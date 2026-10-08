import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, PageHeader, Pagination, SeverityBadge, Stat, Table, Td, Th } from "@/components/ui";
import { DQ_RULES } from "@/domain/dq-rules";
import { fmt, flattenParams, qs, type SearchParams } from "@/lib/format";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { dqListQuerySchema, getDqSummary, listDqIssues } from "@/server/services/dq";

export const metadata: Metadata = { title: "Data quality" };
export const dynamic = "force-dynamic";

export default async function DataQualityPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser("dq:read");
  const raw = flattenParams(await searchParams);
  const parsed = dqListQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : dqListQuerySchema.parse({});
  const db = await getDb();
  const [summary, list] = await Promise.all([getDqSummary(db, user), listDqIssues(db, user, query)]);
  const base = Object.fromEntries(Object.entries(raw).filter(([k]) => k !== "page"));
  const canOpenAthletes = user.caps.has("athletes:read");
  const activeRule = query.rule ? DQ_RULES[query.rule as keyof typeof DQ_RULES] : null;

  return (
    <>
      <PageHeader
        title="Data quality"
        description="Automatic checks run on every import. Invalid values are never stored; the finding remains here until the record is corrected at source and re-imported."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Errors"
          value={fmt(summary.bySeverity.error)}
          hint="record is wrong or unusable"
          href={`/data-quality${qs({}, { severity: "error" })}`}
        />
        <Stat
          label="Warnings"
          value={fmt(summary.bySeverity.warning)}
          hint="probably wrong – review"
          href={`/data-quality${qs({}, { severity: "warning" })}`}
        />
        <Stat
          label="Notes"
          value={fmt(summary.bySeverity.info)}
          hint="informational"
          href={`/data-quality${qs({}, { severity: "info" })}`}
        />
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-800">Findings by rule</h2>
      <Table caption="Data-quality rules and counts">
        <thead>
          <tr>
            <Th>Rule</Th>
            <Th>Severity</Th>
            <Th>What it checks</Th>
            <Th className="text-right">Findings</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {summary.rows.map((r) => (
            <tr key={r.rule} className={query.rule === r.rule ? "bg-brand-50" : "hover:bg-slate-50"}>
              <Td className="font-medium">{r.title}</Td>
              <Td>
                <SeverityBadge severity={r.severity} />
              </Td>
              <Td className="max-w-md text-slate-600">{r.description}</Td>
              <Td className="text-right tabular-nums">{fmt(r.count)}</Td>
              <Td className="whitespace-nowrap text-right">
                {r.count > 0 ? (
                  <>
                    <Link href={`/data-quality${qs({}, { rule: r.rule })}`} className="text-brand-700 hover:underline">
                      List
                    </Link>
                    {canOpenAthletes && r.entity === "athlete" ? (
                      <>
                        {" · "}
                        <Link href={`/athletes${qs({}, { issueRule: r.rule })}`} className="text-brand-700 hover:underline">
                          Athletes
                        </Link>
                      </>
                    ) : null}
                  </>
                ) : null}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <h2 className="mb-2 mt-8 text-sm font-semibold text-slate-800">
        {activeRule ? `Findings: ${activeRule.title}` : query.severity ? `All ${query.severity} findings` : "All findings (errors first)"}{" "}
        {(query.rule || query.severity) && (
          <Link href="/data-quality" className="ml-2 text-xs font-normal text-brand-700 hover:underline">
            clear filter
          </Link>
        )}
      </h2>
      {list.items.length === 0 ? (
        <EmptyState title="Nothing to show" />
      ) : (
        <>
          <Card className="!p-0">
            <ul className="divide-y divide-slate-100">
              {list.items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                  <SeverityBadge severity={i.severity} />
                  <span className="font-medium text-slate-900">{i.title}</span>
                  <span className="text-slate-600">{i.message}</span>
                  <span className="ml-auto">
                    {i.canOpen ? (
                      <Link href={i.href} className="text-brand-700 hover:underline">
                        {i.subject}
                      </Link>
                    ) : (
                      <span className="text-slate-700">{i.subject}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Pagination
            page={list.page}
            pageCount={list.pageCount}
            total={list.total}
            pageSize={list.pageSize}
            hrefFor={(p) => `/data-quality${qs(base, { page: p })}`}
          />
        </>
      )}
    </>
  );
}
