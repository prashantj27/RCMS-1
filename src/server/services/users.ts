import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { isScopedRole, ROLES, type Role } from "@/domain/permissions";
import { audit } from "../auth/audit";
import type { SessionUser } from "../auth/authenticate";
import { hashPassword, passwordPolicyError } from "../auth/password";
import type { Db } from "../db/client";
import { academies, userAcademies, users } from "../db/schema";
import { badRequest, conflict, notFound } from "../errors";

/**
 * Login id: a plain username ("admin", "hq") or an email address. Stored lower-cased in the `email` column
 * (the column predates username logins; it holds whatever the person signs in with).
 */
export const loginIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._@+-]{1,199}$/, "Use 2–200 letters, digits or . _ @ + - (starting with a letter or digit)");

export const createUserSchema = z.object({
  email: loginIdSchema,
  name: z.string().trim().min(1).max(120),
  role: z.enum(ROLES),
  password: z.string().min(1).max(128),
  academyIds: z.array(z.number().int().positive()).max(5000).default([]),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    role: z.enum(ROLES).optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(1).max(128).optional(),
    academyIds: z.array(z.number().int().positive()).max(5000).optional(),
  })
  .strict();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export interface UserView {
  id: string;
  email: string;
  name: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: string | null;
  academyCount: number;
}

export async function listUsers(db: Db): Promise<UserView[]> {
  const r = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      academyCount: sql<number>`(select count(*)::int from user_academies ua where ua.user_id = ${users.id})`,
    })
    .from(users)
    .orderBy(users.email);
  return r.map((u) => ({
    ...u,
    role: u.role as Role,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    academyCount: Number(u.academyCount),
  }));
}

async function assertAcademiesExist(db: Db, ids: number[]) {
  if (!ids.length) return;
  const found = await db.select({ id: academies.id }).from(academies).where(inArray(academies.id, ids));
  if (found.length !== new Set(ids).size) throw badRequest("One or more academy ids do not exist");
}

/** Postgres unique_violation (23505), however the driver wraps it. */
export function isUniqueViolation(e: unknown): boolean {
  for (let cur: unknown = e, i = 0; cur && i < 4; i++) {
    if ((cur as { code?: string }).code === "23505") return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

export async function createUser(db: Db, actor: SessionUser | null, rawInput: CreateUserInput, ip: string | null): Promise<UserView> {
  const input = { ...rawInput, email: rawInput.email.trim().toLowerCase() };
  const problem = passwordPolicyError(input.password, input.email);
  if (problem) throw badRequest(problem);
  if (isScopedRole(input.role) && input.academyIds.length === 0) {
    throw badRequest("Centre users must be assigned at least one academy");
  }
  await assertAcademiesExist(db, input.academyIds);
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.email})`, input.email));
  if (existing) throw conflict("A user with that email already exists");
  const passwordHash = await hashPassword(input.password);
  let id: string;
  try {
    id = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({ email: input.email, name: input.name, role: input.role, passwordHash })
        .returning({ id: users.id });
      if (isScopedRole(input.role) && input.academyIds.length) {
        await tx.insert(userAcademies).values([...new Set(input.academyIds)].map((academyId) => ({ userId: u!.id, academyId })));
      }
      return u!.id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict("A user with that email already exists"); // lost a race with a concurrent create
    throw e;
  }
  await audit(db, {
    actorId: actor?.id ?? null,
    actorEmail: actor?.email ?? "system",
    action: "user_create",
    entityType: "user",
    entityId: id,
    detail: { email: input.email, role: input.role },
    ip,
  });
  return (await listUsers(db)).find((u) => u.id === id)!;
}

export async function updateUser(db: Db, actor: SessionUser, id: string, input: UpdateUserInput, ip: string | null): Promise<UserView> {
  const [current] = await db.select().from(users).where(eq(users.id, id));
  if (!current) throw notFound("User");
  if (id === actor.id && (input.isActive === false || (input.role && input.role !== "ADMIN"))) {
    throw badRequest("You cannot deactivate or demote your own account");
  }
  const set: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) set.name = input.name;
  if (input.role !== undefined) set.role = input.role;
  if (input.isActive !== undefined) set.isActive = input.isActive;
  if (input.password !== undefined) {
    const problem = passwordPolicyError(input.password, current.email);
    if (problem) throw badRequest(problem);
    set.passwordHash = await hashPassword(input.password); // also invalidates existing sessions
    set.failedLogins = 0;
    set.lockedUntil = null;
  }
  const role = (input.role ?? current.role) as Role;
  if (input.academyIds) await assertAcademiesExist(db, input.academyIds);
  if (isScopedRole(role)) {
    const finalIds =
      input.academyIds ??
      (await db.select({ a: userAcademies.academyId }).from(userAcademies).where(eq(userAcademies.userId, id))).map((r) => r.a);
    if (finalIds.length === 0) throw badRequest("Centre users must be assigned at least one academy");
  }
  await db.transaction(async (tx) => {
    await tx.update(users).set(set).where(eq(users.id, id));
    if (!isScopedRole(role)) {
      await tx.delete(userAcademies).where(eq(userAcademies.userId, id));
    } else if (input.academyIds) {
      await tx.delete(userAcademies).where(eq(userAcademies.userId, id));
      await tx.insert(userAcademies).values([...new Set(input.academyIds)].map((academyId) => ({ userId: id, academyId })));
    }
  });
  await audit(db, {
    actorId: actor.id,
    actorEmail: actor.email,
    action: "user_update",
    entityType: "user",
    entityId: id,
    detail: { ...input, password: input.password ? "[changed]" : undefined },
    ip,
  });
  return (await listUsers(db)).find((u) => u.id === id)!;
}
