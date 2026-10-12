"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { dict, href, pick, switchHref, type Lang } from "@/i18n";
import { useCart, cartCount } from "@/lib/client/cart-store";
import { track } from "@/lib/client/track";
import { formatTND } from "@/lib/money";
import { Logo } from "./Logo";
import { IconBag, IconChevron, IconClose, IconMenu, IconSearch } from "./Icons";

type Cat = { slug: string; name: string; nameAr: string | null };

export function Header({ lang, categories, announcement }: { lang: Lang; categories: Cat[]; announcement: string[] }) {
  const t = dict(lang);
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const lines = useCart((s) => s.lines);
  const setOpen = useCart((s) => s.setOpen);
  const [mounted, setMounted] = useState(false);
  const [bump, setBump] = useState(false);
  const count = mounted ? cartCount(lines) : 0;
  const prev = useRef(count);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (count > prev.current) {
      setBump(true);
      const id = setTimeout(() => setBump(false), 400);
      prev.current = count;
      return () => clearTimeout(id);
    }
    prev.current = count;
  }, [count]);
  useEffect(() => {
    setMenu(false);
    setSearch(false);
  }, [pathname]);

  return (
    <>
      <div className="bg-ink text-[12px] text-white/85">
        <div className="mx-auto flex h-8 max-w-6xl items-center justify-center gap-4 overflow-hidden px-4 no-scrollbar">
          {announcement.map((a, i) => (
            <span key={a} className={`whitespace-nowrap ${i > 0 ? "max-sm:hidden" : ""}`}>
              {a}
            </span>
          ))}
        </div>
      </div>
      <header className="sticky top-0 z-30 border-b border-line/70 bg-cream/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
          <button type="button" onClick={() => setMenu(true)} className="-ms-2 rounded-full p-2 text-ink lg:hidden" aria-label={t.nav.menu}>
            <IconMenu />
          </button>
          <Link href={href(lang, "/")} className="flex items-center" aria-label="Mena">
            <Logo />
          </Link>
          <nav className="ms-8 hidden items-center gap-6 text-sm text-ink-2 lg:flex">
            {categories.slice(0, 6).map((c) => (
              <Link key={c.slug} href={href(lang, `/categorie/${c.slug}`)} className="hover:text-sea">
                {pick(lang, c.name, c.nameAr)}
              </Link>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-1">
            <Link href={switchHref(lang, pathname)} className="rounded-full px-2.5 py-1.5 text-[13px] font-medium text-ink-2 hover:bg-sand" hrefLang={lang === "fr" ? "ar" : "fr"} prefetch={false}>
              {t.nav.language}
            </Link>
            <button type="button" onClick={() => setSearch(true)} className="rounded-full p-2 text-ink hover:bg-sand" aria-label={t.nav.search}>
              <IconSearch />
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(true);
                track("cart_viewed");
              }}
              className="relative -me-2 rounded-full p-2 text-ink hover:bg-sand"
              aria-label={`${t.nav.cart} (${count})`}
              data-testid="cart-button"
            >
              <IconBag className="h-[22px] w-[22px]" />
              {count > 0 && (
                <span className={`absolute end-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-sea px-1 text-[11px] font-semibold text-white ltr-nums ${bump ? "animate-pop" : ""}`}>
                  {count}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {menu && (
        <Sheet side="start" onClose={() => setMenu(false)} label={t.nav.menu}>
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <Logo />
            <button type="button" onClick={() => setMenu(false)} className="rounded-full p-2" aria-label={t.nav.close}>
              <IconClose />
            </button>
          </div>
          <nav className="flex flex-col px-2 py-3">
            <MenuLink href={href(lang, "/")}>{t.nav.home}</MenuLink>
            <MenuLink href={href(lang, "/boutique")}>{t.nav.shop}</MenuLink>
            <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{t.nav.categories}</p>
            {categories.map((c) => (
              <MenuLink key={c.slug} href={href(lang, `/categorie/${c.slug}`)}>
                {pick(lang, c.name, c.nameAr)}
              </MenuLink>
            ))}
            <div className="my-3 border-t border-line" />
            <MenuLink href={href(lang, "/suivi")}>{t.nav.track}</MenuLink>
            <MenuLink href={href(lang, "/livraison-retours")}>{t.footer.deliveryReturns}</MenuLink>
            <MenuLink href={href(lang, "/contact")}>{t.footer.contact}</MenuLink>
          </nav>
        </Sheet>
      )}

      {search && <SearchSheet lang={lang} onClose={() => setSearch(false)} />}
    </>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-xl px-3 py-3 text-[15px] text-ink hover:bg-sand">
      {children}
      <IconChevron className="h-4 w-4 text-muted" />
    </Link>
  );
}

export function Sheet({ side, onClose, label, children, wide = false }: { side: "start" | "end" | "bottom" | "top"; onClose: () => void; label: string; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  const pos =
    side === "start"
      ? "inset-y-0 start-0 w-[86%] max-w-sm animate-sheet-side [--sheet-from:-100%] rtl:[--sheet-from:100%]"
      : side === "end"
        ? `inset-y-0 end-0 w-full ${wide ? "max-w-md" : "max-w-sm"} animate-sheet-side [--sheet-from:100%] rtl:[--sheet-from:-100%]`
        : side === "top"
          ? "inset-x-0 top-0 animate-fade"
          : "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-3xl animate-sheet-up";
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={label}>
      <button type="button" className="absolute inset-0 animate-fade bg-ink/40" onClick={onClose} aria-label="×" tabIndex={-1} />
      <div className={`absolute flex flex-col overflow-y-auto bg-cream shadow-lift ${pos}`}>{children}</div>
    </div>
  );
}

type Suggestion = { products: { slug: string; name: string; nameAr: string | null; price: number; imageId: string | null }[]; categories: Cat[] };

function SearchSheet({ lang, onClose }: { lang: Lang; onClose: () => void }) {
  const t = dict(lang);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [s, setS] = useState<Suggestion | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setS(null);
      return;
    }
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      fetch(`/api/suggest?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setS(d))
        .catch(() => {});
    }, 160);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q]);

  return (
    <Sheet side="top" onClose={onClose} label={t.nav.search}>
      <form
        className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          const term = q.trim();
          if (term) router.push(href(lang, `/recherche?q=${encodeURIComponent(term)}`));
        }}
        role="search"
      >
        <div className="flex flex-1 items-center gap-2 rounded-full border border-line bg-white px-4">
          <IconSearch className="h-5 w-5 text-muted" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t.nav.searchPlaceholder}
            className="h-11 flex-1 bg-transparent outline-none placeholder:text-muted"
            enterKeyHint="search"
            name="q"
            autoComplete="off"
          />
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-2" aria-label={t.nav.close}>
          <IconClose />
        </button>
      </form>
      {s && (s.products.length > 0 || s.categories.length > 0) && (
        <div className="mx-auto w-full max-w-2xl px-4 pb-5">
          {s.categories.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {s.categories.map((c) => (
                <Link key={c.slug} href={href(lang, `/categorie/${c.slug}`)} className="rounded-full bg-sand px-3 py-1.5 text-sm" onClick={() => track("search_suggestion_clicked", { props: { q, kind: "category" } })}>
                  {pick(lang, c.name, c.nameAr)}
                </Link>
              ))}
            </div>
          )}
          <ul className="divide-y divide-line">
            {s.products.map((p) => (
              <li key={p.slug}>
                <Link
                  href={href(lang, `/produit/${p.slug}`)}
                  className="flex items-center gap-3 py-2.5"
                  onClick={() => track("search_suggestion_clicked", { props: { q, kind: "product" } })}
                >
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-sand">
                    {p.imageId && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/img/${p.imageId}/96`} alt="" className="h-full w-full object-cover" />
                    )}
                  </span>
                  <span className="flex-1 text-sm">{pick(lang, p.name, p.nameAr)}</span>
                  <span className="text-sm font-semibold ltr-nums">{formatTND(p.price, lang)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Sheet>
  );
}
