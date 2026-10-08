import type { Metadata } from "next";
import Link from "next/link";
import {
  Badge,
  buttonPrimary,
  buttonSecondary,
  EmptyState,
  Field,
  PageHeader,
  Pagination,
  Select,
  Table,
  Td,
  TextInput,
  Th,
} from "@/components/ui";
import { STATE_OPTIONS } from "@/domain/states";
import { fmt, flattenParams, qs, type SearchParams } from "@/lib/format";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { academyListQuerySchema, listAcademies } from "@/server/services/academies";
import { getLookups } from "@/server/services/lookups";

export const metadata: Metadata = { title: "Academies & centres" };
export const dynamic = "force-dynamic";

export default async function AcademiesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser("academies:read");
  const raw = flattenParams(await searchParams);
  const parsed = academyListQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : academyListQuerySchema.parse({});
  const db = await getDb();
  const [result, lookups] = await Promise.all([listAcademies(db, user, query), getLookups(db, user)]);
  const base = Object.fromEntries(Object.entries(raw).filter(([k]) => k !== "page"));
  const canOpenAthletes = user.caps.has("athletes:read");

  return (
    <>
      <PageHeader
        title="Academies & centres"
        description={`${fmt(result.total)} centres. Athlete counts are enrolments (an athlete enrolled in two centres is counted in both).`}
      />
      <form action="/academies" method="get" className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Search name or code" htmlFor="a-q">
            <TextInput id="a-q" name="q" value={raw.q} />
          </Field>
          <Field label="Centre type" htmlFor="a-ct">
            <Select
              id="a-ct"
              name="centreTypeId"
              value={raw.centreTypeId}
              options={lookups.centreTypes.map((c) => ({ value: c.id, label: c.label }))}
            />
          </Field>
          <Field label="State (inferred)" htmlFor="a-st">
            <Select
              id="a-st"
              name="stateCode"
              value={raw.stateCode}
              options={STATE_OPTIONS.map((s) => ({ value: s.code, label: s.name }))}
            />
          </Field>
          <Field label="Status" htmlFor="a-status">
            <Select
              id="a-status"
              name="status"
              value={raw.status}
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
              ]}
            />
          </Field>
          <Field label="Sort" htmlFor="a-sort">
            <Select id="a-sort" name="sort" value={raw.sort} placeholder="Most athletes" options={[{ value: "name", label: "Name A–Z" }]} />
          </Field>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Link href="/academies" className={buttonSecondary}>
            Reset
          </Link>
          <button type="submit" className={buttonPrimary}>
            Apply filters
          </button>
        </div>
      </form>

      {result.items.length === 0 ? (
        <EmptyState title="No centres match these filters" />
      ) : (
        <>
          <Table caption="Academies and centres">
            <thead>
              <tr>
                <Th>Centre</Th>
                <Th>Code</Th>
                <Th>Type</Th>
                <Th>State</Th>
                <Th>Status</Th>
                <Th className="text-right">Athletes</Th>
                <Th className="text-right">Residential</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result.items.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <Td>
                    <Link href={`/academies/${a.id}`} className="font-medium text-brand-700 hover:underline">
                      {a.name}
                    </Link>
                  </Td>
                  <Td className="font-mono text-xs">{a.kitCode ?? "—"}</Td>
                  <Td>{a.centreType ?? "—"}</Td>
                  <Td>{a.stateName ?? <span className="text-slate-400">—</span>}</Td>
                  <Td>{a.isActive ? <Badge tone="ok">Active</Badge> : <Badge tone="warning">Inactive</Badge>}</Td>
                  <Td className="text-right tabular-nums">
                    {canOpenAthletes ? (
                      <Link href={`/athletes?academyId=${a.id}`} className="text-brand-700 hover:underline">
                        {fmt(a.athletes)}
                      </Link>
                    ) : (
                      fmt(a.athletes)
                    )}
                  </Td>
                  <Td className="text-right tabular-nums">{fmt(a.residential)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            pageSize={result.pageSize}
            hrefFor={(p) => `/academies${qs(base, { page: p })}`}
          />
        </>
      )}
    </>
  );
}
