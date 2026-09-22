import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requirePermission } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/error.js';
import { validate } from '../../middleware/validate.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { audit } from '../../lib/audit.js';
import { pid } from '../../lib/params.js';
import { PERMISSIONS, ALL_PERMISSIONS, invalidatePermissionCache, type PermissionKey } from '../../lib/permissions.js';
import { RoleKey } from '../../generated/prisma/enums.js';

/**
 * Roles & permissions management.
 *  GET    /api/roles                → all roles with permission keys and user counts
 *  GET    /api/roles/permissions    → permission catalogue grouped by resource
 *  POST   /api/roles                → create a custom role (kind = CUSTOM or based on a system kind)
 *  PATCH  /api/roles/:id            → rename / recolor / replace permissions
 *  DELETE /api/roles/:id            → delete custom role (must have no users)
 */
export const rolesRouter = Router();
rolesRouter.use(authenticate);

const permKeys = z.array(z.enum(ALL_PERMISSIONS as [PermissionKey, ...PermissionKey[]])).max(200);

const createSchema = z.object({
  name: z.string().min(2).max(60),
  slug: z.string().regex(/^[a-z0-9_-]{2,40}$/i).optional(),
  description: z.string().max(300).optional().nullable(),
  color: z.string().max(20).optional().nullable(),
  /** Which system role this custom role behaves like for scoping (menu/bot). Default CUSTOM = staff web user. */
  kind: z.nativeEnum(RoleKey).default('CUSTOM'),
  permissions: permKeys.default([]),
});
const updateSchema = createSchema.partial().omit({ kind: true });

const roleInclude = { permissions: { select: { permission: { select: { key: true } } } }, _count: { select: { users: true } } } as const;
const shape = (r: { id: string; key: RoleKey; slug: string; name: string; description: string | null; color: string | null; isSystem: boolean; permissions: { permission: { key: string } }[]; _count: { users: number } }) => ({
  id: r.id,
  key: r.key,
  slug: r.slug,
  name: r.name,
  description: r.description,
  color: r.color,
  isSystem: r.isSystem,
  users: r._count.users,
  permissions: r.key === 'SUPER_ADMIN' ? ALL_PERMISSIONS : r.permissions.map((p) => p.permission.key),
});

rolesRouter.get(
  '/',
  requirePermission('users.view', 'users.manage_roles'),
  asyncHandler(async (_req, res) => {
    const roles = await prisma.role.findMany({ include: roleInclude, orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }] });
    res.json(roles.map(shape));
  }),
);

rolesRouter.get(
  '/permissions',
  requirePermission('users.view', 'users.manage_roles'),
  asyncHandler(async (_req, res) => {
    const groups: Record<string, { key: string; label: string }[]> = {};
    for (const [key, label] of Object.entries(PERMISSIONS)) {
      const g = key.split('.')[0];
      (groups[g] ??= []).push({ key, label });
    }
    res.json(Object.entries(groups).map(([group, items]) => ({ group, items })));
  }),
);

rolesRouter.post(
  '/',
  requirePermission('users.manage_roles'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'SUPER_ADMIN') throw forbidden('Yangi rol yaratish faqat Super Admin uchun');
    const body = req.body as z.infer<typeof createSchema>;
    if (body.kind === 'SUPER_ADMIN') throw badRequest('Super Admin turidagi rol yaratib bo\'lmaydi');
    const slug = (body.slug ?? `custom-${body.name}`).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    if (await prisma.role.findUnique({ where: { slug } })) throw badRequest('Bunday kalitli rol mavjud');
    const perms = await prisma.permission.findMany({ where: { key: { in: body.permissions } } });
    const role = await prisma.role.create({
      data: {
        key: body.kind,
        slug,
        name: body.name,
        description: body.description ?? null,
        color: body.color ?? null,
        isSystem: false,
        permissions: { create: perms.map((p) => ({ permissionId: p.id })) },
      },
      include: roleInclude,
    });
    audit({ userId: req.user!.sub, action: 'role.create', entity: 'Role', entityId: role.id, meta: { name: body.name, permissions: body.permissions }, ip: req.ip });
    res.status(201).json(shape(role));
  }),
);

rolesRouter.patch(
  '/:id',
  requirePermission('users.manage_roles'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'SUPER_ADMIN') throw forbidden('Rollarni faqat Super Admin tahrirlaydi');
    const body = req.body as z.infer<typeof updateSchema>;
    const existing = await prisma.role.findUnique({ where: { id: pid(req) } });
    if (!existing) throw notFound('Rol topilmadi');
    if (existing.key === 'SUPER_ADMIN') throw forbidden('Super Admin rolini o\'zgartirib bo\'lmaydi');

    const role = await prisma.$transaction(async (tx) => {
      if (body.permissions) {
        const perms = await tx.permission.findMany({ where: { key: { in: body.permissions } } });
        await tx.rolePermission.deleteMany({ where: { roleId: existing.id } });
        await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId: existing.id, permissionId: p.id })), skipDuplicates: true });
      }
      return tx.role.update({
        where: { id: existing.id },
        data: { name: body.name, description: body.description, color: body.color, ...(body.slug && !existing.isSystem ? { slug: body.slug.toLowerCase() } : {}) },
        include: roleInclude,
      });
    });
    invalidatePermissionCache(existing.id);
    audit({ userId: req.user!.sub, action: 'role.update', entity: 'Role', entityId: role.id, meta: body, ip: req.ip });
    res.json(shape(role));
  }),
);

rolesRouter.delete(
  '/:id',
  requirePermission('users.manage_roles'),
  asyncHandler(async (req, res) => {
    if (req.user!.role !== 'SUPER_ADMIN') throw forbidden();
    const existing = await prisma.role.findUnique({ where: { id: pid(req) }, include: { _count: { select: { users: true } } } });
    if (!existing) throw notFound('Rol topilmadi');
    if (existing.isSystem) throw badRequest('Tizim rolini o\'chirib bo\'lmaydi');
    if (existing._count.users > 0) throw badRequest(`Bu rolda ${existing._count.users} ta foydalanuvchi bor. Avval ularni boshqa rolga o'tkazing`);
    await prisma.role.delete({ where: { id: existing.id } });
    invalidatePermissionCache(existing.id);
    audit({ userId: req.user!.sub, action: 'role.delete', entity: 'Role', entityId: existing.id, meta: { name: existing.name }, ip: req.ip });
    res.json({ ok: true });
  }),
);
