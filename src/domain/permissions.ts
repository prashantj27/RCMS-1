export const ROLES = ["ADMIN", "HQ_OFFICER", "CENTRE_USER", "ANALYST"] as const;
export type Role = (typeof ROLES)[number];

export type Capability =
  | "athletes:read"
  | "athletes:read_pii"
  | "athletes:write"
  | "academies:read"
  | "analytics:read"
  | "kit:read"
  | "dq:read"
  | "imports:read"
  | "imports:run"
  | "audit:read";

const ALL: Capability[] = [
  "athletes:read",
  "athletes:read_pii",
  "athletes:write",
  "academies:read",
  "analytics:read",
  "kit:read",
  "dq:read",
  "imports:read",
  "imports:run",
  "audit:read",
];

/**
 * Role → capabilities.
 *  ADMIN        everything (all data, edits, imports)
 *  HQ_OFFICER   national view of all athletes incl. PII; no edits, imports or user admin
 *  CENTRE_USER  works only on the academies assigned to them (see `isScopedRole`)
 *  ANALYST      aggregates and data quality only – no athlete-level records
 */
export const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  ADMIN: ALL,
  HQ_OFFICER: ["athletes:read", "athletes:read_pii", "academies:read", "analytics:read", "kit:read", "dq:read", "imports:read"],
  CENTRE_USER: ["athletes:read", "athletes:read_pii", "athletes:write", "academies:read", "analytics:read", "kit:read", "dq:read"],
  ANALYST: ["academies:read", "analytics:read", "kit:read", "dq:read"],
};

export const isScopedRole = (role: Role) => role === "CENTRE_USER";

export function capabilitiesFor(role: Role): ReadonlySet<Capability> {
  return new Set(ROLE_CAPABILITIES[role]);
}

/** `academyIds: null` means unrestricted; an array (possibly empty) restricts to those academies. */
export interface Scope {
  academyIds: number[] | null;
}
export const UNRESTRICTED: Scope = { academyIds: null };
