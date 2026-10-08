/**
 * Browser side of the workbook import: reads the .xlsx/.csv locally, then sends it to the server in small
 * batches (Vercel caps a request body at 4.5 MB, the national workbook is ~10 MB) and asks the server to run
 * the import. The server re-checks everything; nothing here is trusted.
 */
import { batches, toJsonRow, type JsonCell } from "./matrix-json";

export const BATCH_ROWS = 1000;
const MAX_RETRIES = 3;

export type ImportPhase = "reading" | "uploading" | "importing";
export interface Progress {
  phase: ImportPhase;
  sent: number;
  total: number;
}

export class ImportClientError extends Error {}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new ImportClientError("This browser cannot read files securely – open the site over https.");
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Reads the file into a matrix (row 0 = header). Uses the AthleteMaster sheet when present, else the first sheet. */
export async function readMatrix(file: File, buf: ArrayBuffer): Promise<unknown[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const { readSheet, SheetNotFoundError } = await import("read-excel-file/browser");
    const blob = new Blob([buf]);
    try {
      return (await readSheet(blob, "AthleteMaster")) as unknown[][];
    } catch (e) {
      if (!(e instanceof SheetNotFoundError)) throw new ImportClientError(`Could not read the workbook: ${(e as Error).message}`);
      return (await readSheet(blob)) as unknown[][];
    }
  }
  if (name.endsWith(".csv")) {
    const { parse } = await import("csv-parse/browser/esm/sync");
    const text = new TextDecoder("utf-8").decode(buf);
    return parse(text, { bom: true, relax_column_count: true, skip_empty_lines: true }) as string[][];
  }
  throw new ImportClientError("Unsupported file type – choose a .xlsx or .csv file");
}

async function api<T>(url: string, method: "POST" | "DELETE", body?: unknown): Promise<T> {
  let lastError = "";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
      if (res.ok && json) return json;
      const message = json?.error?.message ?? `HTTP ${res.status}`;
      if (res.status < 500) throw new ImportClientError(message); // client errors will not improve on retry
      lastError = message;
    } catch (e) {
      if (e instanceof ImportClientError) throw e;
      lastError = "network error";
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  throw new ImportClientError(`Upload failed (${lastError}). Nothing was imported – please try again.`);
}

export async function runBrowserImport<R>(file: File, mode: "dry_run" | "apply", onProgress: (p: Progress) => void): Promise<R> {
  onProgress({ phase: "reading", sent: 0, total: 0 });
  const buf = await file.arrayBuffer();
  const [hash, matrix] = await Promise.all([sha256Hex(buf), readMatrix(file, buf)]);
  if (matrix.length < 2) throw new ImportClientError("The file has no data rows");
  const header = (matrix[0] ?? []).map((c) => String(c ?? "").trim());
  const rows: JsonCell[][] = matrix.slice(1).map((r) => toJsonRow(r as unknown[]));

  const { stageId } = await api<{ stageId: string }>("/api/imports/stage", "POST", {
    fileName: file.name,
    fileSha256: hash,
    rowCount: rows.length,
    header,
  });
  try {
    let seq = 0;
    let sent = 0;
    for (const part of batches(rows, BATCH_ROWS)) {
      await api(`/api/imports/stage/${stageId}`, "POST", { seq: seq++, rows: part });
      sent += part.length;
      onProgress({ phase: "uploading", sent, total: rows.length });
    }
    onProgress({ phase: "importing", sent: rows.length, total: rows.length });
    return await api<R>(`/api/imports/stage/${stageId}/finish`, "POST", { mode });
  } catch (e) {
    await fetch(`/api/imports/stage/${stageId}`, { method: "DELETE" }).catch(() => undefined);
    throw e;
  }
}
