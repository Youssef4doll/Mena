"use client";

import { useState } from "react";
import { dict, type Lang } from "@/i18n";

export function ReviewForm({ lang, orderRef, itemId, productName, defaultName, autoFocus }: { lang: Lang; orderRef: string; itemId: string; productName: string; defaultName: string; autoFocus?: boolean }) {
  const t = dict(lang);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [name, setName] = useState(defaultName);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  if (state === "done") return <p className="text-sm text-olive">{productName} — {t.track.reviewThanks}</p>;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!rating) return;
        setState("busy");
        const res = await fetch(`/api/orders/${encodeURIComponent(orderRef)}/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId, rating, text, authorName: name }) }).catch(() => null);
        setState(res?.ok ? "done" : "error");
      }}
    >
      <p className="text-sm font-medium">{productName}</p>
      <div className="flex gap-1" role="radiogroup" aria-label="Note">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} onClick={() => setRating(n)} className="p-1" autoFocus={autoFocus && n === 5}>
            <svg width="30" height="30" viewBox="0 0 20 20" aria-hidden>
              <path fill={n <= rating ? "#c8902e" : "#e2d8c6"} d="M10 1.5l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L1.4 7.8l6-.7L10 1.5z" />
            </svg>
          </button>
        ))}
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={800} placeholder={t.track.reviewText} className="rounded-xl border border-line bg-white px-3 py-2.5 outline-none focus:border-sea" />
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={t.track.reviewName} aria-label={t.track.reviewName} className="h-11 rounded-xl border border-line bg-white px-3 outline-none focus:border-sea" />
      {state === "error" && <p className="text-sm text-danger">{t.checkout.errors.server}</p>}
      <button type="submit" disabled={!rating || state === "busy"} className="h-11 self-start rounded-full bg-ink px-5 text-sm font-medium text-white disabled:opacity-40">
        {t.track.reviewSend}
      </button>
    </form>
  );
}

export function ReturnForm({ lang, orderRef, days }: { lang: Lang; orderRef: string; days: number }) {
  const t = dict(lang);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(t.track.returnReasons[0]);
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  if (state === "done") return <p className="rounded-xl bg-sea-soft px-4 py-3 text-sm text-sea-2">{t.track.returnSent}</p>;
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-start text-sm text-muted underline underline-offset-2">
        {t.track.returnTitle} — {t.track.returnSub(days)}
      </button>
    );
  return (
    <form
      className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setState("busy");
        const res = await fetch(`/api/orders/${encodeURIComponent(orderRef)}/return`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason, details }) }).catch(() => null);
        setState(res?.ok ? "done" : "error");
      }}
    >
      <h2 className="text-lg font-semibold">{t.track.returnTitle}</h2>
      <p className="text-sm text-muted">{t.track.returnSub(days)}</p>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {t.track.returnReason}
        <select value={reason} onChange={(e) => setReason(e.target.value)} className="h-11 rounded-xl border border-line bg-white px-3">
          {t.track.returnReasons.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
      <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={600} placeholder={t.track.returnDetails} className="rounded-xl border border-line bg-white px-3 py-2.5" />
      {state === "error" && <p className="text-sm text-danger">{t.checkout.errors.server}</p>}
      <button type="submit" disabled={state === "busy"} className="h-11 self-start rounded-full bg-ink px-5 text-sm font-medium text-white">
        {t.track.returnSend}
      </button>
    </form>
  );
}
