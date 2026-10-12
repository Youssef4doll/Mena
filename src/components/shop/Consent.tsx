"use client";

import Link from "next/link";
import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { dict, href, type Lang } from "@/i18n";
import { getConsent, onConsent, setConsent, type Consent as C } from "@/lib/client/consent";

const subscribeConsent = (cb: () => void) => onConsent(() => cb());
import { track } from "@/lib/client/track";
import { store } from "@/lib/client/storage";

type Ids = { metaPixelId: string; ga4Id: string; tiktokPixelId: string };

/**
 * The cookie choice, and the pixels that depend on it. Nothing from Meta,
 * TikTok or Google is loaded before "Accepter". First-party analytics (our
 * own /api/events, no cookie, no personal data) run either way.
 */
export function ConsentAndPixels({ lang, ids }: { lang: Lang; ids: Ids }) {
  const t = dict(lang);
  // The stored choice, read as an external store: "unknown" on the server and during hydration.
  const consent = useSyncExternalStore<C | "unknown">(subscribeConsent, getConsent, () => "unknown");
  const pathname = usePathname();
  const anyPixel = Boolean(ids.metaPixelId || ids.ga4Id || ids.tiktokPixelId);

  useEffect(() => {
    const ttclid = new URLSearchParams(location.search).get("ttclid");
    if (ttclid) store.set("mena_ttclid", ttclid);
  }, []);

  // Our own page view, every route change.
  useEffect(() => {
    track("page_view");
  }, [pathname]);

  // Pixels' page views after client-side navigations (the first is sent by their init snippet).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (consent !== "granted") return;
    const w = window as unknown as { fbq?: (...a: unknown[]) => void; ttq?: { page: () => void } };
    w.fbq?.("track", "PageView");
    w.ttq?.page();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      {consent === "granted" && ids.metaPixelId && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(ids.metaPixelId)});fbq('track','PageView');`}
        </Script>
      )}
      {consent === "granted" && ids.tiktokPixelId && (
        <Script id="tiktok-pixel" strategy="afterInteractive">
          {`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=d.createElement("script");o.type="text/javascript",o.async=!0,o.src=r+"?sdkid="+e+"&lib="+t;var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load(${JSON.stringify(ids.tiktokPixelId)});ttq.page();}(window,document,'ttq');`}
        </Script>
      )}
      {consent === "granted" && ids.ga4Id && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ids.ga4Id)}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config',${JSON.stringify(ids.ga4Id)});`}
          </Script>
        </>
      )}

      {anyPixel && consent === null && (
        <div className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-lg animate-sheet-up rounded-2xl border border-line bg-white p-4 shadow-lift" role="region" aria-label={t.footer.cookies}>
          <p className="text-[15px] leading-relaxed text-ink-2">
            {t.consent.text}{" "}
            <Link href={href(lang, "/confidentialite")} className="underline underline-offset-2">
              {t.footer.privacy}
            </Link>
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setConsent("denied")} className="h-10 flex-1 rounded-full border border-line text-sm font-medium">
              {t.consent.refuse}
            </button>
            <button type="button" onClick={() => setConsent("granted")} className="h-10 flex-1 rounded-full bg-sea text-sm font-medium text-white">
              {t.consent.accept}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
