"use client";

import { useSyncExternalStore } from "react";
import { dict, type Lang } from "@/i18n";
import { store } from "@/lib/client/storage";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { ContactLink } from "./ContactLink";

const noopSubscribe = () => () => {};

/**
 * "We will call you at 22 123 456": the number the customer just typed, read
 * from this browser (the order form saves it), never sent back by the server.
 * Shown only on the page of the order that saved it, so an older order's
 * page never shows a number that is not on that order.
 */
export function ThanksPhone({ lang, firstName, whatsapp, orderRef, shopPhone }: { lang: Lang; firstName: string; whatsapp: string | null; orderRef: string; shopPhone?: string | null }) {
  const t = dict(lang);
  const raw = useSyncExternalStore(noopSubscribe, () => store.get("mena_details") ?? "", () => "");
  let phone: string | null = null;
  try {
    const d = JSON.parse(raw || "{}") as { name?: string; phone?: string; ref?: string };
    if (d.ref === orderRef && d.name?.trim().split(/\s+/)[0] === firstName) phone = normalizePhone(d.phone ?? "");
  } catch {}
  // The number the call comes from, when the shop gave one: an unknown number is often not answered.
  const from = shopPhone ? normalizePhone(shopPhone) : null;
  const fromLine = from ? <p className="text-[16px] text-ink-2">{t.thanks.callFrom(formatPhone(from))}</p> : null;
  if (!phone)
    return (
      <div className="flex flex-col items-center">
        <p className="text-[17px] text-ink">{t.thanks.callSoon}</p>
        {fromLine}
      </div>
    );
  return (
    <div className="flex flex-col items-center">
      <p className="text-[17px] text-ink">
        {t.thanks.callingYou} <strong className="ltr-nums">{formatPhone(phone)}</strong>
      </p>
      {fromLine}
      {whatsapp && (
        <ContactLink kind="whatsapp" where="thanks_wrong_number" href={`https://wa.me/216${whatsapp}?text=${encodeURIComponent(orderRef)}`} className="inline-flex min-h-11 items-center text-[15px] text-sea underline underline-offset-4">
          {t.thanks.notYours}
        </ContactLink>
      )}
    </div>
  );
}
