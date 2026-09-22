import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { prisma } from '../../lib/prisma.js';
import { env } from '../../config/env.js';
import { hashToken, signAccess, signRefresh, ttlToMs, verifyRefresh } from '../../lib/jwt.js';
import { forbidden, unauthorized, badRequest } from '../../lib/errors.js';
import { DASHBOARD_ROLES, permissionsForRole } from '../../lib/permissions.js';
import { audit } from '../../lib/audit.js';

const userSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  avatarUrl: true,
  language: true,
  position: true,
  status: true,
  telegramId: true,
  telegramUsername: true,
  lastLoginAt: true,
  role: { select: { id: true, key: true, name: true, slug: true } },
  branch: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true } },
} as const;

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}


async function issueTokens(userId: string, meta: ClientMeta) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: userSelect });
  const jti = crypto.randomUUID();
  const refreshToken = signRefresh(user.id, jti);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      userAgent: meta.userAgent?.slice(0, 300),
      ip: meta.ip,
      expiresAt: new Date(Date.now() + ttlToMs(env.JWT_REFRESH_TTL)),
    },
  });
  const accessToken = signAccess({
    sub: user.id,
    role: user.role.key,
    roleId: user.role.id,
    branchId: user.branch?.id ?? null,
    name: user.fullName,
  });
  return {
    accessToken,
    refreshToken,
    expiresIn: Math.floor(ttlToMs(env.JWT_ACCESS_TTL) / 1000),
    user: { ...user, telegramId: user.telegramId?.toString() ?? null, permissions: await permissionsForRole(user.role.key, user.role.id) },
  };
}

export async function login(identifier: string, password: string, meta: ClientMeta) {
  const id = identifier.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: id }, { phone: identifier.trim() }] },
    include: { role: true },
  });
  if (!user || !user.passwordHash) throw unauthorized("Login yoki parol noto'g'ri");
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    audit({ userId: user.id, action: 'auth.login_failed', ...meta });
    throw unauthorized("Login yoki parol noto'g'ri");
  }
  if (user.status !== 'ACTIVE') throw forbidden('Hisobingiz faol emas. Administrator bilan bog\'laning');
  if (!DASHBOARD_ROLES.includes(user.role.key)) throw forbidden('Bu panelga faqat boshqaruv xodimlari kira oladi');

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastActivityAt: new Date() } });
  audit({ userId: user.id, action: 'auth.login', ...meta });
  return issueTokens(user.id, meta);
}

export async function refresh(token: string, meta: ClientMeta) {
  let payload: { sub: string; jti: string };
  try {
    payload = verifyRefresh(token);
  } catch {
    throw unauthorized('Sessiya yaroqsiz');
  }
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date() || stored.userId !== payload.sub) {
    throw unauthorized('Sessiya yaroqsiz');
  }
  // rotate
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  const user = await prisma.user.findUnique({ where: { id: stored.userId }, select: { status: true } });
  if (!user || user.status !== 'ACTIVE') throw forbidden('Hisobingiz faol emas');
  return issueTokens(stored.userId, meta);
}

export async function logout(token: string | undefined, userId?: string) {
  if (token) {
    await prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  if (userId) audit({ userId, action: 'auth.logout' });
}

export async function me(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: userSelect });
  if (!user) throw unauthorized();
  return { ...user, telegramId: user.telegramId?.toString() ?? null, permissions: await permissionsForRole(user.role.key, user.role.id) };
}

export async function changePassword(userId: string, current: string, next: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.passwordHash && !(await bcrypt.compare(current, user.passwordHash))) {
    throw badRequest("Joriy parol noto'g'ri");
  }
  const passwordHash = await bcrypt.hash(next, env.BCRYPT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  audit({ userId, action: 'auth.password_changed' });
}

/** Creates a short-lived code the user types into the Telegram bot (/link CODE) to bind the account. */
export async function createTelegramLinkCode(userId: string) {
  await prisma.telegramLinkCode.deleteMany({ where: { userId, usedAt: null } });
  const code = crypto.randomInt(100000, 999999).toString();
  const rec = await prisma.telegramLinkCode.create({
    data: { userId, code, expiresAt: new Date(Date.now() + 10 * 60_000) },
  });
  return { code: rec.code, expiresAt: rec.expiresAt };
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, env.BCRYPT_ROUNDS);
