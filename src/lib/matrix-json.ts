/**
 * Spreadsheet cells ⇄ JSON. The browser reads the workbook and sends rows as JSON, so dates must survive the
 * trip: a date at UTC midnight becomes "YYYY-MM-DD", a date with a time becomes a full ISO string. The importer
 * treats both exactly like the Date objects it gets when it reads a file itself (tested for equivalence).
 */
export type JsonCell = string | number | boolean | null;

export function toJsonCell(v: unknown): JsonCell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "Invalid Date";
    const midnight = v.getUTCHours() === 0 && v.getUTCMinutes() === 0 && v.getUTCSeconds() === 0 && v.getUTCMilliseconds() === 0;
    return midnight ? v.toISOString().slice(0, 10) : v.toISOString();
  }
  if (typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  return String(v);
}

export const toJsonRow = (row: ReadonlyArray<unknown>): JsonCell[] => row.map(toJsonCell);

/** Splits rows into batches of at most `size` rows. */
export function* batches<T>(rows: readonly T[], size: number): Generator<T[]> {
  for (let i = 0; i < rows.length; i += size) yield rows.slice(i, i + size) as T[];
}
