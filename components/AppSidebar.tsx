"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/scanner", label: "Market scanner" },
  { href: "/earnings", label: "Earnings calendar" },
  { href: "/options", label: "Options opportunities" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/positions", label: "Open positions" },
  { href: "/history", label: "Trade history" },
  { href: "/rationale", label: "AI rationale" },
  { href: "/analytics", label: "Performance analytics" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/strategy-views", label: "Strategy views" },
  { href: "/strategy", label: "Strategy settings" },
  { href: "/notifications", label: "Notifications" },
  { href: "/settings", label: "Settings" },
];

export function AppSidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[#0a0f18]/90 p-4 backdrop-blur">
      <div className="mb-6">
        <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
          Earnings Pilot AI
        </Link>
        <p className="mt-1 text-[10px] uppercase tracking-widest text-[var(--muted)]">
          Paper desk
        </p>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 text-sm">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-md px-2 py-1.5 transition hover:bg-white/5 ${
              pathname === l.href ? "bg-[var(--accent-dim)] text-white" : "text-[var(--muted)]"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/" })}
        className="mt-4 rounded-md border border-[var(--border)] px-2 py-2 text-left text-xs text-[var(--muted)] hover:bg-white/5"
      >
        Sign out
      </button>
    </aside>
  );
}
