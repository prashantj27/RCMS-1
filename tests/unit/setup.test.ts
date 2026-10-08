import { describe, expect, it } from "vitest";
import { notConfiguredError, pgErrorCode } from "@/server/setup";

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
  it("leaves every other error alone", () => {
    expect(notConfiguredError(new Error("something else"))).toBeNull();
    expect(notConfiguredError({ code: "23505" })).toBeNull();
  });
});
