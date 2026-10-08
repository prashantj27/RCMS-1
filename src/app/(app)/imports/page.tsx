import type { Metadata } from "next";
import { Badge, Card, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { fmt, fmtDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { listImportBatches } from "@/server/services/imports";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Data imports" };
export const dynamic = "force-dynamic";

export default async function ImportsPage() {
  const user = await requireUser("imports:read");
  const batches = await listImportBatches(await getDb());
  const canRun = user.caps.has("imports:run");

  return (
    <>
      <PageHeader
        title="Data imports"
        description="Load or refresh the athlete master from the RC monitoring workbook. Every run is recorded below."
      />
      {canRun ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Upload a workbook" className="lg:col-span-2">
            <ImportForm />
          </Card>
          <Card title="How imports behave">
            <ul className="list-disc space-y-2 pl-5 text-sm text-slate-700">
              <li>
                Always run a <strong>dry run</strong> first: it shows what would change and what the checks found.
              </li>
              <li>
                Imports only <strong>add or update</strong>; nothing is deleted. A blank cell never erases a known value.
              </li>
              <li>Invalid values (impossible dates, size 0, plain-text phone numbers) are not stored and are listed under Data quality.</li>
              <li>Kit data edited in RCMS is kept when the workbook is re-imported.</li>
              <li>
                The national master (~10 MB) is read in your browser and uploaded in small batches, so it works on Vercel. Keep the tab open
                until it finishes. A terminal import is also available: <code>npm run import:athletes -- ./file.xlsx</code>
              </li>
            </ul>
          </Card>
        </div>
      ) : null}

      <h2 className="mb-2 mt-8 text-sm font-semibold text-slate-800">History</h2>
      {batches.length === 0 ? (
        <EmptyState title="No imports yet" />
      ) : (
        <Table caption="Import history">
          <thead>
            <tr>
              <Th>When (IST)</Th>
              <Th>File</Th>
              <Th>Mode</Th>
              <Th>Status</Th>
              <Th className="text-right">Athletes</Th>
              <Th className="text-right">Rejected</Th>
              <Th>By</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {batches.map((b) => {
              const stats = (b.summary as { stats?: { athletes?: number; rowsRejected?: number } } | null)?.stats;
              return (
                <tr key={b.id}>
                  <Td className="whitespace-nowrap">{fmtDateTime(b.startedAt)}</Td>
                  <Td>
                    <span title={`sha256 ${b.fileSha256}`}>{b.fileName}</span>
                  </Td>
                  <Td>{b.mode === "apply" ? <Badge tone="brand">Applied</Badge> : <Badge tone="muted">Dry run</Badge>}</Td>
                  <Td>
                    {b.status === "completed" ? (
                      <Badge tone="ok">Completed</Badge>
                    ) : b.status === "failed" ? (
                      <Badge tone="error">Failed</Badge>
                    ) : (
                      <Badge tone="warning">Running</Badge>
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{fmt(stats?.athletes)}</Td>
                  <Td className="text-right tabular-nums">{fmt(stats?.rowsRejected)}</Td>
                  <Td>{b.createdBy ?? <span className="text-slate-400">CLI / system</span>}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
