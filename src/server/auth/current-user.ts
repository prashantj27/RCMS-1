import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Capability } from "@/domain/permissions";
import { getDb } from "../db/client";
import { SESSION_COOKIE, authMode } from "../env";
import { forbidden, unauthorized } from "../errors";
import { loadUser, type SessionUser } from "./authenticate";
import { getPrototypeUser } from "./prototype";
import { sessionVersion, verifySession } from "./session";

/**
 * Resolves the current user for this request (or null).
 *  - prototype mode: the portal chosen on the home page (no credentials)
 *  - login mode: the signed-in account; the DB is re-checked so deactivation is immediate
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (authMode() === "prototype") return getPrototypeUser();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySession(token);
  if (!claims) return null;
  const db = await getDb();
  const user = await loadUser(db, claims.sub);
  if (!user || sessionVersion(user.passwordHash) !== claims.sv) return null;
  const { passwordHash: _ph, ...safe } = user;
  return safe;
});

/** For pages / layouts: redirects to the portal chooser (prototype) or /login, or to /forbidden for a missing capability. */
export async function requireUser(cap?: Capability): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(authMode() === "prototype" ? "/" : "/login");
  if (cap && !user.caps.has(cap)) redirect("/forbidden");
  return user;
}

/** For route handlers: throws AppError (rendered as JSON). */
export async function requireApiUser(cap?: Capability): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  if (cap && !user.caps.has(cap)) throw forbidden();
  return user;
}
