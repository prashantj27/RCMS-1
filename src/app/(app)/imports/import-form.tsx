"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Badge, buttonPrimary, buttonSecondary, inputClass, Notice } from "@/components/ui";
import { discardUpload, finishImport, isUploadGone, uploadWorkbook, type Progress } from "@/lib/import-client";

interface Report {
  batchId: string;
  mode: "dry_run" | "apply";
  fileName: string;
  replacing: { athletes: number; centres: number; enrollments: number } | null;
  stats: {
    rowsRead: number;
    rowsRejected: number;
    rowsWithoutAcademy: number;
    duplicateEnrollmentRows: number;
    athletes: number;
    academies: number;
    enrollments: number;
    athletesWithoutEnrollment: number;
  };
  diff: {
    athletesNew: number;
    athletesExisting: number;
    academiesNew: number;
    enrollmentsNew: number;
    athletesProtectedByManualEdit: number;
    kitIdConflicts: number;
  };
  rejected: { line: number; reasons: string[] }[];
  rejectedTruncated: boolean;
  topIssues: { rule: string; count: number }[];
  applied: { possibleDuplicates: number } | null;
}

const MAX_FILE_BYTES = 50 * 1024 * 1024;
const nf = new Intl.NumberFormat("en-IN");
const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

export function ImportForm() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"dry_run" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [replace, setReplace] = useState(true);
  // The uploaded file stays on the server after a dry run, so "Import" does not have to upload it again.
  const staged = useRef<{ key: string; id: string } | null>(null);

  async function submit(mode: "dry_run" | "apply") {
    const file = input.current?.files?.[0];
    setError(null);
    if (!file) return setError("Choose a .xlsx or .csv file first");
    if (file.size > MAX_FILE_BYTES) return setError("This file is over 50 MB – check that it is the athlete master workbook.");
    if (mode === "apply") {
      const message = replace
        ? `Replace ALL data in the live registry with ${file.name}?\n\nEverything currently loaded (including any earlier load or demo data and kit sizes edited in RCMS) is removed and the registry will hold exactly this file. This cannot be undone.`
        : `Import ${file.name} into the live registry?\n\nExisting records are updated, nothing is removed.`;
      if (!window.confirm(message)) return;
    }
    setBusy(mode);
    setReport(null);
    setProgress(null);
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    try {
      const run = async (): Promise<Report> => {
        if (staged.current?.key !== key) {
          if (staged.current) await discardUpload(staged.current.id);
          staged.current = { key, id: await uploadWorkbook(file, setProgress) };
        }
        setProgress({ phase: "importing", sentBytes: file.size, totalBytes: file.size });
        return finishImport<Report>(staged.current.id, mode, replace);
      };
      let json: Report;
      try {
        json = await run();
      } catch (e) {
        if (!isUploadGone(e)) throw e;
        staged.current = null; // expired on the server: send it again once
        json = await run();
      }
      if (mode === "apply") staged.current = null; // the server removes it after a successful import
      setReport(json);
      if (mode === "apply") router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed – please try again");
    }
    setBusy(null);
    setProgress(null);
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="import-file" className="mb-1 block text-xs font-medium text-slate-600">
          Athlete master workbook (.xlsx or .csv)
        </label>
        <input id="import-file" ref={input} type="file" accept=".xlsx,.csv" className={inputClass} />
      </div>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={replace}
          onChange={(e) => setReplace(e.target.checked)}
          className="mt-1"
          data-testid="replace-all"
        />
        <span>
          <strong>Replace all existing data with this file</strong> (recommended for the final dataset). Anything already loaded, such as an
          earlier load or demo data, is removed in the same step, so the registry holds exactly this file. Untick to only add and update.
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy !== null} onClick={() => submit("dry_run")} className={buttonSecondary}>
          {busy === "dry_run" ? "Validating…" : "Validate (dry run)"}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => submit("apply")} className={buttonPrimary}>
          {busy === "apply" ? "Importing…" : "Import"}
        </button>
      </div>
      <div aria-live="polite">
        {busy && progress ? (
          <Notice tone="info">
            {progress.phase === "fingerprint"
              ? "Preparing the file…"
              : progress.phase === "uploading"
                ? `Uploading ${mb(progress.sentBytes)} of ${mb(progress.totalBytes)} MB…`
                : "Reading the workbook and checking it on the server – this takes up to a minute for the national master…"}
          </Notice>
        ) : null}
        {error ? <Notice tone="error">{error}</Notice> : null}
        {report ? (
          <div className="space-y-3">
            {report.replacing ? (
              <Notice tone="warning">
                {report.mode === "apply" ? "Replaced" : "Would replace"} the current registry ({nf.format(report.replacing.athletes)}{" "}
                athletes, {nf.format(report.replacing.centres)} centres, {nf.format(report.replacing.enrollments)} enrolments) with this
                file.
              </Notice>
            ) : null}
            <Notice tone={report.mode === "apply" ? "ok" : "info"}>
              {report.mode === "apply" ? "Imported" : "Dry run complete – nothing was written"}:{" "}
              <strong>{nf.format(report.stats.athletes)}</strong> athletes ({nf.format(report.diff.athletesNew)} new,{" "}
              {nf.format(report.diff.athletesExisting)} existing), <strong>{nf.format(report.stats.academies)}</strong> centres (
              {nf.format(report.diff.academiesNew)} new), <strong>{nf.format(report.stats.enrollments)}</strong> enrolments (
              {nf.format(report.diff.enrollmentsNew)} new).
            </Notice>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              <li>
                {nf.format(report.stats.rowsRead)} rows read, {nf.format(report.stats.rowsRejected)} rejected
              </li>
              <li>
                {nf.format(report.stats.rowsWithoutAcademy)} rows without a centre; {nf.format(report.stats.athletesWithoutEnrollment)}{" "}
                athletes end up not enrolled anywhere
              </li>
              <li>{nf.format(report.stats.duplicateEnrollmentRows)} duplicate enrolment rows merged</li>
              {report.diff.athletesProtectedByManualEdit > 0 ? (
                <li>{nf.format(report.diff.athletesProtectedByManualEdit)} athletes keep their manually edited kit data</li>
              ) : null}
              {report.applied ? <li>{nf.format(report.applied.possibleDuplicates)} athletes flagged as possible duplicates</li> : null}
            </ul>
            <div className="flex flex-wrap gap-2">
              {report.topIssues.slice(0, 8).map((t) => (
                <Badge key={t.rule} tone="muted">
                  {t.rule}: {nf.format(t.count)}
                </Badge>
              ))}
            </div>
            {report.rejected.length > 0 ? (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium text-red-800">
                  Rejected rows ({report.rejected.length}
                  {report.rejectedTruncated ? "+" : ""})
                </summary>
                <ul className="mt-2 list-disc pl-5 text-slate-700">
                  {report.rejected.map((r, i) => (
                    <li key={i}>
                      {r.line ? `line ${r.line}: ` : ""}
                      {r.reasons.join("; ")}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
