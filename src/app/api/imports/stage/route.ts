import { NextResponse } from "next/server";
import { parseJson, route } from "@/server/http";
import { startStage, startStageSchema } from "@/server/import/stage";

export const dynamic = "force-dynamic";

/** Begin a workbook upload: { fileName, fileSha256, rowCount, header[] } → { stageId } */
export const POST = route({ cap: "imports:run" }, async ({ req, db, user }) => {
  const out = await startStage(db, user, await parseJson(req, startStageSchema));
  return NextResponse.json(out, { status: 201 });
});
