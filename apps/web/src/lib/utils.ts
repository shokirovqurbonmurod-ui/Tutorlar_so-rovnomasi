import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import 'dayjs/locale/uz-latn';

dayjs.extend(relativeTime);
dayjs.locale('uz-latn');

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmtDate = (d?: string | Date | null, f = 'DD.MM.YYYY') => (d ? dayjs(d).format(f) : '—');
export const fmtDateTime = (d?: string | Date | null) => (d ? dayjs(d).format('DD.MM.YYYY HH:mm') : '—');
export const fromNow = (d?: string | Date | null) => (d ? dayjs(d).fromNow() : '—');
export const fmtNum = (n?: number | null) => (n === null || n === undefined ? '—' : new Intl.NumberFormat('uz-UZ').format(n));
export const pct = (n?: number | null) => (n === null || n === undefined ? '—' : `${Math.round(n)}%`);
export const initials = (name?: string | null) =>
  (name ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

export { dayjs };
