import { sql } from "drizzle-orm";
import { z } from "zod";
import { DQ_RULE_CODES, DQ_RULES, type DqRuleCode } from "@/domain/dq-rules";
import type { PortalUser } from "../auth/user";
import type { Db } from "../db/client";
import { num, rows } from "../db/util";
import { dqScope, pagingSchema } from "./filters";
import type { Page } from "./athletes";

const emptyToUndef = (v: unknown) => (v === "" || v === null ? undefined : v);

export const dqListQuerySchema = pagingSchema.extend({
  rule: z.preprocess(emptyToUndef, z.enum(DQ_RULE_CODES as [string, ...string[]]).optional()),
  severity: z.preprocess(emptyToUndef, z.enum(["error", "warning", "info"]).optional()),
});
export type DqListQuery = z.infer<typeof dqListQuerySchema>;

export interface DqSummaryRow {
  rule: DqRuleCode;
  title: string;
  description: string;
  severity: "error" | "warning" | "info";
  entity: "athlete" | "academy";
  count: number;
}

export async function getDqSummary(db: Db, user: PortalUser): Promise<{ rows: DqSummaryRow[]; bySeverity: Record<string, number> }> {
  const res = await rows<{ rule_code: string; n: number }>(
    db,
    sql`select d.rule_code, count(*)::int as n from dq_issues d where ${dqScope(user.scope)} group by 1`,
  );
  const counts = new Map(res.map((r) => [r.rule_code, num(r.n)]));
  const out: DqSummaryRow[] = DQ_RULE_CODES.map((rule) => {
    const def = DQ_RULES[rule];
    return {
      rule,
      title: def.title,
      description: def.description,
      severity: def.severity,
      entity: def.entity,
      count: counts.get(rule) ?? 0,
    };
  });
  const order = { error: 0, warning: 1, info: 2 } as const;
  out.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);
  const bySeverity: Record<string, number> = { error: 0, warning: 0, info: 0 };
  for (const r of out) bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + r.count;
  return { rows: out, bySeverity };
}

export interface DqIssueItem {
  id: number;
  rule: DqRuleCode;
  title: string;
  severity: string;
  message: string;
  entityType: "athlete" | "academy";
  entityId: number;
  /** Athlete name is only included for callers allowed to read athlete records. */
  subject: string;
  href: string;
  canOpen: boolean;
}

export async function listDqIssues(db: Db, user: PortalUser, q: DqListQuery): Promise<Page<DqIssueItem>> {
  const conds = [dqScope(user.scope)];
  if (q.rule) conds.push(sql`d.rule_code = ${q.rule}`);
  if (q.severity) conds.push(sql`d.severity = ${q.severity}`);
  const where = sql`${sql.join(conds, sql` and `)}`;
  const counted = await rows<{ n: number }>(db, sql`select count(*)::int as n from dq_issues d where ${where}`);
  const total = num(counted[0]?.n);
  const pageCount = Math.max(1, Math.ceil(total / q.pageSize));
  const page = Math.min(q.page, pageCount);
  const canSeeAthletes = user.caps.has("athletes:read");
  const list = await rows<{
    id: number;
    rule_code: string;
    severity: string;
    message: string;
    entity_type: "athlete" | "academy";
    entity_id: number;
    kit_id: string | null;
    full_name: string | null;
    academy_name: string | null;
  }>(
    db,
    sql`select d.id, d.rule_code, d.severity, d.message, d.entity_type, d.entity_id, a.kit_id, a.full_name, ac.name as academy_name
        from dq_issues d
        left join athletes a on d.entity_type = 'athlete' and a.id = d.entity_id
        left join academies ac on d.entity_type = 'academy' and ac.id = d.entity_id
        where ${where}
        order by case d.severity when 'error' then 0 when 'warning' then 1 else 2 end, d.id
        limit ${q.pageSize} offset ${(page - 1) * q.pageSize}`,
  );
  return {
    items: list.map((r) => ({
      id: Number(r.id),
      rule: r.rule_code as DqRuleCode,
      title: DQ_RULES[r.rule_code as DqRuleCode]?.title ?? r.rule_code,
      severity: r.severity,
      message: r.message,
      entityType: r.entity_type,
      entityId: r.entity_id,
      subject:
        r.entity_type === "academy"
          ? (r.academy_name ?? `Academy ${r.entity_id}`)
          : canSeeAthletes
            ? `${r.full_name ?? "(no name)"} · ${r.kit_id ?? r.entity_id}`
            : String(r.kit_id ?? r.entity_id),
      href: r.entity_type === "academy" ? `/academies/${r.entity_id}` : `/athletes/${r.entity_id}`,
      canOpen: r.entity_type === "academy" || canSeeAthletes,
    })),
    total,
    page,
    pageSize: q.pageSize,
    pageCount,
  };
}
