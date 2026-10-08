import { route } from "@/server/http";
import { listImportBatches } from "@/server/services/imports";

export const dynamic = "force-dynamic";

/** Import history. (Uploading is done in batches through /api/imports/stage.) */
export const GET = route({ cap: "imports:read" }, async ({ db }) => ({ batches: await listImportBatches(db) }));
