import { describe, expect, it } from "vitest";
import { ROLES, ROLE_CAPABILITIES } from "@/domain/permissions";
import { PORTALS, PROTOTYPE_USER_IDS, portalByRole, portalBySlug, prototypeCapabilities } from "@/domain/prototype";
import { buildPrototypeUser } from "@/server/auth/prototype";
import { authMode } from "@/server/env";

describe("auth mode", () => {
  it("defaults to prototype (no sign-in); only RCMS_AUTH_MODE=login turns authentication on", () => {
    expect(authMode({})).toBe("prototype");
    expect(authMode({ RCMS_AUTH_MODE: "" })).toBe("prototype");
    expect(authMode({ RCMS_AUTH_MODE: "whatever" })).toBe("prototype");
    expect(authMode({ RCMS_AUTH_MODE: "login" })).toBe("login");
    expect(authMode({ RCMS_AUTH_MODE: " LOGIN " })).toBe("login");
  });
});

describe("portal definitions", () => {
  it("offers exactly one portal per role, with unique slugs", () => {
    expect(PORTALS.map((p) => p.role).sort()).toEqual([...ROLES].sort());
    expect(new Set(PORTALS.map((p) => p.slug)).size).toBe(PORTALS.length);
    expect(portalBySlug("hq")?.role).toBe("HQ_OFFICER");
    expect(portalBySlug("nope")).toBeUndefined();
    expect(portalByRole("CENTRE_USER").slug).toBe("centre");
  });

  it("a portal has the real role's capabilities, minus account management only", () => {
    for (const role of ROLES) {
      const expected = ROLE_CAPABILITIES[role].filter((c) => c !== "users:manage").sort();
      expect([...prototypeCapabilities(role)].sort()).toEqual(expected);
      expect(prototypeCapabilities(role).has("users:manage")).toBe(false);
    }
  });

  it("the home-page promises match the actual permissions", () => {
    const caps = (r: (typeof ROLES)[number]) => prototypeCapabilities(r);
    // Administrator: edits + imports + personal details
    expect(["athletes:write", "imports:run", "athletes:read_pii"].every((c) => caps("ADMIN").has(c as never))).toBe(true);
    // HQ: reads incl. personal details, never edits or imports
    expect(caps("HQ_OFFICER").has("athletes:read_pii")).toBe(true);
    expect(caps("HQ_OFFICER").has("athletes:write")).toBe(false);
    expect(caps("HQ_OFFICER").has("imports:run")).toBe(false);
    // Centre: edits + personal details, no imports; scoped
    expect(caps("CENTRE_USER").has("athletes:write")).toBe(true);
    expect(caps("CENTRE_USER").has("imports:run")).toBe(false);
    // Analyst: aggregates only
    expect(caps("ANALYST").has("athletes:read")).toBe(false);
    expect(caps("ANALYST").has("athletes:read_pii")).toBe(false);
    expect(caps("ANALYST").has("analytics:read")).toBe(true);
  });
});

describe("buildPrototypeUser", () => {
  it("is unrestricted for national portals and limited to the chosen centre for the centre portal", () => {
    for (const role of ["ADMIN", "HQ_OFFICER", "ANALYST"] as const) expect(buildPrototypeUser(role).scope.academyIds).toBeNull();
    const c = buildPrototypeUser("CENTRE_USER", { id: 3010, name: "NCOE Kolkata" });
    expect(c.scope.academyIds).toEqual([3010]);
    expect(c.name).toBe("NCOE Kolkata");
  });
  it("a centre portal without a centre sees nothing (empty scope, never unrestricted)", () => {
    expect(buildPrototypeUser("CENTRE_USER").scope.academyIds).toEqual([]);
  });
  it("uses stable, valid, distinct actor ids", () => {
    const ids = Object.values(PROTOTYPE_USER_IDS);
    expect(new Set(ids).size).toBe(4);
    for (const id of ids) expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(buildPrototypeUser("ADMIN").id).toBe(PROTOTYPE_USER_IDS.ADMIN);
  });
});
