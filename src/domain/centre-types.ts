import { slugify } from "./normalize";

export type CentreOperator = "SAI" | "SLKIC" | "ACADEMY";

export interface CentreTypeDef {
  /** Matches `role_detail_id` in the source export. */
  id: number;
  code: string;
  label: string;
  operator: CentreOperator;
}

/** Centre types observed in RC_monitoring_Athlete_Details_V1 (role_detail_id → label). */
export const KNOWN_CENTRE_TYPES: readonly CentreTypeDef[] = [
  { id: 6, code: "ACADEMY", label: "Academy", operator: "ACADEMY" },
  { id: 29, code: "NCOE_SAI", label: "NCOE (SAI)", operator: "SAI" },
  { id: 40, code: "SATC_SAI", label: "SATC (SAI)", operator: "SAI" },
  { id: 41, code: "ABSC_SAI", label: "ABSC (SAI)", operator: "SAI" },
  { id: 42, code: "SKIC_SAI", label: "SKIC (SAI)", operator: "SAI" },
  { id: 43, code: "NSTC_SAI", label: "NSTC (SAI)", operator: "SAI" },
  { id: 69, code: "ABSC_SLKIC", label: "ABSC (SLKIC)", operator: "SLKIC" },
  { id: 80, code: "KICE_SLKIC", label: "KICE (SLKIC)", operator: "SLKIC" },
  { id: 82, code: "SKIC_SLKIC", label: "SKIC (SLKIC)", operator: "SLKIC" },
];

/** Derive a definition for a role id we have not seen before, so imports never fail on new types. */
export function centreTypeFromRole(id: number, label: string): CentreTypeDef {
  const known = KNOWN_CENTRE_TYPES.find((t) => t.id === id);
  if (known) return known;
  const operator: CentreOperator = /\(SAI\)/i.test(label) ? "SAI" : /\(SLKIC\)/i.test(label) ? "SLKIC" : "ACADEMY";
  return { id, code: slugify(label).toUpperCase().replace(/-/g, "_") || `TYPE_${id}`, label, operator };
}
