"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/shop/Logo";

export type NavItem = { href: string; label: string; badge?: number };

export function Shell({ nav, admin, logout, children }: { nav: NavItem[]; admin: string; logout: () => Promise<void>; children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const active = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname.startsWith(href));

  const links = (
    <nav className="flex flex-col gap-0.5">
      {nav.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm ${active(n.href) ? "bg-ink text-white" : "text-ink-2 hover:bg-sand"}`}
        >
          {n.label}
          {n.badge ? <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${active(n.href) ? "bg-white/20" : "bg-clay text-white"}`}>{n.badge}</span> : null}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-e border-line bg-cream p-4 lg:flex">
        <Link href="/admin" className="px-2 pt-1">
          <Logo />
        </Link>
        {links}
        <div className="mt-auto flex flex-col gap-2 px-2 text-xs text-muted">
          <Link href="/" target="_blank" className="underline">Voir la boutique</Link>
          <span>{admin}</span>
          <form action={logout}>
            <button className="underline">Se déconnecter</button>
          </form>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-cream/95 px-4 backdrop-blur lg:hidden">
          <button type="button" onClick={() => setOpen(true)} className="-ms-2 rounded-full p-2" aria-label="Menu">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" /></svg>
          </button>
          <Logo />
          <span className="ms-auto text-xs text-muted">admin</span>
        </header>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} aria-label="Fermer" />
            <div className="absolute inset-y-0 start-0 flex w-72 flex-col gap-6 overflow-y-auto bg-cream p-4">
              <Logo />
              {links}
              <form action={logout} className="mt-auto px-2 text-xs text-muted">
                <button className="underline">Se déconnecter</button>
              </form>
            </div>
          </div>
        )}
        <main className="mx-auto max-w-[1400px] px-4 py-5 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
