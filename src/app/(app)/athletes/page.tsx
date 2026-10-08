import type { Metadata } from "next";
import Link from "next/link";
import { AthleteFilterForm } from "@/components/athlete-filter-form";
import { Badge, EmptyState, Field, PageHeader, Pagination, Select, Table, Td, Th } from "@/components/ui";
import { fmt, flattenParams, qs, type SearchParams } from "@/lib/format";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { listAthletes } from "@/server/services/athletes";
import { ATHLETE_SORTS, athleteListQuerySchema } from "@/server/services/filters";
import { getLookups } from "@/server/services/lookups";

export const metadata: Metadata = { title: "Athletes" };
export const dynamic = "force-dynamic";

const SORT_LABELS: Record<(typeof ATHLETE_SORTS)[number], string> = {
  name: "Name A–Z",
  recent: "Newest id first",
  kit: "KIT id",
  age_asc: "Youngest first",
  age_desc: "Oldest first",
};

export default async function AthletesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser("athletes:read");
  const raw = flattenParams(await searchParams);
  const parsed = athleteListQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : athleteListQuerySchema.parse({});
  const db = await getDb();
  const [result, lookups] = await Promise.all([listAthletes(db, user, query), getLookups(db, user)]);
  const base = Object.fromEntries(Object.entries(raw).filter(([k]) => k !== "page"));

  return (
    <>
      <PageHeader
        title="Athletes"
        description={`${fmt(result.total)} athletes${user.scope.academyIds !== null ? " in your assigned centres" : ""}.`}
      />
      {!parsed.success ? <p className="mb-3 text-sm text-amber-800">Some filters were not understood and were ignored.</p> : null}
      <AthleteFilterForm
        action="/athletes"
        values={raw}
        lookups={lookups}
        resetHref="/athletes"
        extra={
          <Field label="Sort by" htmlFor="f-sort">
            <Select
              id="f-sort"
              name="sort"
              value={query.sort}
              placeholder="Name A–Z"
              options={ATHLETE_SORTS.filter((s) => s !== "name").map((s) => ({ value: s, label: SORT_LABELS[s] }))}
            />
          </Field>
        }
      />

      {result.items.length === 0 ? (
        <EmptyState title="No athletes match these filters">Try removing a filter or searching by KIT id.</EmptyState>
      ) : (
        <>
          <Table caption="Athletes">
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>KIT id</Th>
                <Th>Gender</Th>
                <Th>Age</Th>
                <Th>Sport</Th>
                <Th>Centre</Th>
                <Th>Review</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.items.map((a) => {
                const first = a.enrollments[0];
                return (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <Td>
                      <Link href={`/athletes/${a.id}`} className="font-medium text-brand-700 hover:underline">
                        {a.fullName ?? <em className="text-slate-500">(no name)</em>}
                      </Link>
                    </Td>
                    <Td className="font-mono text-xs">{a.kitId}</Td>
                    <Td>{a.gender === "M" ? "Male" : "Female"}</Td>
                    <Td className="tabular-nums">{a.age ?? "—"}</Td>
                    <Td>{a.sport}</Td>
                    <Td>
                      {first ? (
                        <>
                          <span>{first.academyName}</span>
                          {first.centreType ? <span className="ml-1 text-xs text-slate-500">({first.centreType})</span> : null}
                          {a.enrollments.length > 1 ? (
                            <span className="ml-1 text-xs text-slate-500">+{a.enrollments.length - 1} more</span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-slate-500">Not enrolled</span>
                      )}
                    </Td>
                    <Td>
                      {a.issueCount > 0 ? (
                        <Badge tone="warning">
                          {a.issueCount} issue{a.issueCount > 1 ? "s" : ""}
                        </Badge>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            pageSize={result.pageSize}
            hrefFor={(p) => `/athletes${qs(base, { page: p })}`}
          />
        </>
      )}
    </>
  );
}
