const nf = new Intl.NumberFormat("en-IN");
export const fmt = (n: number | null | undefined): string => (n === null || n === undefined ? "—" : nf.format(n));

export const pct = (part: number, whole: number, digits = 0): string => (whole <= 0 ? "—" : `${((part / whole) * 100).toFixed(digits)}%`);

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export type SearchParams = Record<string, string | string[] | undefined>;

/** First value of every query parameter (arrays collapse). */
export function flattenParams(sp: SearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    const first = Array.isArray(v) ? v[0] : v;
    if (first !== undefined) out[k] = first;
  }
  return out;
}

/** Builds `?a=1&b=2`, dropping empty values; `overrides` replace/remove keys. */
export function qs(base: Record<string, string>, overrides: Record<string, string | number | undefined | null> = {}): string {
  const merged: Record<string, string> = { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined || v === null || v === "") delete merged[k];
    else merged[k] = String(v);
  }
  const s = new URLSearchParams(merged).toString();
  return s ? `?${s}` : "";
}
