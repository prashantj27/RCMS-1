import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { appVersion } from "@/server/env";

export const dynamic = "force-dynamic";

/** Liveness + database readiness. Deliberately returns no internals. */
export async function GET() {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return NextResponse.json({ status: "ok", db: "up", version: appVersion(), time: new Date().toISOString() });
  } catch (e) {
    console.error("[health] database check failed", e);
    return NextResponse.json({ status: "degraded", db: "down", version: appVersion(), time: new Date().toISOString() }, { status: 503 });
  }
}
