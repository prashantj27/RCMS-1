import Link from "next/link";
import type { ReactNode } from "react";
import { fmt } from "@/lib/format";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({
  title,
  children,
  className = "",
  action,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {title ? (
        <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {action}
        </header>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: ReactNode; hint?: ReactNode; href?: string }) {
  const body = (
    <>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</dd>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </>
  );
  const cls = "block rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
  return href ? (
    <Link href={href} className={`${cls} transition hover:border-brand-300 hover:shadow`}>
      <dl>{body}</dl>
    </Link>
  ) : (
    <div className={cls}>
      <dl>{body}</dl>
    </div>
  );
}

const BADGE: Record<string, string> = {
  error: "bg-red-50 text-red-700 ring-red-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  info: "bg-slate-100 text-slate-700 ring-slate-200",
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  muted: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function Badge({ tone = "muted", children }: { tone?: keyof typeof BADGE | string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${BADGE[tone] ?? BADGE.muted}`}
    >
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  return <Badge tone={severity}>{severity}</Badge>;
}

export interface BarItem {
  label: string;
  count: number;
  href?: string;
  hint?: string;
}

/** Horizontal bars. Values are always printed, so colour is never the only signal. */
export function BarList({ items, emptyText = "No data", total }: { items: BarItem[]; emptyText?: string; total?: number }) {
  if (items.length === 0) return <p className="text-sm text-slate-500">{emptyText}</p>;
  const max = Math.max(...items.map((i) => i.count), 1);
  const sum = total ?? items.reduce((s, i) => s + i.count, 0);
  return (
    <ul className="space-y-2">
      {items.map((i) => {
        const label = (
          <span className="truncate" title={i.label}>
            {i.label}
          </span>
        );
        return (
          <li key={i.label} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              {i.href ? (
                <Link href={i.href} className="min-w-0 text-slate-800 hover:text-brand-700 hover:underline">
                  {label}
                </Link>
              ) : (
                <span className="min-w-0 text-slate-800">{label}</span>
              )}
              <span className="shrink-0 tabular-nums text-slate-600">
                {fmt(i.count)}
                {sum > 0 ? (
                  <span className="ml-1 text-xs text-slate-400">{((i.count / sum) * 100).toFixed(i.count / sum < 0.1 ? 1 : 0)}%</span>
                ) : null}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(2, (i.count / max) * 100)}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const p = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3" role="img" aria-label={`${label}: ${p}%`}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${p >= 90 ? "bg-emerald-500" : p >= 60 ? "bg-brand-500" : "bg-amber-500"}`}
          style={{ width: `${p}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-600">{p}%</span>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="font-medium text-slate-800">{title}</p>
      {children ? <div className="mt-1 text-sm text-slate-500">{children}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warning" | "error" | "ok"; children: ReactNode }) {
  const cls = {
    info: "border-brand-200 bg-brand-50 text-brand-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    error: "border-red-200 bg-red-50 text-red-900",
    ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>
      {children}
    </div>
  );
}

export function Table({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <caption className="sr-only">{caption}</caption>
        {children}
      </table>
    </div>
  );
}

export const Th = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <th
    scope="col"
    className={`whitespace-nowrap bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 ${className}`}
  >
    {children}
  </th>
);

export const Td = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <td className={`px-3 py-2 align-top text-slate-800 ${className}`}>{children}</td>
);

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  hrefFor,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  hrefFor: (p: number) => string;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const link = "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50";
  const off = "pointer-events-none rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-400";
  return (
    <nav aria-label="Pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-600">
        {fmt(from)}–{fmt(to)} of {fmt(total)}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={link} rel="prev">
            Previous
          </Link>
        ) : (
          <span className={off} aria-disabled="true">
            Previous
          </span>
        )}
        <span className="text-sm text-slate-600">
          Page {fmt(page)} of {fmt(pageCount)}
        </span>
        {page < pageCount ? (
          <Link href={hrefFor(page + 1)} className={link} rel="next">
            Next
          </Link>
        ) : (
          <span className={off} aria-disabled="true">
            Next
          </span>
        )}
      </div>
    </nav>
  );
}

// ── form controls (plain GET forms keep list pages fully server-rendered) ──

const field =
  "block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400";

export function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-slate-600">
        {label}
      </label>
      {children}
    </div>
  );
}

export function Select({
  id,
  name,
  value,
  options,
  placeholder = "All",
}: {
  id: string;
  name: string;
  value?: string;
  options: { value: string | number; label: string }[];
  placeholder?: string;
}) {
  return (
    <select id={id} name={name} defaultValue={value ?? ""} className={field}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TextInput({
  id,
  name,
  value,
  placeholder,
  type = "text",
}: {
  id: string;
  name: string;
  value?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input id={id} name={name} type={type} defaultValue={value ?? ""} placeholder={placeholder} className={field} autoComplete="off" />
  );
}

export const buttonPrimary =
  "inline-flex items-center justify-center rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50";
export const buttonSecondary =
  "inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50";
export const inputClass = field;
