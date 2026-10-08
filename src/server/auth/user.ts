import type { Capability, Role, Scope } from "@/domain/permissions";

/**
 * Who is acting. There are no accounts or sign-in anywhere in the app: this is the *portal* chosen on the home page
 * (see ./prototype.ts), carrying that portal's capabilities and data scope.
 */
export interface PortalUser {
  id: string;
  /** Stable label for audit rows, e.g. "portal:admin". */
  email: string;
  name: string;
  role: Role;
  caps: ReadonlySet<Capability>;
  scope: Scope;
}
