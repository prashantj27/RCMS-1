import { z } from "zod";
import { badRequest } from "@/server/errors";
import { parseJson, route } from "@/server/http";
import { finishSchema, finishStage } from "@/server/import/stage";

export const dynamic = "force-dynamic";
// The file is read, validated and written in one atomic transaction (≈ 10–30 s for 65,000 rows).
export const maxDuration = 60;

/**
 * { mode: "dry_run" | "apply", replace?: boolean } → import report.
 * A dry run changes nothing and keeps the upload for a following "apply". `replace` empties the registry first.
 */
export const POST = route({ cap: "imports:run" }, async ({ req, db, user, params, ip }) => {
  const id = z.string().uuid().safeParse(params.id);
  if (!id.success) throw badRequest("Invalid upload id");
  return finishStage(db, user, id.data, await parseJson(req, finishSchema), ip);
});
