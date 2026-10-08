import { sql } from "drizzle-orm";
import { z } from "zod";
import { stateName } from "@/domain/states";
import { DQ_RULES, type DqRuleCode } from "@/domain/dq-rules";
import type { SessionUser } from "../auth/authenticate";
import type { Db } from "../db/client";
import { num, one, rows } from "../db/util";
import { notFound } from "../errors";
import { academyScope, pagingSchema } from "./filters";
import type { Page } from "./athletes";

const emptyToUndef = (v: unknown) => (v === "" || v === null ? undefined : v);

export const academyListQuerySchema = pagingSchema.extend({
  q: z.preprocess(emptyToUndef, z.string().trim().min(1).max(100).optional()),
  centreTypeId: z.preprocess(emptyToUndef, z.coerce.number().int().positive().optional()),
  stateCode: z.preprocess(emptyToUndef, z.string().trim().length(2).toUpperCase().optional()),
  status: z.preprocess(emptyToUndef, z.enum(["active", "inactive"]).optional()),
  sort: z.preprocess(emptyToUndef, z.enum(["name", "athletes"]).default("athletes")),
});
export type AcademyListQuery = z.infer<typeof academyListQuerySchema>;

export interface AcademyListItem {
  id: number;
  name: string;
  kitCode: string | null;
  centreType: string | null;
  operator: string | null;
  stateCode: string | null;
  stateName: string | null;
  isActive: boolean;
  athletes: number;
  residential: number;
}

export async function listAcademies(db: Db, user: SessionUser, q: AcademyListQuery): Promise<Page<AcademyListItem>> {
  const conds = [academyScope(user.scope)];
  if (q.q) {
    const like = `%${q.q.toLowerCase().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    conds.push(sql`(lower(ac.name) like ${like} or lower(coalesce(ac.kit_code,'')) like ${like})`);
  }
  if (q.centreTypeId) conds.push(sql`ac.centre_type_id = ${q.centreTypeId}`);
  if (q.stateCode) conds.push(sql`ac.state_code = ${q.stateCode}`);
  if (q.status) conds.push(sql`ac.is_active = ${q.status === "active"}`);
  const where = sql`${sql.join(conds, sql` and `)}`;

  const total = num((await one<{ n: number }>(db, sql`select count(*)::int as n from academies ac where ${where}`))?.n);
  const pageCount = Math.max(1, Math.ceil(total / q.pageSize));
  const page = Math.min(q.page, pageCount);
  const order = q.sort === "name" ? sql`ac.name, ac.id` : sql`athletes desc, ac.name, ac.id`;
  const list = await rows<{
    id: number;
    name: string;
    kit_code: string | null;
    centre_type: string | null;
    operator: string | null;
    state_code: string | null;
    is_active: boolean;
    athletes: number;
    residential: number;
  }>(
    db,
    sql`select ac.id, ac.name, ac.kit_code, ct.label as centre_type, ct.operator, ac.state_code, ac.is_active,
               count(e.id)::int as athletes,
               count(e.id) filter (where e.athlete_type = 'RESIDENTIAL')::int as residential
        from academies ac
        left join centre_types ct on ct.id = ac.centre_type_id
        left join enrollments e on e.academy_id = ac.id
        where ${where}
        group by ac.id, ct.label, ct.operator
        order by ${order}
        limit ${q.pageSize} offset ${(page - 1) * q.pageSize}`,
  );
  return {
    items: list.map((r) => ({
      id: r.id,
      name: r.name,
      kitCode: r.kit_code,
      centreType: r.centre_type,
      operator: r.operator,
      stateCode: r.state_code,
      stateName: stateName(r.state_code),
      isActive: r.is_active,
      athletes: num(r.athletes),
      residential: num(r.residential),
    })),
    total,
    page,
    pageSize: q.pageSize,
    pageCount,
  };
}

export interface Distribution {
  label: string;
  count: number;
}

export interface AcademyDetail extends AcademyListItem {
  nonResidential: number;
  genderSplit: Distribution[];
  sports: Distribution[];
  kitCoverage: { athletes: number; withAllSizes: number; kitted: number };
  issues: { rule: DqRuleCode; severity: string; title: string; count: number }[];
}

export async function getAcademy(db: Db, user: SessionUser, id: number): Promise<AcademyDetail> {
  const base = await one<{
    id: number;
    name: string;
    kit_code: string | null;
    centre_type: string | null;
    operator: string | null;
    state_code: string | null;
    is_active: boolean;
    athletes: number;
    residential: number;
    non_residential: number;
  }>(
    db,
    sql`select ac.id, ac.name, ac.kit_code, ct.label as centre_type, ct.operator, ac.state_code, ac.is_active,
               count(e.id)::int as athletes,
               count(e.id) filter (where e.athlete_type = 'RESIDENTIAL')::int as residential,
               count(e.id) filter (where e.athlete_type = 'NON_RESIDENTIAL')::int as non_residential
        from academies ac
        left join centre_types ct on ct.id = ac.centre_type_id
        left join enrollments e on e.academy_id = ac.id
        where ac.id = ${id} and ${academyScope(user.scope)}
        group by ac.id, ct.label, ct.operator`,
  );
  if (!base) throw notFound("Academy");

  const gender = await rows<{ gender: string; n: number }>(
    db,
    sql`select a.gender, count(*)::int as n from enrollments e join athletes a on a.id = e.athlete_id where e.academy_id = ${id} group by 1 order by 2 desc`,
  );
  const sports = await rows<{ name: string; n: number }>(
    db,
    sql`select s.name, count(*)::int as n from enrollments e join athletes a on a.id = e.athlete_id join sports s on s.id = a.sport_id
        where e.academy_id = ${id} group by 1 order by 2 desc, 1 limit 12`,
  );
  const kit = await one<{ athletes: number; complete: number; kitted: number }>(
    db,
    sql`select count(*)::int as athletes,
               count(*) filter (where a.shoe_size is not null and a.tshirt_size is not null and a.blazer_size is not null and a.pant_size is not null)::int as complete,
               count(*) filter (where a.kitting_updated_at is not null)::int as kitted
        from enrollments e join athletes a on a.id = e.athlete_id where e.academy_id = ${id}`,
  );
  const issues = await rows<{ rule_code: string; severity: string; n: number }>(
    db,
    sql`select d.rule_code, d.severity, count(*)::int as n
        from dq_issues d
        where (d.entity_type = 'academy' and d.entity_id = ${id})
           or (d.entity_type = 'athlete' and exists (select 1 from enrollments e where e.athlete_id = d.entity_id and e.academy_id = ${id}))
        group by 1, 2 order by 3 desc`,
  );

  return {
    id: base.id,
    name: base.name,
    kitCode: base.kit_code,
    centreType: base.centre_type,
    operator: base.operator,
    stateCode: base.state_code,
    stateName: stateName(base.state_code),
    isActive: base.is_active,
    athletes: num(base.athletes),
    residential: num(base.residential),
    nonResidential: num(base.non_residential),
    genderSplit: gender.map((g) => ({ label: g.gender === "M" ? "Male" : "Female", count: num(g.n) })),
    sports: sports.map((s) => ({ label: s.name, count: num(s.n) })),
    kitCoverage: { athletes: num(kit?.athletes), withAllSizes: num(kit?.complete), kitted: num(kit?.kitted) },
    issues: issues.map((i) => ({
      rule: i.rule_code as DqRuleCode,
      severity: i.severity,
      title: DQ_RULES[i.rule_code as DqRuleCode]?.title ?? i.rule_code,
      count: num(i.n),
    })),
  };
}
