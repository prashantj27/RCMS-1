import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold">Access denied</h1>
      <p className="text-slate-600">Your role does not include this section.</p>
      <Link href="/" className="text-brand-700 underline">
        Back to start
      </Link>
    </main>
  );
}
