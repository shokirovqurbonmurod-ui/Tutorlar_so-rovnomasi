import rateLimit from 'express-rate-limit';
import { tooMany } from '../lib/errors.js';

const handler = (_req: unknown, _res: unknown, next: (e?: unknown) => void) => next(tooMany());

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
});
