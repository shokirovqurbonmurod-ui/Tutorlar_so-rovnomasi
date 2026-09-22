import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  search: z.string().trim().optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function paged<T>(items: T[], total: number, p: Pagination) {
  return {
    items,
    total,
    page: p.page,
    limit: p.limit,
    pages: Math.max(1, Math.ceil(total / p.limit)),
  };
}

export const skipTake = (p: Pagination) => ({ skip: (p.page - 1) * p.limit, take: p.limit });
