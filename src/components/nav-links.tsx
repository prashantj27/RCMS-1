"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
}

export function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="space-y-1">
      {items.map((i) => {
        const active = pathname === i.href || pathname.startsWith(`${i.href}/`);
        return (
          <li key={i.href}>
            <Link
              href={i.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`block rounded-md px-3 py-2 text-sm font-medium ${active ? "bg-white/15 text-white" : "text-brand-100 hover:bg-white/10 hover:text-white"}`}
            >
              {i.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
