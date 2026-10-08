import type { ReactNode } from "react";
import { ROLE_LABELS } from "@/domain/permissions";
import type { SessionUser } from "@/server/auth/authenticate";
import { LogoutButton } from "./logout-button";
import { NavLinks, type NavItem } from "./nav-links";

export function navFor(user: SessionUser): NavItem[] {
  const c = user.caps;
  const items: (NavItem | false)[] = [
    c.has("analytics:read") && { href: "/", label: "Dashboard" },
    c.has("athletes:read") && { href: "/athletes", label: "Athletes" },
    c.has("academies:read") && { href: "/academies", label: "Academies & centres" },
    c.has("kit:read") && { href: "/kit", label: "Kit & shoe planning" },
    c.has("dq:read") && { href: "/data-quality", label: "Data quality" },
    c.has("imports:read") && { href: "/imports", label: "Data imports" },
    c.has("users:manage") && { href: "/admin/users", label: "Users" },
  ];
  return items.filter((i): i is NavItem => i !== false);
}

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const nav = navFor(user);
  const sidebar = (
    <>
      <div className="px-3 pb-4">
        <p className="text-lg font-semibold tracking-tight text-white">RCMS</p>
        <p className="text-xs text-brand-200">Regional Centre Monitoring System</p>
      </div>
      <nav aria-label="Main">
        <NavLinks items={nav} />
      </nav>
      <div className="mt-auto space-y-3 px-3 pt-6">
        <div className="text-xs text-brand-200">
          <p className="truncate font-medium text-white" title={user.name}>
            {user.name}
          </p>
          <p className="truncate" title={user.email}>
            {user.email}
          </p>
          <p>{ROLE_LABELS[user.role]}</p>
          {user.scope.academyIds !== null ? <p>{user.scope.academyIds.length} assigned centre(s)</p> : null}
        </div>
        <LogoutButton />
      </div>
    </>
  );
  return (
    <div className="min-h-screen lg:flex">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <aside className="hidden w-64 shrink-0 flex-col bg-brand-900 px-3 py-5 lg:sticky lg:top-0 lg:flex lg:h-screen">{sidebar}</aside>
      <header className="bg-brand-900 px-4 py-3 lg:hidden">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between text-white">
            <span className="text-lg font-semibold">RCMS</span>
            <span className="rounded-md border border-white/30 px-3 py-1 text-sm">Menu</span>
          </summary>
          <div className="mt-4 flex flex-col pb-2">{sidebar}</div>
        </details>
      </header>
      <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
