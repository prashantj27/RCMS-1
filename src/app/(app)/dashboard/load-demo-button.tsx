"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonPrimary } from "@/components/ui";

export function LoadDemoButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-4">
      <button
        type="button"
        disabled={busy}
        className={buttonPrimary}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch("/api/demo-data", { method: "POST" });
            if (res.ok) {
              router.refresh();
              return;
            }
            const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
            setError(j?.error?.message ?? `Could not load demo data (HTTP ${res.status})`);
          } catch {
            setError("Network error – please try again");
          }
          setBusy(false);
        }}
      >
        {busy ? "Loading demo data… (about 10 seconds)" : "Load synthetic demo data"}
      </button>
      <p aria-live="polite" className="mt-2 text-sm text-red-700">
        {error}
      </p>
    </div>
  );
}
