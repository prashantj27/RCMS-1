import { describe, expect, it } from "vitest";
import { databaseUrl, directDatabaseUrl } from "@/server/db/url";

const POOLED = "postgres://u:p@ep-x-pooler.ap-southeast-1.aws.neon.tech/db?sslmode=require";
const DIRECT = "postgres://u:p@ep-x.ap-southeast-1.aws.neon.tech/db?sslmode=require";

describe("connection string resolution (Vercel + Neon)", () => {
  it("runtime uses the pooled DATABASE_URL", () => {
    expect(databaseUrl({ DATABASE_URL: POOLED, DATABASE_URL_UNPOOLED: DIRECT })).toBe(POOLED);
  });
  it("migrations / imports prefer the un-pooled URL", () => {
    expect(directDatabaseUrl({ DATABASE_URL: POOLED, DATABASE_URL_UNPOOLED: DIRECT })).toBe(DIRECT);
    expect(directDatabaseUrl({ DATABASE_URL: POOLED, POSTGRES_URL_NON_POOLING: DIRECT })).toBe(DIRECT);
  });
  it("falls back to the pooled URL when no direct URL exists", () => {
    expect(directDatabaseUrl({ DATABASE_URL: POOLED })).toBe(POOLED);
  });
  it("accepts the legacy POSTGRES_URL alias and ignores blanks", () => {
    expect(databaseUrl({ POSTGRES_URL: POOLED })).toBe(POOLED);
    expect(databaseUrl({ DATABASE_URL: "  ", POSTGRES_URL: POOLED })).toBe(POOLED);
    expect(databaseUrl({})).toBeUndefined();
    expect(directDatabaseUrl({ DATABASE_URL_UNPOOLED: "" })).toBeUndefined();
  });
});
