import type { Db } from "../db/client";
import { auditLog } from "../db/schema";

export interface AuditEntry {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType?: string;
  entityId?: string | number;
  detail?: Record<string, unknown>;
  ip?: string | null;
}

/** Best-effort audit trail: a logging failure must never fail the user's request. */
export async function audit(db: Db, e: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorId: e.actorId ?? null,
      actorEmail: e.actorEmail ?? null,
      action: e.action,
      entityType: e.entityType ?? null,
      entityId: e.entityId === undefined ? null : String(e.entityId),
      detail: e.detail ?? null,
      ip: e.ip ?? null,
    });
  } catch (err) {
    console.error("[audit] failed to write entry", e.action, err);
  }
}
