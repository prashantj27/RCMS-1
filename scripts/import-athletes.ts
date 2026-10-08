/**
 * Loads an athlete-master workbook (.xlsx / .csv) into the database.
 *
 *   npm run import:athletes -- ./RC_monitoring_Athlete_Details_V1.xlsx --dry-run
 *   npm run import:athletes -- ./RC_monitoring_Athlete_Details_V1.xlsx
 *
 * Options
 *   --dry-run        parse + validate + diff against the database, write nothing
 *   --as-of YYYY-MM-DD   reference date for "future"/age rules (default: today)
 *
 * Uses DATABASE_URL_UNPOOLED / DATABASE_URL (or the local PGlite dev database when neither is set).
 * The workbook contains personal data of minors: keep it out of git and shared drives.
 */
import fs from "node:fs";
import path from "node:path";
import { createDb } from "../src/server/db/client";
import { matrixFromFile, sha256, ImportFileError } from "../src/server/import/parse-file";
import { runAthleteImport } from "../src/server/import/run-import";
import { DQ_RULES, type DqRuleCode } from "../src/domain/dq-rules";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

let closeHandle: () => Promise<void> = async () => undefined;

async function main() {
  const asOfArg = arg("--as-of");
  const file = process.argv.slice(2).find((a) => !a.startsWith("--") && a !== asOfArg);
  if (!file) {
    console.error("Usage: npm run import:athletes -- <file.xlsx|file.csv> [--dry-run] [--as-of YYYY-MM-DD]");
    process.exit(2);
  }
  const dryRun = process.argv.includes("--dry-run");
  const asOf = asOfArg;
  if (asOf && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    console.error("--as-of must be YYYY-MM-DD");
    process.exit(2);
  }

  const buf = fs.readFileSync(file);
  const handle = await createDb({ direct: true });
  closeHandle = () => handle.close();
  const db = handle.db;
  const createdBy: string | null = null; // started from the command line, not from a portal

  const t0 = Date.now();
  console.log(`Reading ${path.basename(file)} (${(buf.length / 1e6).toFixed(1)} MB) …`);
  const matrix = await matrixFromFile(buf, path.basename(file));
  console.log(`Parsed ${(matrix.length - 1).toLocaleString("en-IN")} rows in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const report = await runAthleteImport(db, {
    matrix,
    fileName: path.basename(file),
    fileSha256: sha256(buf),
    mode: dryRun ? "dry_run" : "apply",
    createdBy,
    ...(asOf ? { asOf } : {}),
  });

  const s = report.stats;
  console.log(`\n${dryRun ? "DRY RUN – nothing written" : "APPLIED"}  (batch ${report.batchId})`);
  console.table({
    "rows read": s.rowsRead,
    "rows rejected": s.rowsRejected,
    "rows without academy": s.rowsWithoutAcademy,
    "duplicate enrolment rows merged": s.duplicateEnrollmentRows,
    athletes: `${s.athletes} (${report.diff.athletesNew} new / ${report.diff.athletesExisting} existing)`,
    academies: `${s.academies} (${report.diff.academiesNew} new / ${report.diff.academiesExisting} existing)`,
    enrolments: `${s.enrollments} (${report.diff.enrollmentsNew} new / ${report.diff.enrollmentsExisting} existing)`,
    sports: s.sports,
    "athletes without enrolment": s.athletesWithoutEnrollment,
    "athletes protected by manual edit": report.diff.athletesProtectedByManualEdit,
  });
  console.log("Data-quality findings:");
  console.table(
    report.topIssues.map((t) => ({
      rule: t.rule,
      severity: DQ_RULES[t.rule as DqRuleCode]?.severity ?? "?",
      count: t.count,
    })),
  );
  if (report.applied) console.log(`Possible duplicate athletes flagged: ${report.applied.possibleDuplicates}`);
  if (report.rejected.length) {
    console.log("Rejected rows (first 10):");
    for (const r of report.rejected.slice(0, 10)) console.log(`  line ${r.line}: ${r.reasons.join("; ")}`);
  }
  console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main()
  .then(() => closeHandle())
  .catch(async (e) => {
    console.error(e instanceof ImportFileError ? `Import failed: ${e.message}` : e);
    await closeHandle().catch(() => undefined);
    process.exit(1);
  });
