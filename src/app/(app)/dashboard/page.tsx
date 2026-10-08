import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, BarList, Card, Meter, PageHeader, Stat } from "@/components/ui";
import { fmt, pct } from "@/lib/format";
import { getPortalUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { getOverview } from "@/server/services/analytics";
import { getDemoStatus } from "@/server/services/demo";
import { LoadDemoButton } from "./load-demo-button";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getPortalUser();
  if (!user) redirect("/");
  if (!user.caps.has("analytics:read")) redirect(user.caps.has("athletes:read") ? "/athletes" : "/forbidden");
  const db = await getDb();
  const o = await getOverview(db, user);
  const t = o.totals;
  const canDrill = user.caps.has("athletes:read");

  if (t.athletes === 0) {
    const demo = await getDemoStatus(db, user);
    return (
      <>
        <PageHeader title="Dashboard" />
        <Card title="No athletes in the registry yet">
          {demo.canLoad ? (
            <>
              <p className="text-sm text-slate-700">
                This is a fresh prototype with an empty database. Load fictional, synthetic data (about 1,200 athletes in 30 centres) to
                explore every portal. You can also load the real workbook from the command line (see the README) – but only load real
                athlete data if the site is access-protected.
              </p>
              <LoadDemoButton />
            </>
          ) : user.scope.academyIds !== null ? (
            <p className="text-sm text-slate-700">No athletes are enrolled in this centre.</p>
          ) : demo.athletes === 0 ? (
            <p className="text-sm text-slate-700">
              The registry is empty. Use{" "}
              <Link href="/" className="text-brand-700 underline">
                Home
              </Link>{" "}
              to open the <strong>Administrator</strong> portal, which can load demo data.
            </p>
          ) : (
            <p className="text-sm text-slate-700">The registry is empty. Load the athlete workbook (see the README).</p>
          )}
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          user.scope.academyIds === null
            ? "National overview of enrolled athletes and centres."
            : user.scope.academyIds.length === 1
              ? "Figures for your centre."
              : "Figures for your assigned centres."
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Athletes" value={fmt(t.athletes)} href={canDrill ? "/athletes" : undefined} />
        <Stat label="Centres" value={fmt(t.academies)} hint={`${fmt(t.activeAcademies)} active`} href="/academies" />
        <Stat label="Sports" value={fmt(t.sports)} />
        <Stat label="Enrolments" value={fmt(t.enrollments)} hint="athlete × centre" />
        <Stat label="Kit issued" value={pct(t.kitted, t.athletes)} hint={`${fmt(t.kitted)} athletes`} href="/kit" />
        <Stat
          label="Need data review"
          value={fmt(t.withIssues)}
          hint={`${pct(t.withIssues, t.athletes, 1)} of athletes`}
          href={canDrill ? "/athletes?hasIssues=1" : "/data-quality"}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card title="Athletes by centre type">
          <BarList
            items={o.byCentreType.map((c) => ({
              label: `${c.label} · ${fmt(c.academies)} ${c.academies === 1 ? "centre" : "centres"}`,
              count: c.count,
              href: canDrill && c.key !== "none" ? `/athletes?centreTypeId=${c.key}` : undefined,
            }))}
            total={t.athletes}
          />
        </Card>
        <Card title="Top sports" action={<Badge tone="muted">top 15</Badge>}>
          <BarList
            items={o.bySport.map((s) => ({ label: s.label, count: s.count, href: canDrill ? `/athletes?sportId=${s.key}` : undefined }))}
            total={t.athletes}
          />
        </Card>
        <Card title="Athletes by state" action={<Badge tone="muted">inferred from centre code</Badge>}>
          <BarList
            items={o.byState.slice(0, 15).map((s) => ({
              label: s.label,
              count: s.count,
              href: canDrill && s.key !== "unknown" ? `/athletes?stateCode=${s.key}` : undefined,
            }))}
            total={t.athletes}
          />
          {o.byState.length > 15 ? <p className="mt-3 text-xs text-slate-500">+ {o.byState.length - 15} more states / UTs</p> : null}
        </Card>
        <div className="grid gap-4">
          <Card title="Gender">
            <BarList
              items={o.gender.map((g) => ({ label: g.label, count: g.count, href: canDrill ? `/athletes?gender=${g.key}` : undefined }))}
              total={t.athletes}
            />
          </Card>
          <Card title="Residential status">
            <BarList
              items={o.residency.map((r) => ({
                label: r.label,
                count: r.count,
                href: canDrill && r.key !== "unknown" ? `/athletes?athleteType=${r.key}` : undefined,
              }))}
            />
          </Card>
          <Card title="Age profile">
            <BarList items={o.ageBands.map((a) => ({ label: a.label, count: a.count }))} total={t.athletes} />
          </Card>
        </div>
      </div>

      <Card title="Profile completeness" className="mt-6">
        <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {o.completeness.map((c) => (
            <li key={c.field}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-slate-700">{c.label}</span>
                <span className="tabular-nums text-slate-500">{fmt(c.present)}</span>
              </div>
              <Meter value={c.present} max={c.total} label={c.label} />
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
