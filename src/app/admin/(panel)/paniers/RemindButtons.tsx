"use client";

import { useTransition } from "react";
import { markReminded } from "./actions";
import { btn } from "@/components/admin/ui";

export function RemindButtons({ cartId, wa, text, sms }: { cartId: string; wa: string; text: string; sms: boolean }) {
  const [pending, start] = useTransition();
  return (
    <span className="flex gap-2">
      <a href={wa} target="_blank" rel="noopener" className={btn.wa} onClick={() => start(async () => void (await markReminded(cartId, false, text)))}>
        WhatsApp
      </a>
      {sms && (
        <button type="button" disabled={pending} className={btn.ghost} onClick={() => confirm("Envoyer le SMS de relance ?") && start(async () => void (await markReminded(cartId, true, text)))}>
          SMS
        </button>
      )}
    </span>
  );
}
