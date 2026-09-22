import { prisma } from './prisma.js';
import { logger } from './logger.js';

export interface AuditInput {
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  meta?: unknown;
  ip?: string;
  userAgent?: string;
  source?: 'web' | 'telegram' | 'system';
}

/** Fire-and-forget audit trail. Never throws. */
export function audit(input: AuditInput) {
  prisma.auditLog
    .create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        meta: input.meta === undefined ? undefined : (JSON.parse(JSON.stringify(input.meta, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))) as object),
        ip: input.ip,
        userAgent: input.userAgent?.slice(0, 300),
        source: input.source ?? 'web',
      },
    })
    .catch((e) => logger.warn({ err: e }, 'audit log failed'));
}
