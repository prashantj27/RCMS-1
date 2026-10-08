"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-slate-600">
        An unexpected error occurred.{" "}
        {error.digest ? (
          <>
            Reference: <code>{error.digest}</code>
          </>
        ) : null}
      </p>
      <button onClick={reset} className="rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white">
        Try again
      </button>
    </main>
  );
}
