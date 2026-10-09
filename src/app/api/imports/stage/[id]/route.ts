import { z } from "zod";
import { badRequest } from "@/server/errors";
import { route } from "@/server/http";
import { discardStage, MAX_CHUNK_BYTES, putChunk } from "@/server/import/stage";

export const dynamic = "force-dynamic";

const uuid = z.string().uuid();

/** Send one piece of the file as the raw request body: POST …/stage/<id>?seq=<n> (re-sending a seq replaces it). */
export const POST = route({ cap: "imports:run" }, async ({ req, db, params }) => {
  const id = uuid.safeParse(params.id);
  if (!id.success) throw badRequest("Invalid upload id");
  const seq = Number(req.nextUrl.searchParams.get("seq"));
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_CHUNK_BYTES) throw badRequest("Piece too large – send at most 4 MB at a time");
  return putChunk(db, id.data, seq, Buffer.from(await req.arrayBuffer()));
});

/** Abandon an upload and delete its pieces. */
export const DELETE = route({ cap: "imports:run" }, async ({ db, params }) => {
  const id = uuid.safeParse(params.id);
  if (!id.success) throw badRequest("Invalid upload id");
  await discardStage(db, id.data);
  return { ok: true };
});
