import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { capabilitiesFor, isScopedRole, ROLES, ROLE_CAPABILITIES } from "@/domain/permissions";
import { passwordPolicyError } from "@/server/auth/password";
import { sessionVersion, signSession, verifySession } from "@/server/auth/session";
import { assertSameOrigin } from "@/server/http";
import { ImportFileError, matrixFromFile } from "@/server/import/parse-file";
import { escapeLike } from "@/server/services/filters";

const req = (method: string, headers: Record<string, string>) => new NextRequest("http://rcms.test/api/x", { method, headers });

describe("CSRF origin check", () => {
  it("allows safe methods and same-origin mutations", () => {
    expect(() => assertSameOrigin(req("GET", {}))).not.toThrow();
    expect(() => assertSameOrigin(req("POST", { origin: "http://rcms.test", host: "rcms.test" }))).not.toThrow();
    expect(() => assertSameOrigin(req("POST", { "sec-fetch-site": "same-origin", host: "rcms.test" }))).not.toThrow();
    expect(() => assertSameOrigin(req("POST", { host: "rcms.test" }))).not.toThrow(); // non-browser client
  });
  it("blocks cross-origin mutations", () => {
    expect(() => assertSameOrigin(req("POST", { origin: "https://evil.example", host: "rcms.test" }))).toThrow(/Cross-origin/);
    expect(() => assertSameOrigin(req("PATCH", { "sec-fetch-site": "cross-site", host: "rcms.test" }))).toThrow(/Cross-origin/);
    expect(() => assertSameOrigin(req("DELETE", { origin: "null", host: "rcms.test" }))).toThrow(/Cross-origin/);
  });
  it("honours x-forwarded-host behind a proxy", () => {
    expect(() =>
      assertSameOrigin(req("POST", { origin: "https://app.example.org", host: "internal:3000", "x-forwarded-host": "app.example.org" })),
    ).not.toThrow();
  });
});

describe("sessions", () => {
  it("round-trips and rejects tampering", async () => {
    const token = await signSession({ sub: "u1", sv: "abc" });
    expect(await verifySession(token)).toEqual({ sub: "u1", sv: "abc" });
    expect(await verifySession(`${token}x`)).toBeNull();
    expect(await verifySession("garbage")).toBeNull();
    const [h, p, s] = token.split(".");
    const forged = `${h}.${Buffer.from(JSON.stringify({ sub: "admin", sv: "abc" })).toString("base64url")}.${s}`;
    expect(await verifySession(forged)).toBeNull();
    expect(p).toBeTruthy();
  });
  it("rejects alg=none tokens", async () => {
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from('{"sub":"u1","sv":"x"}').toString("base64url")}.`;
    expect(await verifySession(none)).toBeNull();
  });
  it("session fingerprint differs per password hash", () => {
    expect(sessionVersion("a")).not.toBe(sessionVersion("b"));
  });
});

describe("password policy", () => {
  it("enforces length and obvious weaknesses", () => {
    expect(passwordPolicyError("short", "a@b.org")).toMatch(/12/);
    expect(passwordPolicyError("aaaaaaaaaaaaaaaa", "a@b.org")).toMatch(/repetitive/);
    expect(passwordPolicyError("contains-jsmith-inside", "jsmith@x.org")).toMatch(/email/);
    expect(passwordPolicyError("Quartz-Meadow-7731!", "jsmith@x.org")).toBeNull();
  });
});

describe("roles", () => {
  it("only ADMIN may import or manage users; only centre users are scoped", () => {
    for (const r of ROLES) {
      const caps = capabilitiesFor(r);
      expect(caps.has("users:manage")).toBe(r === "ADMIN");
      expect(caps.has("imports:run")).toBe(r === "ADMIN");
      expect(isScopedRole(r)).toBe(r === "CENTRE_USER");
    }
  });
  it("analysts never see athlete-level data; only writers can edit", () => {
    expect(ROLE_CAPABILITIES.ANALYST).not.toContain("athletes:read");
    expect(ROLE_CAPABILITIES.ANALYST).not.toContain("athletes:read_pii");
    expect(ROLES.filter((r) => capabilitiesFor(r).has("athletes:write"))).toEqual(["ADMIN", "CENTRE_USER"]);
  });
});

describe("search escaping", () => {
  it("escapes LIKE metacharacters", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});

describe("upload parsing", () => {
  it("parses CSV (with BOM) into a matrix", async () => {
    const csv = Buffer.from('﻿player_detail_id,full_name\n1,"Doe, Jane"\n2,Bob\n');
    expect(await matrixFromFile(csv, "x.csv")).toEqual([
      ["player_detail_id", "full_name"],
      ["1", "Doe, Jane"],
      ["2", "Bob"],
    ]);
  });
  it("rejects unsupported types and mislabelled files", async () => {
    await expect(matrixFromFile(Buffer.from("x"), "x.exe")).rejects.toBeInstanceOf(ImportFileError);
    await expect(matrixFromFile(Buffer.from("not a zip"), "x.xlsx")).rejects.toThrow(/not a valid .xlsx/);
    await expect(matrixFromFile(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]), "x.csv")).rejects.toThrow(/looks like a workbook/);
  });
});
