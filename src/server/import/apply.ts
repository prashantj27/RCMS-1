import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { AcademyDraft, AthleteDraft, EnrollmentDraft, ImportPlan, RejectedRow } from "@/domain/athlete-master";
import { issueKey, type DqIssue } from "@/domain/dq-rules";
import { slugify } from "@/domain/normalize";
import type { Db } from "../db/client";
import { academies, athletes, centreTypes, dqIssues, enrollments, sports } from "../db/schema";
import { rows } from "../db/util";

// Statement sizes stay under Postgres' 65,535-parameter limit (athletes: 19 columns × 2,500 rows = 47,500)
// while keeping round-trips to a remote database (Neon) to a few dozen for the whole national file.
const ATHLETE_CHUNK = 2500;
const ENROLLMENT_CHUNK = 10_000;
const ISSUE_CHUNK = 6000;
const SMALL_CHUNK = 1000;
const ID_CHUNK = 20_000;

function* chunks<T>(list: readonly T[], size: number): Generator<T[]> {
  for (let i = 0; i < list.length; i += size) yield list.slice(i, i + size) as T[];
}

export interface RegistryCounts {
  athletes: number;
  centres: number;
  enrollments: number;
}

export async function registryCounts(db: Db): Promise<RegistryCounts> {
  const [r] = await rows<{ a: number | string; c: number | string; e: number | string }>(
    db,
    sql`select (select count(*) from athletes)::int as a, (select count(*) from academies)::int as c, (select count(*) from enrollments)::int as e`,
  );
  return { athletes: Number(r?.a ?? 0), centres: Number(r?.c ?? 0), enrollments: Number(r?.e ?? 0) };
}

/** The diff of a plan against an EMPTY registry – what "replace everything" amounts to. */
export function diffAgainstEmpty(plan: ImportPlan): DbDiff {
  return {
    athletesNew: plan.athletes.length,
    athletesExisting: 0,
    academiesNew: plan.academies.length,
    academiesExisting: 0,
    enrollmentsNew: plan.enrollments.length,
    enrollmentsExisting: 0,
    athletesProtectedByManualEdit: 0,
    kitConflictIds: [],
    kitIdConflicts: [],
  };
}

export interface DbDiff {
  athletesNew: number;
  athletesExisting: number;
  academiesNew: number;
  academiesExisting: number;
  enrollmentsNew: number;
  enrollmentsExisting: number;
  /** Existing athletes whose kit data was edited in the app and is therefore preserved. */
  athletesProtectedByManualEdit: number;
  /** Athletes in the file whose KIT id already belongs to a different athlete in the database. */
  kitConflictIds: number[];
  kitIdConflicts: RejectedRow[];
}

/** Read-only comparison of an import plan with the current database. */
export async function diffAgainstDb(db: Db, plan: ImportPlan): Promise<DbDiff> {
  const athleteIds = plan.athletes.map((a) => a.id);
  const existingAthletes = new Set<number>();
  let protectedCount = 0;
  for (const ids of chunks(athleteIds, ID_CHUNK)) {
    const found = await db.select({ id: athletes.id, edited: athletes.editedAt }).from(athletes).where(inArray(athletes.id, ids));
    for (const r of found) {
      existingAthletes.add(r.id);
      if (r.edited) protectedCount++;
    }
  }

  const existingAcademies = new Set<number>();
  for (const ids of chunks(
    plan.academies.map((a) => a.id),
    ID_CHUNK,
  )) {
    const found = await db.select({ id: academies.id }).from(academies).where(inArray(academies.id, ids));
    for (const r of found) existingAcademies.add(r.id);
  }

  const wanted = new Set(plan.enrollments.map((e) => `${e.athleteId}:${e.academyId}`));
  let existingEnrollments = 0;
  for (const ids of chunks(athleteIds, ID_CHUNK)) {
    const found = await db
      .select({ a: enrollments.athleteId, b: enrollments.academyId })
      .from(enrollments)
      .where(inArray(enrollments.athleteId, ids));
    for (const r of found) if (wanted.has(`${r.a}:${r.b}`)) existingEnrollments++;
  }

  // A KIT id is unique. If the file assigns an id that already belongs to a *different* athlete, reject it.
  const kitConflicts: RejectedRow[] = [];
  const kitConflictIds: number[] = [];
  const byKit = new Map(plan.athletes.map((a) => [a.kitId, a.id]));
  for (const ids of chunks([...byKit.keys()], ID_CHUNK)) {
    const found = await db.select({ id: athletes.id, kitId: athletes.kitId }).from(athletes).where(inArray(athletes.kitId, ids));
    for (const r of found) {
      const incoming = byKit.get(r.kitId);
      if (incoming !== undefined && incoming !== r.id) {
        kitConflictIds.push(incoming);
        kitConflicts.push({
          line: 0,
          reasons: [`athlete_kitd_id ${r.kitId} is already used by athlete ${r.id}; file assigns it to ${incoming}`],
        });
      }
    }
  }

  return {
    athletesNew: plan.athletes.length - existingAthletes.size,
    athletesExisting: existingAthletes.size,
    academiesNew: plan.academies.length - existingAcademies.size,
    academiesExisting: existingAcademies.size,
    enrollmentsNew: plan.enrollments.length - existingEnrollments,
    enrollmentsExisting: existingEnrollments,
    athletesProtectedByManualEdit: protectedCount,
    kitConflictIds,
    kitIdConflicts: kitConflicts,
  };
}

/** Removes athletes (and everything that hangs off them) from a plan. */
export function excludeAthletes(plan: ImportPlan, drop: ReadonlySet<number>): ImportPlan {
  if (drop.size === 0) return plan;
  const athletesKept = plan.athletes.filter((a) => !drop.has(a.id));
  const enrollmentsKept = plan.enrollments.filter((e) => !drop.has(e.athleteId));
  const academyIds = new Set(enrollmentsKept.map((e) => e.academyId));
  return {
    ...plan,
    athletes: athletesKept,
    enrollments: enrollmentsKept,
    academies: plan.academies.filter((a) => academyIds.has(a.id)),
    issues: plan.issues.filter((i) => !(i.entityType === "athlete" && drop.has(i.entityId))),
  };
}

export interface ApplyResult {
  athletesWritten: number;
  academiesWritten: number;
  enrollmentsWritten: number;
  issuesWritten: number;
  possibleDuplicates: number;
}

/**
 * Writes a plan inside one transaction. Semantics:
 *  - upsert only (nothing is ever deleted);
 *  - a blank value in the file never erases a known value in the database;
 *  - kit data of athletes edited in the app (edited_at) is preserved.
 * With `replace: true` the registry tables are emptied first, in the same transaction, so afterwards the registry holds
 * exactly the file. That is the only way to retire records the file no longer contains (a previous or demo load).
 * Import history and the audit log are kept; if anything fails the transaction rolls back and nothing changes.
 */
export async function applyImportPlan(db: Db, plan: ImportPlan, batchId: string, opts: { replace?: boolean } = {}): Promise<ApplyResult> {
  return db.transaction(async (tx) => {
    if (opts.replace) {
      await tx.delete(dqIssues);
      await tx.delete(enrollments);
      await tx.delete(athletes);
      await tx.delete(academies);
      await tx.delete(sports);
      await tx.delete(centreTypes);
    }
    // — centre types —
    for (const group of chunks(plan.centreTypes, SMALL_CHUNK)) {
      await tx
        .insert(centreTypes)
        .values(group.map((c) => ({ id: c.id, code: c.code, label: c.label, operator: c.operator })))
        .onConflictDoUpdate({
          target: centreTypes.id,
          set: { label: sql`excluded.label`, operator: sql`excluded.operator` },
        });
    }

    // — sports —
    if (plan.sports.length) {
      await tx.insert(sports).values(plan.sports).onConflictDoNothing({ target: sports.slug });
    }
    const sportRows = await tx.select({ id: sports.id, slug: sports.slug }).from(sports);
    const sportIdBySlug = new Map(sportRows.map((s) => [s.slug, s.id]));

    // — academies —
    for (const group of chunks<AcademyDraft>(plan.academies, SMALL_CHUNK)) {
      await tx
        .insert(academies)
        .values(
          group.map((a) => ({
            id: a.id,
            kitCode: a.kitCode,
            name: a.name,
            centreTypeId: a.centreTypeId,
            isActive: a.isActive,
            stateCode: a.stateCode,
          })),
        )
        .onConflictDoUpdate({
          target: academies.id,
          set: {
            kitCode: sql`coalesce(excluded.kit_code, ${academies.kitCode})`,
            name: sql`excluded.name`,
            centreTypeId: sql`coalesce(excluded.centre_type_id, ${academies.centreTypeId})`,
            isActive: sql`excluded.is_active`,
            stateCode: sql`coalesce(excluded.state_code, ${academies.stateCode})`,
            updatedAt: sql`now()`,
          },
        });
    }

    // — athletes —
    for (const group of chunks<AthleteDraft>(plan.athletes, ATHLETE_CHUNK)) {
      await tx
        .insert(athletes)
        .values(
          group.map((a) => ({
            id: a.id,
            kitId: a.kitId,
            fullName: a.fullName,
            searchName: (a.fullName ?? "").toLowerCase(),
            fatherName: a.fatherName,
            motherName: a.motherName,
            gender: a.gender,
            dob: a.dob,
            mobileCipher: a.mobileCipher,
            sportId: sportIdBySlug.get(slugify(a.sportName))!,
            shoeSize: a.shoeSize,
            blazerSize: a.blazerSize,
            tshirtSize: a.tshirtSize,
            pantSize: a.pantSize,
            kittingUpdatedAt: a.kittingUpdatedAt,
            lastImportBatchId: batchId,
          })),
        )
        .onConflictDoUpdate({
          target: athletes.id,
          set: {
            kitId: sql`excluded.kit_id`,
            fullName: sql`coalesce(excluded.full_name, ${athletes.fullName})`,
            searchName: sql`case when excluded.full_name is null then ${athletes.searchName} else excluded.search_name end`,
            fatherName: sql`coalesce(excluded.father_name, ${athletes.fatherName})`,
            motherName: sql`coalesce(excluded.mother_name, ${athletes.motherName})`,
            gender: sql`excluded.gender`,
            dob: sql`coalesce(excluded.dob, ${athletes.dob})`,
            mobileCipher: sql`coalesce(excluded.mobile_cipher, ${athletes.mobileCipher})`,
            sportId: sql`excluded.sport_id`,
            shoeSize: sql`case when ${athletes.editedAt} is null then coalesce(excluded.shoe_size, ${athletes.shoeSize}) else ${athletes.shoeSize} end`,
            blazerSize: sql`case when ${athletes.editedAt} is null then coalesce(excluded.blazer_size, ${athletes.blazerSize}) else ${athletes.blazerSize} end`,
            tshirtSize: sql`case when ${athletes.editedAt} is null then coalesce(excluded.tshirt_size, ${athletes.tshirtSize}) else ${athletes.tshirtSize} end`,
            pantSize: sql`case when ${athletes.editedAt} is null then coalesce(excluded.pant_size, ${athletes.pantSize}) else ${athletes.pantSize} end`,
            kittingUpdatedAt: sql`case when ${athletes.editedAt} is null then coalesce(excluded.kitting_updated_at, ${athletes.kittingUpdatedAt}) else ${athletes.kittingUpdatedAt} end`,
            lastImportBatchId: sql`excluded.last_import_batch_id`,
            updatedAt: sql`now()`,
          },
        });
    }

    // — enrolments —
    for (const group of chunks<EnrollmentDraft>(plan.enrollments, ENROLLMENT_CHUNK)) {
      await tx
        .insert(enrollments)
        .values(group.map((e) => ({ athleteId: e.athleteId, academyId: e.academyId, athleteType: e.athleteType, joinedOn: e.joinedOn })))
        .onConflictDoUpdate({
          target: [enrollments.athleteId, enrollments.academyId],
          set: {
            athleteType: sql`coalesce(excluded.athlete_type, ${enrollments.athleteType})`,
            joinedOn: sql`coalesce(excluded.joined_on, ${enrollments.joinedOn})`,
            updatedAt: sql`now()`,
          },
        });
    }

    // — data-quality issues: replace import-managed findings for the entities in this file —
    const athleteIds = plan.athletes.map((a) => a.id);
    for (const ids of chunks(athleteIds, ID_CHUNK)) {
      await tx
        .delete(dqIssues)
        .where(and(eq(dqIssues.entityType, "athlete"), inArray(dqIssues.entityId, ids), ne(dqIssues.ruleCode, "POSSIBLE_DUPLICATE")));
    }
    for (const ids of chunks(
      plan.academies.map((a) => a.id),
      ID_CHUNK,
    )) {
      await tx.delete(dqIssues).where(and(eq(dqIssues.entityType, "academy"), inArray(dqIssues.entityId, ids)));
    }
    const seen = new Set<string>();
    const issueRows: DqIssue[] = [];
    for (const i of plan.issues) {
      const k = issueKey(i);
      if (!seen.has(k)) {
        seen.add(k);
        issueRows.push(i);
      }
    }
    for (const group of chunks(issueRows, ISSUE_CHUNK)) {
      await tx.insert(dqIssues).values(
        group.map((i) => ({
          entityType: i.entityType,
          entityId: i.entityId,
          ref: i.ref,
          ruleCode: i.rule,
          severity: i.severity,
          message: i.message,
          detail: i.detail ?? null,
          batchId,
        })),
      );
    }

    const possibleDuplicates = await refreshPossibleDuplicates(tx as unknown as Db, batchId);

    return {
      athletesWritten: plan.athletes.length,
      academiesWritten: plan.academies.length,
      enrollmentsWritten: plan.enrollments.length,
      issuesWritten: issueRows.length,
      possibleDuplicates,
    };
  });
}

/** Re-derives POSSIBLE_DUPLICATE for the whole registry (same name + DOB + father, different id). */
export async function refreshPossibleDuplicates(db: Db, batchId: string | null): Promise<number> {
  await db.delete(dqIssues).where(eq(dqIssues.ruleCode, "POSSIBLE_DUPLICATE"));
  await db.execute(sql`
    with d as (
      select array_agg(id order by id) as ids
      from athletes
      where search_name <> '' and dob is not null and coalesce(father_name, '') <> ''
      group by search_name, dob, lower(father_name)
      having count(*) > 1
    )
    insert into dq_issues (entity_type, entity_id, ref, rule_code, severity, message, detail, batch_id)
    select 'athlete', x.id, '', 'POSSIBLE_DUPLICATE', 'warning',
           'Same name, date of birth and father as athlete id ' || array_to_string(array_remove(d.ids, x.id), ', '),
           jsonb_build_object('otherIds', to_jsonb(array_remove(d.ids, x.id))),
           ${batchId}::uuid
    from d cross join lateral unnest(d.ids) as x(id)
    on conflict do nothing
  `);
  // Count what is stored rather than trusting a count taken inside the INSERT (not reliable on every driver).
  const [stored] = await rows<{ n: number | string }>(
    db,
    sql`select count(*)::int as n from dq_issues where rule_code = 'POSSIBLE_DUPLICATE'`,
  );
  return Number(stored?.n ?? 0);
}
