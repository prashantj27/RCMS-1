import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { syntheticAthleteMatrix } from "@/dev/synthetic-athletes";
import { authenticate } from "@/server/auth/authenticate";
import type { DbHandle } from "@/server/db/client";
import { academies, users, userAcademies } from "@/server/db/schema";
import { runAthleteImport } from "@/server/import/run-import";
import { parseIdList, provisionUsers } from "@/server/provision";
import { loginIdSchema } from "@/server/services/users";
import { testDb } from "../helpers/db";

let h: DbHandle;
let acad: number[];
const env = (o: Record<string, string> = {}) => ({
  RCMS_ADMIN_PASSWORD: "Quartz-Meadow-7731!",
  RCMS_HQ_PASSWORD: "Orchid-Lantern-4410#",
  RCMS_CENTRE_PASSWORD: "Falcon-Harbour-9082$",
  RCMS_ANALYST_PASSWORD: "Cobalt-Meridian-5527%",
  ...o,
});

beforeAll(async () => {
  h = await testDb();
  await runAthleteImport(h.db, {
    matrix: syntheticAthleteMatrix({ athletes: 120, academies: 6, seed: 5 }),
    fileName: "s.xlsx",
    fileSha256: "b".repeat(64),
    mode: "apply",
    createdBy: null,
    asOf: "2026-10-08",
  });
  acad = (await h.db.select({ id: academies.id }).from(academies).orderBy(academies.id).limit(2)).map((a) => a.id);
});
afterAll(async () => h.close());

describe("login id validation", () => {
  it("accepts plain usernames and emails, rejects junk", () => {
    for (const ok of ["admin", "hq", "centre", "analyst", "Jane.Doe@Example.org", "a_b-c+d"])
      expect(loginIdSchema.safeParse(ok).success, ok).toBe(true);
    expect(loginIdSchema.parse(" HQ ")).toBe("hq");
    for (const bad of ["", "x", "-lead", "has space", "semi;colon", "a".repeat(201)])
      expect(loginIdSchema.safeParse(bad).success, bad).toBe(false);
  });
  it("parses id lists", () => {
    expect(parseIdList("3010, 888;888  12")).toEqual([3010, 888, 12]);
    expect(parseIdList("abc,0,-4,1.5")).toEqual([]);
    expect(parseIdList(undefined)).toEqual([]);
  });
});

describe("provisionUsers (accounts from environment variables)", () => {
  it("skips accounts without a password and needs centre ids for the centre user", async () => {
    const r = await provisionUsers(h.db, { RCMS_ADMIN_PASSWORD: "Quartz-Meadow-7731!", RCMS_CENTRE_PASSWORD: "Falcon-Harbour-9082$" });
    const by = Object.fromEntries(r.map((x) => [x.key, x]));
    expect(by.ADMIN).toMatchObject({ login: "admin", action: "created" });
    expect(by.HQ).toMatchObject({ action: "skipped" });
    expect(by.ANALYST).toMatchObject({ action: "skipped" });
    expect(by.CENTRE).toMatchObject({ action: "skipped" });
    expect(by.CENTRE!.detail).toMatch(/RCMS_CENTRE_ACADEMY_IDS/);
  });

  it("creates the four standard accounts with the usernames admin / hq / centre / analyst", async () => {
    const r = await provisionUsers(h.db, env({ RCMS_CENTRE_ACADEMY_IDS: acad.join(",") }));
    expect(r.map((x) => `${x.login}:${x.action}`)).toEqual(["admin:unchanged", "hq:created", "centre:created", "analyst:created"]);
    const all = await h.db.select({ login: users.email, role: users.role }).from(users).orderBy(users.email);
    expect(all).toEqual([
      { login: "admin", role: "ADMIN" },
      { login: "analyst", role: "ANALYST" },
      { login: "centre", role: "CENTRE_USER" },
      { login: "hq", role: "HQ_OFFICER" },
    ]);
    const [c] = await h.db.select().from(users).where(eq(users.email, "centre"));
    expect((await h.db.select().from(userAcademies).where(eq(userAcademies.userId, c!.id))).map((x) => x.academyId).sort()).toEqual(
      [...acad].sort(),
    );
  });

  it("the provisioned usernames and env passwords can actually sign in", async () => {
    for (const [login, pw] of [
      ["admin", "Quartz-Meadow-7731!"],
      ["HQ", "Orchid-Lantern-4410#"],
      ["centre", "Falcon-Harbour-9082$"],
      ["analyst", "Cobalt-Meridian-5527%"],
    ]) {
      const { user } = await authenticate(h.db, login!, pw!, null);
      expect(user.email).toBe(login!.toLowerCase());
    }
    await expect(authenticate(h.db, "admin", "wrong-wrong-wrong-1", null)).rejects.toMatchObject({ status: 401 });
  });

  it("is idempotent, and rotates a password when the variable changes", async () => {
    const e = env({ RCMS_CENTRE_ACADEMY_IDS: acad.join(",") });
    expect((await provisionUsers(h.db, e)).every((x) => x.action === "unchanged")).toBe(true);
    const rotated = await provisionUsers(h.db, { ...e, RCMS_HQ_PASSWORD: "Maple-Thunder-6613^" });
    expect(rotated.find((x) => x.key === "HQ")?.action).toBe("password_updated");
    await expect(authenticate(h.db, "hq", "Orchid-Lantern-4410#", null)).rejects.toMatchObject({ status: 401 });
    await expect(authenticate(h.db, "hq", "Maple-Thunder-6613^", null)).resolves.toBeTruthy();
  });

  it("re-syncs the centre user's academies", async () => {
    const r = await provisionUsers(h.db, env({ RCMS_CENTRE_ACADEMY_IDS: String(acad[0]) }));
    expect(r.find((x) => x.key === "CENTRE")?.action).toBe("academies_updated");
    const [c] = await h.db.select().from(users).where(eq(users.email, "centre"));
    expect((await h.db.select().from(userAcademies).where(eq(userAcademies.userId, c!.id))).map((x) => x.academyId)).toEqual([acad[0]]);
  });

  it("reports (does not throw) on policy violations, bad usernames and role clashes", async () => {
    const weak = await provisionUsers(h.db, { RCMS_ANALYST_USERNAME: "newanalyst", RCMS_ANALYST_PASSWORD: "short" });
    expect(weak.find((x) => x.key === "ANALYST")).toMatchObject({ action: "error", detail: expect.stringMatching(/12 characters/) });
    const containsName = await provisionUsers(h.db, { RCMS_ANALYST_USERNAME: "zebra", RCMS_ANALYST_PASSWORD: "my-zebra-password-1" });
    expect(containsName.find((x) => x.key === "ANALYST")?.action).toBe("error");
    const badName = await provisionUsers(h.db, { RCMS_HQ_USERNAME: "bad name", RCMS_HQ_PASSWORD: "Maple-Thunder-6613^" });
    expect(badName.find((x) => x.key === "HQ")).toMatchObject({ action: "error", detail: expect.stringMatching(/USERNAME/) });
    const clash = await provisionUsers(h.db, { RCMS_ANALYST_USERNAME: "hq", RCMS_ANALYST_PASSWORD: "Cobalt-Meridian-5527%" });
    expect(clash.find((x) => x.key === "ANALYST")).toMatchObject({ action: "error", detail: expect.stringMatching(/role HQ_OFFICER/) });
  });

  it("never echoes passwords and leaves deactivated accounts deactivated", async () => {
    await h.db.update(users).set({ isActive: false }).where(eq(users.email, "analyst"));
    const secret = "Cobalt-Meridian-5527%";
    const r = await provisionUsers(h.db, env({ RCMS_CENTRE_ACADEMY_IDS: String(acad[0]) }));
    expect(JSON.stringify(r)).not.toContain(secret);
    expect(JSON.stringify(r)).not.toContain("Quartz-Meadow");
    expect(r.find((x) => x.key === "ANALYST")?.detail).toMatch(/deactivated/);
    const [a] = await h.db
      .select({ active: users.isActive })
      .from(users)
      .where(sql`${users.email} = 'analyst'`);
    expect(a!.active).toBe(false);
  });
});
