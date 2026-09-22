import { Router } from 'express';
import { z } from 'zod';
import * as svc from './auth.service.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../middleware/error.js';
import { authenticate } from '../../middleware/auth.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { env } from '../../config/env.js';
import { ttlToMs } from '../../lib/jwt.js';

export const authRouter = Router();

const cookieOpts = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.isProd,
  path: '/api/auth',
  maxAge: ttlToMs(env.JWT_REFRESH_TTL),
};

const meta = (req: { ip?: string; headers: Record<string, unknown> }) => ({
  ip: req.ip,
  userAgent: String(req.headers['user-agent'] ?? ''),
});

authRouter.post(
  '/login',
  authLimiter,
  validate(z.object({ identifier: z.string().min(3), password: z.string().min(4) })),
  asyncHandler(async (req, res) => {
    const result = await svc.login(req.body.identifier, req.body.password, meta(req));
    res.cookie('refresh_token', result.refreshToken, cookieOpts);
    res.json(result);
  }),
);

authRouter.post(
  '/refresh',
  authLimiter,
  asyncHandler(async (req, res) => {
    const token = (req.body?.refreshToken as string | undefined) ?? (req.cookies?.refresh_token as string | undefined);
    if (!token) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Refresh token yo\'q' } });
    const result = await svc.refresh(token, meta(req));
    res.cookie('refresh_token', result.refreshToken, cookieOpts);
    res.json(result);
  }),
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = (req.body?.refreshToken as string | undefined) ?? (req.cookies?.refresh_token as string | undefined);
    let userId: string | undefined;
    try {
      const h = req.headers.authorization;
      if (h?.startsWith('Bearer ')) userId = (await import('../../lib/jwt.js')).verifyAccess(h.slice(7)).sub;
    } catch {
      /* ignore */
    }
    await svc.logout(token, userId);
    res.clearCookie('refresh_token', { path: '/api/auth' });
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(await svc.me(req.user!.sub));
  }),
);

authRouter.post(
  '/change-password',
  authenticate,
  validate(z.object({ currentPassword: z.string(), newPassword: z.string().min(8) })),
  asyncHandler(async (req, res) => {
    await svc.changePassword(req.user!.sub, req.body.currentPassword, req.body.newPassword);
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/telegram-link-code',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json(await svc.createTelegramLinkCode(req.user!.sub));
  }),
);
