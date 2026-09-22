import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint topilmadi' } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  const anyErr = err as { code?: string; message?: string; type?: string };
  if (anyErr?.code === 'P2002') {
    return res.status(409).json({ error: { code: 'CONFLICT', message: "Bunday yozuv allaqachon mavjud" } });
  }
  if (anyErr?.code === 'P2025') {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Yozuv topilmadi' } });
  }
  if (anyErr?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_JSON', message: "JSON noto'g'ri" } });
  }
  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL', message: env.isProd ? 'Serverda xatolik' : anyErr?.message ?? 'Serverda xatolik' },
  });
}

export const asyncHandler =
  <T extends Request>(fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req as T, res, next).catch(next);
