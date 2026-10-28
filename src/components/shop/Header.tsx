"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { dict, href, pick, switchHref, type Lang } from "@/i18n";
import { track } from "@/lib/client/track";
import { pixelContact } from "@/lib/client/pixels";
import { formatTND } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { Logo } from "./Logo";
import { IconCart, IconChevron, IconClose, IconMenu, IconPhone, IconSearch } from "./Icons";
import { cartCount, useCart } from "@/lib/client/cart";

type Cat = { slug: string; name: string; nameAr: string | null };

/**
 * A white header like the product page: the logo, one wide rounded search
 * box, the language and the basket with its count, and the categories as
 * light chips underneath. Every product can still be ordered on its own page
 * without the basket.
 */
export function Header({ lang, categories, announcement, phone }: { lang: Lang; categories: Cat[]; announcement: string[]; phone: string | null }) {
  const t = dict(lang);
  const pathname = usePathname();
  // The menu remembers the page it was opened on: navigating closes it.
  const [menuOn, setMenuOn] = useState<string | null>(null);
  const menu = menuOn === pathname;
  const onProduct = pathname.includes("/produit/");
  // A page prerendered at build time carries the internal "/ar" prefix; the browser's address does not.
  const bare = pathname.replace(/^\/(ar|fr)(?=\/|$)/, "") || "/";
  // The home page shows the categories with their pictures right under the header.
  const onHome = bare === "/";
  const shopOn = pathname.endsWith("/boutique");
  // On a product page on a phone, search is an icon until tapped (closes again on the next page).
  const [searchAt, setSearchAt] = useState<string | null>(null);
  const compact = onProduct && searchAt !== pathname;
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
      {/* Two facts from the settings, quietly: how one pays, and what delivery costs. */}
      <div className="border-b border-line bg-sand text-[15px] text-ink-2">
        <p className="mx-auto flex min-h-9 max-w-6xl flex-wrap items-center justify-center gap-x-2 px-4 py-1.5 text-center">
          {announcement.map((a, i) => (
            <Fragment key={a}>
              {i > 0 && <span aria-hidden className="text-muted">·</span>}
              <span>{a}</span>
            </Fragment>
          ))}
        </p>
      </div>
      {/* Stays at the top from tablet width; on a phone it scrolls away and leaves the screen to the page.
          On a product page on a phone, search becomes an icon and the category strip goes, so the
          picture, the name, the price and the stock fit on the first screen. */}
      <header className="z-30 border-b border-line bg-white text-ink md:sticky md:top-0">
        {/* Tight on a phone: menu, logo, search, language and basket fit on one line from 360 px. */}
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-2 px-3 pb-3 pt-2 sm:gap-x-3 sm:px-4">
          <button ref={openBtn} type="button" onClick={() => setMenu(true)} className="-ms-1.5 flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-sand" aria-label={t.nav.menu}>
            <IconMenu className="h-6 w-6" />
          </button>
          <Link href={href(lang, "/")} className="flex items-center rounded-lg px-0.5 py-1" aria-label="Mena">
            <Logo />
          </Link>
          <div className={`order-last w-full md:order-none md:ms-4 md:w-auto md:flex-1 ${compact ? "max-md:hidden" : ""}`}>
            {/* The box follows the URL's search (Back, Forward); while the page loads it is the same box, empty. */}
            <Suspense fallback={<SearchBox lang={lang} urlQ="" />}>
              <SearchFromUrl lang={lang} />
            </Suspense>
          </div>
          <div className="ms-auto flex items-center gap-0.5 md:ms-0 md:gap-1">
            {compact && (
              <button
                type="button"
                onClick={() => {
                  // Shown and focused in the same tap, which is what opens the phone's keyboard.
                  flushSync(() => setSearchAt(pathname));
                  document.querySelector<HTMLInputElement>("header input[name=q]")?.focus();
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-sand md:hidden"
                aria-label={t.nav.search}
              >
                <IconSearch className="h-6 w-6" />
              </button>
            )}
            {phone && (
              <a
                href={`tel:+216${phone}`}
                onClick={() => {
                  track("phone_clicked", { props: { where: "header" } });
                  pixelContact();
                }}
                className="hidden flex-col items-end rounded-2xl px-3 py-1 leading-tight hover:bg-sand lg:flex"
              >
                <span className="text-[14px] text-muted">{t.trust.support}</span>
                <span className="text-[16px] font-bold text-ink ltr-nums">{formatPhone(phone)}</span>
              </a>
            )}
            <LangLink lang={lang} pathname={pathname} className="flex h-11 items-center rounded-full border border-line gap-2 px-4 text-[16px] font-bold text-ink hover:border-field">
              <Flag of={lang === "ar" ? "fr" : "tn"} />
              {t.nav.language}
            </LangLink>
            <CartLink lang={lang} />
          </div>
        </div>
        {categories.length > 0 && (
          // The menu keeps the categories when the strip gives way on a product page.
          <nav className={`relative ${onProduct || onHome ? "max-md:hidden" : ""}`} aria-label={t.nav.categories}>
            <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-3 pb-3 pt-0.5 no-scrollbar sm:px-4">
              <Link
                href={href(lang, "/boutique")}
                className={`flex h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-[16px] ${shopOn ? "border-ink bg-ink font-bold text-white" : "border-line text-ink hover:border-field"}`}
                aria-current={shopOn ? "page" : undefined}
              >
                {t.nav.shop}
              </Link>
              {categories.map((c) => {
                const active = pathname.endsWith(`/categorie/${c.slug}`);
                return (
                  <Link
                    key={c.slug}
                    href={href(lang, `/categorie/${c.slug}`)}
                    className={`flex h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-[16px] ${active ? "border-ink bg-ink font-bold text-white" : "border-line text-ink hover:border-field"}`}
                    aria-current={active ? "page" : undefined}
                  >
                    {pick(lang, c.name, c.nameAr)}
                  </Link>
                );
              })}
            </div>
            {/* A fade at the end says the strip scrolls. */}
            <span aria-hidden className="pointer-events-none absolute inset-y-0 end-0 w-10 bg-gradient-to-l from-white to-transparent rtl:bg-gradient-to-r md:hidden" />
          </nav>
        )}
      </header>

      {menu && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t.nav.menu}>
          <button type="button" className="absolute inset-0 animate-fade bg-ink/40" onClick={() => setMenu(false)} aria-label={t.nav.close} tabIndex={-1} />
          <div className="absolute inset-y-0 start-0 flex w-[86%] max-w-sm animate-sheet-side flex-col overflow-y-auto bg-white shadow-lift [--sheet-from:-100%] rtl:[--sheet-from:100%]">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <Logo />
              <button ref={closeBtn} type="button" onClick={() => setMenu(false)} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-sand" aria-label={t.nav.close}>
                <IconClose className="h-6 w-6" />
              </button>
            </div>
            <nav className="flex flex-col px-2 py-3">
              <MenuLink href={href(lang, "/")}>{t.nav.home}</MenuLink>
              <MenuLink href={href(lang, "/panier")}>{t.cart.title}</MenuLink>
              <MenuLink href={href(lang, "/boutique")}>{t.nav.shop}</MenuLink>
              <p className="px-3 pb-1 pt-4 text-[15px] font-bold text-muted">{t.nav.categories}</p>
              {categories.map((c) => (
                <MenuLink key={c.slug} href={href(lang, `/categorie/${c.slug}`)}>
                  {pick(lang, c.name, c.nameAr)}
                </MenuLink>
              ))}
              <div className="my-3 border-t border-line" />
              <MenuLink href={href(lang, "/suivi")}>{t.nav.track}</MenuLink>
              <MenuLink href={href(lang, "/livraison-retours")}>{t.footer.deliveryReturns}</MenuLink>
              <MenuLink href={href(lang, "/contact")}>{t.footer.contact}</MenuLink>
              <LangLink lang={lang} pathname={pathname} className="flex min-h-12 items-center gap-2.5 rounded-xl px-3 text-[17px] text-ink hover:bg-sand">
                <Flag of={lang === "ar" ? "fr" : "tn"} />
                {t.nav.language}
              </LangLink>
              {phone && (
                <a
                  href={`tel:+216${phone}`}
                  onClick={() => {
                    track("phone_clicked", { props: { where: "menu" } });
                    pixelContact();
                  }}
                  className="mx-3 mt-4 flex min-h-12 items-center justify-center gap-2 rounded-full border border-field text-[17px] font-bold text-ink"
                >
                  <IconPhone className="h-5 w-5" />
                  <span className="ltr-nums">{formatPhone(phone)}</span>
                </a>
              )}
            </nav>
          </div>
        </div>
      )}
    </>
  );
}

/** The same page in the other language, keeping what was searched and the sort (the session keeps the ad's utm_*). */
function LangLink({ lang, pathname, className, children }: { lang: Lang; pathname: string; className: string; children: React.ReactNode }) {
  const plain = (
    <Link href={switchHref(lang, pathname)} className={className} hrefLang={lang === "fr" ? "ar" : "fr"} prefetch={false}>
      {children}
    </Link>
  );
  return (
    <Suspense fallback={plain}>
      <LangLinkWithQuery lang={lang} pathname={pathname} className={className}>
        {children}
      </LangLinkWithQuery>
    </Suspense>
  );
}

function LangLinkWithQuery({ lang, pathname, className, children }: { lang: Lang; pathname: string; className: string; children: React.ReactNode }) {
  const params = useSearchParams();
  const keep = new URLSearchParams();
  for (const k of ["q", "tri"]) {
    const v = params.get(k);
    if (v) keep.set(k, v);
  }
  const qs = keep.toString();
  return (
    <Link href={`${switchHref(lang, pathname)}${qs ? `?${qs}` : ""}`} className={className} hrefLang={lang === "fr" ? "ar" : "fr"} prefetch={false}>
      {children}
    </Link>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex min-h-12 items-center rounded-xl px-3 text-[17px] text-ink hover:bg-sand">
      {children}
    </Link>
  );
}

/** The basket, Amazon's way: the count inside the cart, and the word beside it when there is room. */
function CartLink({ lang }: { lang: Lang }) {
  const t = dict(lang);
  const n = cartCount(useCart());
  return (
    <Link href={href(lang, "/panier")} className="relative flex h-11 items-center gap-1 rounded-full px-1.5 text-ink hover:bg-sand md:pe-3" aria-label={t.cart.open(n)} prefetch={false} data-testid="cart-link">
      {/* The cart is drawn the same way in both languages, so the count sits over its basket on the left. */}
      <span className="relative" dir="ltr">
        <IconCart className="h-7 w-7" />
        {n > 0 && (
          <span className="absolute -top-2 left-[8px] flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-buy px-1 text-[14px] font-bold leading-none text-night" aria-hidden data-testid="cart-count">
            {n}
          </span>
        )}
      </span>
      <span className="hidden text-[16px] font-bold md:inline">{t.nav.cart}</span>
    </Link>
  );
}

type Suggestion = { completions: string[]; products: { slug: string; name: string; nameAr: string | null; price: number; imageId: string | null }[]; categories: Cat[] };

function SearchFromUrl({ lang }: { lang: Lang }) {
  const pathname = usePathname();
  const params = useSearchParams();
  return <SearchBox lang={lang} urlQ={pathname.endsWith("/recherche") ? (params.get("q") ?? "") : ""} />;
}

/** "lampe de chevet" after "lam": the typed part as typed, the rest in bold, as Google shows it. */
function Completion({ text, typed }: { text: string; typed: string }) {
  const n = typed.trim().length;
  const starts = text.slice(0, n).toLocaleLowerCase() === typed.trim().toLocaleLowerCase();
  return starts ? (
    <span>
      {text.slice(0, n)}
      <strong>{text.slice(n)}</strong>
    </span>
  ) : (
    <strong>{text}</strong>
  );
}

/**
 * One wide search box. From two letters: what it may be completing (found
 * even with a typing mistake), the products with their picture and price,
 * the categories. Arrows and Enter work as in any search engine.
 */
function SearchBox({ lang, urlQ }: { lang: Lang; urlQ: string }) {
  const t = dict(lang);
  const router = useRouter();
  // On the results page the box shows what was searched; typing takes over until the search changes.
  const [typed, setTyped] = useState<{ at: string; q: string } | null>(null);
  const q = typed?.at === urlQ ? typed.q : urlQ;
  const setQ = (v: string) => setTyped({ at: urlQ, q: v });
  const [s, setS] = useState<Suggestion | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLDivElement>(null);
  const term = q.trim();
  // Suggestions only for a real term; while the next answer is on its way, the last one stays.
  const shown = open && term.length >= 2 ? s : null;

  useEffect(() => {
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const id = setTimeout(() => {
      fetch(`/api/suggest?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setS(d))
        .catch(() => {});
    }, 150);
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

  // Every line of the list, in order, with where it leads.
  const items = shown
    ? [
        ...shown.completions.map((c) => ({ key: `q:${c}`, to: href(lang, `/recherche?q=${encodeURIComponent(c)}`), kind: "completion" as const, c })),
        ...shown.categories.map((c) => ({ key: `c:${c.slug}`, to: href(lang, `/categorie/${c.slug}`), kind: "category" as const, cat: c })),
        ...shown.products.map((p) => ({ key: `p:${p.slug}`, to: href(lang, `/produit/${p.slug}`), kind: "product" as const, p })),
      ]
    : [];
  const go = (i: number) => {
    const it = items[i];
    if (!it) return;
    setOpen(false);
    track("search_suggestion_clicked", { props: { q: term, kind: it.kind } });
    if (it.kind === "completion") setQ(it.c);
    router.push(it.to);
  };

  return (
    <div ref={box} className="relative">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (active >= 0 && items[active]) return go(active);
          setOpen(false);
          if (term) router.push(href(lang, `/recherche?q=${encodeURIComponent(term)}`));
        }}
        className="flex h-[52px] items-center rounded-full border border-field bg-white pe-1 focus-within:border-sea focus-within:ring-2 focus-within:ring-sea/20"
      >
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!items.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % items.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
            } else if (e.key === "Escape") setOpen(false);
          }}
          placeholder={t.nav.searchPlaceholder}
          className="h-full min-w-0 flex-1 bg-transparent pe-2 ps-5 text-[17px] text-ink outline-none placeholder:text-placeholder"
          enterKeyHint="search"
          name="q"
          autoComplete="off"
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls="search-list"
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 && items[active] ? `sg-${active}` : undefined}
          aria-label={t.nav.search}
        />
        <button type="submit" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white hover:bg-ink-2" aria-label={t.nav.search}>
          <IconSearch className="h-5 w-5" />
        </button>
      </form>
      {items.length > 0 && (
        <ul id="search-list" role="listbox" aria-label={t.search.suggestions} className="absolute inset-x-0 top-full z-40 mt-1 max-h-[70vh] overflow-y-auto rounded-2xl border border-line bg-white p-1.5 text-ink shadow-lift" data-testid="suggestions">
          {items.map((it, i) => (
            <li key={it.key} id={`sg-${i}`} role="option" aria-selected={i === active}>
              <Link
                href={it.to}
                onClick={(e) => {
                  e.preventDefault();
                  go(i);
                }}
                onPointerEnter={() => setActive(i)}
                tabIndex={-1}
                className={`flex min-h-12 items-center gap-3 rounded-lg px-2.5 py-1.5 ${i === active ? "bg-sand" : ""} ${it.kind === "product" && items[i - 1]?.kind !== "product" ? "mt-1 border-t border-line pt-2.5" : ""}`}
              >
                {it.kind === "completion" ? (
                  <>
                    <IconSearch className="h-5 w-5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate text-[17px]" dir="auto">
                      <Completion text={it.c} typed={term} />
                    </span>
                  </>
                ) : it.kind === "category" ? (
                  <>
                    <IconChevron className="h-5 w-5 shrink-0 text-sea" />
                    <span className="flex-1 text-[16px] font-bold text-sea-2">{pick(lang, it.cat.name, it.cat.nameAr)}</span>
                  </>
                ) : (
                  <>
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-sand">
                      {it.p.imageId && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/img/${it.p.imageId}/96`} alt="" className="h-full w-full object-cover" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 text-[16px] leading-snug text-ink">{pick(lang, it.p.name, it.p.nameAr)}</span>
                    <span className="shrink-0 text-[16px] font-bold price-nums ltr-nums">{formatTND(it.p.price, lang)}</span>
                  </>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The flag of the language the link leads to: France for French, Tunisia
 * for Arabic. Drawn here, not an emoji: Windows shows emoji flags as letters.
 */
function Flag({ of }: { of: "fr" | "tn" }) {
  return (
    <svg viewBox="0 0 30 20" className="h-[15px] w-[22px] shrink-0 overflow-hidden rounded-[3px] shadow-[0_0_0_1px_rgb(0_0_0/.15)]" aria-hidden>
      {of === "fr" ? (
        <>
          <rect width="10" height="20" fill="#002654" />
          <rect x="10" width="10" height="20" fill="#fff" />
          <rect x="20" width="10" height="20" fill="#ce1126" />
        </>
      ) : (
        <>
          <rect width="30" height="20" fill="#e70013" />
          <circle cx="15" cy="10" r="5" fill="#fff" />
          <circle cx="15.6" cy="10" r="3.75" fill="#e70013" />
          <circle cx="16.6" cy="10" r="3" fill="#fff" />
          <polygon fill="#e70013" points="15.3,10 18.4,9 16.5,11.7 16.5,8.3 18.4,11" />
        </>
      )}
    </svg>
  );
}
