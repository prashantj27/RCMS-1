import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { syntheticAthleteMatrix } from "@/dev/synthetic-athletes";
import { prototypeCapabilities } from "@/domain/prototype";
import { buildPrototypeUser } from "@/server/auth/prototype";
import type { PortalUser } from "@/server/auth/user";
import type { DbHandle } from "@/server/db/client";
import { academies, athletes, dqIssues } from "@/server/db/schema";
import { rows } from "@/server/db/util";
import { runAthleteImport } from "@/server/import/run-import";
import { getAcademy, listAcademies, academyListQuerySchema } from "@/server/services/academies";
import { getOverview } from "@/server/services/analytics";
import { getAthlete, listAthletes, updateAthleteKit } from "@/server/services/athletes";
import { getDqSummary, listDqIssues, dqListQuerySchema } from "@/server/services/dq";
import { athleteListQuerySchema } from "@/server/services/filters";
import { getKitDemand, kitDemandCsv, kitQuerySchema } from "@/server/services/kit";
import { testDb } from "../helpers/db";

let h: DbHandle;
let admin: PortalUser;
let hq: PortalUser;
let centre: PortalUser;
let analyst: PortalUser;
let centreAcademyIds: number[];

const listQ = (o: Record<string, unknown> = {}) => athleteListQuerySchema.parse({ pageSize: "100", ...o });
/** The same portal with date of birth / parents' names enabled (RCMS_PROTOTYPE_SHOW_PII=1). */
const withPii = (u: PortalUser): PortalUser => ({ ...u, caps: prototypeCapabilities(u.role, { showPii: true }) });

beforeAll(async () => {
  h = await testDb();
  await runAthleteImport(h.db, {
    matrix: syntheticAthleteMatrix({ athletes: 800, academies: 24, seed: 11 }),
    fileName: "s.xlsx",
    fileSha256: "a".repeat(64),
    mode: "apply",
    createdBy: null,
    asOf: "2026-10-08",
  });
  const acs = await h.db.select({ id: academies.id }).from(academies).orderBy(academies.id).limit(2);
  centreAcademyIds = acs.map((a) => a.id);
  admin = buildPrototypeUser("ADMIN");
  hq = buildPrototypeUser("HQ_OFFICER");
  // The shipped centre portal has ONE centre; two are used here to exercise multi-centre scoping.
  centre = { ...buildPrototypeUser("CENTRE_USER"), scope: { academyIds: centreAcademyIds } };
  analyst = buildPrototypeUser("ANALYST");
});
afterAll(async () => {
  await h.close();
});

describe("athlete listing", () => {
  it("returns every athlete to an unrestricted user, paged", async () => {
    const [{ n }] = (await rows<{ n: number }>(h.db, sql`select count(*)::int as n from athletes`)) as [{ n: number }];
    const p = await listAthletes(h.db, admin, listQ({ pageSize: "25" }));
    expect(p.total).toBe(n);
    expect(p.items).toHaveLength(25);
    expect(p.pageCount).toBe(Math.ceil(n / 25));
    const last = await listAthletes(h.db, admin, listQ({ pageSize: "25", page: "9999" }));
    expect(last.page).toBe(p.pageCount); // clamps rather than returning empty
  });

  it("filters by name, KIT id, id, sport, gender, centre type, state and issues", async () => {
    const sample = (await listAthletes(h.db, admin, listQ({ pageSize: "5", sort: "recent" }))).items[0]!;
    const byName = await listAthletes(h.db, admin, listQ({ q: (sample.fullName ?? "x").split(" ")[0]!.toLowerCase() }));
    expect(byName.total).toBeGreaterThan(0);
    const byKit = await listAthletes(h.db, admin, listQ({ q: sample.kitId.toLowerCase() }));
    expect(byKit.items.map((i) => i.id)).toContain(sample.id);
    const byId = await listAthletes(h.db, admin, listQ({ q: String(sample.id) }));
    expect(byId.items.map((i) => i.id)).toContain(sample.id);

    const bySport = await listAthletes(h.db, admin, listQ({ sportId: String(sample.sportId) }));
    expect(bySport.items.every((i) => i.sportId === sample.sportId)).toBe(true);
    const female = await listAthletes(h.db, admin, listQ({ gender: "F" }));
    expect(female.items.every((i) => i.gender === "F")).toBe(true);

    const withIssues = await listAthletes(h.db, admin, listQ({ hasIssues: "1" }));
    expect(withIssues.total).toBeGreaterThan(0);
    expect(withIssues.items.every((i) => i.issueCount > 0)).toBe(true);

    const rule = await listAthletes(h.db, admin, listQ({ issueRule: "NO_ACADEMY" }));
    expect(rule.items.every((i) => i.enrollments.length === 0)).toBe(true);

    const state = await listAthletes(h.db, admin, listQ({ stateCode: "UP" }));
    expect(state.total).toBeGreaterThan(0);
    expect(state.items.every((i) => i.enrollments.some((e) => e.stateCode === "UP"))).toBe(true);
  });

  it("treats LIKE wildcards in the search box literally", async () => {
    const r = await listAthletes(h.db, admin, listQ({ q: "%" }));
    expect(r.total).toBe(0);
    const r2 = await listAthletes(h.db, admin, listQ({ q: "'; drop table athletes; --" }));
    expect(r2.total).toBe(0);
    expect((await h.db.select().from(athletes).limit(1)).length).toBe(1);
  });
});

describe("centre-user scoping", () => {
  it("only lists athletes enrolled in assigned academies and agrees with analytics", async () => {
    const list = await listAthletes(h.db, centre, listQ());
    expect(list.total).toBeGreaterThan(0);
    for (const a of list.items) expect(a.enrollments.some((e) => centreAcademyIds.includes(e.academyId))).toBe(true);
    const overview = await getOverview(h.db, centre);
    expect(overview.totals.athletes).toBe(list.total);
    const kit = await getKitDemand(h.db, centre, kitQuerySchema.parse({}));
    expect(kit.totals.athletes).toBe(list.total);
  });

  it("hides out-of-scope athletes and academies (404, not 403)", async () => {
    const outside = (await listAthletes(h.db, admin, listQ({ pageSize: "100" }))).items.find(
      (a) => !a.enrollments.some((e) => centreAcademyIds.includes(e.academyId)),
    )!;
    await expect(getAthlete(h.db, centre, outside.id)).rejects.toMatchObject({ status: 404 });
    await expect(updateAthleteKit(h.db, centre, outside.id, { shoeSize: 7 }, null)).rejects.toMatchObject({ status: 404 });
    const acads = await listAcademies(h.db, centre, academyListQuerySchema.parse({}));
    expect(acads.items.map((a) => a.id).sort()).toEqual([...centreAcademyIds].sort());
    const foreign = (await listAcademies(h.db, admin, academyListQuerySchema.parse({ pageSize: "100" }))).items.find(
      (a) => !centreAcademyIds.includes(a.id),
    )!;
    await expect(getAcademy(h.db, centre, foreign.id)).rejects.toMatchObject({ status: 404 });
  });

  it("a centre user with no assigned academies sees nothing", async () => {
    const empty: PortalUser = { ...centre, scope: { academyIds: [] } };
    expect((await listAthletes(h.db, empty, listQ())).total).toBe(0);
    expect((await getOverview(h.db, empty)).totals.athletes).toBe(0);
    expect((await getDqSummary(h.db, empty)).bySeverity).toEqual({ error: 0, warning: 0, info: 0 });
  });

  it("scopes data-quality findings", async () => {
    const mine = await listDqIssues(h.db, centre, dqListQuerySchema.parse({ pageSize: "100" }));
    for (const i of mine.items) {
      if (i.entityType === "academy") expect(centreAcademyIds).toContain(i.entityId);
      else {
        const a = await getAthlete(h.db, centre, i.entityId);
        expect(a.enrollments.some((e) => centreAcademyIds.includes(e.academyId))).toBe(true);
      }
    }
    const all = await listDqIssues(h.db, admin, dqListQuerySchema.parse({}));
    expect(all.total).toBeGreaterThan(mine.total);
  });
});

describe("PII gating", () => {
  it("hides date of birth and parents' names by default in every portal (nobody is signed in)", async () => {
    const id = (await listAthletes(h.db, admin, listQ({ pageSize: "1", sort: "recent" }))).items[0]!.id;
    for (const u of [admin, hq]) {
      const d = await getAthlete(h.db, u, id);
      expect(d.dob).toBeNull();
      expect(d.fatherName).toBeNull();
      expect(d.motherName).toBeNull();
    }
  });

  it("shows them only when RCMS_PROTOTYPE_SHOW_PII is deliberately enabled", async () => {
    const id = (await listAthletes(h.db, admin, listQ({ pageSize: "1", sort: "recent" }))).items[0]!.id;
    const shown = await getAthlete(h.db, withPii(hq), id);
    expect(shown.dob).not.toBeNull();
    expect(JSON.stringify(shown)).not.toMatch(/mobile|cipher/i); // phone numbers are never exposed
  });

  it("analysts cannot read athlete records by capability; HQ cannot edit", () => {
    expect(analyst.caps.has("athletes:read")).toBe(false);
    expect(withPii(analyst).caps.has("athletes:read_pii")).toBe(false);
    expect(analyst.caps.has("analytics:read")).toBe(true);
    expect(hq.caps.has("athletes:write")).toBe(false);
  });
});

describe("kit editing", () => {
  it("validates sizes, marks the record as manually edited and clears stale findings", async () => {
    const target = (await h.db.select().from(dqIssues).where(eq(dqIssues.ruleCode, "SIZE_INVALID")).limit(1))[0]!;
    // make the athlete visible to the centre user
    const aid = target.entityId;
    const asAdmin = await updateAthleteKit(h.db, admin, aid, { shoeSize: 8, tshirtSize: "xl", pantSize: 32, markKitted: true }, "9.9.9.9");
    expect(asAdmin.kit.shoeSize).toBe(8);
    expect(asAdmin.kit.tshirtSize).toBe("XL");
    expect(asAdmin.kit.pantSize).toBe("32");
    expect(asAdmin.kit.kittingUpdatedAt).not.toBeNull();
    expect(asAdmin.kit.editedAt).not.toBeNull();
    const left = await h.db
      .select()
      .from(dqIssues)
      .where(sql`entity_id = ${aid} and rule_code = 'SIZE_INVALID' and ref in ('shoe','tshirt','pant')`);
    expect(left).toHaveLength(0);

    await expect(updateAthleteKit(h.db, admin, aid, { shoeSize: 0 }, null)).rejects.toMatchObject({ status: 400 });
    await expect(updateAthleteKit(h.db, admin, aid, { tshirtSize: "HUGE" }, null)).rejects.toMatchObject({ status: 400 });
    await expect(updateAthleteKit(h.db, admin, aid, {}, null)).rejects.toMatchObject({ status: 400 });
    await expect(updateAthleteKit(h.db, admin, aid, { markKitted: true, clearKitted: true }, null)).rejects.toMatchObject({ status: 400 });
    await expect(updateAthleteKit(h.db, hq, aid, { shoeSize: 7 }, null)).rejects.toMatchObject({ status: 403 });
    const cleared = await updateAthleteKit(h.db, admin, aid, { clearKitted: true, blazerSize: null }, null);
    expect(cleared.kit.kittingUpdatedAt).toBeNull();
    expect(cleared.kit.blazerSize).toBeNull();

    const audit = await rows<{ n: number }>(
      h.db,
      sql`select count(*)::int as n from audit_log where action = 'athlete_kit_update' and entity_id = ${String(aid)}`,
    );
    expect(audit[0]!.n).toBeGreaterThanOrEqual(2);
  });
});

describe("analytics and kit demand", () => {
  it("overview totals agree with the registry", async () => {
    const o = await getOverview(h.db, admin);
    const [c] = await rows<{ a: number; ac: number; en: number }>(
      h.db,
      sql`select (select count(*) from athletes)::int a, (select count(distinct academy_id) from enrollments)::int ac, (select count(*) from enrollments)::int en`,
    );
    expect(o.totals.athletes).toBe(c!.a);
    expect(o.totals.academies).toBe(c!.ac);
    expect(o.totals.enrollments).toBe(c!.en);
    expect(o.gender.reduce((s, g) => s + g.count, 0)).toBe(c!.a);
    expect(o.ageBands.reduce((s, g) => s + g.count, 0)).toBe(c!.a);
    expect(o.completeness.every((f) => f.present <= f.total && f.total === c!.a)).toBe(true);
    expect(o.byState.some((s) => s.key === "UP")).toBe(true);
  });

  it("kit totals and size distributions are consistent", async () => {
    const k = await getKitDemand(h.db, admin, kitQuerySchema.parse({ groupBy: "centreType" }));
    const [c] = await rows<{ n: number; shoe: number; t: number }>(
      h.db,
      sql`select count(*)::int n, count(shoe_size)::int shoe, count(tshirt_size)::int t from athletes`,
    );
    expect(k.totals.athletes).toBe(c!.n);
    expect(k.sizes.shoe.reduce((s, x) => s + x.count, 0)).toBe(c!.shoe);
    expect(k.sizes.tshirt.reduce((s, x) => s + x.count, 0)).toBe(c!.t);
    expect(k.totals.missing.shoe).toBe(c!.n - c!.shoe);
    expect(k.groups.rows.length).toBeGreaterThan(0);
    for (const g of k.groups.rows) expect(g.missingAny).toBeLessThanOrEqual(g.athletes);
    // sizes sorted XS..XXL / ascending numbers
    expect(k.sizes.shoe.map((s) => Number(s.size))).toEqual([...k.sizes.shoe.map((s) => Number(s.size))].sort((a, b) => a - b));
  });

  it("supports every grouping and filters", async () => {
    for (const groupBy of ["academy", "sport", "centreType", "state", "none"] as const) {
      const k = await getKitDemand(h.db, admin, kitQuerySchema.parse({ groupBy, pageSize: "5" }));
      expect(k.groupBy).toBe(groupBy);
      if (groupBy === "none") expect(k.groups.rows).toHaveLength(0);
      else expect(k.groups.rows.length).toBeGreaterThan(0);
    }
    const f = await getKitDemand(h.db, admin, kitQuerySchema.parse({ gender: "F", groupBy: "none" }));
    const all = await getKitDemand(h.db, admin, kitQuerySchema.parse({ groupBy: "none" }));
    expect(f.totals.athletes).toBeLessThan(all.totals.athletes);
  });

  it("CSV export neutralises spreadsheet formulas", () => {
    const csv = kitDemandCsv({
      groupBy: "academy",
      totals: { athletes: 1, kitted: 0, missingAny: 0, missing: { shoe: 0, tshirt: 0, blazer: 0, pant: 0 } },
      sizes: { shoe: [], tshirt: [], blazer: [], pant: [] },
      groups: {
        rows: [
          {
            key: "1",
            label: '=HYPERLINK("http://evil")',
            athletes: 1,
            kitted: 0,
            missing: { shoe: 0, tshirt: 0, blazer: 0, pant: 0 },
            missingAny: 0,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 1,
        pageCount: 1,
      },
    });
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
  });
});

describe("data quality", () => {
  it("summary counts equal stored findings and list paginates", async () => {
    const s = await getDqSummary(h.db, admin);
    const [c] = await rows<{ n: number }>(h.db, sql`select count(*)::int n from dq_issues`);
    expect(s.rows.reduce((sum, r) => sum + r.count, 0)).toBe(c!.n);
    expect(s.bySeverity.error! + s.bySeverity.warning! + s.bySeverity.info!).toBe(c!.n);
    const page1 = await listDqIssues(h.db, admin, dqListQuerySchema.parse({ pageSize: "10", severity: "error" }));
    expect(page1.items.every((i) => i.severity === "error")).toBe(true);
    expect(page1.items.length).toBeLessThanOrEqual(10);
  });

  it("hides athlete names from users who cannot read athletes", async () => {
    const r = await listDqIssues(h.db, analyst, dqListQuerySchema.parse({ rule: "NAME_MISSING", pageSize: "5" }));
    for (const i of r.items) expect(i.canOpen).toBe(false);
    const g = await listDqIssues(h.db, analyst, dqListQuerySchema.parse({ rule: "DOB_INVALID", pageSize: "5" }));
    for (const i of g.items) expect(i.subject).not.toContain(" · ");
  });
});
