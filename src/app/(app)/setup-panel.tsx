"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonPrimary, buttonSecondary, Notice } from "@/components/ui";

/** Shown instead of the page while the database is not connected or not set up. */
export function SetupPanel({ problem, hint, canRun }: { problem: string; hint: string; canRun: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSetUp = problem === "migrations_missing";

  async function setUp() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/setup", { method: "POST" });
      if (res.ok) {
        router.refresh();
        return;
      }
      const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(j?.error?.message ?? `Setup failed (HTTP ${res.status})`);
    } catch {
      setError("Network error – please try again");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4" data-testid="setup-panel">
      <Notice tone="warning">
        <strong>The database is not ready.</strong> {hint}
      </Notice>
      {canSetUp && canRun ? (
        <button type="button" disabled={busy} className={buttonPrimary} onClick={setUp}>
          {busy ? "Setting up… (a few seconds)" : "Set up database"}
        </button>
      ) : canSetUp ? (
        <p className="text-sm text-slate-700">Open the Administrator portal (Home → Administrator) and press “Set up database”.</p>
      ) : (
        <button type="button" className={buttonSecondary} onClick={() => router.refresh()}>
          Check again
        </button>
      )}
      <p aria-live="polite" className="text-sm text-red-700">
        {error}
      </p>
      <p className="text-xs text-slate-500">
        Technical status:{" "}
        <a href="/api/health" className="underline">
          /api/health
        </a>
      </p>
    </div>
  );
}
