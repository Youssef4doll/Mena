"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { dict, href, pick, switchHref, type Lang } from "@/i18n";
import { track } from "@/lib/client/track";
import { pixelContact } from "@/lib/client/pixels";
import { formatTND } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { Logo } from "./Logo";
import { IconChevron, IconClose, IconMenu, IconSearch } from "./Icons";

type Cat = { slug: string; name: string; nameAr: string | null };

/**
 * Amazon's arrangement, in a calmer palette: the logo, one wide search box,
 * and a row of categories underneath. No basket — every product is ordered
 * from its own page.
 */
export function Header({ lang, categories, announcement, phone }: { lang: Lang; categories: Cat[]; announcement: string[]; phone: string | null }) {
  const t = dict(lang);
  const pathname = usePathname();
  // The menu remembers the page it was opened on: navigating closes it.
  const [menuOn, setMenuOn] = useState<string | null>(null);
  const menu = menuOn === pathname;
  const setMenu = (o: boolean) => setMenuOn(o ? pathname : null);
  const openBtn = useRef<HTMLButtonElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  // While the menu is open: Escape closes it, the page behind does not scroll, focus is inside.
  useEffect(() => {
    if (!menu) return;
    const opener = openBtn.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOn(null);
    };
    addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [menu]);

  return (
    <>
      <div className="border-b border-sea/10 bg-sea-soft text-[14px] text-ink">
        <div className="mx-auto flex min-h-9 max-w-6xl items-center justify-center gap-6 px-4 py-1.5 text-center">
          {announcement.map((a, i) => (
            <span key={a} className={i > 0 ? "max-md:hidden" : ""}>
              {a}
            </span>
          ))}
        </div>
      </div>
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
          <button ref={openBtn} type="button" onClick={() => setMenu(true)} className="-ms-2 flex h-11 w-11 items-center justify-center rounded-xl text-ink" aria-label={t.nav.menu}>
            <IconMenu className="h-6 w-6" />
          </button>
          <Link href={href(lang, "/")} className="flex items-center" aria-label="Mena">
            <Logo />
          </Link>
          <div className="order-last w-full md:order-none md:ms-4 md:w-auto md:flex-1">
            <SearchBox lang={lang} />
          </div>
          <div className="ms-auto flex items-center gap-1 md:ms-0">
            {phone && (
              <a
                href={`tel:+216${phone}`}
                onClick={() => {
                  track("phone_clicked", { props: { where: "header" } });
                  pixelContact();
                }}
                className="hidden flex-col items-end rounded-xl px-3 py-1 leading-tight lg:flex"
              >
                <span className="text-[13px] text-muted">{t.trust.support}</span>
                <span className="text-[16px] font-bold text-ink ltr-nums">{formatPhone(phone)}</span>
              </a>
            )}
            <Link href={switchHref(lang, pathname)} className="flex h-11 items-center rounded-xl px-3 text-[16px] font-bold text-sea" hrefLang={lang === "fr" ? "ar" : "fr"} prefetch={false}>
              {t.nav.language}
            </Link>
          </div>
        </div>
        {categories.length > 0 && (
          <nav className="border-t border-line bg-white" aria-label={t.nav.categories}>
            <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 no-scrollbar">
              <Link href={href(lang, "/boutique")} className="shrink-0 whitespace-nowrap rounded-lg px-3 py-2.5 text-[16px] font-bold text-ink hover:bg-sand">
                {t.nav.shop}
              </Link>
              {categories.map((c) => {
                const active = pathname.endsWith(`/categorie/${c.slug}`);
                return (
                  <Link
                    key={c.slug}
                    href={href(lang, `/categorie/${c.slug}`)}
                    className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2.5 text-[16px] ${active ? "bg-sea-soft font-bold text-sea-2" : "text-ink-2 hover:bg-sand"}`}
                  >
                    {pick(lang, c.name, c.nameAr)}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </header>

      {menu && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t.nav.menu}>
          <button type="button" className="absolute inset-0 animate-fade bg-ink/40" onClick={() => setMenu(false)} aria-label={t.nav.close} tabIndex={-1} />
          <div className="absolute inset-y-0 start-0 flex w-[86%] max-w-sm animate-sheet-side flex-col overflow-y-auto bg-white shadow-lift [--sheet-from:-100%] rtl:[--sheet-from:100%]">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <Logo />
              <button ref={closeBtn} type="button" onClick={() => setMenu(false)} className="flex h-11 w-11 items-center justify-center rounded-xl" aria-label={t.nav.close}>
                <IconClose className="h-6 w-6" />
              </button>
            </div>
            <nav className="flex flex-col px-2 py-3">
              <MenuLink href={href(lang, "/")}>{t.nav.home}</MenuLink>
              <MenuLink href={href(lang, "/boutique")}>{t.nav.shop}</MenuLink>
              <p className="px-3 pb-1 pt-4 text-[14px] font-bold text-muted">{t.nav.categories}</p>
              {categories.map((c) => (
                <MenuLink key={c.slug} href={href(lang, `/categorie/${c.slug}`)}>
                  {pick(lang, c.name, c.nameAr)}
                </MenuLink>
              ))}
              <div className="my-3 border-t border-line" />
              <MenuLink href={href(lang, "/suivi")}>{t.nav.track}</MenuLink>
              <MenuLink href={href(lang, "/livraison-retours")}>{t.footer.deliveryReturns}</MenuLink>
              <MenuLink href={href(lang, "/contact")}>{t.footer.contact}</MenuLink>
              {phone && (
                <a href={`tel:+216${phone}`} className="mx-3 mt-4 flex min-h-12 items-center justify-center rounded-xl bg-sea-soft text-[17px] font-bold text-sea-2 ltr-nums">
                  {formatPhone(phone)}
                </a>
              )}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex min-h-12 items-center justify-between rounded-xl px-3 text-[17px] text-ink hover:bg-sand">
      {children}
      <IconChevron className="h-5 w-5 text-muted" />
    </Link>
  );
}

type Suggestion = { products: { slug: string; name: string; nameAr: string | null; price: number; imageId: string | null }[]; categories: Cat[] };

/** One wide search box, with suggestions under it as soon as two letters are typed. */
function SearchBox({ lang }: { lang: Lang }) {
  const t = dict(lang);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [s, setS] = useState<Suggestion | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const term = q.trim();
  // Suggestions only for a real term; a stale answer for a shorter one is never shown.
  const shown = open && term.length >= 2 ? s : null;

  useEffect(() => {
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      fetch(`/api/suggest?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setS(d))
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [term]);

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    addEventListener("pointerdown", close);
    return () => removeEventListener("pointerdown", close);
  }, []);

  return (
    <div ref={box} className="relative">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setOpen(false);
          if (term) router.push(href(lang, `/recherche?q=${encodeURIComponent(term)}`));
        }}
        className="flex h-12 items-stretch overflow-hidden rounded-xl border-2 border-sea/40 bg-white focus-within:border-sea"
      >
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t.nav.searchPlaceholder}
          className="min-w-0 flex-1 bg-transparent px-4 text-[17px] text-ink outline-none placeholder:text-placeholder"
          enterKeyHint="search"
          name="q"
          autoComplete="off"
          aria-label={t.nav.search}
        />
        <button type="submit" className="flex w-14 items-center justify-center bg-sea text-white" aria-label={t.nav.search}>
          <IconSearch className="h-6 w-6" />
        </button>
      </form>
      {shown && (shown.products.length > 0 || shown.categories.length > 0) && (
        <div className="absolute inset-x-0 top-full z-40 mt-1 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-white p-2 shadow-lift">
          {shown.categories.map((c) => (
            <Link key={c.slug} href={href(lang, `/categorie/${c.slug}`)} onClick={() => { setOpen(false); track("search_suggestion_clicked", { props: { q: term, kind: "category" } }); }} className="flex min-h-11 items-center rounded-lg px-3 text-[16px] font-bold text-sea-2 hover:bg-sand">
              {pick(lang, c.name, c.nameAr)}
            </Link>
          ))}
          {shown.products.map((p) => (
            <Link
              key={p.slug}
              href={href(lang, `/produit/${p.slug}`)}
              onClick={() => {
                setOpen(false);
                track("search_suggestion_clicked", { props: { q: term, kind: "product" } });
              }}
              className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-sand"
            >
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-sand">
                {p.imageId && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/img/${p.imageId}/96`} alt="" className="h-full w-full object-cover" />
                )}
              </span>
              <span className="flex-1 text-[16px] text-ink">{pick(lang, p.name, p.nameAr)}</span>
              <span className="text-[16px] font-bold ltr-nums">{formatTND(p.price, lang)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
