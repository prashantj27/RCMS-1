"use client";

import { useEffect } from "react";

export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">
      <h1 className="text-lg font-semibold">This page could not load</h1>
      <p className="mt-2 text-sm">
        On a brand-new deployment the most common cause is that the database is not connected or not set up yet. Open{" "}
        <a href="/api/health" className="font-medium underline">
          /api/health
        </a>{" "}
        – it shows which part is missing (database, migrations).{" "}
        {error.digest ? (
          <>
            Reference: <code>{error.digest}</code>.
          </>
        ) : null}
      </p>
      <button onClick={reset} className="mt-4 rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white">
        Try again
      </button>
    </div>
  );
}
