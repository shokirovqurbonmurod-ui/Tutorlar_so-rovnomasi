import jwt, { type SignOptions } from 'jsonwebtoken';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import type { RoleKey } from '../generated/prisma/enums.js';

export interface AccessPayload {
  sub: string;
  role: RoleKey;
  branchId: string | null;
  name: string;
}

export const signAccess = (p: AccessPayload) =>
  jwt.sign(p, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL as SignOptions['expiresIn'] });

export const verifyAccess = (token: string) => jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload & jwt.JwtPayload;

export const signRefresh = (sub: string, jti: string) =>
  jwt.sign({ sub, jti }, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_TTL as SignOptions['expiresIn'] });

export const verifyRefresh = (token: string) => jwt.verify(token, env.JWT_REFRESH_SECRET) as { sub: string; jti: string; exp: number };

export const hashToken = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

export const ttlToMs = (ttl: string) => {
  const m = /^(\d+)([smhd])$/.exec(ttl);
  if (!m) return 15 * 60 * 1000;
  const n = Number(m[1]);
  return n * { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[m[2] as 's' | 'm' | 'h' | 'd'];
};
