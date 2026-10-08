import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { compareSizes } from "@/domain/normalize";
import { stateName } from "@/domain/states";
import type { PortalUser } from "../auth/user";
import type { Db } from "../db/client";
import { num, rows } from "../db/util";
import { athleteFiltersSchema, athleteWhere, joinedWhere, pagingSchema, type AthleteFilters } from "./filters";

export const KIT_GROUPS = ["academy", "sport", "centreType", "state", "none"] as const;
export type KitGroup = (typeof KIT_GROUPS)[number];

export const kitQuerySchema = athleteFiltersSchema.extend(pagingSchema.shape).extend({
  groupBy: z.preprocess((v) => (v === "" ? undefined : v), z.enum(KIT_GROUPS).default("centreType")),
});
export type KitQuery = z.infer<typeof kitQuerySchema>;

export type KitItem = "shoe" | "tshirt" | "blazer" | "pant";
export const KIT_ITEMS: { key: KitItem; label: string }[] = [
  { key: "shoe", label: "Shoes" },
  { key: "tshirt", label: "T-shirt" },
  { key: "blazer", label: "Blazer" },
  { key: "pant", label: "Pant" },
];

export interface KitGroupRow {
  key: string;
  label: string;
  athletes: number;
  kitted: number;
  missing: Record<KitItem, number>;
  missingAny: number;
}

export interface KitDemand {
  groupBy: KitGroup;
  totals: { athletes: number; kitted: number; missingAny: number; missing: Record<KitItem, number> };
  /** Required quantity per size, for athletes whose size is known. */
  sizes: Record<KitItem, { size: string; count: number }[]>;
  groups: { rows: KitGroupRow[]; total: number; page: number; pageSize: number; pageCount: number };
}

const MISSING_ANY = sql`(a.shoe_size is null or a.tshirt_size is null or a.blazer_size is null or a.pant_size is null)`;

function aggregateColumns(): SQL {
  return sql`count(distinct a.id)::int as athletes,
    count(distinct a.id) filter (where a.kitting_updated_at is not null)::int as kitted,
    count(distinct a.id) filter (where a.shoe_size is null)::int as m_shoe,
    count(distinct a.id) filter (where a.tshirt_size is null)::int as m_tshirt,
    count(distinct a.id) filter (where a.blazer_size is null)::int as m_blazer,
    count(distinct a.id) filter (where a.pant_size is null)::int as m_pant,
    count(distinct a.id) filter (where ${MISSING_ANY})::int as m_any`;
}

type AggRow = {
  key: string | number | null;
  label: string | null;
  athletes: number;
  kitted: number;
  m_shoe: number;
  m_tshirt: number;
  m_blazer: number;
  m_pant: number;
  m_any: number;
  total_groups?: number;
};

const toGroupRow = (r: AggRow, label: string): KitGroupRow => ({
  key: String(r.key ?? "none"),
  label,
  athletes: num(r.athletes),
  kitted: num(r.kitted),
  missing: { shoe: num(r.m_shoe), tshirt: num(r.m_tshirt), blazer: num(r.m_blazer), pant: num(r.m_pant) },
  missingAny: num(r.m_any),
});

/** Kit & shoe demand for the selected athletes, overall and grouped. */
export async function getKitDemand(db: Db, user: PortalUser, q: KitQuery): Promise<KitDemand> {
  const filters: AthleteFilters = q;
  const aw = athleteWhere(filters, user.scope);
  const jw = joinedWhere(filters, user.scope);

  // — overall totals (athlete-level, each athlete once) —
  const totalsP = rows<AggRow>(db, sql`select ${aggregateColumns()} from athletes a where ${aw}`);

  // — size distribution per item (athlete-level) —
  const distP = rows<{ item: KitItem; size: string; n: number }>(
    db,
    sql`select 'shoe' as item, a.shoe_size::text as size, count(*)::int as n from athletes a where ${aw} and a.shoe_size is not null group by 2
        union all select 'tshirt', a.tshirt_size, count(*)::int from athletes a where ${aw} and a.tshirt_size is not null group by 2
        union all select 'blazer', a.blazer_size, count(*)::int from athletes a where ${aw} and a.blazer_size is not null group by 2
        union all select 'pant', a.pant_size, count(*)::int from athletes a where ${aw} and a.pant_size is not null group by 2`,
  );
  // — grouped rows (started now so all three queries run concurrently) —
  const offset = (Math.max(1, q.page) - 1) * q.pageSize;
  const groupsP = (async () => {
    let groupRows: KitGroupRow[] = [];
    let totalGroups = 0;
    if (q.groupBy !== "none") {
      let keyExpr: SQL;
      let labelExpr: SQL;
      let from: SQL;
      let where: SQL;
      let groupCols: SQL;
      const joined = sql`from athletes a join enrollments e on e.athlete_id = a.id join academies ac on ac.id = e.academy_id left join centre_types ct on ct.id = ac.centre_type_id`;
      switch (q.groupBy) {
        case "academy":
          keyExpr = sql`ac.id`;
          labelExpr = sql`ac.name`;
          from = joined;
          where = jw;
          groupCols = sql`ac.id, ac.name`;
          break;
        case "centreType":
          keyExpr = sql`coalesce(ct.id, 0)`;
          labelExpr = sql`coalesce(ct.label, 'Unclassified')`;
          from = joined;
          where = jw;
          groupCols = sql`ct.id, ct.label`;
          break;
        case "state":
          keyExpr = sql`coalesce(ac.state_code, '??')`;
          labelExpr = sql`coalesce(ac.state_code, '??')`;
          from = joined;
          where = jw;
          groupCols = sql`ac.state_code`;
          break;
        case "sport":
          keyExpr = sql`s.id`;
          labelExpr = sql`s.name`;
          from = sql`from athletes a join sports s on s.id = a.sport_id`;
          where = aw;
          groupCols = sql`s.id, s.name`;
          break;
      }
      const res = await rows<AggRow>(
        db,
        sql`select ${keyExpr} as key, ${labelExpr} as label, ${aggregateColumns()}, count(*) over ()::int as total_groups
          ${from} where ${where}
          group by ${groupCols}
          order by athletes desc, label
          limit ${q.pageSize} offset ${offset}`,
      );
      totalGroups = num(res[0]?.total_groups);
      groupRows = res.map((r) =>
        toGroupRow(
          r,
          q.groupBy === "state" ? (r.key === "??" ? "Not determinable" : (stateName(String(r.label)) ?? String(r.label))) : String(r.label),
        ),
      );
    }
    return { groupRows, totalGroups };
  })();

  const [[t], dist, { groupRows, totalGroups }] = await Promise.all([totalsP, distP, groupsP]);
  const sizes: KitDemand["sizes"] = { shoe: [], tshirt: [], blazer: [], pant: [] };
  for (const d of dist) sizes[d.item].push({ size: d.size, count: num(d.n) });
  for (const k of Object.keys(sizes) as KitItem[]) sizes[k].sort((x, y) => compareSizes(x.size, y.size));

  const pageCount = Math.max(1, Math.ceil(totalGroups / q.pageSize));
  const agg = t ?? ({ athletes: 0, kitted: 0, m_shoe: 0, m_tshirt: 0, m_blazer: 0, m_pant: 0, m_any: 0 } as AggRow);
  return {
    groupBy: q.groupBy,
    totals: {
      athletes: num(agg.athletes),
      kitted: num(agg.kitted),
      missingAny: num(agg.m_any),
      missing: { shoe: num(agg.m_shoe), tshirt: num(agg.m_tshirt), blazer: num(agg.m_blazer), pant: num(agg.m_pant) },
    },
    sizes,
    groups: { rows: groupRows, total: totalGroups, page: Math.min(q.page, pageCount), pageSize: q.pageSize, pageCount },
  };
}

// ── CSV export ──

const csvCell = (v: string | number): string => {
  let s = String(v);
  // Neutralise spreadsheet formula injection from user-controlled text (academy / sport names).
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function kitDemandCsv(d: KitDemand): string {
  const lines: string[] = [];
  lines.push(
    ["Group", "Athletes", "Kitted", "Missing shoe", "Missing t-shirt", "Missing blazer", "Missing pant", "Missing any"]
      .map(csvCell)
      .join(","),
  );
  for (const g of d.groups.rows) {
    lines.push(
      [g.label, g.athletes, g.kitted, g.missing.shoe, g.missing.tshirt, g.missing.blazer, g.missing.pant, g.missingAny]
        .map(csvCell)
        .join(","),
    );
  }
  lines.push("");
  lines.push(["Item", "Size", "Quantity"].join(","));
  for (const item of KIT_ITEMS) for (const s of d.sizes[item.key]) lines.push([item.label, s.size, s.count].map(csvCell).join(","));
  return `${lines.join("\n")}\n`;
}
