import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from '../config/env.js';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  log: env.isProd ? ['error'] : ['warn', 'error'],
});

import { registerPermissionResolver, type PermissionKey } from './permissions.js';
registerPermissionResolver(async (roleId) => {
  const rows = await prisma.rolePermission.findMany({ where: { roleId }, select: { permission: { select: { key: true } } } });
  return rows.map((r) => r.permission.key as PermissionKey);
});

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
