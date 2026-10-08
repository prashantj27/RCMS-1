import { and as dAnd, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { parseGarmentSize, parseShoeSize } from "@/domain/normalize";
import { DQ_RULES, type DqRuleCode } from "@/domain/dq-rules";
import { stateName } from "@/domain/states";
import type { SessionUser } from "../auth/authenticate";
import { audit } from "../auth/audit";
import type { Db } from "../db/client";
import { athletes, dqIssues } from "../db/schema";
import { num, one, rows } from "../db/util";
import { badRequest, forbidden, notFound } from "../errors";
import { AGE_SQL, athleteWhere, idList, type AthleteListQuery } from "./filters";

export interface EnrollmentView {
  academyId: number;
  academyName: string;
  centreType: string | null;
  stateCode: string | null;
  stateName: string | null;
  academyActive: boolean;
  athleteType: string | null;
  joinedOn: string | null;
}

export interface AthleteListItem {
  id: number;
  kitId: string;
  fullName: string | null;
  gender: "M" | "F";
  age: number | null;
  sportId: number;
  sport: string;
  issueCount: number;
  enrollments: EnrollmentView[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

const ORDER: Record<AthleteListQuery["sort"], ReturnType<typeof sql>> = {
  name: sql`(a.search_name = ''), a.search_name, a.id`,
  recent: sql`a.id desc`,
  kit: sql`a.kit_id, a.id`,
  age_asc: sql`a.dob desc nulls last, a.id`,
  age_desc: sql`a.dob asc nulls last, a.id`,
};

async function enrollmentsFor(db: Db, athleteIds: number[]): Promise<Map<number, EnrollmentView[]>> {
  const map = new Map<number, EnrollmentView[]>();
  if (!athleteIds.length) return map;
  const r = await rows<{
    athlete_id: number;
    academy_id: number;
    name: string;
    centre_type: string | null;
    state_code: string | null;
    is_active: boolean;
    athlete_type: string | null;
    joined_on: string | null;
  }>(
    db,
    sql`select e.athlete_id, ac.id as academy_id, ac.name, ct.label as centre_type, ac.state_code, ac.is_active, e.athlete_type, e.joined_on::text as joined_on
        from enrollments e
        join academies ac on ac.id = e.academy_id
        left join centre_types ct on ct.id = ac.centre_type_id
        where e.athlete_id in (${idList(athleteIds)})
        order by e.athlete_id, e.joined_on desc nulls last, e.id desc`,
  );
  for (const x of r) {
    const list = map.get(x.athlete_id) ?? [];
    list.push({
      academyId: x.academy_id,
      academyName: x.name,
      centreType: x.centre_type,
      stateCode: x.state_code,
      stateName: stateName(x.state_code),
      academyActive: x.is_active,
      athleteType: x.athlete_type,
      joinedOn: x.joined_on,
    });
    map.set(x.athlete_id, list);
  }
  return map;
}

export async function listAthletes(db: Db, user: SessionUser, q: AthleteListQuery): Promise<Page<AthleteListItem>> {
  const where = athleteWhere(q, user.scope);
  const total = num((await one<{ n: number }>(db, sql`select count(*)::int as n from athletes a where ${where}`))?.n);
  const pageCount = Math.max(1, Math.ceil(total / q.pageSize));
  const page = Math.min(q.page, pageCount);
  const list = await rows<{
    id: number;
    kit_id: string;
    full_name: string | null;
    gender: "M" | "F";
    age: number | null;
    sport_id: number;
    sport: string;
    issue_count: number;
  }>(
    db,
    sql`select a.id, a.kit_id, a.full_name, a.gender, ${AGE_SQL} as age, s.id as sport_id, s.name as sport,
               (select count(*)::int from dq_issues d where d.entity_type = 'athlete' and d.entity_id = a.id and d.severity in ('error','warning')) as issue_count
        from athletes a join sports s on s.id = a.sport_id
        where ${where}
        order by ${ORDER[q.sort]}
        limit ${q.pageSize} offset ${(page - 1) * q.pageSize}`,
  );
  const enr = await enrollmentsFor(
    db,
    list.map((r) => r.id),
  );
  return {
    items: list.map((r) => ({
      id: r.id,
      kitId: r.kit_id,
      fullName: r.full_name,
      gender: r.gender,
      age: r.age === null ? null : Number(r.age),
      sportId: r.sport_id,
      sport: r.sport,
      issueCount: num(r.issue_count),
      enrollments: enr.get(r.id) ?? [],
    })),
    total,
    page,
    pageSize: q.pageSize,
    pageCount,
  };
}

export interface AthleteIssueView {
  rule: DqRuleCode;
  severity: string;
  title: string;
  message: string;
  ref: string;
}

export interface AthleteDetail {
  id: number;
  kitId: string;
  fullName: string | null;
  gender: "M" | "F";
  age: number | null;
  sportId: number;
  sport: string;
  /** Present only for callers with `athletes:read_pii`. */
  dob: string | null;
  fatherName: string | null;
  motherName: string | null;
  kit: {
    shoeSize: number | null;
    blazerSize: string | null;
    tshirtSize: string | null;
    pantSize: string | null;
    kittingUpdatedAt: string | null;
    editedAt: string | null;
  };
  enrollments: EnrollmentView[];
  issues: AthleteIssueView[];
  canEdit: boolean;
}

/** An athlete is visible to a scoped caller only when enrolled in one of their academies. */
async function assertInScope(db: Db, user: SessionUser, athleteId: number): Promise<void> {
  if (user.scope.academyIds === null) return;
  if (!user.scope.academyIds.length) throw notFound("Athlete");
  const hit = await one(
    db,
    sql`select 1 from enrollments e where e.athlete_id = ${athleteId} and e.academy_id in (${idList(user.scope.academyIds)}) limit 1`,
  );
  if (!hit) throw notFound("Athlete");
}

export async function getAthlete(db: Db, user: SessionUser, id: number): Promise<AthleteDetail> {
  await assertInScope(db, user, id);
  const a = await one<{
    id: number;
    kit_id: string;
    full_name: string | null;
    gender: "M" | "F";
    dob: string | null;
    father_name: string | null;
    mother_name: string | null;
    age: number | null;
    sport_id: number;
    sport: string;
    shoe_size: number | null;
    blazer_size: string | null;
    tshirt_size: string | null;
    pant_size: string | null;
    kitting_updated_at: string | null;
    edited_at: string | null;
  }>(
    db,
    sql`select a.id, a.kit_id, a.full_name, a.gender, a.dob::text as dob, a.father_name, a.mother_name, ${AGE_SQL} as age,
               s.id as sport_id, s.name as sport, a.shoe_size, a.blazer_size, a.tshirt_size, a.pant_size,
               a.kitting_updated_at::text as kitting_updated_at, a.edited_at::text as edited_at
        from athletes a join sports s on s.id = a.sport_id where a.id = ${id}`,
  );
  if (!a) throw notFound("Athlete");
  const pii = user.caps.has("athletes:read_pii");
  const enr = await enrollmentsFor(db, [id]);
  const issues = await db
    .select()
    .from(dqIssues)
    .where(dAnd(eq(dqIssues.entityType, "athlete"), eq(dqIssues.entityId, id)));
  const order = { error: 0, warning: 1, info: 2 } as Record<string, number>;
  return {
    id: a.id,
    kitId: a.kit_id,
    fullName: a.full_name,
    gender: a.gender,
    age: a.age === null ? null : Number(a.age),
    sportId: a.sport_id,
    sport: a.sport,
    dob: pii ? a.dob : null,
    fatherName: pii ? a.father_name : null,
    motherName: pii ? a.mother_name : null,
    kit: {
      shoeSize: a.shoe_size === null ? null : Number(a.shoe_size),
      blazerSize: a.blazer_size,
      tshirtSize: a.tshirt_size,
      pantSize: a.pant_size,
      kittingUpdatedAt: a.kitting_updated_at,
      editedAt: a.edited_at,
    },
    enrollments: enr.get(id) ?? [],
    issues: issues
      .map((i) => ({
        rule: i.ruleCode as DqRuleCode,
        severity: i.severity,
        title: DQ_RULES[i.ruleCode as DqRuleCode]?.title ?? i.ruleCode,
        message: i.message,
        ref: i.ref,
      }))
      .sort((x, y) => (order[x.severity] ?? 9) - (order[y.severity] ?? 9)),
    canEdit: user.caps.has("athletes:write"),
  };
}

// ── kit data edits ──

const sizeField = z.union([z.string().trim().max(10), z.number(), z.null()]);
export const kitPatchSchema = z
  .object({
    shoeSize: sizeField.optional(),
    blazerSize: sizeField.optional(),
    tshirtSize: sizeField.optional(),
    pantSize: sizeField.optional(),
    /** Stamp "kit issued" now. */
    markKitted: z.boolean().optional(),
    /** Clear the kitted stamp. */
    clearKitted: z.boolean().optional(),
  })
  .strict();
export type KitPatch = z.infer<typeof kitPatchSchema>;

export async function updateAthleteKit(db: Db, user: SessionUser, id: number, patch: KitPatch, ip: string | null): Promise<AthleteDetail> {
  if (!user.caps.has("athletes:write")) throw forbidden();
  await assertInScope(db, user, id);
  const [current] = await db.select().from(athletes).where(eq(athletes.id, id));
  if (!current) throw notFound("Athlete");

  const set: Partial<typeof athletes.$inferInsert> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const errors: string[] = [];

  if (patch.shoeSize !== undefined) {
    const r = parseShoeSize(patch.shoeSize);
    if (r.invalid) errors.push(`Invalid shoe size '${r.raw}' (expected 1–15)`);
    else {
      set.shoeSize = r.value;
      changes.shoeSize = { from: current.shoeSize, to: r.value };
    }
  }
  for (const [key, item] of [
    ["blazerSize", "blazer"],
    ["tshirtSize", "tshirt"],
    ["pantSize", "pant"],
  ] as const) {
    if (patch[key] === undefined) continue;
    const r = parseGarmentSize(item, patch[key]);
    if (r.invalid) errors.push(`Invalid ${item} size '${r.raw}'`);
    else {
      set[key] = r.value;
      changes[key] = { from: current[key], to: r.value };
    }
  }
  if (errors.length) throw badRequest(errors.join("; "), errors);
  if (patch.markKitted && patch.clearKitted) throw badRequest("markKitted and clearKitted are mutually exclusive");
  if (patch.markKitted) {
    set.kittingUpdatedAt = new Date();
    changes.kittingUpdatedAt = { from: current.kittingUpdatedAt, to: set.kittingUpdatedAt };
  }
  if (patch.clearKitted) {
    set.kittingUpdatedAt = null;
    changes.kittingUpdatedAt = { from: current.kittingUpdatedAt, to: null };
  }
  if (Object.keys(set).length === 0) throw badRequest("Nothing to update");

  await db.transaction(async (tx) => {
    await tx
      .update(athletes)
      .set({ ...set, editedAt: new Date(), editedBy: user.id, updatedAt: new Date() })
      .where(eq(athletes.id, id));
    // Values are validated now, so earlier "invalid size / kitting date" findings no longer apply to what we store.
    const stale: string[] = [];
    if (set.shoeSize !== undefined) stale.push("shoe");
    if ("blazerSize" in set) stale.push("blazer");
    if ("tshirtSize" in set) stale.push("tshirt");
    if ("pantSize" in set) stale.push("pant");
    if (stale.length) {
      await tx
        .delete(dqIssues)
        .where(
          dAnd(
            eq(dqIssues.entityType, "athlete"),
            eq(dqIssues.entityId, id),
            eq(dqIssues.ruleCode, "SIZE_INVALID"),
            inArray(dqIssues.ref, stale),
          ),
        );
    }
    if ("kittingUpdatedAt" in set) {
      await tx
        .delete(dqIssues)
        .where(dAnd(eq(dqIssues.entityType, "athlete"), eq(dqIssues.entityId, id), eq(dqIssues.ruleCode, "KITTING_DATE_INVALID")));
    }
  });
  await audit(db, {
    actorId: user.id,
    actorEmail: user.email,
    action: "athlete_kit_update",
    entityType: "athlete",
    entityId: id,
    detail: changes,
    ip,
  });
  return getAthlete(db, user, id);
}
