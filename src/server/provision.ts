import { eq, sql } from "drizzle-orm";
import type { Role } from "@/domain/permissions";
import { isScopedRole } from "@/domain/permissions";
import type { SessionUser } from "./auth/authenticate";
import { verifyPassword } from "./auth/password";
import type { Db } from "./db/client";
import { userAcademies, users } from "./db/schema";
import { createUser, loginIdSchema, updateUser } from "./services/users";

type Env = Record<string, string | undefined>;

export interface AccountSpec {
  /** Env-var infix: RCMS_<KEY>_USERNAME / _PASSWORD / _NAME */
  key: "ADMIN" | "HQ" | "CENTRE" | "ANALYST";
  role: Role;
  defaultLogin: string;
  defaultName: string;
}

/** The four standard accounts. Their default login ids are the plain usernames admin / hq / centre / analyst. */
export const ACCOUNT_SPECS: readonly AccountSpec[] = [
  { key: "ADMIN", role: "ADMIN", defaultLogin: "admin", defaultName: "Administrator" },
  { key: "HQ", role: "HQ_OFFICER", defaultLogin: "hq", defaultName: "HQ Officer" },
  { key: "CENTRE", role: "CENTRE_USER", defaultLogin: "centre", defaultName: "Centre User" },
  { key: "ANALYST", role: "ANALYST", defaultLogin: "analyst", defaultName: "Analyst" },
];

export type ProvisionAction = "created" | "password_updated" | "academies_updated" | "unchanged" | "skipped" | "error";

export interface ProvisionResult {
  key: AccountSpec["key"];
  login: string;
  role: Role;
  action: ProvisionAction;
  /** Human-readable reason; never contains the password. */
  detail?: string;
}

export function parseIdList(raw: string | undefined): number[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(/[\s,;]+/)
        .filter(Boolean)
        .map(Number),
    ),
  ].filter((n) => Number.isInteger(n) && n > 0);
}

const SYSTEM_ACTOR = { id: "00000000-0000-0000-0000-000000000000", email: "system:provision" } as unknown as SessionUser;

/**
 * Makes the database match the account variables in the environment (the environment is the source of truth
 * for these four accounts' passwords). Idempotent; safe to run on every deploy.
 *
 *   RCMS_ADMIN_PASSWORD / RCMS_HQ_PASSWORD / RCMS_CENTRE_PASSWORD / RCMS_ANALYST_PASSWORD   (unset → account skipped)
 *   RCMS_<KEY>_USERNAME   optional override of the login id (defaults: admin, hq, centre, analyst)
 *   RCMS_<KEY>_NAME       optional display name
 *   RCMS_CENTRE_ACADEMY_IDS   comma-separated centre ids the centre user may see (required for that account)
 *
 * Nothing is deleted, deactivated accounts stay deactivated, and a role is never changed silently.
 */
export async function provisionUsers(db: Db, env: Env = process.env): Promise<ProvisionResult[]> {
  const out: ProvisionResult[] = [];
  for (const spec of ACCOUNT_SPECS) {
    const base = { key: spec.key, role: spec.role };
    // Values pasted into hosting dashboards often carry a trailing newline; that would silently become part of the password.
    const rawPassword = env[`RCMS_${spec.key}_PASSWORD`];
    const password = rawPassword?.replace(/[\r\n]+$/, "");
    const paddedPassword = Boolean(password && password !== password.trim());
    const rawLogin = env[`RCMS_${spec.key}_USERNAME`]?.trim() || spec.defaultLogin;
    if (!password) {
      out.push({ ...base, login: rawLogin, action: "skipped", detail: `RCMS_${spec.key}_PASSWORD is not set` });
      continue;
    }
    const parsed = loginIdSchema.safeParse(rawLogin);
    if (!parsed.success) {
      out.push({ ...base, login: rawLogin, action: "error", detail: `RCMS_${spec.key}_USERNAME is not a valid login id` });
      continue;
    }
    const login = parsed.data;
    const name = env[`RCMS_${spec.key}_NAME`]?.trim() || spec.defaultName;
    const academyIds = isScopedRole(spec.role) ? parseIdList(env[`RCMS_${spec.key}_ACADEMY_IDS`]) : [];

    try {
      const [existing] = await db
        .select()
        .from(users)
        .where(eq(sql`lower(${users.email})`, login));
      if (!existing) {
        if (isScopedRole(spec.role) && academyIds.length === 0) {
          out.push({
            ...base,
            login,
            action: "skipped",
            detail: `RCMS_${spec.key}_ACADEMY_IDS must list the centre ids this account may see`,
          });
          continue;
        }
        await createUser(db, null, { email: login, name, role: spec.role, password, academyIds }, null);
        out.push({
          ...base,
          login,
          action: "created",
          ...(paddedPassword ? { detail: `RCMS_${spec.key}_PASSWORD has leading/trailing spaces, which are part of the password` } : {}),
        });
        continue;
      }
      if (existing.role !== spec.role) {
        out.push({
          ...base,
          login,
          action: "error",
          detail: `account exists with role ${existing.role}, expected ${spec.role}; change it in the Users page or choose another username`,
        });
        continue;
      }
      const actions: ProvisionAction[] = [];
      if (!(await verifyPassword(password, existing.passwordHash))) {
        await updateUser(db, SYSTEM_ACTOR, existing.id, { password }, null);
        actions.push("password_updated");
      }
      if (isScopedRole(spec.role) && academyIds.length) {
        const current = (
          await db.select({ id: userAcademies.academyId }).from(userAcademies).where(eq(userAcademies.userId, existing.id))
        ).map((r) => r.id);
        const same = current.length === academyIds.length && academyIds.every((i) => current.includes(i));
        if (!same) {
          await updateUser(db, SYSTEM_ACTOR, existing.id, { academyIds }, null);
          actions.push("academies_updated");
        }
      }
      out.push({
        ...base,
        login,
        action: actions[0] ?? "unchanged",
        ...(actions.length > 1 ? { detail: actions.join(" + ") } : {}),
        ...(!existing.isActive ? { detail: "account is deactivated; not re-enabled automatically" } : {}),
      });
    } catch (e) {
      // createUser/updateUser throw AppError with a safe message (e.g. password policy); anything else is summarised.
      const msg = e instanceof Error ? e.message : "unknown error";
      out.push({ ...base, login, action: "error", detail: msg.split("\n")[0]!.slice(0, 200) });
    }
  }
  return out;
}
