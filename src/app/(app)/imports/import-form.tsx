"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Badge, buttonPrimary, buttonSecondary, inputClass, Notice } from "@/components/ui";

interface Report {
  batchId: string;
  mode: "dry_run" | "apply";
  fileName: string;
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

const MAX = 4 * 1024 * 1024;
const nf = new Intl.NumberFormat("en-IN");

export function ImportForm() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"dry_run" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  async function submit(mode: "dry_run" | "apply") {
    const file = input.current?.files?.[0];
    setError(null);
    if (!file) return setError("Choose a .xlsx or .csv file first");
    if (file.size > MAX) return setError("This file is over 4 MB. Use the command-line importer for large workbooks (see below).");
    if (
      mode === "apply" &&
      !window.confirm(`Import ${file.name} into the live registry?\n\nExisting records are updated, nothing is deleted.`)
    )
      return;
    setBusy(mode);
    setReport(null);
    const body = new FormData();
    body.set("file", file);
    body.set("mode", mode);
    try {
      const res = await fetch("/api/imports", { method: "POST", body });
      const json = (await res.json().catch(() => null)) as (Report & { error?: { message?: string } }) | null;
      if (!res.ok || !json) setError(json?.error?.message ?? `Import failed (HTTP ${res.status})`);
      else {
        setReport(json);
        if (mode === "apply") router.refresh();
      }
    } catch {
      setError("Network error – please try again");
    }
    setBusy(null);
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="import-file" className="mb-1 block text-xs font-medium text-slate-600">
          Athlete master workbook (.xlsx or .csv, max 4 MB)
        </label>
        <input id="import-file" ref={input} type="file" accept=".xlsx,.csv" className={inputClass} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy !== null} onClick={() => submit("dry_run")} className={buttonSecondary}>
          {busy === "dry_run" ? "Validating…" : "Validate (dry run)"}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => submit("apply")} className={buttonPrimary}>
          {busy === "apply" ? "Importing…" : "Import"}
        </button>
      </div>
      <div aria-live="polite">
        {error ? <Notice tone="error">{error}</Notice> : null}
        {report ? (
          <div className="space-y-3">
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
