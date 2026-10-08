import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { DQ_RULE_CODES } from "@/domain/dq-rules";
import type { Scope } from "@/domain/permissions";

// ── query-string parsing (HTML GET forms send empty strings for untouched fields) ──
const emptyToUndef = (v: unknown) => (v === "" || v === null ? undefined : v);
const optInt = z.preprocess(emptyToUndef, z.coerce.number().int().positive().optional());
const optStr = (max = 100) => z.preprocess(emptyToUndef, z.string().trim().min(1).max(max).optional());
const flag = z
  .union([z.boolean(), z.enum(["1", "0", "true", "false", "on"])])
  .optional()
  .transform((v) => v === true || v === "1" || v === "true" || v === "on");

export const athleteFiltersSchema = z.object({
  q: optStr(100),
  sportId: optInt,
  academyId: optInt,
  centreTypeId: optInt,
  stateCode: z.preprocess(emptyToUndef, z.string().trim().length(2).toUpperCase().optional()),
  gender: z.preprocess(emptyToUndef, z.enum(["M", "F"]).optional()),
  athleteType: z.preprocess(emptyToUndef, z.enum(["RESIDENTIAL", "NON_RESIDENTIAL"]).optional()),
  activeOnly: flag,
  hasIssues: flag,
  issueRule: z.preprocess(emptyToUndef, z.enum(DQ_RULE_CODES as [string, ...string[]]).optional()),
});
export type AthleteFilters = z.infer<typeof athleteFiltersSchema>;

export const pagingSchema = z.object({
  page: z.preprocess(emptyToUndef, z.coerce.number().int().min(1).max(100_000).default(1)),
  pageSize: z.preprocess(emptyToUndef, z.coerce.number().int().min(1).max(100).default(25)),
});
export type Paging = z.infer<typeof pagingSchema>;

export const ATHLETE_SORTS = ["name", "recent", "kit", "age_asc", "age_desc"] as const;
export const athleteListQuerySchema = athleteFiltersSchema.extend(pagingSchema.shape).extend({
  sort: z.preprocess(emptyToUndef, z.enum(ATHLETE_SORTS).default("name")),
});
export type AthleteListQuery = z.infer<typeof athleteListQuerySchema>;

// ── SQL fragments (aliases: a=athletes, e=enrollments, ac=academies, ct=centre_types, s=sports) ──

export const idList = (ids: readonly number[]): SQL =>
  sql.join(
    ids.map((i) => sql`${i}`),
    sql`, `,
  );

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** Conditions on the athlete row itself. */
export function athleteCoreConds(f: AthleteFilters): SQL[] {
  const c: SQL[] = [];
  if (f.q) {
    const lower = escapeLike(f.q.toLowerCase());
    const upper = escapeLike(f.q.toUpperCase());
    const numeric = /^\d{1,9}$/.test(f.q) ? sql` or a.id = ${Number(f.q)}` : sql``;
    c.push(sql`(a.search_name like ${`%${lower}%`} or a.kit_id like ${`${upper}%`}${numeric})`);
  }
  if (f.sportId) c.push(sql`a.sport_id = ${f.sportId}`);
  if (f.gender) c.push(sql`a.gender = ${f.gender}`);
  if (f.hasIssues) {
    c.push(
      sql`exists (select 1 from dq_issues d where d.entity_type = 'athlete' and d.entity_id = a.id and d.severity in ('error','warning'))`,
    );
  }
  if (f.issueRule) {
    c.push(sql`exists (select 1 from dq_issues d where d.entity_type = 'athlete' and d.entity_id = a.id and d.rule_code = ${f.issueRule})`);
  }
  return c;
}

/** Conditions on enrolment (e) / academy (ac) rows, including the caller's scope. */
export function enrollmentConds(f: AthleteFilters, scope: Scope): SQL[] {
  const c: SQL[] = [];
  if (scope.academyIds !== null) c.push(scope.academyIds.length ? sql`e.academy_id in (${idList(scope.academyIds)})` : sql`false`);
  if (f.academyId) c.push(sql`e.academy_id = ${f.academyId}`);
  if (f.centreTypeId) c.push(sql`ac.centre_type_id = ${f.centreTypeId}`);
  if (f.stateCode) c.push(sql`ac.state_code = ${f.stateCode}`);
  if (f.athleteType) c.push(sql`e.athlete_type = ${f.athleteType}`);
  if (f.activeOnly) c.push(sql`ac.is_active`);
  return c;
}

export const and = (conds: SQL[]): SQL => (conds.length ? sql`${sql.join(conds, sql` and `)}` : sql`true`);

/** Athlete-level WHERE (alias a): core filters + EXISTS over enrolments when any enrolment filter or scope applies. */
export function athleteWhere(f: AthleteFilters, scope: Scope): SQL {
  const conds = athleteCoreConds(f);
  const ec = enrollmentConds(f, scope);
  if (ec.length) {
    conds.push(
      sql`exists (select 1 from enrollments e join academies ac on ac.id = e.academy_id where e.athlete_id = a.id and ${and(ec)})`,
    );
  }
  return and(conds);
}

/** Row-level WHERE for queries that already join enrollments e / academies ac. */
export function joinedWhere(f: AthleteFilters, scope: Scope): SQL {
  return and([...athleteCoreConds(f), ...enrollmentConds(f, scope)]);
}

/** Restricts dq_issues (alias d) to what a scoped caller may see. */
export function dqScope(scope: Scope): SQL {
  if (scope.academyIds === null) return sql`true`;
  if (!scope.academyIds.length) return sql`false`;
  const ids = idList(scope.academyIds);
  return sql`((d.entity_type = 'athlete' and exists (select 1 from enrollments se where se.athlete_id = d.entity_id and se.academy_id in (${ids}))) or (d.entity_type = 'academy' and d.entity_id in (${ids})))`;
}

export function academyScope(scope: Scope, alias = "ac"): SQL {
  if (scope.academyIds === null) return sql`true`;
  if (!scope.academyIds.length) return sql`false`;
  return sql`${sql.raw(alias)}.id in (${idList(scope.academyIds)})`;
}

export const AGE_SQL = sql`case when a.dob is null then null else extract(year from age(current_date, a.dob))::int end`;
