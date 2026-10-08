import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { buildPrototypeUser } from "@/server/auth/prototype";
import type { DbHandle } from "@/server/db/client";
import { rows } from "@/server/db/util";
import { getDemoStatus, loadDemoData } from "@/server/services/demo";
import { testDb } from "../helpers/db";

let h: DbHandle;
const admin = buildPrototypeUser("ADMIN");
const count = async () => (await rows<{ n: number }>(h.db, sql`select count(*)::int as n from athletes`))[0]!.n;

beforeAll(async () => {
  h = await testDb();
});
afterAll(async () => h.close());

describe("prototype demo data", () => {
  it("is offered only to the Administrator portal while the registry is empty", async () => {
    expect(await getDemoStatus(h.db, admin)).toEqual({ athletes: 0, canLoad: true });
    expect((await getDemoStatus(h.db, buildPrototypeUser("HQ_OFFICER"))).canLoad).toBe(false);
    expect((await getDemoStatus(h.db, buildPrototypeUser("CENTRE_USER", { id: 1, name: "x" }))).canLoad).toBe(false);
    expect((await getDemoStatus(h.db, buildPrototypeUser("ANALYST"))).canLoad).toBe(false);
  });

  it("refuses every portal except Administrator", async () => {
    for (const role of ["HQ_OFFICER", "ANALYST", "CENTRE_USER"] as const) {
      await expect(loadDemoData(h.db, buildPrototypeUser(role, { id: 1, name: "x" }), null)).rejects.toMatchObject({ status: 403 });
    }
    expect(await count()).toBe(0);
  });

  it("loads synthetic athletes, centres and an audit record", async () => {
    const r = await loadDemoData(h.db, admin, "1.2.3.4");
    expect(r.stats.athletes).toBe(1200);
    expect(r.stats.academies).toBe(30);
    expect(await count()).toBe(1200);
    const [a] = await rows<{ n: number }>(h.db, sql`select count(*)::int as n from audit_log where action = 'demo_data_load'`);
    expect(a!.n).toBe(1);
    // synthetic people only: every name comes from the fictional generator lists
    const odd = await rows<{ n: number }>(
      h.db,
      sql`select count(*)::int as n from athletes where full_name is not null and full_name !~ '^[A-Z][a-z]+ [A-Z][a-z]+$'`,
    );
    expect(odd[0]!.n).toBe(0);
  });

  it("then refuses to run again, so it can never mix with real records", async () => {
    await expect(loadDemoData(h.db, admin, null)).rejects.toMatchObject({ status: 409 });
    expect((await getDemoStatus(h.db, admin)).canLoad).toBe(false);
    expect(await count()).toBe(1200);
  });
});
