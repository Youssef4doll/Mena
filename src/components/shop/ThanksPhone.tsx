"use client";

import { useSyncExternalStore } from "react";
import { dict, type Lang } from "@/i18n";
import { store } from "@/lib/client/storage";
import { formatPhone, normalizePhone } from "@/lib/phone";

const noopSubscribe = () => () => {};

/**
 * "We will call you at 22 123 456": the number the customer just typed, read
 * from this browser (the order form saves it), never sent back by the server.
 * Shown only on the page of the order that saved it, so an older order's
 * page never shows a number that is not on that order.
 */
export function ThanksPhone({ lang, firstName, whatsapp, orderRef }: { lang: Lang; firstName: string; whatsapp: string | null; orderRef: string }) {
  const t = dict(lang);
  const raw = useSyncExternalStore(noopSubscribe, () => store.get("mena_details") ?? "", () => "");
  let phone: string | null = null;
  try {
    const d = JSON.parse(raw || "{}") as { name?: string; phone?: string; ref?: string };
    if (d.ref === orderRef && d.name?.trim().split(/\s+/)[0] === firstName) phone = normalizePhone(d.phone ?? "");
  } catch {}
  if (!phone) return <p className="text-[17px] text-ink">{t.thanks.callSoon}</p>;
  return (
    <div className="flex flex-col items-center">
      <p className="text-[17px] text-ink">
        {t.thanks.callingYou} <strong className="ltr-nums">{formatPhone(phone)}</strong>
      </p>
      {whatsapp && (
        <a href={`https://wa.me/216${whatsapp}?text=${encodeURIComponent(orderRef)}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center text-[15px] text-sea underline underline-offset-4">
          {t.thanks.notYours}
        </a>
      )}
    </div>
  );
}
