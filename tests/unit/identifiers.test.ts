import { describe, expect, it } from "vitest";
import { centreTypeFromRole, KNOWN_CENTRE_TYPES } from "@/domain/centre-types";
import { inferStateCode, normalizeKitId, parseAthleteKitId } from "@/domain/identifiers";
import { STATE_BY_CODE, stateName } from "@/domain/states";

describe("athlete KIT id", () => {
  it("decodes prefix, gender and birth year", () => {
    expect(parseAthleteKitId("ARAA080F04")).toEqual({ sportPrefix: "AR", series: "AA", serial: "080", gender: "F", birthYear2: 4 });
    expect(parseAthleteKitId("ATAC332M04")?.gender).toBe("M");
    expect(parseAthleteKitId("bad")).toBeNull();
    expect(parseAthleteKitId("ARAA080X04")).toBeNull();
  });
  it("normalises case and whitespace", () => {
    expect(normalizeKitId(" ttaa024f06 ")).toBe("TTAA024F06");
    expect(normalizeKitId("NULL")).toBeNull();
    expect(normalizeKitId(null)).toBeNull();
  });
});

describe("academy code → state", () => {
  it("infers a state only from the SSAA000XXnn pattern", () => {
    expect(inferStateCode("MSAA000UP21")).toBe("UP");
    expect(inferStateCode("RBAA000DL15")).toBe("DL");
    expect(inferStateCode("msaa000as10")).toBe("AS");
    expect(inferStateCode("NCOEAA009MS")).toBeNull(); // other scheme: MS is not a state
    expect(inferStateCode("ABSCAA172MS")).toBeNull();
    expect(inferStateCode("MSAA000ZZ21")).toBeNull(); // unknown code
    expect(inferStateCode(null)).toBeNull();
  });
  it("names states", () => {
    expect(stateName("UP")).toBe("Uttar Pradesh");
    expect(stateName(null)).toBeNull();
    expect(Object.keys(STATE_BY_CODE).length).toBeGreaterThan(30);
  });
});

describe("centre types", () => {
  it("knows the nine observed types and derives unknown ones", () => {
    expect(KNOWN_CENTRE_TYPES).toHaveLength(9);
    expect(centreTypeFromRole(82, "SKIC (SLKIC)")).toMatchObject({ code: "SKIC_SLKIC", operator: "SLKIC" });
    expect(centreTypeFromRole(99, "XYZ (SAI)")).toMatchObject({ id: 99, code: "XYZ_SAI", operator: "SAI" });
    expect(centreTypeFromRole(98, "Private Club")).toMatchObject({ operator: "ACADEMY" });
  });
});
