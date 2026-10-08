import { describe, expect, it } from "vitest";
import { buildImportPlan, HeaderError, parseRow, rowsFromMatrix, type RawRow } from "@/domain/athlete-master";

const ASOF = "2026-10-08";
const good = (o: RawRow = {}): RawRow => ({
  player_detail_id: 1,
  athlete_kitd_id: "ARAA080F04",
  full_name: "Test Athlete",
  father_full_name: "Father One",
  mother_full_name: "Mother One",
  gender: "F",
  date_of_birth: new Date(Date.UTC(2004, 5, 5)),
  mobile_number: "K533WZ8yaErhk5mBzWIzSQ==",
  sport_name: "Archery",
  role_detail_id: 6,
  academy_role: "Academy",
  academy_detail_id: 100,
  academy_kitd_id: "MSAA000UP21",
  academy_name: "Test Academy",
  academy_is_active: 1,
  type_of_athelete: "Residential",
  date_of_joining: new Date(Date.UTC(2020, 0, 15)),
  shoe_size: 6,
  blazer_size: 38,
  tshirt_size: "M",
  pant_size: 32,
  kitting_updated_date: "NULL",
  ...o,
});
const rules = (r: RawRow) => parseRow(2, r, { asOf: ASOF }).issues.map((i) => i.rule);

describe("parseRow", () => {
  it("accepts a clean row with no findings", () => {
    const p = parseRow(2, good(), { asOf: ASOF });
    expect(p.fatal).toEqual([]);
    expect(p.issues).toEqual([]);
    expect(p.athlete).toMatchObject({
      id: 1,
      kitId: "ARAA080F04",
      gender: "F",
      dob: "2004-06-05",
      shoeSize: 6,
      blazerSize: "38",
      tshirtSize: "M",
      pantSize: "32",
    });
    expect(p.academy).toMatchObject({ id: 100, centreTypeId: 6, isActive: true, stateCode: "UP" });
    expect(p.enrollment).toEqual({ athleteId: 1, academyId: 100, athleteType: "RESIDENTIAL", joinedOn: "2020-01-15" });
  });

  it("rejects rows without usable identity", () => {
    expect(parseRow(2, good({ player_detail_id: "NULL" }), { asOf: ASOF }).fatal[0]).toMatch(/player_detail_id/);
    expect(parseRow(2, good({ athlete_kitd_id: "NULL" }), { asOf: ASOF }).fatal[0]).toMatch(/athlete_kitd_id/);
    expect(parseRow(2, good({ gender: "?" }), { asOf: ASOF }).fatal[0]).toMatch(/gender/);
    expect(parseRow(2, good({ sport_name: "" }), { asOf: ASOF }).fatal[0]).toMatch(/sport_name/);
  });

  it.each([
    [{ full_name: "NULL" }, "NAME_MISSING"],
    [{ date_of_birth: "1882-04-26 00:00:00.000" }, "DOB_INVALID"],
    [{ date_of_birth: new Date(Date.UTC(2101, 2, 24)) }, "DOB_INVALID"],
    [{ date_of_birth: new Date(Date.UTC(2004, 0, 1)) }, "DOB_PLACEHOLDER_LIKELY"],
    [{ date_of_birth: new Date(Date.UTC(2024, 5, 5)), athlete_kitd_id: "ARAA080F24" }, "DOB_AGE_OUTLIER"],
    [{ mobile_number: 9876543210 }, "MOBILE_INVALID"],
    [{ athlete_kitd_id: "ARAA080M04" }, "KITID_GENDER_MISMATCH"],
    [{ athlete_kitd_id: "ARAA080F99" }, "KITID_YEAR_MISMATCH"],
    [{ athlete_kitd_id: "WEIRD" }, "KITID_FORMAT"],
    [{ father_full_name: "father" }, "PARENT_PLACEHOLDER"],
    [{ shoe_size: 0 }, "SIZE_INVALID"],
    [{ tshirt_size: 36 }, "SIZE_INVALID"],
    [{ kitting_updated_date: new Date(Date.UTC(2031, 0, 1)) }, "KITTING_DATE_INVALID"],
    [{ date_of_joining: "0202-08-01" }, "JOIN_DATE_INVALID"],
    [{ date_of_joining: new Date(Date.UTC(2003, 0, 1)) }, "JOIN_BEFORE_BIRTH"],
    [{ date_of_joining: new Date(Date.UTC(2007, 0, 1)) }, "JOIN_AGE_IMPLAUSIBLE"],
    [{ type_of_athelete: "NULL" }, "ATHLETE_TYPE_MISSING"],
    [{ academy_is_active: 0 }, "INACTIVE_ACADEMY"],
    [{ academy_name: "NULL" }, "ACADEMY_NAME_MISSING"],
  ] as [RawRow, string][])("flags %j as %s", (override, rule) => {
    expect(rules(good(override))).toContain(rule);
  });

  it("does not store invalid values", () => {
    const p = parseRow(
      2,
      good({ shoe_size: 0, date_of_joining: "0202-08-01", mobile_number: 5551234, father_full_name: "abc", date_of_birth: "1882-04-26" }),
      { asOf: ASOF },
    );
    expect(p.athlete).toMatchObject({ shoeSize: null, mobileCipher: null, fatherName: null, dob: null });
    expect(p.enrollment?.joinedOn).toBeNull();
  });

  it("treats a row without academy as athlete-only", () => {
    const p = parseRow(
      2,
      good({
        role_detail_id: "NULL",
        academy_role: "NULL",
        academy_detail_id: "NULL",
        academy_kitd_id: "NULL",
        academy_name: "NULL",
        academy_is_active: "NULL",
      }),
      { asOf: ASOF },
    );
    expect(p.athlete).toBeDefined();
    expect(p.academy).toBeUndefined();
    expect(p.enrollment).toBeUndefined();
  });

  it("uppercases and trims the KIT id", () => {
    expect(parseRow(2, good({ athlete_kitd_id: " araa080f04 " }), { asOf: ASOF }).athlete?.kitId).toBe("ARAA080F04");
  });
});

describe("rowsFromMatrix", () => {
  it("maps headers case-insensitively, accepts the corrected spelling, skips blank lines and reports line numbers", () => {
    const rows = rowsFromMatrix([
      ["Player_Detail_ID", "athlete_kitd_id", "full_name", "gender", "date_of_birth", "sport_name", "type_of_athlete"],
      [1, "A", "n", "M", null, "x", "Residential"],
      [null, "", " ", null, null, null, null],
      [2, "B", "n", "F", null, "x", null],
    ]);
    expect(rows.map((r) => r.line)).toEqual([2, 4]);
    expect(rows[0]!.row.player_detail_id).toBe(1);
    expect(rows[0]!.row.type_of_athelete).toBe("Residential");
  });
  it("fails fast on missing required columns", () => {
    expect(() => rowsFromMatrix([["foo"], [1]])).toThrow(HeaderError);
    expect(() => rowsFromMatrix([])).toThrow(HeaderError);
    try {
      rowsFromMatrix([["player_detail_id"]]);
    } catch (e) {
      expect((e as HeaderError).missing).toContain("sport_name");
    }
  });
});

describe("buildImportPlan", () => {
  const row = (o: RawRow, line: number) => ({ line, row: good(o) });

  it("collapses duplicate athlete rows into one athlete with several enrolments", () => {
    const plan = buildImportPlan(
      [row({}, 2), row({ academy_detail_id: 101, academy_name: "Second", academy_kitd_id: "MSAA000MH23" }, 3), row({}, 4)],
      { asOf: ASOF },
    );
    expect(plan.athletes).toHaveLength(1);
    expect(plan.academies).toHaveLength(2);
    expect(plan.enrollments).toHaveLength(2);
    expect(plan.stats.duplicateEnrollmentRows).toBe(1);
    expect(plan.stats.athleteAttributeConflicts).toBe(0);
  });

  it("merges a duplicate enrolment: fills blanks and keeps the earliest joining date", () => {
    const plan = buildImportPlan(
      [
        row({ type_of_athelete: "NULL", date_of_joining: new Date(Date.UTC(2021, 0, 1)) }, 2),
        row({ type_of_athelete: "Residential", date_of_joining: new Date(Date.UTC(2019, 0, 1)) }, 3),
      ],
      { asOf: ASOF },
    );
    expect(plan.enrollments).toEqual([{ athleteId: 1, academyId: 100, athleteType: "RESIDENTIAL", joinedOn: "2019-01-01" }]);
  });

  it("counts genuine attribute conflicts between rows of one athlete", () => {
    const plan = buildImportPlan([row({}, 2), row({ date_of_birth: new Date(Date.UTC(2005, 1, 1)) }, 3)], { asOf: ASOF });
    expect(plan.stats.athleteAttributeConflicts).toBe(1);
    expect(plan.athletes[0]!.dob).toBe("2004-06-05"); // first value wins
  });

  it("flags athletes without enrolment, multi-enrolment and shared academy codes", () => {
    const rows = [
      row(
        {
          player_detail_id: 5,
          athlete_kitd_id: "ARAA001F04",
          role_detail_id: "NULL",
          academy_role: "NULL",
          academy_detail_id: "NULL",
          academy_kitd_id: "NULL",
          academy_name: "NULL",
          academy_is_active: "NULL",
        },
        2,
      ),
      ...[100, 101, 102].map((id, i) => row({ academy_detail_id: id, academy_name: `A${id}`, academy_kitd_id: "MSAA000UP21" }, 3 + i)),
    ];
    const plan = buildImportPlan(rows, { asOf: ASOF });
    const by = plan.stats.issuesByRule;
    expect(by.NO_ACADEMY).toBe(1);
    expect(by.MULTI_ENROLLMENT).toBe(1);
    expect(by.ACADEMY_CODE_SHARED).toBe(3);
    expect(plan.stats.athletesWithoutEnrollment).toBe(1);
  });

  it("rejects a KIT id claimed by two different athlete ids", () => {
    const plan = buildImportPlan([row({ player_detail_id: 1 }, 2), row({ player_detail_id: 2 }, 3)], { asOf: ASOF });
    expect(plan.athletes).toHaveLength(1);
    expect(plan.rejected).toHaveLength(1);
    expect(plan.rejected[0]!.line).toBe(3);
  });

  it("builds the sports master with a para flag and derives centre types", () => {
    const plan = buildImportPlan(
      [
        row({ sport_name: "Para-Archery" }, 2),
        row({ player_detail_id: 2, athlete_kitd_id: "ARAA002M04", gender: "M", sport_name: "Archery" }, 3),
      ],
      { asOf: ASOF },
    );
    expect(plan.sports).toEqual([
      { name: "Archery", slug: "archery", isPara: false },
      { name: "Para - Archery", slug: "para-archery", isPara: true },
    ]);
    expect(plan.centreTypes.map((c) => c.id)).toEqual([6]);
  });
});
