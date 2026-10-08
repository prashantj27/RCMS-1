import { NextResponse } from "next/server";
import { parseQuery, route } from "@/server/http";
import { getKitDemand, kitDemandCsv, kitQuerySchema } from "@/server/services/kit";

export const dynamic = "force-dynamic";

export const GET = route({ cap: "kit:read" }, async ({ req, db, user }) => {
  const q = parseQuery(req, kitQuerySchema);
  const csv = req.nextUrl.searchParams.get("format") === "csv";
  // A CSV export covers every group, not just the visible page.
  const demand = await getKitDemand(db, user, csv ? { ...q, page: 1, pageSize: 100 } : q);
  if (!csv) return demand;
  let all = demand;
  if (demand.groups.pageCount > 1) {
    const rows = [...demand.groups.rows];
    for (let p = 2; p <= demand.groups.pageCount; p++)
      rows.push(...(await getKitDemand(db, user, { ...q, page: p, pageSize: 100 })).groups.rows);
    all = { ...demand, groups: { ...demand.groups, rows } };
  }
  return new NextResponse(kitDemandCsv(all), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="kit-demand-${q.groupBy}.csv"`,
    },
  });
});
