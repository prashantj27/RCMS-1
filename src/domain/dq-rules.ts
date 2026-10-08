export type Severity = "error" | "warning" | "info";
export type DqEntityType = "athlete" | "academy";

export interface DqRuleDef {
  severity: Severity;
  entity: DqEntityType;
  title: string;
  description: string;
}

/**
 * Catalogue of data-quality rules. Codes are stable identifiers stored in the
 * database; never rename one without a migration.
 */
export const DQ_RULES = {
  NAME_MISSING: { severity: "error", entity: "athlete", title: "Athlete name missing", description: "full_name is empty." },
  DOB_INVALID: {
    severity: "error",
    entity: "athlete",
    title: "Date of birth invalid",
    description: "Date of birth is unparseable or outside 1900 – today. The value is not stored.",
  },
  DOB_AGE_OUTLIER: {
    severity: "warning",
    entity: "athlete",
    title: "Implausible age",
    description: "Age is below 5 or above 50 years; the date of birth is probably wrong.",
  },
  DOB_PLACEHOLDER_LIKELY: {
    severity: "info",
    entity: "athlete",
    title: "Date of birth is 1 January",
    description: "1 January is the usual placeholder when only the birth year is known.",
  },
  MOBILE_INVALID: {
    severity: "warning",
    entity: "athlete",
    title: "Mobile value unrecognised",
    description: "Mobile number is not in the expected encrypted format (plain digits are never stored).",
  },
  KITID_FORMAT: {
    severity: "warning",
    entity: "athlete",
    title: "Athlete KIT id malformed",
    description: "athlete_kitd_id does not follow the SSAAnnnGyy pattern.",
  },
  KITID_GENDER_MISMATCH: {
    severity: "warning",
    entity: "athlete",
    title: "KIT id gender ≠ gender",
    description: "Gender letter embedded in the KIT id disagrees with the gender column.",
  },
  KITID_YEAR_MISMATCH: {
    severity: "warning",
    entity: "athlete",
    title: "KIT id birth year ≠ date of birth",
    description: "Birth year embedded in the KIT id disagrees with the date of birth.",
  },
  PARENT_PLACEHOLDER: {
    severity: "info",
    entity: "athlete",
    title: "Placeholder parent name",
    description: "Parent name is a placeholder such as 'father', 'mother' or 'abc'. The value is not stored.",
  },
  SIZE_INVALID: {
    severity: "warning",
    entity: "athlete",
    title: "Kit size invalid",
    description: "A shoe/blazer/t-shirt/pant size is out of range or in an unknown format. The value is not stored.",
  },
  KITTING_DATE_INVALID: {
    severity: "warning",
    entity: "athlete",
    title: "Kitting date invalid",
    description: "kitting_updated_date is unparseable or in the future.",
  },
  NO_ACADEMY: {
    severity: "warning",
    entity: "athlete",
    title: "Not enrolled in any academy",
    description: "The athlete has no academy / centre enrolment.",
  },
  MULTI_ENROLLMENT: {
    severity: "info",
    entity: "athlete",
    title: "Enrolled in 3+ academies",
    description: "Athlete is enrolled in three or more academies; check for a mis-linked profile.",
  },
  JOIN_DATE_INVALID: {
    severity: "warning",
    entity: "athlete",
    title: "Joining date invalid",
    description: "date_of_joining is unparseable, before 1990 or in the future. The value is not stored.",
  },
  JOIN_BEFORE_BIRTH: {
    severity: "error",
    entity: "athlete",
    title: "Joined before birth",
    description: "date_of_joining is earlier than date_of_birth.",
  },
  JOIN_AGE_IMPLAUSIBLE: {
    severity: "info",
    entity: "athlete",
    title: "Joined under age 4",
    description: "Athlete would have been younger than four when joining the academy.",
  },
  ATHLETE_TYPE_MISSING: {
    severity: "info",
    entity: "athlete",
    title: "Residential status missing",
    description: "type_of_athelete is empty for this enrolment.",
  },
  INACTIVE_ACADEMY: {
    severity: "warning",
    entity: "athlete",
    title: "Enrolled in inactive academy",
    description: "The academy is flagged inactive but still has this athlete enrolled.",
  },
  POSSIBLE_DUPLICATE: {
    severity: "warning",
    entity: "athlete",
    title: "Possible duplicate athlete",
    description: "Another athlete id has the same name, date of birth and father's name.",
  },
  ACADEMY_NAME_MISSING: { severity: "error", entity: "academy", title: "Academy name missing", description: "academy_name is empty." },
  ACADEMY_CODE_SHARED: {
    severity: "warning",
    entity: "academy",
    title: "Academy code shared",
    description: "The same academy_kitd_id is used by more than one academy record.",
  },
} as const satisfies Record<string, DqRuleDef>;

export type DqRuleCode = keyof typeof DQ_RULES;

export const DQ_RULE_CODES = Object.keys(DQ_RULES) as DqRuleCode[];

export interface DqIssue {
  entityType: DqEntityType;
  entityId: number;
  /** Disambiguates multiple findings of one rule on one entity (e.g. academy id, size item). */
  ref: string;
  rule: DqRuleCode;
  severity: Severity;
  message: string;
  detail?: Record<string, unknown>;
}

export function issue(
  rule: DqRuleCode,
  entityId: number,
  message: string,
  opts: { ref?: string; detail?: Record<string, unknown> } = {},
): DqIssue {
  const def: DqRuleDef = DQ_RULES[rule];
  return {
    entityType: def.entity,
    entityId,
    ref: opts.ref ?? "",
    rule,
    severity: def.severity,
    message,
    ...(opts.detail ? { detail: opts.detail } : {}),
  };
}

export const issueKey = (i: Pick<DqIssue, "entityType" | "entityId" | "rule" | "ref">) =>
  `${i.entityType}:${i.entityId}:${i.rule}:${i.ref}`;

/** Rules persisted by the importer. POSSIBLE_DUPLICATE is derived afterwards in SQL. */
export const IMPORT_MANAGED_RULES: DqRuleCode[] = DQ_RULE_CODES.filter((c) => c !== "POSSIBLE_DUPLICATE");
