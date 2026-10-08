import { eq, sql } from "drizzle-orm";
import { capabilitiesFor, isScopedRole, type Capability, type Role, type Scope } from "@/domain/permissions";
import type { Db } from "../db/client";
import { userAcademies, users } from "../db/schema";
import { LOCKOUT_MINUTES, MAX_FAILED_LOGINS } from "../env";
import { AppError } from "../errors";
import { audit } from "./audit";
import { verifyPassword } from "./password";
import { sessionVersion, signSession } from "./session";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  caps: ReadonlySet<Capability>;
  scope: Scope;
}

export function can(user: SessionUser, cap: Capability): boolean {
  return user.caps.has(cap);
}

export async function loadUser(db: Db, id: string): Promise<(SessionUser & { passwordHash: string }) | null> {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u || !u.isActive) return null;
  const role = u.role as Role;
  let academyIds: number[] | null = null;
  if (isScopedRole(role)) {
    const rows = await db.select({ id: userAcademies.academyId }).from(userAcademies).where(eq(userAcademies.userId, u.id));
    academyIds = rows.map((r) => r.id);
  }
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role,
    caps: capabilitiesFor(role),
    scope: { academyIds },
    passwordHash: u.passwordHash,
  };
}

/**
 * Verifies credentials with lockout (5 failures → 15 min). Returns a signed session token.
 * Errors are deliberately generic so they do not reveal whether an account exists.
 */
export async function authenticate(
  db: Db,
  email: string,
  password: string,
  ip: string | null,
): Promise<{ token: string; user: SessionUser }> {
  const normalized = email.trim().toLowerCase();
  const [row] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.email})`, normalized));

  if (row?.lockedUntil && row.lockedUntil.getTime() > Date.now()) {
    await audit(db, { actorId: row.id, actorEmail: row.email, action: "login_blocked", ip });
    throw new AppError(429, "locked", `Too many failed attempts. Try again in ${LOCKOUT_MINUTES} minutes.`);
  }

  const ok = await verifyPassword(password, row && row.isActive ? row.passwordHash : null);
  if (!row || !ok) {
    if (row) {
      const failed = row.failedLogins + 1;
      const lock = failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null;
      await db
        .update(users)
        .set({ failedLogins: lock ? 0 : failed, lockedUntil: lock })
        .where(eq(users.id, row.id));
    }
    await audit(db, { actorId: row?.id ?? null, actorEmail: normalized, action: "login_failed", ip });
    throw new AppError(401, "invalid_credentials", "Invalid email or password");
  }

  await db.update(users).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, row.id));
  await audit(db, { actorId: row.id, actorEmail: row.email, action: "login", ip });
  const user = await loadUser(db, row.id);
  if (!user) throw new AppError(401, "invalid_credentials", "Invalid email or password");
  const token = await signSession({ sub: row.id, sv: sessionVersion(row.passwordHash) });
  const { passwordHash: _ph, ...safe } = user;
  return { token, user: safe };
}
