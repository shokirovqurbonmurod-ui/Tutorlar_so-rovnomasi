import type { Request } from 'express';
/** Express 5 types params as string | string[]; our routes never use array params. */
export const pid = (req: Request, key = 'id'): string => {
  const v = (req.params as Record<string, string | string[]>)[key];
  return Array.isArray(v) ? v[0] : v;
};
