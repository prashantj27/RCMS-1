import { route } from "@/server/http";
import { runSetup } from "@/server/setup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Creates / updates the database tables (idempotent). Administrator portal only. */
export const POST = route({ cap: "imports:run" }, async () => ({ checks: await runSetup() }));
