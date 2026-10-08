import { STATE_BY_CODE } from "./states";

/**
 * Athlete KIT id, e.g. ARAA080F04 =
 *   AR   sport prefix
 *   AA   series
 *   080  serial
 *   F    gender
 *   04   year of birth (last two digits)
 *
 * In the real export gender agrees in 99.86% of rows and birth year in 99.6%, so
 * the embedded values are used purely as a cross-check, never as source of truth.
 */
const ATHLETE_KIT_ID = /^([A-Z]{2})([A-Z]{2})(\d{3})([MF])(\d{2})$/;

export interface AthleteKitId {
  sportPrefix: string;
  series: string;
  serial: string;
  gender: "M" | "F";
  birthYear2: number;
}

export function normalizeKitId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim().toUpperCase().replace(/\s+/g, "");
  return s === "" || s === "NULL" ? null : s;
}

export function parseAthleteKitId(kitId: string): AthleteKitId | null {
  const m = ATHLETE_KIT_ID.exec(kitId);
  if (!m) return null;
  return {
    sportPrefix: m[1]!,
    series: m[2]!,
    serial: m[3]!,
    gender: m[4] as "M" | "F",
    birthYear2: Number(m[5]),
  };
}

/**
 * Academy codes of the form MSAA000UP21 carry a two-letter state code before the
 * trailing sequence. Other schemes (NCOEAA009MS, ABSCAA172MS, SATC…) do not, and
 * yield null. The result is *inferred* – surfaced as such in the UI.
 */
const ACADEMY_CODE_WITH_STATE = /^[A-Z]{2}AA\d{3}([A-Z]{2})\d{2}$/;

export function inferStateCode(academyCode: string | null): string | null {
  if (!academyCode) return null;
  const m = ACADEMY_CODE_WITH_STATE.exec(academyCode.trim().toUpperCase());
  const code = m?.[1];
  return code && STATE_BY_CODE[code] ? code : null;
}
