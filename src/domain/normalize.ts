/**
 * Pure normalisation helpers for the athlete-master workbook.
 *
 * The source export is messy in predictable ways: missing values are the literal
 * text "NULL", names carry stray whitespace, dates may be corrupted (year 0202,
 * 1017, 2101 …) and sizes mix numbers and letters. Everything here is
 * deterministic and side-effect free so it can be unit-tested exhaustively.
 */

const NULL_TOKENS = new Set(["", "null"]);

/** Trim + collapse internal whitespace; the literal "NULL"/empty becomes null. */
export function cleanText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return null;
  const s = String(value).replace(/\s+/g, " ").trim();
  return NULL_TOKENS.has(s.toLowerCase()) ? null : s;
}

/** Integer from a number or a numeric string; anything else → null. */
export function toInt(value: unknown): number | null {
  if (typeof value === "number") return Number.isInteger(value) ? value : null;
  const s = cleanText(value);
  if (s === null || !/^-?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

export function toGender(value: unknown): "M" | "F" | null {
  const s = cleanText(value)?.toUpperCase();
  if (s === "M" || s === "MALE") return "M";
  if (s === "F" || s === "FEMALE") return "F";
  return null;
}

export type AthleteType = "RESIDENTIAL" | "NON_RESIDENTIAL";

export function toAthleteType(value: unknown): AthleteType | null {
  const s = cleanText(value)
    ?.toLowerCase()
    .replace(/[\s_]+/g, "-");
  if (s === "residential") return "RESIDENTIAL";
  if (s === "non-residential" || s === "nonresidential") return "NON_RESIDENTIAL";
  return null;
}

export function toActiveFlag(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const n = toInt(value);
  if (n === 1) return true;
  if (n === 0) return false;
  const s = cleanText(value)?.toLowerCase();
  if (s === "true" || s === "yes" || s === "y") return true;
  if (s === "false" || s === "no" || s === "n") return false;
  return null;
}

/** "Para-Archery", "Para -Archery", "para  - archery" → "Para - Archery". */
export function normalizeSportName(value: unknown): string | null {
  const s = cleanText(value);
  if (s === null) return null;
  const para = /^para\s*-\s*(.+)$/i.exec(s);
  if (para?.[1]) return `Para - ${para[1].trim()}`;
  return s;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ───────────────────────────── dates ─────────────────────────────

export interface ParsedDate {
  /** ISO calendar date (YYYY-MM-DD) or null when the cell is empty / unparseable. */
  iso: string | null;
  /** The original value as text, kept for data-quality evidence when it was unusable. */
  raw: string | null;
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function isoDateFromParts(y: number, m: number, d: number): string | null {
  if (y < 1 || y > 9999 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

/**
 * Accepts a Date (spreadsheet reader emits UTC midnight), an ISO-ish string
 * ("2004-01-05", "2004-01-05 00:00:00.000"), or empty/NULL.
 */
export function parseDateOnly(value: unknown): ParsedDate {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { iso: null, raw: "Invalid Date" };
    return { iso: isoDateFromParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()), raw: null };
  }
  const s = cleanText(value);
  if (s === null) return { iso: null, raw: null };
  const m = /^(\d{1,4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) {
    const iso = isoDateFromParts(Number(m[1]), Number(m[2]), Number(m[3]));
    return iso ? { iso, raw: null } : { iso: null, raw: s };
  }
  return { iso: null, raw: s };
}

export function parseTimestamp(value: unknown): { at: Date | null; raw: string | null } {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? { at: null, raw: "Invalid Date" } : { at: value, raw: null };
  }
  const s = cleanText(value);
  if (s === null) return { at: null, raw: null };
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?Z?$/.exec(s);
  if (!m) return { at: null, raw: s };
  const at = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), +(m[7] ?? 0)));
  return Number.isNaN(at.getTime()) ? { at: null, raw: s } : { at, raw: null };
}

export function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

/** Completed years between two ISO dates (b on or after a), fractional-free. */
export function ageInYears(birthIso: string, onIso: string): number {
  const [by, bm, bd] = birthIso.split("-").map(Number) as [number, number, number];
  const [oy, om, od] = onIso.split("-").map(Number) as [number, number, number];
  let age = oy - by;
  if (om < bm || (om === bm && od < bd)) age -= 1;
  return age;
}

export function todayIso(now: Date = new Date()): string {
  return isoDateFromParts(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate())!;
}

// ───────────────────────────── contact ─────────────────────────────

/**
 * Mobile numbers in the export are AES ciphertext (base64, 16-byte block → 24 chars).
 * We store the opaque ciphertext and never expose it. Anything else (plain digits,
 * truncated blobs) is rejected rather than stored, so no plaintext phone number
 * ever lands in the database.
 */
const CIPHERTEXT = /^[A-Za-z0-9+/]{22}==$/;

export function parseMobileCipher(value: unknown): { cipher: string | null; invalid: boolean } {
  if (typeof value === "number") return { cipher: null, invalid: true };
  const s = cleanText(value);
  if (s === null) return { cipher: null, invalid: false };
  return CIPHERTEXT.test(s) ? { cipher: s, invalid: false } : { cipher: null, invalid: true };
}

const PARENT_PLACEHOLDERS = new Set(["father", "mother", "abc", "xyz", "test", "na", "n/a", "nil", "none", "-", ".", "--"]);

export function parseParentName(value: unknown): { name: string | null; placeholder: boolean } {
  const s = cleanText(value);
  if (s === null) return { name: null, placeholder: false };
  if (PARENT_PLACEHOLDERS.has(s.toLowerCase())) return { name: null, placeholder: true };
  return { name: s, placeholder: false };
}

// ───────────────────────────── kit sizes ─────────────────────────────

export const LETTER_SIZES = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "XXXXL"] as const;
const LETTER_RE = /^(XXS|XS|S|M|L|X{1,4}L)$/;

export type SizeItem = "shoe" | "blazer" | "tshirt" | "pant";

export interface SizeResult<T> {
  value: T | null;
  /** Set when a non-empty value was supplied but rejected. */
  invalid: boolean;
  raw: string | null;
}

const NUMERIC_RANGE: Record<SizeItem, { min: number; max: number }> = {
  shoe: { min: 1, max: 15 },
  blazer: { min: 20, max: 60 },
  pant: { min: 18, max: 60 },
  tshirt: { min: 0, max: 0 }, // numeric t-shirt sizes are not accepted
};

/** Shoe sizes are numeric (UK/India). 0 is an export artefact for "unknown". */
export function parseShoeSize(value: unknown): SizeResult<number> {
  const s = cleanText(value);
  if (s === null) return { value: null, invalid: false, raw: null };
  const n = toInt(s);
  const { min, max } = NUMERIC_RANGE.shoe;
  if (n !== null && n >= min && n <= max) return { value: n, invalid: false, raw: null };
  return { value: null, invalid: true, raw: s };
}

/** Blazer / pant / t-shirt: letter sizes (XS…XXXXL) or, where relevant, waist/chest numbers. */
export function parseGarmentSize(item: Exclude<SizeItem, "shoe">, value: unknown): SizeResult<string> {
  const s = cleanText(value);
  if (s === null) return { value: null, invalid: false, raw: null };
  const upper = s.toUpperCase().replace(/\s+/g, "");
  if (LETTER_RE.test(upper)) return { value: upper, invalid: false, raw: null };
  const n = toInt(upper);
  const { min, max } = NUMERIC_RANGE[item];
  if (n !== null && max > 0 && n >= min && n <= max) return { value: String(n), invalid: false, raw: null };
  return { value: null, invalid: true, raw: s };
}

/** Sort key so size lists read XXS…XXXXL then ascending numbers. */
export function sizeSortKey(size: string): [number, number] {
  const idx = (LETTER_SIZES as readonly string[]).indexOf(size);
  if (idx >= 0) return [0, idx];
  const n = Number(size);
  return [1, Number.isFinite(n) ? n : 9999];
}

export function compareSizes(a: string, b: string): number {
  const [a0, a1] = sizeSortKey(a);
  const [b0, b1] = sizeSortKey(b);
  return a0 - b0 || a1 - b1 || a.localeCompare(b);
}
