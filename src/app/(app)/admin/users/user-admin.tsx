"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonPrimary, buttonSecondary, inputClass, Notice } from "@/components/ui";

const ROLES = [
  { value: "ADMIN", label: "Administrator" },
  { value: "HQ_OFFICER", label: "HQ officer" },
  { value: "CENTRE_USER", label: "Centre user" },
  { value: "ANALYST", label: "Analyst" },
];

export function CreateUserForm() {
  const router = useRouter();
  const [role, setRole] = useState("ANALYST");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const academyIds = String(f.get("academyIds") ?? "")
      .split(/[\s,;]+/)
      .filter(Boolean)
      .map(Number);
    if (academyIds.some((n) => !Number.isInteger(n) || n <= 0))
      return setMsg({ tone: "error", text: "Academy ids must be positive whole numbers" });
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: f.get("email"), name: f.get("name"), role, password: f.get("password"), academyIds }),
    }).catch(() => null);
    if (res?.ok) {
      setMsg({ tone: "ok", text: "User created" });
      form.reset();
      setRole("ANALYST");
      router.refresh();
    } else {
      const j = (await res?.json().catch(() => null)) as { error?: { message?: string; details?: { message: string }[] } } | null;
      setMsg({ tone: "error", text: j?.error?.details?.[0]?.message ?? j?.error?.message ?? "Could not create user" });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor="u-name" className="mb-1 block text-xs font-medium text-slate-600">
          Name
        </label>
        <input id="u-name" name="name" required maxLength={120} className={inputClass} />
      </div>
      <div>
        <label htmlFor="u-email" className="mb-1 block text-xs font-medium text-slate-600">
          Username or email
        </label>
        <input
          id="u-email"
          name="email"
          type="text"
          required
          minLength={2}
          maxLength={200}
          className={inputClass}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
      </div>
      <div>
        <label htmlFor="u-role" className="mb-1 block text-xs font-medium text-slate-600">
          Role
        </label>
        <select id="u-role" value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="u-pw" className="mb-1 block text-xs font-medium text-slate-600">
          Initial password (min 12 characters)
        </label>
        <input
          id="u-pw"
          name="password"
          type="password"
          required
          minLength={12}
          maxLength={128}
          className={inputClass}
          autoComplete="new-password"
        />
      </div>
      {role === "CENTRE_USER" ? (
        <div className="sm:col-span-2">
          <label htmlFor="u-acad" className="mb-1 block text-xs font-medium text-slate-600">
            Assigned centre ids (comma separated – see the Centres list)
          </label>
          <input id="u-acad" name="academyIds" required placeholder="e.g. 3015, 3019" className={inputClass} />
        </div>
      ) : null}
      <div className="flex items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={busy} className={buttonPrimary}>
          Create user
        </button>
        <span aria-live="polite">
          {msg ? <span className={msg.tone === "ok" ? "text-sm text-emerald-700" : "text-sm text-red-700"}>{msg.text}</span> : null}
        </span>
      </div>
    </form>
  );
}

export function ToggleActive({ id, isActive, self }: { id: string; isActive: boolean; self: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (self) return <span className="text-xs text-slate-400">you</span>;
  return (
    <>
      <button
        type="button"
        disabled={busy}
        className={buttonSecondary}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          const res = await fetch(`/api/users/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isActive: !isActive }),
          }).catch(() => null);
          if (res?.ok) router.refresh();
          else setErr("Failed");
          setBusy(false);
        }}
      >
        {isActive ? "Deactivate" : "Reactivate"}
      </button>
      {err ? <Notice tone="error">{err}</Notice> : null}
    </>
  );
}
