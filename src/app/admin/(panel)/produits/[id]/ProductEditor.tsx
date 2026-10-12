"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { deleteImage, deleteProduct, importImage, moveImage, saveProduct, setImageAlt, uploadImages, type ProductInput } from "../actions";
import { parseTND, toInputTND, formatTND } from "@/lib/money";
import { slugify } from "@/lib/slug";
import { Card, btn, input, label } from "@/components/admin/ui";

type Opt = { id: string; name: string };
type Img = { id: string; mediaId: string; alt: string };

const EMPTY: ProductInput = {
  name: "", nameAr: "", slug: "", description: "", descriptionAr: "", price: 0, compareAt: null, cost: null, categoryId: null, supplierId: null,
  supplierRef: "", supplierUrl: "", stockMode: "SUPPLIER", stockQty: 0, available: true, active: false, featured: false, variants: [], offers: [],
};

export function ProductEditor({ id, initial, images, categories, suppliers }: { id: string | null; initial: ProductInput | null; images: Img[]; categories: Opt[]; suppliers: Opt[] }) {
  const router = useRouter();
  const [p, setP] = useState<ProductInput>(initial ?? EMPTY);
  const [money, setMoney] = useState({ price: toInputTND(initial?.price || null), compareAt: toInputTND(initial?.compareAt), cost: toInputTND(initial?.cost) });
  const [vPrices, setVPrices] = useState<string[]>((initial?.variants ?? []).map((v) => toInputTND(v.price)));
  const [oPrices, setOPrices] = useState<string[]>((initial?.offers ?? []).map((o) => toInputTND(o.price)));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof ProductInput>(k: K, v: ProductInput[K]) => setP((x) => ({ ...x, [k]: v }));

  const price = parseTND(money.price);
  const cost = money.cost ? parseTND(money.cost) : null;
  const margin = price && cost != null ? price - cost : null;

  function save() {
    const priceM = parseTND(money.price);
    const compareM = money.compareAt.trim() ? parseTND(money.compareAt) : null;
    const costM = money.cost.trim() ? parseTND(money.cost) : null;
    if (priceM == null || priceM <= 0) return setMsg({ ok: false, text: "Prix invalide (ex. 59,900)." });
    if (money.compareAt.trim() && compareM == null) return setMsg({ ok: false, text: "Ancien prix invalide." });
    if (money.cost.trim() && costM == null) return setMsg({ ok: false, text: "Coût invalide." });
    const variants = p.variants.map((v, i) => ({ ...v, price: vPrices[i]?.trim() ? parseTND(vPrices[i]) : null }));
    if (variants.some((v, i) => vPrices[i]?.trim() && v.price == null)) return setMsg({ ok: false, text: "Prix de variante invalide." });
    const offers = p.offers.map((o, i) => ({ ...o, price: parseTND(oPrices[i] ?? "") ?? 0 }));
    const badOffer = offers.findIndex((o) => !o.label.trim() || o.price <= 0 || o.quantity < 1);
    if (badOffer >= 0) return setMsg({ ok: false, text: `Offre ${badOffer + 1} : nom, quantité et prix total sont obligatoires.` });
    start(async () => {
      const r = await saveProduct(id, { ...p, price: priceM, compareAt: compareM, cost: costM, variants, offers });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: r.message ?? "Enregistré." });
      if (!id && r.id) router.replace(`/admin/produits/${r.id}`);
      else router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card title="Texte">
          <div className="grid gap-3">
            <label className={label}>Nom (français)<input className={input} value={p.name} onChange={(e) => set("name", e.target.value)} onBlur={() => !p.slug && set("slug", slugify(p.name))} /></label>
            <label className={label}>Nom (arabe, facultatif)<input className={input} dir="rtl" value={p.nameAr} onChange={(e) => set("nameAr", e.target.value)} /></label>
            <label className={label}>
              Adresse de la page
              <span className="flex items-center gap-1 text-xs text-muted">/produit/<input className={input} value={p.slug} onChange={(e) => set("slug", e.target.value)} /></span>
            </label>
            <label className={label}>Description (français)<textarea rows={6} className={`${input} h-auto py-2`} value={p.description} onChange={(e) => set("description", e.target.value)} /></label>
            <label className={label}>Description (arabe, facultatif)<textarea rows={4} dir="rtl" className={`${input} h-auto py-2`} value={p.descriptionAr} onChange={(e) => set("descriptionAr", e.target.value)} /></label>
          </div>
        </Card>

        {id ? <Images productId={id} images={images} /> : <Card title="Photos"><p className="text-sm text-muted">Enregistrez le produit une première fois pour ajouter des photos.</p></Card>}

        <Card title="Offres" hint="Ce que le client choisit en haut du formulaire de commande : « 1 unité », « 2 unités », « Achetez 2, la 3e offerte »… Le prix est le total pour la quantité. Sans offre, le client choisit simplement une quantité. L'économie affichée est calculée sur le prix unitaire réel, et une date de fin n'est montrée que si vous la fixez.">
          <div className="flex flex-col gap-2">
            {p.offers.map((o, i) => {
              const total = parseTND(oPrices[i] ?? "");
              const unitNow = price ?? 0;
              const separately = unitNow * o.quantity;
              const setO = (patch: Partial<typeof o>) => set("offers", p.offers.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <div key={o.id ?? `n${i}`} className="flex flex-col gap-2 rounded-xl border border-line p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
                    <input className={input} placeholder="Nom (ex. Achetez 2, la 3e offerte)" value={o.label} onChange={(e) => setO({ label: e.target.value })} />
                    <input className={input} dir="rtl" placeholder="الاسم بالعربي (اختياري)" value={o.labelAr} onChange={(e) => setO({ labelAr: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-[100px_140px_1fr]">
                    <label className={label}>Quantité<input type="number" min={1} max={50} className={input} value={o.quantity} onChange={(e) => setO({ quantity: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} /></label>
                    <label className={label}>Prix total (DT)<input className={input} inputMode="decimal" placeholder="99,000" value={oPrices[i] ?? ""} onChange={(e) => setOPrices(oPrices.map((x, j) => (j === i ? e.target.value : x)))} /></label>
                    <label className={label}>Dernier jour (facultatif)<input type="date" className={input} value={o.endsOn} onChange={(e) => setO({ endsOn: e.target.value })} /></label>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={o.freeDelivery} onChange={(e) => setO({ freeDelivery: e.target.checked })} />Livraison offerte</label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={o.active} onChange={(e) => setO({ active: e.target.checked })} />Active</label>
                    {total != null && total > 0 && (
                      <span className="text-muted">
                        {formatTND(Math.round(total / o.quantity))} l&apos;unité
                        {separately > total && <span className="text-olive"> · économie client {formatTND(separately - total)}</span>}
                        {cost != null && <span className={total - cost * o.quantity > 0 ? "text-olive" : "text-danger"}> · marge {formatTND(total - cost * o.quantity)}</span>}
                      </span>
                    )}
                    <span className="ms-auto flex gap-3">
                      <button type="button" className="text-muted" onClick={() => { if (i === 0) return; const a = [...p.offers]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; const b = [...oPrices]; [b[i - 1], b[i]] = [b[i], b[i - 1]]; set("offers", a); setOPrices(b); }} aria-label="Monter">↑</button>
                      <button type="button" className="text-clay" onClick={() => { set("offers", p.offers.filter((_, j) => j !== i)); setOPrices(oPrices.filter((_, j) => j !== i)); }}>Retirer</button>
                    </span>
                  </div>
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn.ghost} onClick={() => { set("offers", [...p.offers, { label: "", labelAr: "", quantity: p.offers.length + 1, price: 0, freeDelivery: false, endsOn: "", active: true }]); setOPrices([...oPrices, ""]); }}>
                + Ajouter une offre
              </button>
              {p.offers.length === 0 && price ? (
                <button
                  type="button"
                  className={btn.ghost}
                  onClick={() => {
                    set("offers", [
                      { label: "1 unité", labelAr: "حبة وحدة", quantity: 1, price: 0, freeDelivery: false, endsOn: "", active: true },
                      { label: "Achetez 2, la 3e offerte", labelAr: "اشري 2 والثالثة هدية", quantity: 3, price: 0, freeDelivery: true, endsOn: "", active: true },
                    ]);
                    setOPrices([toInputTND(price), toInputTND(price * 2)]);
                  }}
                >
                  Proposer « 1 » et « 2 + 1 offerte »
                </button>
              ) : null}
            </div>
          </div>
        </Card>

        <Card title="Variantes" hint="Taille, couleur… Laissez vide si le produit n'a pas d'option. Le prix d'une variante remplace celui du produit s'il est rempli.">
          <div className="flex flex-col gap-2">
            {p.variants.map((v, i) => (
              <div key={v.id ?? `n${i}`} className="grid grid-cols-2 gap-2 rounded-xl border border-line p-2 sm:grid-cols-[1fr_110px_90px_auto_auto]">
                <input className={input} placeholder="Nom (Noir / M)" value={v.name} onChange={(e) => set("variants", p.variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input className={input} placeholder="Prix (option)" inputMode="decimal" value={vPrices[i] ?? ""} onChange={(e) => setVPrices(vPrices.map((x, j) => (j === i ? e.target.value : x)))} />
                {p.stockMode === "TRACKED" ? (
                  <input className={input} type="number" min={0} placeholder="Stock" value={v.stockQty} onChange={(e) => set("variants", p.variants.map((x, j) => (j === i ? { ...x, stockQty: Math.max(0, Number(e.target.value) || 0) } : x)))} />
                ) : (
                  <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={v.available} onChange={(e) => set("variants", p.variants.map((x, j) => (j === i ? { ...x, available: e.target.checked } : x)))} />Dispo</label>
                )}
                <span className="flex gap-1">
                  <button type="button" className="rounded-lg px-2 text-sm text-muted" onClick={() => { if (i === 0) return; const a = [...p.variants]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; const b = [...vPrices]; [b[i - 1], b[i]] = [b[i], b[i - 1]]; set("variants", a); setVPrices(b); }} aria-label="Monter">↑</button>
                </span>
                <button type="button" className="text-sm text-clay" onClick={() => { set("variants", p.variants.filter((_, j) => j !== i)); setVPrices(vPrices.filter((_, j) => j !== i)); }}>Retirer</button>
              </div>
            ))}
            <button type="button" className={`${btn.ghost} self-start`} onClick={() => { set("variants", [...p.variants, { name: "", sku: "", price: null, stockQty: 0, available: true }]); setVPrices([...vPrices, ""]); }}>
              + Ajouter une variante
            </button>
          </div>
        </Card>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <Card title="Publication">
          <label className="flex items-center justify-between gap-3 py-1 text-sm">En ligne<input type="checkbox" className="h-5 w-5" checked={p.active} onChange={(e) => set("active", e.target.checked)} /></label>
          <label className="flex items-center justify-between gap-3 py-1 text-sm">Dans « Notre sélection »<input type="checkbox" className="h-5 w-5" checked={p.featured} onChange={(e) => set("featured", e.target.checked)} /></label>
          <label className={`${label} mt-2`}>
            Catégorie
            <select className={input} value={p.categoryId ?? ""} onChange={(e) => set("categoryId", e.target.value || null)}>
              <option value="">—</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </Card>

        <Card title="Prix">
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>Prix de vente (DT)<input className={input} inputMode="decimal" placeholder="59,900" value={money.price} onChange={(e) => setMoney({ ...money, price: e.target.value })} /></label>
            <label className={label}>Ancien prix (DT)<input className={input} inputMode="decimal" placeholder="facultatif" value={money.compareAt} onChange={(e) => setMoney({ ...money, compareAt: e.target.value })} /></label>
          </div>
          <p className="mt-1.5 text-xs text-muted">L&apos;ancien prix doit être un prix réellement pratiqué avant. Il est affiché barré.</p>
          <label className={`${label} mt-3`}>Coût fournisseur (DT)<input className={input} inputMode="decimal" placeholder="jamais affiché aux clients" value={money.cost} onChange={(e) => setMoney({ ...money, cost: e.target.value })} /></label>
          {margin != null && price ? (
            <p className={`mt-2 text-sm ${margin > 0 ? "text-olive" : "text-danger"}`}>
              Marge : {formatTND(margin)} ({Math.round((margin / price) * 100)} %)
            </p>
          ) : null}
        </Card>

        <Card title="Stock">
          <div className="flex gap-2">
            <button type="button" className={p.stockMode === "SUPPLIER" ? btn.primary : btn.ghost} onClick={() => set("stockMode", "SUPPLIER")}>Stock fournisseur</button>
            <button type="button" className={p.stockMode === "TRACKED" ? btn.primary : btn.ghost} onClick={() => set("stockMode", "TRACKED")}>Je compte</button>
          </div>
          {p.stockMode === "SUPPLIER" ? (
            <>
              <p className="mt-2 text-xs text-muted">Dropshipping : aucune quantité n&apos;est affichée. Décochez quand le fournisseur ne peut plus livrer.</p>
              <label className="mt-2 flex items-center justify-between text-sm">Disponible chez le fournisseur<input type="checkbox" className="h-5 w-5" checked={p.available} onChange={(e) => set("available", e.target.checked)} /></label>
            </>
          ) : (
            <>
              <p className="mt-2 text-xs text-muted">La quantité baisse à chaque commande et remonte si elle est annulée ou refusée. « Plus que N en stock » s&apos;affiche à 5 ou moins.</p>
              {p.variants.length === 0 && <label className={`${label} mt-2`}>Quantité<input type="number" min={0} className={input} value={p.stockQty} onChange={(e) => set("stockQty", Math.max(0, Number(e.target.value) || 0))} /></label>}
            </>
          )}
        </Card>

        <Card title="Fournisseur">
          <label className={label}>
            Fournisseur
            <select className={input} value={p.supplierId ?? ""} onChange={(e) => set("supplierId", e.target.value || null)}>
              <option value="">—</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className={`${label} mt-2`}>Réf. fournisseur<input className={input} value={p.supplierRef} onChange={(e) => set("supplierRef", e.target.value)} /></label>
          <label className={`${label} mt-2`}>Lien fournisseur<input className={input} value={p.supplierUrl} onChange={(e) => set("supplierUrl", e.target.value)} placeholder="https://" /></label>
        </Card>

        <div className="sticky bottom-3 flex flex-col gap-2 rounded-2xl border border-line bg-white/95 p-3 shadow-soft backdrop-blur">
          {msg && <p className={`text-sm ${msg.ok ? "text-olive" : "text-danger"}`}>{msg.text}</p>}
          <button type="button" disabled={pending} onClick={save} className={btn.sea}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
          {id && (
            <button
              type="button"
              className="text-sm text-clay underline"
              onClick={() => {
                if (!confirm("Supprimer ce produit ? Les commandes passées gardent leur détail.")) return;
                start(async () => {
                  await deleteProduct(id);
                  router.replace("/admin/produits");
                });
              }}
            >
              Supprimer le produit
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Images({ productId, images }: { productId: string; images: Img[] }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setErr(r.ok ? null : r.error ?? "Erreur.");
      router.refresh();
    });
  return (
    <Card title="Photos" hint="La première est la photo principale. Format portrait 4:5 conseillé. Les photos sont recompressées et les données GPS retirées.">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {images.map((img, i) => (
          <div key={img.id} className="flex flex-col gap-1">
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-sand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/img/${img.mediaId}/256`} alt="" className="h-full w-full object-cover" />
              {i === 0 && <span className="absolute start-1 top-1 rounded-full bg-ink px-1.5 text-[10px] text-white">Principale</span>}
            </div>
            <div className="flex justify-between text-xs">
              <button type="button" disabled={pending || i === 0} onClick={() => run(() => moveImage(img.id, -1))} className="px-1 disabled:opacity-30">←</button>
              <button type="button" disabled={pending} onClick={() => confirm("Supprimer cette photo ?") && run(() => deleteImage(img.id))} className="text-clay">Suppr.</button>
              <button type="button" disabled={pending || i === images.length - 1} onClick={() => run(() => moveImage(img.id, 1))} className="px-1 disabled:opacity-30">→</button>
            </div>
            <input defaultValue={img.alt} placeholder="Texte alternatif" className="h-8 rounded-lg border border-line px-2 text-xs" onBlur={(e) => e.target.value !== img.alt && run(() => setImageAlt(img.id, e.target.value))} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = e.target.files;
            if (!files?.length) return;
            const fd = new FormData();
            for (const f of Array.from(files)) fd.append("files", f);
            run(() => uploadImages(productId, fd));
            e.target.value = "";
          }}
        />
        <button type="button" disabled={pending} className={btn.primary} onClick={() => file.current?.click()}>{pending ? "Envoi…" : "Ajouter des photos"}</button>
      </div>
      <div className="mt-2 flex gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Ou coller le lien d'une photo du fournisseur" className={input} />
        <button type="button" disabled={pending || !url} className={btn.ghost} onClick={() => run(async () => { const r = await importImage(productId, url); if (r.ok) setUrl(""); return r; })}>Importer</button>
      </div>
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
    </Card>
  );
}
