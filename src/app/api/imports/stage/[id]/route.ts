import { z } from "zod";
import { badRequest } from "@/server/errors";
import { parseJson, route } from "@/server/http";
import { chunkSchema, discardStage, putChunk } from "@/server/import/stage";

export const dynamic = "force-dynamic";

const uuid = z.string().uuid();

/** Send one batch of rows: { seq, rows[][] } (re-sending a seq replaces it). */
export const POST = route({ cap: "imports:run" }, async ({ req, db, params }) => {
  const id = uuid.safeParse(params.id);
  if (!id.success) throw badRequest("Invalid upload id");
  return putChunk(db, id.data, await parseJson(req, chunkSchema));
});

/** Abandon an upload and delete its staged rows. */
export const DELETE = route({ cap: "imports:run" }, async ({ db, params }) => {
  const id = uuid.safeParse(params.id);
  if (!id.success) throw badRequest("Invalid upload id");
  await discardStage(db, id.data);
  return { ok: true };
});
