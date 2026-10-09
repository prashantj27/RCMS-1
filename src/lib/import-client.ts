/**
 * Browser side of the workbook import. The browser does NOT parse the spreadsheet: it fingerprints the file (SHA-256) and
 * sends it, untouched, in pieces small enough for a serverless request (Vercel caps a body at 4.5 MB). The server puts the
 * pieces back together, verifies size and checksum, reads the workbook and imports it. Nothing here is trusted by the server.
 */
export const CHUNK_BYTES = 3 * 1024 * 1024;
const MAX_RETRIES = 3;

export type ImportPhase = "fingerprint" | "uploading" | "importing";
export interface Progress {
  phase: ImportPhase;
  sentBytes: number;
  totalBytes: number;
}

export class ImportClientError extends Error {}

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new ImportClientError("This browser cannot read files securely – open the site over https.");
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

interface ApiOptions {
  json?: unknown;
  blob?: Blob;
}

async function api<T>(url: string, method: "POST" | "DELETE", body: ApiOptions = {}): Promise<T> {
  let lastError = "";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers:
          body.json !== undefined
            ? { "content-type": "application/json" }
            : body.blob
              ? { "content-type": "application/octet-stream" }
              : undefined,
        body: body.json !== undefined ? JSON.stringify(body.json) : body.blob,
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
  throw new ImportClientError(`Request failed (${lastError}). Nothing was imported – please try again.`);
}

/** Uploads the file and returns the id of the staged upload. */
export async function uploadWorkbook(file: File, onProgress: (p: Progress) => void): Promise<string> {
  onProgress({ phase: "fingerprint", sentBytes: 0, totalBytes: file.size });
  const fileSha256 = await sha256Hex(await file.arrayBuffer());
  const { stageId } = await api<{ stageId: string }>("/api/imports/stage", "POST", {
    json: { fileName: file.name, fileSha256, fileBytes: file.size },
  });
  try {
    let sent = 0;
    for (let seq = 0; sent < file.size; seq++) {
      const piece = file.slice(sent, Math.min(sent + CHUNK_BYTES, file.size));
      await api(`/api/imports/stage/${stageId}?seq=${seq}`, "POST", { blob: piece });
      sent += piece.size;
      onProgress({ phase: "uploading", sentBytes: sent, totalBytes: file.size });
    }
  } catch (e) {
    await discardUpload(stageId);
    throw e;
  }
  return stageId;
}

export async function finishImport<R>(stageId: string, mode: "dry_run" | "apply", replace: boolean): Promise<R> {
  return api<R>(`/api/imports/stage/${stageId}/finish`, "POST", { json: { mode, replace } });
}

export async function discardUpload(stageId: string): Promise<void> {
  await fetch(`/api/imports/stage/${stageId}`, { method: "DELETE" }).catch(() => undefined);
}

/** True when the server no longer has the upload (expired or cleaned up), so it must be sent again. */
export const isUploadGone = (e: unknown): boolean =>
  e instanceof ImportClientError && /Upload .*(expired|not found)|not found/i.test(e.message);
