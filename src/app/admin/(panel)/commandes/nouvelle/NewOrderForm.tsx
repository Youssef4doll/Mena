"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { fetchQuote } from "@/lib/client/quote";
import { formatTND } from "@/lib/money";
import { GOVERNORATES } from "@/lib/governorates";
import { Card, btn, input, label } from "@/components/admin/ui";
import { createAdminOrder } from "../actions";

type P = { id: string; name: string; price: number; variants: { id: string; name: string; price: number }[]; offers: { id: string; label: string; quantity: number; price: number }[] };

const CHANNELS = [
  ["whatsapp", "WhatsApp"],
  ["phone", "Téléphone"],
  ["messenger", "Messenger"],
  ["facebook", "Facebook (commentaire)"],
  ["instagram", "Instagram"],
  ["autre", "Autre"],
] as const;

export function NewOrderForm({ products }: { products: P[] }) {
  const router = useRouter();
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const p = products.find((x) => x.id === productId) ?? null;
  const [variantId, setVariantId] = useState("");
  const [offerId, setOfferId] = useState("");
  const [qty, setQty] = useState(1);
  const [f, setF] = useState({ name: "", phone: "", governorate: "", address: "", note: "", channel: "whatsapp" as (typeof CHANNELS)[number][0], locale: "ar" as "ar" | "fr", confirmed: true });
  const [total, setTotal] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // The total the server will charge, for these lines and this governorate: said to the customer before creating.
  const lines = p ? [{ productId: p.id, variantId: variantId || null, offerId: offerId || null, qty: offerId ? 1 : qty }] : [];
  const key = JSON.stringify([lines, f.governorate]);
  useEffect(() => {
    if (!p || (p.variants.length > 0 && !variantId)) return;
    const ctrl = new AbortController();
    fetchQuote({ lines, governorate: f.governorate || null }, ctrl.signal).then((q) => {
      if (ctrl.signal.aborted) return;
      setTotal(q && q.lines.length ? q.total : null);
      setProblem(q && q.problems.length ? "Ce choix n'est pas disponible (stock, option ou offre)." : null);
    });
    return () => ctrl.abort();
    // key holds lines and governorate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const needsVariant = Boolean(p && p.variants.length > 0 && !variantId);
  const ready = p && !needsVariant && total != null && !problem && f.governorate && f.name.trim().length >= 2 && f.address.trim().length >= 4 && f.phone.trim();

  function submit() {
    if (!p || total == null) return;
    setError(null);
    start(async () => {
      const r = await createAdminOrder({ productId: p.id, variantId: variantId || undefined, offerId: offerId || undefined, qty, ...f, expectedTotal: total });
      if (r.ok) router.push(`/admin/commandes/${r.id}`);
      else {
        setError(r.error);
        if (r.total != null) setTotal(r.total);
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Produit">
        <div className="grid gap-2">
          <label className={label}>
            Produit
            <select value={productId} onChange={(e) => { setProductId(e.target.value); setVariantId(""); setOfferId(""); setQty(1); }} className={input}>
              {products.map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
          </label>
          {p && p.variants.length > 0 && (
            <label className={label}>
              Option
              <select value={variantId} onChange={(e) => setVariantId(e.target.value)} className={input}>
                <option value="">Choisir…</option>
                {p.variants.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} · {formatTND(v.price)}</option>
                ))}
              </select>
            </label>
          )}
          {p && p.offers.length > 0 ? (
            <label className={label}>
              Offre
              <select value={offerId} onChange={(e) => setOfferId(e.target.value)} className={input}>
                <option value="">Choisir…</option>
                {p.offers.map((o) => (
                  <option key={o.id} value={o.id}>{o.label} · {formatTND(o.price)}</option>
                ))}
              </select>
            </label>
          ) : (
            <label className={label}>Quantité<input type="number" min={1} max={10} value={qty} onChange={(e) => setQty(Math.min(10, Math.max(1, Number(e.target.value) || 1)))} className={input} /></label>
          )}
          <p className="mt-2 text-sm">
            Total à annoncer : <strong className="tabular-nums">{needsVariant || (p && p.offers.length > 0 && !offerId) ? "choisir d'abord" : total == null ? "…" : formatTND(total)}</strong>
            {!f.governorate && total != null && <span className="text-muted"> (livraison comprise)</span>}
          </p>
          {problem && <p className="text-sm text-danger">{problem}</p>}
        </div>
      </Card>
      <Card title="Client">
        <div className="grid grid-cols-2 gap-2">
          <label className={label}>Nom<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={input} /></label>
          <label className={label}>Téléphone<input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" className={input} placeholder="22 123 456" /></label>
          <label className={label}>
            Gouvernorat
            <select value={f.governorate} onChange={(e) => setF({ ...f, governorate: e.target.value })} className={input}>
              <option value="">Choisir…</option>
              {GOVERNORATES.map((g) => (
                <option key={g.id} value={g.id}>{g.id}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            Canal
            <select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value as typeof f.channel })} className={input}>
              {CHANNELS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label className={`${label} col-span-2`}>Adresse<input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} className={input} /></label>
          <label className={`${label} col-span-2`}>Note (facultatif)<input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={input} /></label>
          <label className={label}>
            Langue des messages
            <select value={f.locale} onChange={(e) => setF({ ...f, locale: e.target.value as "ar" | "fr" })} className={input}>
              <option value="ar">Arabe</option>
              <option value="fr">Français</option>
            </select>
          </label>
          <label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" checked={f.confirmed} onChange={(e) => setF({ ...f, confirmed: e.target.checked })} />Déjà confirmée avec le client</label>
        </div>
        {error && <p className="mt-3 rounded-lg bg-clay-soft px-3 py-2 text-sm text-clay">{error}</p>}
        <div className="mt-3">
          <button type="button" disabled={!ready || pending} onClick={submit} className={btn.primary}>{pending ? "…" : "Créer la commande"}</button>
        </div>
      </Card>
    </div>
  );
}
