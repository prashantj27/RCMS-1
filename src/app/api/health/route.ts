import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";
import { appVersion, authMode } from "@/server/env";
import { getSetupChecks } from "@/server/setup";

export const dynamic = "force-dynamic";

/**
 * Liveness + readiness. Returns booleans only:
 *  - 503 `degraded`        the database cannot be reached
 *  - 200 `setup_required`  app and database are up, but something is not configured yet
 *                          (migrations not run; in login mode also AUTH_SECRET missing / no active accounts)
 *  - 200 `ok`              everything is in place
 */
export async function GET() {
  const base = { version: appVersion(), time: new Date().toISOString() };
  try {
    const db = await getDb();
    const checks = await getSetupChecks(db);
    const mode = authMode();
    // Prototype mode has no accounts or secrets: only the database schema has to be in place.
    const ready = checks.migrations && (mode === "prototype" || (checks.authSecret && checks.accounts));
    return NextResponse.json({ status: ready ? "ok" : "setup_required", db: "up", authMode: mode, checks, ...base });
  } catch (e) {
    console.error("[health] database check failed", e);
    return NextResponse.json({ status: "degraded", db: "down", ...base }, { status: 503 });
  }
}
