/** Makes BigInt (Telegram IDs) JSON-serialisable and Dates ISO strings. */
export function serialize<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
  ) as T;
}
