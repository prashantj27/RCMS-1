import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth/current-user";
import { authMode } from "@/server/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (authMode() === "prototype") redirect("/"); // no sign-in in prototype mode
  if (await getSessionUser()) redirect("/dashboard");
  return (
    <main className="flex min-h-screen items-center justify-center bg-brand-900 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">RCMS</h1>
        <p className="mt-1 text-sm text-slate-600">Regional Centre Monitoring System</p>
        <LoginForm />
        <p className="mt-6 text-xs text-slate-500">Authorised users only. Activity is logged. This system holds personal data of minors.</p>
      </div>
    </main>
  );
}
