import type { ReactNode } from "react";
import { STATE_OPTIONS } from "@/domain/states";
import type { Lookups } from "@/server/services/lookups";
import { buttonPrimary, buttonSecondary, Field, Select, TextInput } from "./ui";
import Link from "next/link";

/** GET form → URL query string; works without JavaScript and keeps pages shareable. */
export function AthleteFilterForm({
  action,
  values,
  lookups,
  showSearch = true,
  extra,
  resetHref,
}: {
  action: string;
  values: Record<string, string>;
  lookups: Lookups;
  showSearch?: boolean;
  extra?: ReactNode;
  resetHref: string;
}) {
  return (
    <form action={action} method="get" className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {showSearch ? (
          <Field label="Search name, KIT id or athlete id" htmlFor="f-q">
            <TextInput id="f-q" name="q" value={values.q} placeholder="e.g. Sharma or ARAA080F04" />
          </Field>
        ) : null}
        <Field label="Sport" htmlFor="f-sport">
          <Select
            id="f-sport"
            name="sportId"
            value={values.sportId}
            options={lookups.sports.map((s) => ({ value: s.id, label: s.name }))}
          />
        </Field>
        <Field label="Centre type" htmlFor="f-ct">
          <Select
            id="f-ct"
            name="centreTypeId"
            value={values.centreTypeId}
            options={lookups.centreTypes.map((c) => ({ value: c.id, label: c.label }))}
          />
        </Field>
        <Field label="State (inferred from centre code)" htmlFor="f-state">
          <Select
            id="f-state"
            name="stateCode"
            value={values.stateCode}
            options={STATE_OPTIONS.map((s) => ({ value: s.code, label: s.name }))}
          />
        </Field>
        <Field label="Gender" htmlFor="f-gender">
          <Select
            id="f-gender"
            name="gender"
            value={values.gender}
            options={[
              { value: "M", label: "Male" },
              { value: "F", label: "Female" },
            ]}
          />
        </Field>
        <Field label="Residential status" htmlFor="f-type">
          <Select
            id="f-type"
            name="athleteType"
            value={values.athleteType}
            options={[
              { value: "RESIDENTIAL", label: "Residential" },
              { value: "NON_RESIDENTIAL", label: "Non-residential" },
            ]}
          />
        </Field>
        {extra}
      </div>
      {values.academyId ? <input type="hidden" name="academyId" value={values.academyId} /> : null}
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="activeOnly"
            value="1"
            defaultChecked={values.activeOnly === "1"}
            className="size-4 rounded border-slate-300"
          />
          Active centres only
        </label>
        {showSearch ? (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              name="hasIssues"
              value="1"
              defaultChecked={values.hasIssues === "1"}
              className="size-4 rounded border-slate-300"
            />
            Has data-quality issues
          </label>
        ) : null}
        <div className="ml-auto flex gap-2">
          <Link href={resetHref} className={buttonSecondary}>
            Reset
          </Link>
          <button type="submit" className={buttonPrimary}>
            Apply filters
          </button>
        </div>
      </div>
    </form>
  );
}
