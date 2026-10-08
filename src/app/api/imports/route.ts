import { audit } from "@/server/auth/audit";
import { MAX_UPLOAD_BYTES } from "@/server/env";
import { badRequest, AppError } from "@/server/errors";
import { route } from "@/server/http";
import { ImportFileError, matrixFromFile, sha256 } from "@/server/import/parse-file";
import { runAthleteImport } from "@/server/import/run-import";
import { listImportBatches } from "@/server/services/imports";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = route({ cap: "imports:read" }, async ({ db }) => ({ batches: await listImportBatches(db) }));

/**
 * multipart/form-data: `file` (.xlsx/.csv, ≤ 4 MB) and `mode` = dry_run | apply.
 * Larger workbooks (e.g. the 65k-row national master) are loaded with `npm run import:athletes`.
 */
export const POST = route({ cap: "imports:run" }, async ({ req, db, user, ip }) => {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) {
    throw new AppError(413, "too_large", "File too large for web upload (max 4 MB). Use the CLI importer for large workbooks.");
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("Expected multipart/form-data");
  }
  const file = form.get("file");
  const mode = form.get("mode") === "apply" ? "apply" : "dry_run";
  if (!(file instanceof File)) throw badRequest("Missing file");
  if (file.size === 0) throw badRequest("File is empty");
  if (file.size > MAX_UPLOAD_BYTES) throw new AppError(413, "too_large", "File too large for web upload (max 4 MB). Use the CLI importer.");

  const buf = Buffer.from(await file.arrayBuffer());
  try {
    const matrix = await matrixFromFile(buf, file.name);
    const report = await runAthleteImport(db, {
      matrix,
      fileName: file.name.slice(0, 200),
      fileSha256: sha256(buf),
      mode,
      createdBy: user.id,
    });
    await audit(db, {
      actorId: user.id,
      actorEmail: user.email,
      action: mode === "apply" ? "import_apply" : "import_dry_run",
      entityType: "import_batch",
      entityId: report.batchId,
      detail: { fileName: file.name, athletes: report.stats.athletes, rejected: report.stats.rowsRejected },
      ip,
    });
    return report;
  } catch (e) {
    if (e instanceof ImportFileError) throw badRequest(e.message);
    throw e;
  }
});
