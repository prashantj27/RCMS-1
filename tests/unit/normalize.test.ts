import { describe, expect, it } from "vitest";
import {
  ageInYears,
  cleanText,
  compareSizes,
  normalizeSportName,
  parseDateOnly,
  parseGarmentSize,
  parseMobileCipher,
  parseParentName,
  parseShoeSize,
  parseTimestamp,
  toActiveFlag,
  toAthleteType,
  toGender,
  toInt,
} from "@/domain/normalize";

describe("cleanText", () => {
  it("turns the literal NULL / blanks into null and collapses whitespace", () => {
    expect(cleanText("NULL")).toBeNull();
    expect(cleanText(" null ")).toBeNull();
    expect(cleanText("   ")).toBeNull();
    expect(cleanText(undefined)).toBeNull();
    expect(cleanText("  Hockey  ")).toBe("Hockey");
    expect(cleanText("A   B\tC")).toBe("A B C");
    expect(cleanText(42)).toBe("42");
    expect(cleanText("Nullius")).toBe("Nullius"); // only the exact token is a null
  });
});

describe("scalar parsers", () => {
  it("toInt", () => {
    expect(toInt(5)).toBe(5);
    expect(toInt("12")).toBe(12);
    expect(toInt(" 7 ")).toBe(7);
    expect(toInt("NULL")).toBeNull();
    expect(toInt(1.5)).toBeNull();
    expect(toInt("1e3")).toBeNull();
    expect(toInt("12abc")).toBeNull();
  });
  it("gender / residency / active flags", () => {
    expect(toGender("m")).toBe("M");
    expect(toGender("Female")).toBe("F");
    expect(toGender("X")).toBeNull();
    expect(toAthleteType("Residential")).toBe("RESIDENTIAL");
    expect(toAthleteType("Non-Residential")).toBe("NON_RESIDENTIAL");
    expect(toAthleteType("NULL")).toBeNull();
    expect(toActiveFlag(1)).toBe(true);
    expect(toActiveFlag(0)).toBe(false);
    expect(toActiveFlag("NULL")).toBeNull();
  });
  it("normalises Para sport spellings but leaves others alone", () => {
    expect(normalizeSportName("Para-Archery")).toBe("Para - Archery");
    expect(normalizeSportName("para  -  badminton ")).toBe("Para - badminton");
    expect(normalizeSportName("Para - Judo")).toBe("Para - Judo");
    expect(normalizeSportName("Hockey ")).toBe("Hockey");
    expect(normalizeSportName("Parasailing")).toBe("Parasailing");
  });
});

describe("dates", () => {
  it("reads spreadsheet Dates (UTC midnight) and ISO-ish strings", () => {
    expect(parseDateOnly(new Date(Date.UTC(2004, 0, 5)))).toEqual({ iso: "2004-01-05", raw: null });
    expect(parseDateOnly("2004-01-05 00:00:00.000")).toEqual({ iso: "2004-01-05", raw: null });
    expect(parseDateOnly("NULL")).toEqual({ iso: null, raw: null });
  });
  it("keeps garbage as evidence instead of guessing", () => {
    expect(parseDateOnly("1017-04-04").iso).toBe("1017-04-04"); // parses; range rules reject it later
    expect(parseDateOnly("2023-02-30")).toEqual({ iso: null, raw: "2023-02-30" });
    expect(parseDateOnly("sometime")).toEqual({ iso: null, raw: "sometime" });
    expect(parseDateOnly(new Date("nope")).iso).toBeNull();
  });
  it("timestamps", () => {
    expect(parseTimestamp(new Date(Date.UTC(2024, 9, 14, 14, 56)))?.at?.toISOString()).toBe("2024-10-14T14:56:00.000Z");
    expect(parseTimestamp("2024-10-14 14:56:13.177").at?.toISOString()).toBe("2024-10-14T14:56:13.177Z");
    expect(parseTimestamp("NULL")).toEqual({ at: null, raw: null });
    expect(parseTimestamp("yesterday").raw).toBe("yesterday");
  });
  it("ageInYears handles birthdays that have not happened yet", () => {
    expect(ageInYears("2010-06-15", "2026-06-14")).toBe(15);
    expect(ageInYears("2010-06-15", "2026-06-15")).toBe(16);
    expect(ageInYears("2000-02-29", "2001-02-28")).toBe(0);
  });
});

describe("mobile / parents", () => {
  it("accepts only the encrypted format and never plaintext", () => {
    expect(parseMobileCipher("K533WZ8yaErhk5mBzWIzSQ==")).toEqual({ cipher: "K533WZ8yaErhk5mBzWIzSQ==", invalid: false });
    expect(parseMobileCipher(9876543210)).toEqual({ cipher: null, invalid: true });
    expect(parseMobileCipher("9876543210")).toEqual({ cipher: null, invalid: true });
    expect(parseMobileCipher("7+wu9TmcTV0=")).toEqual({ cipher: null, invalid: true }); // truncated blob
    expect(parseMobileCipher("NULL")).toEqual({ cipher: null, invalid: false });
  });
  it("drops placeholder parent names", () => {
    expect(parseParentName("father")).toEqual({ name: null, placeholder: true });
    expect(parseParentName("Abc")).toEqual({ name: null, placeholder: true });
    expect(parseParentName("NULL")).toEqual({ name: null, placeholder: false });
    expect(parseParentName("Rajesh Kumar")).toEqual({ name: "Rajesh Kumar", placeholder: false });
  });
});

describe("kit sizes", () => {
  it("shoe: 1–15 only, 0 is invalid", () => {
    expect(parseShoeSize(8).value).toBe(8);
    expect(parseShoeSize("10").value).toBe(10);
    expect(parseShoeSize(0)).toMatchObject({ value: null, invalid: true });
    expect(parseShoeSize(16)).toMatchObject({ invalid: true });
    expect(parseShoeSize("NULL")).toMatchObject({ value: null, invalid: false });
  });
  it("garments: letters and ranges per item", () => {
    expect(parseGarmentSize("tshirt", "xl").value).toBe("XL");
    expect(parseGarmentSize("tshirt", "XXXXL").value).toBe("XXXXL");
    expect(parseGarmentSize("tshirt", 36)).toMatchObject({ value: null, invalid: true });
    expect(parseGarmentSize("blazer", 38).value).toBe("38");
    expect(parseGarmentSize("blazer", 12)).toMatchObject({ invalid: true });
    expect(parseGarmentSize("pant", 7)).toMatchObject({ invalid: true });
    expect(parseGarmentSize("pant", "M").value).toBe("M");
    expect(parseGarmentSize("pant", "HUGE")).toMatchObject({ invalid: true });
    expect(parseGarmentSize("pant", "NULL")).toMatchObject({ value: null, invalid: false });
  });
  it("sorts letters before numbers, in garment order", () => {
    expect(["XL", "30", "S", "XXS", "28", "M"].sort(compareSizes)).toEqual(["XXS", "S", "M", "XL", "28", "30"]);
  });
});
