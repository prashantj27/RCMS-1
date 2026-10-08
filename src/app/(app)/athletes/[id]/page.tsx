import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader, SeverityBadge, Table, Td, Th } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { getAthlete, type AthleteDetail } from "@/server/services/athletes";
import { KitEditor } from "./kit-editor";

export const metadata: Metadata = { title: "Athlete" };
export const dynamic = "force-dynamic";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="col-span-2 text-slate-900">{children ?? "—"}</dd>
    </div>
  );
}

export default async function AthleteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("athletes:read");
  const { id } = await params;
  if (!/^\d{1,9}$/.test(id)) notFound();
  let a: AthleteDetail;
  try {
    a = await getAthlete(await getDb(), user, Number(id));
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  const pii = user.caps.has("athletes:read_pii");
  const kitted = a.kit.kittingUpdatedAt !== null;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/athletes" className="text-brand-700 hover:underline">
          ← Athletes
        </Link>
      </p>
      <PageHeader
        title={a.fullName ?? "(no name recorded)"}
        description={
          <>
            <span className="font-mono">{a.kitId}</span> · {a.sport} · {a.gender === "M" ? "Male" : "Female"}
            {a.age !== null ? ` · ${a.age} yrs` : ""}
          </>
        }
        actions={
          kitted ? <Badge tone="ok">Kit issued {fmtDate(a.kit.kittingUpdatedAt)}</Badge> : <Badge tone="muted">Kit not recorded</Badge>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Profile" className="lg:col-span-1">
          <dl className="divide-y divide-slate-100">
            <Row label="Athlete id">{a.id}</Row>
            <Row label="Sport">{a.sport}</Row>
            <Row label="Gender">{a.gender === "M" ? "Male" : "Female"}</Row>
            {pii ? (
              <>
                <Row label="Date of birth">{a.dob ? fmtDate(a.dob) : <span className="text-slate-500">not recorded / invalid</span>}</Row>
                <Row label="Father">{a.fatherName ?? <span className="text-slate-500">not recorded</span>}</Row>
                <Row label="Mother">{a.motherName ?? <span className="text-slate-500">not recorded</span>}</Row>
              </>
            ) : (
              <Row label="Personal details">
                <span className="text-slate-500">hidden for your role</span>
              </Row>
            )}
          </dl>
        </Card>

        <Card title="Kit & shoe sizes" className="lg:col-span-2">
          {a.canEdit ? (
            <KitEditor athleteId={a.id} initial={a.kit} kitted={kitted} />
          ) : (
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {(
                [
                  ["Shoe", a.kit.shoeSize],
                  ["T-shirt", a.kit.tshirtSize],
                  ["Blazer", a.kit.blazerSize],
                  ["Pant", a.kit.pantSize],
                ] as const
              ).map(([l, v]) => (
                <div key={l}>
                  <dt className="text-xs text-slate-500">{l}</dt>
                  <dd className="text-lg font-semibold">{v ?? "—"}</dd>
                </div>
              ))}
            </dl>
          )}
          {a.kit.editedAt ? <p className="mt-3 text-xs text-slate-500">Last edited in RCMS {fmtDateTime(a.kit.editedAt)}</p> : null}
        </Card>
      </div>

      <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-800">Centre enrolments</h2>
      {a.enrollments.length === 0 ? (
        <p className="text-sm text-slate-600">Not enrolled in any centre.</p>
      ) : (
        <Table caption="Centre enrolments">
          <thead>
            <tr>
              <Th>Centre</Th>
              <Th>Type</Th>
              <Th>State</Th>
              <Th>Status</Th>
              <Th>Residential</Th>
              <Th>Joined</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {a.enrollments.map((e) => (
              <tr key={e.academyId}>
                <Td>
                  <Link href={`/academies/${e.academyId}`} className="text-brand-700 hover:underline">
                    {e.academyName}
                  </Link>
                </Td>
                <Td>{e.centreType ?? "—"}</Td>
                <Td>{e.stateName ?? "—"}</Td>
                <Td>{e.academyActive ? <Badge tone="ok">Active</Badge> : <Badge tone="warning">Inactive</Badge>}</Td>
                <Td>{e.athleteType === "RESIDENTIAL" ? "Residential" : e.athleteType === "NON_RESIDENTIAL" ? "Non-residential" : "—"}</Td>
                <Td>{fmtDate(e.joinedOn)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-800">Data-quality findings</h2>
      {a.issues.length === 0 ? (
        <p className="text-sm text-emerald-700">No findings – this record passes all checks.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
          {a.issues.map((i) => (
            <li key={`${i.rule}:${i.ref}`} className="flex items-start gap-3 px-4 py-3 text-sm">
              <SeverityBadge severity={i.severity} />
              <div>
                <p className="font-medium text-slate-900">{i.title}</p>
                <p className="text-slate-600">{i.message}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
