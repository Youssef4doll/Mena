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
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t.track.ref}
        <input value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} placeholder="MN-XXXXXX" className="h-12 rounded-xl border border-line bg-white px-3 uppercase tracking-wider outline-none focus:border-sea" dir="ltr" autoCapitalize="characters" required data-testid="lookup-ref" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t.track.phone}
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="22 123 456" className="h-12 rounded-xl border border-line bg-white px-3 outline-none focus:border-sea" dir="ltr" required data-testid="lookup-phone" />
      </label>
      {err && <p className="text-sm text-danger" role="alert">{err}</p>}
      <button type="submit" disabled={busy} className="h-12 rounded-full bg-ink font-medium text-white disabled:opacity-60">
        {t.track.submit}
      </button>
    </form>
  );
}
