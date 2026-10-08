import type { Metadata } from "next";
import { PORTALS, portalCan, showPersonalDetails } from "@/domain/prototype";

export const metadata: Metadata = { title: "Choose a portal" };
export const dynamic = "force-dynamic";

/**
 * The initial page: one button per user type. There is no sign-in anywhere in the app.
 */
export default function HomePage() {
  const showPii = showPersonalDetails();

  return (
    <main className="min-h-screen bg-brand-900 px-4 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <header className="text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-brand-200">Regional Centre Monitoring System</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">RCMS</h1>
          <p className="mx-auto mt-3 max-w-2xl text-brand-100">Choose the type of user to open that portal.</p>
          <p className="mx-auto mt-4 inline-block rounded-full bg-amber-400/15 px-4 py-1.5 text-sm text-amber-200 ring-1 ring-inset ring-amber-300/40">
            Prototype – no sign-in required
          </p>
        </header>

        <ul className="mt-10 grid gap-5 sm:grid-cols-2" aria-label="User types">
          {PORTALS.map((p) => (
            <li key={p.slug}>
              <a
                href={`/enter/${p.slug}`}
                data-portal={p.slug}
                className="group flex h-full flex-col rounded-2xl bg-white p-6 text-slate-900 shadow-lg ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-2"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="text-xl font-semibold">{p.title}</span>
                  <span className="rounded-full bg-brand-700 px-3 py-1 text-sm font-medium text-white group-hover:bg-brand-800">
                    {p.slug === "centre" ? "Choose centre →" : "Open portal →"}
                  </span>
                </span>
                <span className="mt-1 text-sm text-slate-500">{p.tagline}</span>
                <span className="mt-4 text-xs font-semibold uppercase tracking-wide text-emerald-700">Can</span>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {portalCan(p, showPii).map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <span className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Cannot</span>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">
                  {p.cannot.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </a>
            </li>
          ))}
        </ul>

        <p className="mx-auto mt-10 max-w-2xl text-center text-xs text-brand-200">
          Every portal works on the same live data and enforces that role&apos;s permissions. Edits made in the Administrator or Centre
          portal are real and are written to the audit log.
        </p>
      </div>
    </main>
  );
}
