import type { Metadata } from "next";
import Link from "next/link";
import { AthleteFilterForm } from "@/components/athlete-filter-form";
import { BarList, buttonSecondary, Card, EmptyState, Field, PageHeader, Pagination, Select, Stat, Table, Td, Th } from "@/components/ui";
import { fmt, flattenParams, pct, qs, type SearchParams } from "@/lib/format";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { getKitDemand, KIT_ITEMS, kitQuerySchema, type KitGroup } from "@/server/services/kit";
import { getLookups } from "@/server/services/lookups";

export const metadata: Metadata = { title: "Kit & shoe planning" };
export const dynamic = "force-dynamic";

const GROUP_LABEL: Record<KitGroup, string> = {
  centreType: "Centre type",
  academy: "Centre",
  sport: "Sport",
  state: "State (inferred)",
  none: "No grouping",
};

export default async function KitPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser("kit:read");
  const raw = flattenParams(await searchParams);
  const parsed = kitQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : kitQuerySchema.parse({});
  const db = await getDb();
  const [d, lookups] = await Promise.all([getKitDemand(db, user, query), getLookups(db, user)]);
  const base = Object.fromEntries(Object.entries(raw).filter(([k]) => k !== "page"));
  const csvHref = `/api/kit/demand${qs(base, { format: "csv" })}`;

  return (
    <>
      <PageHeader
        title="Kit & shoe planning"
        description="Quantities to procure per size for the selected athletes, and who is still missing a size. Narrow the selection with the filters, then export."
        actions={
          <a href={csvHref} className={buttonSecondary}>
            Download CSV
          </a>
        }
      />

      <AthleteFilterForm
        action="/kit"
        values={raw}
        lookups={lookups}
        showSearch={false}
        resetHref="/kit"
        extra={
          <Field label="Group results by" htmlFor="k-group">
            <Select
              id="k-group"
              name="groupBy"
              value={query.groupBy}
              placeholder="Centre type"
              options={(Object.keys(GROUP_LABEL) as KitGroup[])
                .filter((g) => g !== "centreType")
                .map((g) => ({ value: g, label: GROUP_LABEL[g] }))}
            />
          </Field>
        }
      />

      {d.totals.athletes === 0 ? (
        <EmptyState title="No athletes in this selection" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Athletes in selection" value={fmt(d.totals.athletes)} />
            <Stat label="Kit already issued" value={pct(d.totals.kitted, d.totals.athletes)} hint={`${fmt(d.totals.kitted)} athletes`} />
            <Stat
              label="Missing at least one size"
              value={fmt(d.totals.missingAny)}
              hint={pct(d.totals.missingAny, d.totals.athletes) + " of selection"}
            />
            <Stat
              label="Missing shoe size"
              value={fmt(d.totals.missing.shoe)}
              hint={`T-shirt ${fmt(d.totals.missing.tshirt)} · Blazer ${fmt(d.totals.missing.blazer)} · Pant ${fmt(d.totals.missing.pant)}`}
            />
          </div>

          <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-800">Quantity required per size</h2>
          <p className="mb-3 text-xs text-slate-500">
            Counts athletes whose size is on record; athletes with a missing size must be measured first.
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {KIT_ITEMS.map((item) => (
              <Card key={item.key} title={item.label}>
                <BarList items={d.sizes[item.key].map((s) => ({ label: s.size, count: s.count }))} emptyText="No sizes recorded" />
              </Card>
            ))}
          </div>

          {d.groupBy !== "none" ? (
            <>
              <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-800">By {GROUP_LABEL[d.groupBy].toLowerCase()}</h2>
              <Table caption={`Kit demand by ${GROUP_LABEL[d.groupBy]}`}>
                <thead>
                  <tr>
                    <Th>{GROUP_LABEL[d.groupBy]}</Th>
                    <Th className="text-right">Athletes</Th>
                    <Th className="text-right">Kit issued</Th>
                    <Th className="text-right">No shoe</Th>
                    <Th className="text-right">No t-shirt</Th>
                    <Th className="text-right">No blazer</Th>
                    <Th className="text-right">No pant</Th>
                    <Th className="text-right">Any missing</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {d.groups.rows.map((g) => (
                    <tr key={g.key} className="hover:bg-slate-50">
                      <Td>
                        {d.groupBy === "academy" ? (
                          <Link href={`/academies/${g.key}`} className="text-brand-700 hover:underline">
                            {g.label}
                          </Link>
                        ) : (
                          g.label
                        )}
                      </Td>
                      <Td className="text-right tabular-nums">{fmt(g.athletes)}</Td>
                      <Td className="text-right tabular-nums">{fmt(g.kitted)}</Td>
                      <Td className="text-right tabular-nums">{fmt(g.missing.shoe)}</Td>
                      <Td className="text-right tabular-nums">{fmt(g.missing.tshirt)}</Td>
                      <Td className="text-right tabular-nums">{fmt(g.missing.blazer)}</Td>
                      <Td className="text-right tabular-nums">{fmt(g.missing.pant)}</Td>
                      <Td className="text-right font-medium tabular-nums">{fmt(g.missingAny)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Pagination
                page={d.groups.page}
                pageCount={d.groups.pageCount}
                total={d.groups.total}
                pageSize={d.groups.pageSize}
                hrefFor={(p) => `/kit${qs(base, { page: p })}`}
              />
              {d.groupBy !== "sport" ? (
                <p className="mt-2 text-xs text-slate-500">
                  Athletes enrolled in several centres appear in each, so group rows can add up to more than the selection total.
                </p>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </>
  );
}
