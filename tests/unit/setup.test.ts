import { describe, expect, it } from "vitest";
import { authSecretConfigured, notConfiguredError, pgErrorCode } from "@/server/setup";

describe("pgErrorCode", () => {
  it("finds the SQLSTATE however the driver wraps it", () => {
    expect(pgErrorCode({ code: "42P01" })).toBe("42P01");
    expect(pgErrorCode(new Error("Failed query", { cause: { code: "23505" } }))).toBe("23505");
    expect(pgErrorCode({ cause: { cause: { code: "42P01" } } })).toBe("42P01");
    expect(pgErrorCode({ code: "ECONNREFUSED" })).toBeUndefined(); // not a SQLSTATE
    expect(pgErrorCode(null)).toBeUndefined();
    expect(pgErrorCode("boom")).toBeUndefined();
  });
});

describe("notConfiguredError", () => {
  it("maps 'table does not exist' to an actionable 503", () => {
    const e = notConfiguredError(new Error("Failed query", { cause: { code: "42P01" } }));
    expect(e).toMatchObject({ status: 503, code: "not_configured" });
    expect(e?.message).toMatch(/migrations/i);
  });
  it("maps a missing AUTH_SECRET to an actionable 503", () => {
    expect(notConfiguredError(new Error("AUTH_SECRET must be set to a random string"))).toMatchObject({ status: 503 });
  });
  it("leaves every other error alone", () => {
    expect(notConfiguredError(new Error("something else"))).toBeNull();
    expect(notConfiguredError({ code: "23505" })).toBeNull();
  });
});

describe("authSecretConfigured", () => {
  it("is not needed in prototype mode; always true outside production; ≥ 32 chars in production login mode", () => {
    expect(authSecretConfigured({})).toBe(true); // NODE_ENV=test
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    try {
      expect(authSecretConfigured({})).toBe(true); // prototype mode (default): no secret needed
      const login = { RCMS_AUTH_MODE: "login" };
      expect(authSecretConfigured(login)).toBe(false);
      expect(authSecretConfigured({ ...login, AUTH_SECRET: "short" })).toBe(false);
      expect(authSecretConfigured({ ...login, AUTH_SECRET: "x".repeat(32) })).toBe(true);
    } finally {
      (process.env as Record<string, string>).NODE_ENV = prev!;
    }
  });
});
