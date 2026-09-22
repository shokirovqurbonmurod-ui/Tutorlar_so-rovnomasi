export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string = 'ERROR',
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg = "Noto'g'ri so'rov", details?: unknown) => new HttpError(400, msg, 'BAD_REQUEST', details);
export const unauthorized = (msg = 'Avtorizatsiya talab qilinadi') => new HttpError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = "Sizda bu amal uchun ruxsat yo'q") => new HttpError(403, msg, 'FORBIDDEN');
export const notFound = (msg = 'Topilmadi') => new HttpError(404, msg, 'NOT_FOUND');
export const conflict = (msg = 'Ziddiyat') => new HttpError(409, msg, 'CONFLICT');
export const tooMany = (msg = "Juda ko'p so'rov. Birozdan so'ng urinib ko'ring") => new HttpError(429, msg, 'RATE_LIMITED');
