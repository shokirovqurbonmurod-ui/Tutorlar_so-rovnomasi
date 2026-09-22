import type { NextFunction, Request, Response } from 'express';
import { verifyAccess, type AccessPayload } from '../lib/jwt.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { hasPermissionAsync, type PermissionKey } from '../lib/permissions.js';
import { prisma } from '../lib/prisma.js';

declare global {
  namespace Express {
    interface Request {
      user?: AccessPayload;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : (req.cookies?.access_token as string | undefined);
  if (!token) return next(unauthorized());
  try {
    req.user = verifyAccess(token);
    return next();
  } catch {
    return next(unauthorized('Sessiya muddati tugagan'));
  }
}

/** Requires ANY of the given permissions. */
export function requirePermission(...perms: PermissionKey[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (perms.length === 0) return next();
    Promise.all(perms.map((p) => hasPermissionAsync(req.user!.role, req.user!.roleId, p)))
      .then((r) => (r.some(Boolean) ? next() : next(forbidden())))
      .catch(next);
  };
}

/** Rejects blocked/inactive users even if their access token is still valid. */
export async function ensureActive(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  const u = await prisma.user.findUnique({ where: { id: req.user.sub }, select: { status: true } });
  if (!u || u.status !== 'ACTIVE') return next(forbidden('Hisobingiz faol emas'));
  next();
}
