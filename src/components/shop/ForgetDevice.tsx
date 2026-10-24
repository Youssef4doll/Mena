"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { dict, type Lang } from "@/i18n";
import { store } from "@/lib/client/storage";
import { GOV_KEY } from "@/lib/client/quote";
import { forgetThisDevice } from "@/app/[lang]/suivi/actions";

const noopSubscribe = () => () => {};
/** What this browser keeps about the customer: the details typed (name, phone, address), the governorate, an unsent form. */
const KEYS = ["mena_details", "mena_draft", "mena_form_token", GOV_KEY];

/**
 * On a shared family phone, the next person should not find the address
 * and the orders of the last one: one link forgets them on this device.
 * Shown only when there is something to forget.
 */
export function ForgetDevice({ lang, hasOrders }: { lang: Lang; hasOrders: boolean }) {
  const t = dict(lang);
  const router = useRouter();
  const kept = useSyncExternalStore(noopSubscribe, () => KEYS.some((k) => store.get(k)), () => false);
  const [done, setDone] = useState(false);
  const [busy, start] = useTransition();
  if (done) return <p className="text-[15px] text-olive" role="status">{t.track.forgotten}</p>;
  if (!hasOrders && !kept) return null;
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() =>
        start(async () => {
          for (const k of KEYS) store.remove(k);
          await forgetThisDevice().catch(() => {});
          setDone(true);
          router.refresh();
        })
      }
      className="inline-flex min-h-11 items-center self-start text-[15px] text-ink-2 underline decoration-field underline-offset-4"
    >
      {t.track.forget}
    </button>
  );
}
