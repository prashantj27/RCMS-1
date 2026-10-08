import { capabilitiesFor, type Capability, type Role } from "./permissions";

/**
 * Prototype mode: there is no sign-in. The home page offers one button per portal; choosing one makes the
 * session behave exactly like that role (same capabilities, same scope) – except user administration, which
 * has no meaning without accounts.
 */
export interface PortalDef {
  slug: "admin" | "hq" | "centre" | "analyst";
  role: Role;
  title: string;
  tagline: string;
  /** Plain-language list, kept in sync with ROLE_CAPABILITIES by a unit test. */
  can: string[];
  cannot: string[];
}

export const PORTALS: readonly PortalDef[] = [
  {
    slug: "admin",
    role: "ADMIN",
    title: "Administrator",
    tagline: "Full control of the registry",
    can: [
      "All athletes and centres, with personal details",
      "Edit kit sizes and kit-issued status",
      "Import / validate athlete workbooks",
      "Dashboards, kit planning, data quality",
    ],
    cannot: ["User accounts (not needed in the prototype)"],
  },
  {
    slug: "hq",
    role: "HQ_OFFICER",
    title: "HQ officer",
    tagline: "National, read-only view",
    can: ["All athletes and centres, with personal details", "Dashboards, kit planning, data quality", "See the import history"],
    cannot: ["Edit anything", "Run imports"],
  },
  {
    slug: "centre",
    role: "CENTRE_USER",
    title: "Centre user",
    tagline: "One centre – you choose which",
    can: [
      "Only the athletes enrolled in your centre",
      "Edit their kit sizes and kit-issued status",
      "Centre dashboard, kit planning, data quality",
    ],
    cannot: ["Other centres' data", "Run imports"],
  },
  {
    slug: "analyst",
    role: "ANALYST",
    title: "Analyst",
    tagline: "Aggregates only",
    can: ["National dashboard, kit planning, data quality", "Centre list with counts"],
    cannot: ["Individual athlete records or personal details", "Edit anything"],
  },
];

export const portalBySlug = (slug: string): PortalDef | undefined => PORTALS.find((p) => p.slug === slug);
export const portalByRole = (role: Role): PortalDef => PORTALS.find((p) => p.role === role)!;

/** Stable ids so audit rows / "edited by" columns have a consistent, obviously-synthetic actor per portal. */
export const PROTOTYPE_USER_IDS: Record<Role, string> = {
  ADMIN: "00000000-0000-4000-8000-000000000001",
  HQ_OFFICER: "00000000-0000-4000-8000-000000000002",
  CENTRE_USER: "00000000-0000-4000-8000-000000000003",
  ANALYST: "00000000-0000-4000-8000-000000000004",
};

/** Capabilities of a prototype portal = the real role's, minus account management. */
export function prototypeCapabilities(role: Role): ReadonlySet<Capability> {
  const caps = new Set(capabilitiesFor(role));
  caps.delete("users:manage");
  return caps;
}

export const PORTAL_COOKIE = "rcms_portal";
export const CENTRE_COOKIE = "rcms_centre";
