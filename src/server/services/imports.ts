import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { PROTOTYPE_USER_IDS, portalByRole } from "@/domain/prototype";
import { importBatches } from "../db/schema";
import { num, one } from "../db/util";

export interface ImportBatchView {
  id: string;
  mode: string;
  status: string;
  fileName: string;
  fileSha256: string;
  startedAt: string;
  finishedAt: string | null;
  createdBy: string | null;
  error: string | null;
  summary: Record<string, unknown> | null;
}

/** Which portal started a batch (CLI / system runs have no portal). */
function labelFor(id: string | null): string | null {
  const role = (Object.keys(PROTOTYPE_USER_IDS) as (keyof typeof PROTOTYPE_USER_IDS)[]).find((r) => PROTOTYPE_USER_IDS[r] === id);
  return role ? `${portalByRole(role).title} portal` : null;
}

export async function listImportBatches(db: Db, limit = 25): Promise<ImportBatchView[]> {
  const r = await db
    .select({
      id: importBatches.id,
      mode: importBatches.mode,
      status: importBatches.status,
      fileName: importBatches.fileName,
      fileSha256: importBatches.fileSha256,
      startedAt: importBatches.startedAt,
      finishedAt: importBatches.finishedAt,
      createdBy: importBatches.createdBy,
      error: importBatches.error,
      summary: importBatches.summary,
    })
    .from(importBatches)
    .orderBy(desc(importBatches.startedAt))
    .limit(limit);
  return r.map((x) => ({
    id: x.id,
    mode: x.mode,
    status: x.status,
    fileName: x.fileName,
    fileSha256: x.fileSha256,
    startedAt: x.startedAt.toISOString(),
    finishedAt: x.finishedAt?.toISOString() ?? null,
    createdBy: labelFor(x.createdBy),
    error: x.error,
    summary: x.summary,
  }));
}

export interface CurrentDataset {
  athletes: number;
  centres: number;
  /** The most recent import that was applied (not a dry run); null when the registry has never been loaded. */
  source: { fileName: string; fileSha256: string; loadedAt: string } | null;
}

/** What the portals are showing right now, and which workbook it came from. */
export async function getCurrentDataset(db: Db): Promise<CurrentDataset> {
  const [counts, last] = await Promise.all([
    one<{ athletes: number; centres: number }>(
      db,
      sql`select (select count(*) from athletes)::int as athletes, (select count(*) from academies)::int as centres`,
    ),
    db
      .select({ fileName: importBatches.fileName, fileSha256: importBatches.fileSha256, finishedAt: importBatches.finishedAt })
      .from(importBatches)
      .where(and(eq(importBatches.mode, "apply"), eq(importBatches.status, "completed")))
      .orderBy(desc(importBatches.finishedAt))
      .limit(1),
  ]);
  const l = last[0];
  return {
    athletes: num(counts?.athletes),
    centres: num(counts?.centres),
    source: l?.finishedAt ? { fileName: l.fileName, fileSha256: l.fileSha256, loadedAt: new Date(l.finishedAt).toISOString() } : null,
  };
}
