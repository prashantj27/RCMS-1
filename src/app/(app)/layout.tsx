import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getPortalUser } from "@/server/auth/current-user";
import type { PortalUser } from "@/server/auth/user";
import { getSetupState } from "@/server/setup";
import { SetupPanel } from "./setup-panel";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // A page that cannot read the database would only show a generic error; say exactly what is missing instead.
  const setup = await getSetupState();
  let user: PortalUser | null = null;
  try {
    user = await getPortalUser(); // the centre portal looks its centre up in the database
  } catch (e) {
    if (setup.ready) throw e;
  }
  if (setup.ready) {
    if (!user) redirect("/");
    return <AppShell user={user}>{children}</AppShell>;
  }
  const panel = <SetupPanel problem={setup.problem} hint={setup.hint} canRun={Boolean(user?.caps.has("imports:run"))} />;
  return user ? (
    <AppShell user={user}>{panel}</AppShell>
  ) : (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      {panel}
      <Link href="/" className="text-sm underline">
        Home · switch user type
      </Link>
    </main>
  );
}
