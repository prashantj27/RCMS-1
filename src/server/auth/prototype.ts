import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { ROLES, type Role } from "@/domain/permissions";
import { CENTRE_COOKIE, PORTAL_COOKIE, PROTOTYPE_USER_IDS, portalByRole, prototypeCapabilities } from "@/domain/prototype";
import { getDb, type Db } from "../db/client";
import { academies } from "../db/schema";
import type { SessionUser } from "./authenticate";

/** The user object for a portal. `academyId` is only meaningful (and required) for the centre portal. */
export function buildPrototypeUser(role: Role, centre?: { id: number; name: string }): SessionUser {
  const portal = portalByRole(role);
  return {
    id: PROTOTYPE_USER_IDS[role],
    email: `prototype:${portal.slug}`,
    name: role === "CENTRE_USER" && centre ? centre.name : `${portal.title} portal`,
    role,
    caps: prototypeCapabilities(role),
    scope: { academyIds: role === "CENTRE_USER" ? (centre ? [centre.id] : []) : null },
  };
}

/** Unrestricted read-only persona used by the portal chooser to list centres. */
export const prototypeBrowser = (): SessionUser => buildPrototypeUser("ADMIN");

export async function findCentre(db: Db, id: number): Promise<{ id: number; name: string } | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const [row] = await db.select({ id: academies.id, name: academies.name }).from(academies).where(eq(academies.id, id));
  return row ?? null;
}

/** Reads the portal choice from the cookies set by /enter/*; null when nothing (valid) was chosen yet. */
export async function getPrototypeUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const role = jar.get(PORTAL_COOKIE)?.value as Role | undefined;
  if (!role || !ROLES.includes(role)) return null;
  if (role !== "CENTRE_USER") return buildPrototypeUser(role);
  const centre = await findCentre(await getDb(), Number(jar.get(CENTRE_COOKIE)?.value));
  return centre ? buildPrototypeUser(role, centre) : null; // stale / missing centre → choose again
}
