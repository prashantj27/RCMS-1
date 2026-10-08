import {
  ageInYears,
  cleanText,
  isoDateFromParts,
  normalizeSportName,
  parseDateOnly,
  parseGarmentSize,
  parseMobileCipher,
  parseParentName,
  parseShoeSize,
  parseTimestamp,
  slugify,
  todayIso,
  toActiveFlag,
  toAthleteType,
  toGender,
  toInt,
  yearOf,
  type AthleteType,
} from "./normalize";
import { inferStateCode, normalizeKitId, parseAthleteKitId } from "./identifiers";
import { centreTypeFromRole, type CentreTypeDef } from "./centre-types";
import { issue, issueKey, type DqIssue } from "./dq-rules";

/** Columns of RC_monitoring_Athlete_Details_V1 (sheet "AthleteMaster"). */
export const REQUIRED_COLUMNS = ["player_detail_id", "athlete_kitd_id", "full_name", "gender", "date_of_birth", "sport_name"] as const;

export const OPTIONAL_COLUMNS = [
  "father_full_name",
  "mother_full_name",
  "mobile_number",
  "role_detail_id",
  "academy_role",
  "academy_detail_id",
  "academy_kitd_id",
  "academy_name",
  "academy_is_active",
  "type_of_athelete",
  "date_of_joining",
  "shoe_size",
  "blazer_size",
  "tshirt_size",
  "pant_size",
  "kitting_updated_date",
] as const;

const HEADER_ALIASES: Record<string, string> = {
  type_of_athlete: "type_of_athelete", // the export misspells "athlete"
};

export class HeaderError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Missing required column(s): ${missing.join(", ")}`);
    this.name = "HeaderError";
  }
}

export type RawRow = Record<string, unknown>;

/** Turns a spreadsheet matrix (row 0 = header) into keyed rows; throws HeaderError if columns are missing. */
export function rowsFromMatrix(matrix: ReadonlyArray<ReadonlyArray<unknown>>): { line: number; row: RawRow }[] {
  const header = matrix[0];
  if (!header) throw new HeaderError([...REQUIRED_COLUMNS]);
  const names = header.map((h) => {
    const k = String(h ?? "")
      .trim()
      .toLowerCase();
    return HEADER_ALIASES[k] ?? k;
  });
  const missing = REQUIRED_COLUMNS.filter((c) => !names.includes(c));
  if (missing.length) throw new HeaderError(missing);
  const out: { line: number; row: RawRow }[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i]!;
    if (cells.every((c) => c === null || c === undefined || String(c).trim() === "")) continue; // blank line
    const row: RawRow = {};
    names.forEach((n, idx) => {
      if (n) row[n] = cells[idx];
    });
    out.push({ line: i + 1, row });
  }
  return out;
}

// ───────────────────────────── drafts ─────────────────────────────

export interface AthleteDraft {
  id: number;
  kitId: string;
  fullName: string | null;
  fatherName: string | null;
  motherName: string | null;
  gender: "M" | "F";
  dob: string | null;
  mobileCipher: string | null;
  sportName: string;
  shoeSize: number | null;
  blazerSize: string | null;
  tshirtSize: string | null;
  pantSize: string | null;
  kittingUpdatedAt: Date | null;
}

export interface AcademyDraft {
  id: number;
  kitCode: string | null;
  name: string;
  centreTypeId: number | null;
  isActive: boolean;
  stateCode: string | null;
}

export interface EnrollmentDraft {
  athleteId: number;
  academyId: number;
  athleteType: AthleteType | null;
  joinedOn: string | null;
}

export interface ParsedRow {
  line: number;
  fatal: string[];
  athlete?: AthleteDraft;
  academy?: AcademyDraft;
  centreType?: CentreTypeDef;
  enrollment?: EnrollmentDraft;
  issues: DqIssue[];
}

const MIN_JOIN_YEAR = 1990;
const MIN_KITTING_YEAR = 2015;
const MIN_DOB_YEAR = 1900;

export interface ParseOptions {
  /** ISO date used for "in the future" / age rules; defaults to today (UTC). */
  asOf?: string;
}

export function parseRow(line: number, raw: RawRow, opts: ParseOptions = {}): ParsedRow {
  const asOf = opts.asOf ?? todayIso();
  const issues: DqIssue[] = [];
  const fatal: string[] = [];

  const id = toInt(raw.player_detail_id);
  if (id === null || id <= 0) fatal.push("player_detail_id is missing or not a positive integer");
  const kitId = normalizeKitId(raw.athlete_kitd_id);
  if (kitId === null) fatal.push("athlete_kitd_id is missing");
  const gender = toGender(raw.gender);
  if (gender === null) fatal.push(`gender '${cleanText(raw.gender) ?? ""}' is not M/F`);
  const sportName = normalizeSportName(raw.sport_name);
  if (sportName === null) fatal.push("sport_name is missing");
  if (fatal.length || id === null || kitId === null || gender === null || sportName === null) {
    return { line, fatal, issues };
  }

  const fullName = cleanText(raw.full_name);
  if (fullName === null) issues.push(issue("NAME_MISSING", id, "Athlete name is missing"));

  // — date of birth —
  const dobParsed = parseDateOnly(raw.date_of_birth);
  let dob = dobParsed.iso;
  if (dobParsed.raw !== null || (dob !== null && (yearOf(dob) < MIN_DOB_YEAR || dob > asOf))) {
    issues.push(issue("DOB_INVALID", id, "Date of birth is invalid", { detail: { raw: dobParsed.raw ?? dob } }));
    dob = null;
  } else if (dob === null) {
    issues.push(issue("DOB_INVALID", id, "Date of birth is missing", { detail: { raw: null } }));
  }
  if (dob) {
    const age = ageInYears(dob, asOf);
    if (age < 5 || age > 50) issues.push(issue("DOB_AGE_OUTLIER", id, `Age ${age} is implausible`, { detail: { age, dob } }));
    if (dob.endsWith("-01-01")) issues.push(issue("DOB_PLACEHOLDER_LIKELY", id, "Date of birth is 1 January"));
  }

  // — KIT id cross-checks —
  const kit = parseAthleteKitId(kitId);
  if (!kit) {
    issues.push(issue("KITID_FORMAT", id, `KIT id '${kitId}' is malformed`, { detail: { kitId } }));
  } else {
    if (kit.gender !== gender) {
      issues.push(issue("KITID_GENDER_MISMATCH", id, `KIT id says ${kit.gender}, gender column says ${gender}`));
    }
    if (dob && kit.birthYear2 !== yearOf(dob) % 100) {
      issues.push(issue("KITID_YEAR_MISMATCH", id, `KIT id year ${String(kit.birthYear2).padStart(2, "0")} ≠ DOB year ${yearOf(dob)}`));
    }
  }

  // — contact / family —
  const mobile = parseMobileCipher(raw.mobile_number);
  if (mobile.invalid) issues.push(issue("MOBILE_INVALID", id, "Mobile value is not in the expected encrypted format"));
  const father = parseParentName(raw.father_full_name);
  const mother = parseParentName(raw.mother_full_name);
  if (father.placeholder) issues.push(issue("PARENT_PLACEHOLDER", id, "Father's name is a placeholder", { ref: "father" }));
  if (mother.placeholder) issues.push(issue("PARENT_PLACEHOLDER", id, "Mother's name is a placeholder", { ref: "mother" }));

  // — kit sizes —
  const shoe = parseShoeSize(raw.shoe_size);
  const blazer = parseGarmentSize("blazer", raw.blazer_size);
  const tshirt = parseGarmentSize("tshirt", raw.tshirt_size);
  const pant = parseGarmentSize("pant", raw.pant_size);
  for (const [item, r] of [
    ["shoe", shoe],
    ["blazer", blazer],
    ["tshirt", tshirt],
    ["pant", pant],
  ] as const) {
    if (r.invalid) issues.push(issue("SIZE_INVALID", id, `Invalid ${item} size '${r.raw}'`, { ref: item, detail: { item, raw: r.raw } }));
  }

  // — kitting timestamp —
  const kitting = parseTimestamp(raw.kitting_updated_date);
  let kittingUpdatedAt = kitting.at;
  const tomorrow = new Date(`${asOf}T00:00:00Z`).getTime() + 2 * 86_400_000;
  if (
    kitting.raw !== null ||
    (kittingUpdatedAt && (kittingUpdatedAt.getUTCFullYear() < MIN_KITTING_YEAR || kittingUpdatedAt.getTime() > tomorrow))
  ) {
    issues.push(
      issue("KITTING_DATE_INVALID", id, "Kitting date is invalid", { detail: { raw: kitting.raw ?? kittingUpdatedAt?.toISOString() } }),
    );
    kittingUpdatedAt = null;
  }

  const athlete: AthleteDraft = {
    id,
    kitId,
    fullName,
    fatherName: father.name,
    motherName: mother.name,
    gender,
    dob,
    mobileCipher: mobile.cipher,
    sportName,
    shoeSize: shoe.value,
    blazerSize: blazer.value,
    tshirtSize: tshirt.value,
    pantSize: pant.value,
    kittingUpdatedAt,
  };

  // — academy / enrolment —
  const academyId = toInt(raw.academy_detail_id);
  if (academyId === null || academyId <= 0) return { line, fatal, athlete, issues };

  const kitCode = cleanText(raw.academy_kitd_id)?.toUpperCase().replace(/\s+/g, "") ?? null;
  let academyName = cleanText(raw.academy_name);
  if (academyName === null) {
    issues.push(issue("ACADEMY_NAME_MISSING", academyId, "Academy name is missing"));
    academyName = `Academy #${academyId}`;
  }
  const roleId = toInt(raw.role_detail_id);
  const roleLabel = cleanText(raw.academy_role);
  const centreType = roleId !== null && roleLabel !== null ? centreTypeFromRole(roleId, roleLabel) : undefined;
  const isActive = toActiveFlag(raw.academy_is_active) ?? true;
  const academy: AcademyDraft = {
    id: academyId,
    kitCode,
    name: academyName,
    centreTypeId: centreType?.id ?? null,
    isActive,
    stateCode: inferStateCode(kitCode),
  };

  const joined = parseDateOnly(raw.date_of_joining);
  let joinedOn = joined.iso;
  if (joined.raw !== null || (joinedOn !== null && (yearOf(joinedOn) < MIN_JOIN_YEAR || joinedOn > asOf))) {
    issues.push(
      issue("JOIN_DATE_INVALID", id, "Joining date is invalid", {
        ref: String(academyId),
        detail: { academyId, raw: joined.raw ?? joinedOn },
      }),
    );
    joinedOn = null;
  }
  if (joinedOn && dob) {
    if (joinedOn < dob) {
      issues.push(
        issue("JOIN_BEFORE_BIRTH", id, "Joining date is before date of birth", {
          ref: String(academyId),
          detail: { academyId, joinedOn, dob },
        }),
      );
    } else if (ageInYears(dob, joinedOn) < 4) {
      issues.push(
        issue("JOIN_AGE_IMPLAUSIBLE", id, "Athlete would have been under 4 when joining", {
          ref: String(academyId),
          detail: { academyId, joinedOn, dob },
        }),
      );
    }
  }
  const athleteType = toAthleteType(raw.type_of_athelete);
  if (athleteType === null)
    issues.push(issue("ATHLETE_TYPE_MISSING", id, "Residential status is missing", { ref: String(academyId), detail: { academyId } }));
  if (!isActive)
    issues.push(issue("INACTIVE_ACADEMY", id, `Academy '${academyName}' is inactive`, { ref: String(academyId), detail: { academyId } }));

  return {
    line,
    fatal,
    athlete,
    academy,
    ...(centreType ? { centreType } : {}),
    enrollment: { athleteId: id, academyId, athleteType, joinedOn },
    issues,
  };
}

// ───────────────────────────── plan ─────────────────────────────

export interface RejectedRow {
  line: number;
  reasons: string[];
}

export interface ImportStats {
  rowsRead: number;
  rowsAccepted: number;
  rowsRejected: number;
  rowsWithoutAcademy: number;
  duplicateEnrollmentRows: number;
  athleteAttributeConflicts: number;
  athletes: number;
  academies: number;
  enrollments: number;
  sports: number;
  centreTypes: number;
  athletesWithoutEnrollment: number;
  issuesByRule: Record<string, number>;
  issuesBySeverity: Record<string, number>;
}

export interface ImportPlan {
  athletes: AthleteDraft[];
  academies: AcademyDraft[];
  enrollments: EnrollmentDraft[];
  sports: { name: string; slug: string; isPara: boolean }[];
  centreTypes: CentreTypeDef[];
  issues: DqIssue[];
  rejected: RejectedRow[];
  stats: ImportStats;
}

const ATHLETE_FIELDS: (keyof AthleteDraft)[] = [
  "fullName",
  "fatherName",
  "motherName",
  "dob",
  "mobileCipher",
  "shoeSize",
  "blazerSize",
  "tshirtSize",
  "pantSize",
  "kittingUpdatedAt",
];

const sameValue = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);

export function buildImportPlan(rows: ReadonlyArray<{ line: number; row: RawRow }>, opts: ParseOptions = {}): ImportPlan {
  const athletes = new Map<number, AthleteDraft>();
  const academies = new Map<number, AcademyDraft>();
  const enrollments = new Map<string, EnrollmentDraft>();
  const centreTypes = new Map<number, CentreTypeDef>();
  const issues = new Map<string, DqIssue>();
  const rejected: RejectedRow[] = [];
  const kitIdOwner = new Map<string, number>();
  let rowsWithoutAcademy = 0;
  let duplicateEnrollmentRows = 0;
  let athleteAttributeConflicts = 0;

  const addIssue = (i: DqIssue) => {
    const k = issueKey(i);
    if (!issues.has(k)) issues.set(k, i);
  };

  for (const { line, row } of rows) {
    const p = parseRow(line, row, opts);
    if (p.fatal.length || !p.athlete) {
      rejected.push({ line, reasons: p.fatal });
      continue;
    }
    const a = p.athlete;

    // KIT id must be unique per athlete id; a clash means two people share an id.
    const owner = kitIdOwner.get(a.kitId);
    if (owner !== undefined && owner !== a.id) {
      rejected.push({ line, reasons: [`athlete_kitd_id ${a.kitId} already belongs to player_detail_id ${owner}`] });
      continue;
    }
    kitIdOwner.set(a.kitId, a.id);

    const existing = athletes.get(a.id);
    if (!existing) {
      athletes.set(a.id, { ...a });
    } else {
      // Merge: first non-null wins; count genuine conflicts.
      let conflict = false;
      for (const f of ATHLETE_FIELDS) {
        const cur = existing[f];
        const next = a[f];
        if (cur === null && next !== null) (existing as unknown as Record<string, unknown>)[f] = next;
        else if (cur !== null && next !== null && !sameValue(cur, next)) conflict = true;
      }
      if (existing.sportName !== a.sportName || existing.gender !== a.gender) conflict = true;
      if (conflict) athleteAttributeConflicts++;
    }
    for (const i of p.issues) addIssue(i);

    if (!p.academy || !p.enrollment) {
      rowsWithoutAcademy++;
      continue;
    }
    if (!academies.has(p.academy.id)) academies.set(p.academy.id, p.academy);
    if (p.centreType) centreTypes.set(p.centreType.id, p.centreType);

    const ek = `${p.enrollment.athleteId}:${p.enrollment.academyId}`;
    const prev = enrollments.get(ek);
    if (!prev) {
      enrollments.set(ek, { ...p.enrollment });
    } else {
      duplicateEnrollmentRows++;
      prev.athleteType ??= p.enrollment.athleteType;
      if (p.enrollment.joinedOn && (!prev.joinedOn || p.enrollment.joinedOn < prev.joinedOn)) prev.joinedOn = p.enrollment.joinedOn;
    }
  }

  // Athlete-level rules that need the whole picture.
  const perAthlete = new Map<number, number>();
  for (const e of enrollments.values()) perAthlete.set(e.athleteId, (perAthlete.get(e.athleteId) ?? 0) + 1);
  let athletesWithoutEnrollment = 0;
  for (const a of athletes.values()) {
    const n = perAthlete.get(a.id) ?? 0;
    if (n === 0) {
      athletesWithoutEnrollment++;
      addIssue(issue("NO_ACADEMY", a.id, "Athlete is not enrolled in any academy"));
    }
    if (n >= 3) addIssue(issue("MULTI_ENROLLMENT", a.id, `Athlete is enrolled in ${n} academies`, { detail: { count: n } }));
  }
  const codeOwners = new Map<string, number[]>();
  for (const ac of academies.values()) {
    if (!ac.kitCode) continue;
    const list = codeOwners.get(ac.kitCode) ?? [];
    list.push(ac.id);
    codeOwners.set(ac.kitCode, list);
  }
  for (const [code, ids] of codeOwners) {
    if (ids.length > 1) {
      for (const id of ids)
        addIssue(
          issue("ACADEMY_CODE_SHARED", id, `Code ${code} is shared by ${ids.length} academies`, { detail: { code, academyIds: ids } }),
        );
    }
  }

  // Sports master.
  const sportMap = new Map<string, { name: string; slug: string; isPara: boolean }>();
  for (const a of athletes.values()) {
    const slug = slugify(a.sportName);
    if (!sportMap.has(slug)) sportMap.set(slug, { name: a.sportName, slug, isPara: /^para\b/i.test(a.sportName) });
  }

  const issueList = [...issues.values()];
  const issuesByRule: Record<string, number> = {};
  const issuesBySeverity: Record<string, number> = {};
  for (const i of issueList) {
    issuesByRule[i.rule] = (issuesByRule[i.rule] ?? 0) + 1;
    issuesBySeverity[i.severity] = (issuesBySeverity[i.severity] ?? 0) + 1;
  }

  return {
    athletes: [...athletes.values()],
    academies: [...academies.values()],
    enrollments: [...enrollments.values()],
    sports: [...sportMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    centreTypes: [...centreTypes.values()].sort((a, b) => a.id - b.id),
    issues: issueList,
    rejected,
    stats: {
      rowsRead: rows.length,
      rowsAccepted: rows.length - rejected.length,
      rowsRejected: rejected.length,
      rowsWithoutAcademy,
      duplicateEnrollmentRows,
      athleteAttributeConflicts,
      athletes: athletes.size,
      academies: academies.size,
      enrollments: enrollments.size,
      sports: sportMap.size,
      centreTypes: centreTypes.size,
      athletesWithoutEnrollment,
      issuesByRule,
      issuesBySeverity,
    },
  };
}

export { isoDateFromParts };
