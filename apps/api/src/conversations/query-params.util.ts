/** Safe numeric query parsing — invalid values (NaN) must not reach TypeORM `take`/`skip`. */
export function clampInt(n: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}
