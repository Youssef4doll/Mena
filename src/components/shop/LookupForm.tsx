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
      <label className="flex flex-col gap-1.5 text-[16px] font-bold text-ink">
        {t.track.ref}
        <input value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} placeholder="MN-XXXXXX" className="h-14 rounded-xl border-2 border-field bg-white px-4 text-[18px] font-normal placeholder:text-placeholder uppercase tracking-wider outline-none focus:border-sea" dir="ltr" autoCapitalize="characters" required data-testid="lookup-ref" />
      </label>
      <label className="flex flex-col gap-1.5 text-[16px] font-bold text-ink">
        {t.track.phone}
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="22 123 456" className="h-14 rounded-xl border-2 border-field bg-white px-4 text-[18px] font-normal placeholder:text-placeholder outline-none focus:border-sea" dir="ltr" required data-testid="lookup-phone" />
      </label>
      {err && <p className="text-[16px] text-danger" role="alert">{err}</p>}
      <button type="submit" disabled={busy} className="min-h-14 rounded-2xl bg-navy text-[18px] font-bold text-white hover:bg-night disabled:opacity-60">
        {t.track.submit}
      </button>
    </form>
  );
}
