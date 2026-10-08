import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, BarList, Card, Meter, PageHeader, SeverityBadge, Stat } from "@/components/ui";
import { fmt, pct } from "@/lib/format";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { getAcademy, type AcademyDetail } from "@/server/services/academies";

export const metadata: Metadata = { title: "Centre" };
export const dynamic = "force-dynamic";

export default async function AcademyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("academies:read");
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) notFound();
  let a: AcademyDetail;
  try {
    a = await getAcademy(await getDb(), user, Number(id));
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const canOpenAthletes = user.caps.has("athletes:read");
  const k = a.kitCoverage;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/academies" className="text-brand-700 hover:underline">
          ← Academies & centres
        </Link>
      </p>
      <PageHeader
        title={a.name}
        description={
          <>
            {a.centreType ?? "Unclassified"} · {a.stateName ? `${a.stateName} (inferred)` : "state not determinable"}
            {a.kitCode ? (
              <>
                {" "}
                · code <span className="font-mono">{a.kitCode}</span>
              </>
            ) : null}
          </>
        }
        actions={a.isActive ? <Badge tone="ok">Active</Badge> : <Badge tone="warning">Inactive</Badge>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Athletes" value={fmt(a.athletes)} href={canOpenAthletes ? `/athletes?academyId=${a.id}` : undefined} />
        <Stat label="Residential" value={fmt(a.residential)} hint={`${fmt(a.nonResidential)} non-residential`} />
        <Stat
          label="All sizes recorded"
          value={pct(k.withAllSizes, k.athletes)}
          hint={`${fmt(k.withAllSizes)} of ${fmt(k.athletes)}`}
          href={`/kit?groupBy=none&academyId=${a.id}`}
        />
        <Stat label="Kit issued" value={pct(k.kitted, k.athletes)} hint={`${fmt(k.kitted)} athletes`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Sports">
          <BarList items={a.sports.map((s) => ({ label: s.label, count: s.count }))} total={a.athletes} />
        </Card>
        <div className="grid gap-4">
          <Card title="Gender">
            <BarList items={a.genderSplit.map((g) => ({ label: g.label, count: g.count }))} total={a.athletes} />
          </Card>
          <Card title="Size coverage">
            <Meter value={k.withAllSizes} max={k.athletes} label="Athletes with all four sizes recorded" />
          </Card>
        </div>
      </div>

      <Card title="Data-quality findings" className="mt-6">
        {a.issues.length === 0 ? (
          <p className="text-sm text-emerald-700">No findings for this centre.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {a.issues.map((i) => (
              <li key={i.rule} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <SeverityBadge severity={i.severity} />
                  {i.title}
                </span>
                <span className="tabular-nums text-slate-600">{fmt(i.count)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
