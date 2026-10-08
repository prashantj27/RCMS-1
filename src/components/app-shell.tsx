import Link from "next/link";
import type { ReactNode } from "react";
import { ROLE_LABELS } from "@/domain/permissions";
import { portalByRole } from "@/domain/prototype";
import type { SessionUser } from "@/server/auth/authenticate";
import { authMode } from "@/server/env";
import { LogoutButton } from "./logout-button";
import { NavLinks, type NavItem } from "./nav-links";

export function navFor(user: SessionUser): NavItem[] {
  const c = user.caps;
  const items: (NavItem | false)[] = [
    c.has("analytics:read") && { href: "/dashboard", label: "Dashboard" },
    c.has("athletes:read") && { href: "/athletes", label: "Athletes" },
    c.has("academies:read") && { href: "/academies", label: "Academies & centres" },
    c.has("kit:read") && { href: "/kit", label: "Kit & shoe planning" },
    c.has("dq:read") && { href: "/data-quality", label: "Data quality" },
    c.has("imports:read") && { href: "/imports", label: "Data imports" },
    c.has("users:manage") && { href: "/admin/users", label: "Users" },
  ];
  return items.filter((i): i is NavItem => i !== false);
}

const homeLink = "flex items-center gap-2 rounded-md border border-white/25 px-3 py-2 text-sm font-medium text-white hover:bg-white/10";

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const nav = navFor(user);
  const prototype = authMode() === "prototype";
  const portal = portalByRole(user.role);
  // Rendered twice (desktop sidebar + mobile menu), so test ids get a suffix.
  const renderSidebar = (suffix: string) => (
    <>
      <div className="px-3 pb-4">
        <p className="text-lg font-semibold tracking-tight text-white">RCMS</p>
        <p className="text-xs text-brand-200">Regional Centre Monitoring System</p>
      </div>
      {prototype ? (
        <Link href="/" className={`${homeLink} mx-3 mb-4`} data-testid={`home-button${suffix}`}>
          <span aria-hidden="true">⌂</span> Home · switch user type
        </Link>
      ) : null}
      <nav aria-label="Main">
        <NavLinks items={nav} />
      </nav>
      <div className="mt-auto space-y-3 px-3 pt-6">
        {prototype ? (
          <div className="text-xs text-brand-200" data-testid={`portal-label${suffix}`}>
            <p className="font-medium uppercase tracking-wide text-amber-200">Prototype · no sign-in</p>
            <p className="truncate font-medium text-white" title={user.name}>
              {portal.title} portal
            </p>
            {user.role === "CENTRE_USER" ? <p className="truncate">{user.name}</p> : null}
          </div>
        ) : (
          <>
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
          </>
        )}
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
      <aside className="hidden w-64 shrink-0 flex-col bg-brand-900 px-3 py-5 lg:sticky lg:top-0 lg:flex lg:h-screen">
        {renderSidebar("")}
      </aside>
      <header className="bg-brand-900 px-4 py-3 lg:hidden">
        <div className="flex items-center justify-between gap-3 text-white">
          <span className="text-lg font-semibold">RCMS</span>
          {prototype ? (
            <Link href="/" className="ml-auto rounded-md border border-white/30 px-3 py-1 text-sm" data-testid="home-button-bar">
              ⌂ Home
            </Link>
          ) : null}
        </div>
        <details className="group mt-3">
          <summary className="cursor-pointer list-none rounded-md border border-white/30 px-3 py-1.5 text-center text-sm text-white">
            Menu
          </summary>
          <div className="mt-4 flex flex-col pb-2">{renderSidebar("-mobile")}</div>
        </details>
      </header>
      <main id="main" className="min-w-0 flex-1">
        {prototype ? (
          <div
            role="status"
            data-testid="prototype-banner"
            className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-6 lg:px-8"
          >
            <span>
              <strong>Prototype</strong> – no sign-in. Viewing the <strong>{portal.title}</strong> portal
              {user.role === "CENTRE_USER" ? (
                <>
                  {" "}
                  for <strong>{user.name}</strong>
                </>
              ) : null}
              .
            </span>
            <Link href="/" className="font-medium underline">
              Switch user type
            </Link>
          </div>
        ) : null}
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
