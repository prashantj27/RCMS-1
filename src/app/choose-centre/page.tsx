import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonPrimary, buttonSecondary, EmptyState, Field, Pagination, Select, TextInput } from "@/components/ui";
import { STATE_OPTIONS } from "@/domain/states";
import { flattenParams, fmt, qs, type SearchParams } from "@/lib/format";
import { prototypeBrowser } from "@/server/auth/prototype";
import { getDb } from "@/server/db/client";
import { authMode } from "@/server/env";
import { academyListQuerySchema, listAcademies } from "@/server/services/academies";
import { getLookups } from "@/server/services/lookups";

export const metadata: Metadata = { title: "Choose a centre" };
export const dynamic = "force-dynamic";

/** Prototype mode: the centre portal shows one centre's data – pick which. */
export default async function ChooseCentrePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  if (authMode() !== "prototype") notFound();
  const raw = flattenParams(await searchParams);
  const parsed = academyListQuerySchema.safeParse({ pageSize: "12", status: "active", ...raw });
  const query = parsed.success ? parsed.data : academyListQuerySchema.parse({ pageSize: "12" });
  const db = await getDb();
  const viewer = prototypeBrowser();
  const [result, lookups] = await Promise.all([listAcademies(db, viewer, query), getLookups(db, viewer)]);
  const base = Object.fromEntries(Object.entries(raw).filter(([k]) => k !== "page"));

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm">
          <Link href="/" className="text-brand-700 hover:underline">
            ← Home – choose a different user type
          </Link>
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Centre user – choose a centre</h1>
        <p className="mt-1 text-sm text-slate-600">
          The portal will show only the athletes enrolled in the centre you pick. {fmt(result.total)} centres match.
        </p>

        <form action="/choose-centre" method="get" className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Search name or code" htmlFor="c-q">
              <TextInput id="c-q" name="q" value={raw.q} placeholder="e.g. NCOE Kolkata" />
            </Field>
            <Field label="Centre type" htmlFor="c-ct">
              <Select
                id="c-ct"
                name="centreTypeId"
                value={raw.centreTypeId}
                options={lookups.centreTypes.map((c) => ({ value: c.id, label: c.label }))}
              />
            </Field>
            <Field label="State (inferred)" htmlFor="c-st">
              <Select
                id="c-st"
                name="stateCode"
                value={raw.stateCode}
                options={STATE_OPTIONS.map((s) => ({ value: s.code, label: s.name }))}
              />
            </Field>
            <Field label="Status" htmlFor="c-status">
              <Select
                id="c-status"
                name="status"
                value={raw.status ?? "active"}
                placeholder="All"
                options={[
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                ]}
              />
            </Field>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Link href="/choose-centre" className={buttonSecondary}>
              Reset
            </Link>
            <button type="submit" className={buttonPrimary}>
              Search
            </button>
          </div>
        </form>

        {result.items.length === 0 ? (
          <div className="mt-6">
            <EmptyState title="No centres match">
              {result.total === 0 && !raw.q ? (
                <>
                  No centres are loaded yet. Go{" "}
                  <Link href="/" className="underline">
                    Home
                  </Link>{" "}
                  and open the Administrator portal to load demo data.
                </>
              ) : (
                "Try a different search."
              )}
            </EmptyState>
          </div>
        ) : (
          <>
            <ul className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Centres">
              {result.items.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{c.name}</p>
                    <p className="text-sm text-slate-500">
                      {c.centreType ?? "Unclassified"} · {c.stateName ?? "state not determinable"} · {fmt(c.athletes)} athletes
                      {c.isActive ? "" : " · inactive"}
                    </p>
                  </div>
                  <a href={`/enter/centre?centre=${c.id}`} data-centre={c.id} className={buttonPrimary}>
                    Open this centre&apos;s portal →
                  </a>
                </li>
              ))}
            </ul>
            <Pagination
              page={result.page}
              pageCount={result.pageCount}
              total={result.total}
              pageSize={result.pageSize}
              hrefFor={(p) => `/choose-centre${qs(base, { page: p })}`}
            />
          </>
        )}
      </div>
    </main>
  );
}
