import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildImportPlan, rowsFromMatrix } from "@/domain/athlete-master";
import { matrixFromFile, sha256 } from "@/server/import/parse-file";

const FIXTURE = path.join(__dirname, "..", "fixtures", "synthetic-athletes.xlsx");

describe("xlsx import path (synthetic fixture)", () => {
  it("reads the AthleteMaster sheet with real Date cells and builds a clean plan", async () => {
    const buf = fs.readFileSync(FIXTURE);
    const matrix = await matrixFromFile(buf, "synthetic-athletes.xlsx");
    expect(matrix[0]![0]).toBe("player_detail_id");
    expect(matrix[1]![matrix[0]!.indexOf("date_of_birth")]).toBeInstanceOf(Date);
    const plan = buildImportPlan(rowsFromMatrix(matrix), { asOf: "2026-10-08" });
    expect(plan.stats.athletes).toBe(150);
    expect(plan.stats.academies).toBe(6);
    expect(plan.stats.rowsRejected).toBe(0);
    expect(plan.stats.issuesBySeverity.error).toBeGreaterThan(0);
    expect(sha256(buf)).toMatch(/^[0-9a-f]{64}$/);
  });
});
