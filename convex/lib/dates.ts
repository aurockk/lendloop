const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_LOAN_DAYS = 30;
export const MAX_ADVANCE_DAYS = 90;

/** Today's date in UTC as YYYY-MM-DD. All loan dates are UTC calendar days. */
export function todayISO(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function isISODate(s: string): boolean {
  if (!ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );
}

/** Inclusive ranges overlap. ISO strings compare lexicographically. */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}
