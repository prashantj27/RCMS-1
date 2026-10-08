"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonPrimary, inputClass } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      if (res.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Sign-in failed");
    } catch {
      setError("Network error – please try again");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
          Username or email
        </label>
        <input
          id="email"
          name="email"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </div>
      <div aria-live="polite" className="min-h-5">
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>
      <button type="submit" disabled={busy} className={`${buttonPrimary} w-full`}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
