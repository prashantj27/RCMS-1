import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-slate-600">The page or record you asked for does not exist, or you cannot access it.</p>
      <Link href="/" className="text-brand-700 underline">
        Back to start
      </Link>
    </main>
  );
}
