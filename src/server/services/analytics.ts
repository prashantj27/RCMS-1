import { sql } from "drizzle-orm";
import { stateName } from "@/domain/states";
import type { PortalUser } from "../auth/user";
import type { Db } from "../db/client";
import { num, one, rows } from "../db/util";
import { athleteWhere, joinedWhere, type AthleteFilters } from "./filters";

export interface Bucket {
  key: string;
  label: string;
  count: number;
}

export interface Overview {
  totals: {
    athletes: number;
    academies: number;
    activeAcademies: number;
    sports: number;
    enrollments: number;
    kitted: number;
    withIssues: number;
  };
  byCentreType: (Bucket & { academies: number; operator: string | null })[];
  bySport: Bucket[];
  byState: Bucket[];
  gender: Bucket[];
  residency: Bucket[];
  ageBands: Bucket[];
  completeness: { field: string; label: string; present: number; total: number }[];
}

const EMPTY_FILTERS: AthleteFilters = {
  q: undefined,
  sportId: undefined,
  academyId: undefined,
  centreTypeId: undefined,
  stateCode: undefined,
  gender: undefined,
  athleteType: undefined,
  activeOnly: false,
  hasIssues: false,
  issueRule: undefined,
};

export async function getOverview(db: Db, user: PortalUser, filters: AthleteFilters = EMPTY_FILTERS): Promise<Overview> {
  const aw = athleteWhere(filters, user.scope);
  const jw = joinedWhere(filters, user.scope);

  const totalsP = one<{
    athletes: number;
    kitted: number;
    sports: number;
    with_issues: number;
  }>(
    db,
    sql`select count(*)::int as athletes,
               count(*) filter (where a.kitting_updated_at is not null)::int as kitted,
               count(distinct a.sport_id)::int as sports,
               count(*) filter (where exists (select 1 from dq_issues d where d.entity_type = 'athlete' and d.entity_id = a.id and d.severity in ('error','warning')))::int as with_issues
        from athletes a where ${aw}`,
  );
  const acadP = one<{ academies: number; active: number; enrollments: number }>(
    db,
    sql`select count(distinct ac.id)::int as academies,
               count(distinct ac.id) filter (where ac.is_active)::int as active,
               count(e.id)::int as enrollments
        from athletes a join enrollments e on e.athlete_id = a.id join academies ac on ac.id = e.academy_id
        where ${jw}`,
  );

  const byTypeP = rows<{ id: number | null; label: string | null; operator: string | null; academies: number; athletes: number }>(
    db,
    sql`select ct.id, ct.label, ct.operator, count(distinct ac.id)::int as academies, count(distinct a.id)::int as athletes
        from athletes a join enrollments e on e.athlete_id = a.id join academies ac on ac.id = e.academy_id
        left join centre_types ct on ct.id = ac.centre_type_id
        where ${jw}
        group by ct.id, ct.label, ct.operator order by athletes desc`,
  );
  const bySportP = rows<{ id: number; name: string; n: number }>(
    db,
    sql`select s.id, s.name, count(*)::int as n from athletes a join sports s on s.id = a.sport_id where ${aw} group by s.id, s.name order by n desc, s.name limit 15`,
  );
  const byStateP = rows<{ state_code: string | null; n: number }>(
    db,
    sql`select ac.state_code, count(distinct a.id)::int as n
        from athletes a join enrollments e on e.athlete_id = a.id join academies ac on ac.id = e.academy_id
        where ${jw} group by ac.state_code order by n desc`,
  );
  const genderP = rows<{ gender: string; n: number }>(
    db,
    sql`select a.gender, count(*)::int as n from athletes a where ${aw} group by 1 order by 2 desc`,
  );
  const residencyP = rows<{ t: string | null; n: number }>(
    db,
    sql`select e.athlete_type as t, count(distinct a.id)::int as n
        from athletes a join enrollments e on e.athlete_id = a.id join academies ac on ac.id = e.academy_id
        where ${jw} group by 1 order by 2 desc`,
  );
  const agesP = rows<{ band: string; n: number }>(
    db,
    sql`select case
                 when a.dob is null then 'Unknown'
                 when age < 10 then 'Under 10'
                 when age < 15 then '10–14'
                 when age < 20 then '15–19'
                 when age < 25 then '20–24'
                 else '25+' end as band,
               count(*)::int as n
        from (select a.*, extract(year from age(current_date, a.dob))::int as age from athletes a where ${aw}) a
        group by 1`,
  );
  const compP = one<Record<string, number>>(
    db,
    sql`select count(*)::int as total,
               count(a.dob)::int as dob, count(a.father_name)::int as father, count(a.mother_name)::int as mother,
               count(a.mobile_cipher)::int as mobile, count(a.shoe_size)::int as shoe, count(a.tshirt_size)::int as tshirt,
               count(a.blazer_size)::int as blazer, count(a.pant_size)::int as pant, count(a.kitting_updated_at)::int as kitting
        from athletes a where ${aw}`,
  );

  const [totals, acad, byType, bySport, byState, gender, residency, ages, comp] = await Promise.all([
    totalsP,
    acadP,
    byTypeP,
    bySportP,
    byStateP,
    genderP,
    residencyP,
    agesP,
    compP,
  ]);

  const bandOrder = ["Under 10", "10–14", "15–19", "20–24", "25+", "Unknown"];
  const total = num(comp?.total);
  const fields: [string, string][] = [
    ["dob", "Date of birth"],
    ["father", "Father's name"],
    ["mother", "Mother's name"],
    ["mobile", "Mobile number"],
    ["shoe", "Shoe size"],
    ["tshirt", "T-shirt size"],
    ["blazer", "Blazer size"],
    ["pant", "Pant size"],
    ["kitting", "Kitting date"],
  ];

  return {
    totals: {
      athletes: num(totals?.athletes),
      academies: num(acad?.academies),
      activeAcademies: num(acad?.active),
      sports: num(totals?.sports),
      enrollments: num(acad?.enrollments),
      kitted: num(totals?.kitted),
      withIssues: num(totals?.with_issues),
    },
    byCentreType: byType.map((r) => ({
      key: String(r.id ?? "none"),
      label: r.label ?? "Unclassified",
      operator: r.operator,
      academies: num(r.academies),
      count: num(r.athletes),
    })),
    bySport: bySport.map((r) => ({ key: String(r.id), label: r.name, count: num(r.n) })),
    byState: byState.map((r) => ({
      key: r.state_code ?? "unknown",
      label: stateName(r.state_code) ?? "Not determinable",
      count: num(r.n),
    })),
    gender: gender.map((r) => ({ key: r.gender, label: r.gender === "M" ? "Male" : "Female", count: num(r.n) })),
    residency: residency.map((r) => ({
      key: r.t ?? "unknown",
      label: r.t === "RESIDENTIAL" ? "Residential" : r.t === "NON_RESIDENTIAL" ? "Non-residential" : "Not recorded",
      count: num(r.n),
    })),
    ageBands: bandOrder.map((b) => ({ key: b, label: b, count: num(ages.find((x) => x.band === b)?.n) })).filter((b) => b.count > 0),
    completeness: fields.map(([field, label]) => ({ field, label, present: num(comp?.[field]), total })),
  };
}
