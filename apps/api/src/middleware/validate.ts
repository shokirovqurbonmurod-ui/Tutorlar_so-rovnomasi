import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { badRequest } from '../lib/errors.js';

type Source = 'body' | 'query' | 'params';

export const validate =
  (schema: ZodTypeAny, source: Source = 'body') =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(badRequest("Ma'lumotlar noto'g'ri", result.error.flatten()));
    }
    if (source === 'query') {
      // Express 5: req.query is a getter — stash parsed value separately
      (req as Request & { validatedQuery: unknown }).validatedQuery = result.data;
    } else {
      (req as unknown as Record<Source, unknown>)[source] = result.data;
    }
    next();
  };

export const q = <T>(req: Request) => (req as Request & { validatedQuery: T }).validatedQuery;
