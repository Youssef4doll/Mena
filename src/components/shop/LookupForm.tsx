"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { dict, href, type Lang } from "@/i18n";

export function LookupForm({ lang }: { lang: Lang }) {
  const t = dict(lang);
  const router = useRouter();
  const [ref, setRef] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr(null);
        const res = await fetch("/api/orders/lookup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ref, phone }) }).catch(() => null);
        const data = res ? await res.json().catch(() => null) : null;
        setBusy(false);
        if (data?.ok) router.push(href(lang, `/suivi/${data.ref}`));
        else setErr(res?.status === 429 ? t.checkout.errors.rate_limited : t.track.notFound);
      }}
    >
      <label className="flex flex-col gap-1.5 ps-1 text-[16px] text-ink-2">
        {t.track.ref}
        <input value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} placeholder="MN-XXXXXX" className="h-[54px] -ms-1 rounded-full border border-field bg-white px-5 text-[17px] outline-none placeholder:text-placeholder focus:border-sea focus:ring-2 focus:ring-sea/20 uppercase tracking-wider text-ink" dir="ltr" autoCapitalize="characters" required data-testid="lookup-ref" />
      </label>
      <label className="flex flex-col gap-1.5 ps-1 text-[16px] text-ink-2">
        {t.track.phone}
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="22 123 456" className="h-[54px] -ms-1 rounded-full border border-field bg-white px-5 text-[17px] outline-none placeholder:text-placeholder focus:border-sea focus:ring-2 focus:ring-sea/20 text-ink" dir="ltr" required data-testid="lookup-phone" />
      </label>
      {err && <p className="text-[15px] font-bold text-danger" role="alert">{err}</p>}
      <button type="submit" disabled={busy} className="w-full inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-ink px-7 text-[17px] font-bold text-white hover:bg-ink-2 disabled:opacity-50">
        {t.track.submit}
      </button>
    </form>
  );
}
