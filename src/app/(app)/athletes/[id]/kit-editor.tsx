"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonPrimary, buttonSecondary, inputClass } from "@/components/ui";

interface Props {
  athleteId: number;
  initial: { shoeSize: number | null; blazerSize: string | null; tshirtSize: string | null; pantSize: string | null };
  kitted: boolean;
}

export function KitEditor({ athleteId, initial, kitted }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function send(body: Record<string, unknown>, okText: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/athletes/${athleteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setMsg({ tone: "ok", text: okText });
        router.refresh();
      } else {
        const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setMsg({ tone: "error", text: j?.error?.message ?? "Update failed" });
      }
    } catch {
      setMsg({ tone: "error", text: "Network error – please try again" });
    }
    setBusy(false);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const val = (k: string) => {
      const v = String(f.get(k) ?? "").trim();
      return v === "" ? null : v;
    };
    void send(
      { shoeSize: val("shoeSize"), blazerSize: val("blazerSize"), tshirtSize: val("tshirtSize"), pantSize: val("pantSize") },
      "Sizes saved",
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {(
          [
            ["shoeSize", "Shoe", initial.shoeSize],
            ["tshirtSize", "T-shirt", initial.tshirtSize],
            ["blazerSize", "Blazer", initial.blazerSize],
            ["pantSize", "Pant", initial.pantSize],
          ] as const
        ).map(([name, label, value]) => (
          <div key={name}>
            <label htmlFor={`k-${name}`} className="mb-1 block text-xs font-medium text-slate-600">
              {label}
            </label>
            <input id={`k-${name}`} name={name} defaultValue={value ?? ""} className={inputClass} autoComplete="off" maxLength={10} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={busy} className={buttonPrimary}>
          Save sizes
        </button>
        {kitted ? (
          <button
            type="button"
            disabled={busy}
            className={buttonSecondary}
            onClick={() => send({ clearKitted: true }, "Kit issue stamp cleared")}
          >
            Clear “kit issued”
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            className={buttonSecondary}
            onClick={() => send({ markKitted: true }, "Marked as kit issued")}
          >
            Mark kit issued today
          </button>
        )}
        <span aria-live="polite" className={`text-sm ${msg?.tone === "error" ? "text-red-700" : "text-emerald-700"}`}>
          {msg?.text}
        </span>
      </div>
      <p className="text-xs text-slate-500">
        Shoe 1–15 · T-shirt XXS–XXXXL · Blazer 20–60 or XS–XXXL · Pant 18–60 or XS–XXXL. Edits are recorded in the audit log and are
        protected from being overwritten by later bulk imports.
      </p>
    </form>
  );
}
