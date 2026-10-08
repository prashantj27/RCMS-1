import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { appVersion } from "@/server/env";
import { getSetupChecks } from "@/server/setup";

export const dynamic = "force-dynamic";

/**
 * Liveness + readiness. Returns booleans only:
 *  - 503 `degraded`        the database cannot be reached
 *  - 200 `setup_required`  app and database are up, but the tables do not exist yet (migrations did not run)
 *  - 200 `ok`              ready; `checks.data` says whether athletes have been loaded
 */
export async function GET() {
  const base = { version: appVersion(), time: new Date().toISOString() };
  try {
    const checks = await getSetupChecks(await getDb());
    return NextResponse.json({ status: checks.migrations ? "ok" : "setup_required", db: "up", checks, ...base });
  } catch (e) {
    console.error("[health] database check failed", e);
    return NextResponse.json({ status: "degraded", db: "down", ...base }, { status: 503 });
  }
}
