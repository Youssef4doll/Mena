"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, useTransition } from "react";
import { deleteImage, deleteProduct, importImage, moveImage, saveProduct, setImageAlt, translateTexts, uploadImages, type ProductInput } from "../actions";
import type { ProductTexts } from "@/lib/translate-merge";
import { parseTND, toInputTND, formatTND } from "@/lib/money";
import { offerCompareAt } from "@/lib/offer-display";
import { slugify } from "@/lib/slug";
import { parseSpecs, parseVideo } from "@/lib/product-content";
import { shrinkForUpload } from "@/lib/client/shrink-image";
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, productDescription, productTitle } from "@/lib/seo";
import { Card, btn, input, label } from "@/components/admin/ui";

type Opt = { id: string; name: string; nameAr?: string | null };
type Img = { id: string; mediaId: string; alt: string; kind: "GALLERY" | "DETAIL"; width: number; height: number };

const EMPTY: ProductInput = {
  name: "", nameAr: "", slug: "", summary: "", summaryAr: "", description: "", descriptionAr: "", specs: "", specsAr: "", videoUrl: "", keywords: "", seoTitle: "", seoTitleAr: "", seoDescription: "", seoDescriptionAr: "", price: 0, compareAt: null, cost: null, categoryId: null, supplierId: null,
  supplierRef: "", supplierUrl: "", stockMode: "SUPPLIER", stockQty: 0, available: true, active: false, featured: false, variants: [], offers: [],
};

type Msg = { ok: boolean; text: string };
type Props = { id: string | null; version: string; initial: ProductInput | null; images: Img[]; categories: Opt[]; suppliers: Opt[]; shopName: string; siteUrl: string; everywhere: boolean; oldSlugs: string[]; aiReady: boolean };

/** The texts a translation reads and writes. */
const textsOf = (p: ProductInput): ProductTexts => ({
  name: p.name, nameAr: p.nameAr, summary: p.summary, summaryAr: p.summaryAr, description: p.description, descriptionAr: p.descriptionAr,
  specs: p.specs, specsAr: p.specsAr, keywords: p.keywords,
  variants: p.variants.map((v) => ({ name: v.name, nameAr: v.nameAr ?? "" })),
  offers: p.offers.map((o) => ({ label: o.label, labelAr: o.labelAr })),
});
const withTexts = (p: ProductInput, t: ProductTexts): ProductInput => ({
  ...p, ...t,
  variants: p.variants.map((v, i) => ({ ...v, name: t.variants[i]?.name ?? v.name, nameAr: t.variants[i]?.nameAr ?? v.nameAr })),
  offers: p.offers.map((o, i) => ({ ...o, label: t.offers[i]?.label ?? o.label, labelAr: t.offers[i]?.labelAr ?? o.labelAr })),
});
/** A text written in one language only, or no keywords yet: something for the translation to do. */
function missing(p: ProductInput): boolean {
  const one = (a: string | undefined, b: string | undefined) => Boolean(a?.trim()) !== Boolean(b?.trim());
  return (
    one(p.name, p.nameAr) || one(p.summary, p.summaryAr) || one(p.description, p.descriptionAr) || one(p.specs, p.specsAr) ||
    (!p.keywords.trim() && Boolean(p.name.trim() || p.nameAr.trim())) ||
    p.variants.some((v) => one(v.name, v.nameAr)) || p.offers.some((o) => one(o.label, o.labelAr))
  );
}
const AUTO = "mena_admin_autotranslate";
const noopSubscribe = () => () => {};
const readAuto = () => {
  try {
    return localStorage.getItem(AUTO) ?? "1";
  } catch {
    return "1";
  }
};

/** "3" → 3; empty, decimal or outside 1–50 → null. */
function offerQty(s: string | undefined): number | null {
  const t = (s ?? "").trim();
  return /^\d+$/.test(t) && Number(t) >= 1 && Number(t) <= 50 ? Number(t) : null;
}

/**
 * Keeps the save message; the form is keyed on `version` (id + updatedAt), so
 * each save remounts it from the saved rows: new offers and variants get their ids.
 */
export function ProductEditor(props: Props) {
  const [msg, setMsg] = useState<Msg | null>(null);
  return <Form key={props.version} {...props} msg={msg} setMsg={setMsg} />;
}

function Form({ id, initial, images, categories, suppliers, shopName, siteUrl, everywhere, oldSlugs, aiReady, msg, setMsg }: Props & { msg: Msg | null; setMsg: (m: Msg | null) => void }) {
  const router = useRouter();
  const [p, setP] = useState<ProductInput>(initial ?? EMPTY);
  const [money, setMoney] = useState({ price: toInputTND(initial?.price || null), compareAt: toInputTND(initial?.compareAt), cost: toInputTND(initial?.cost) });
  const [vPrices, setVPrices] = useState<string[]>((initial?.variants ?? []).map((v) => toInputTND(v.price)));
  const [oPrices, setOPrices] = useState<string[]>((initial?.offers ?? []).map((o) => toInputTND(o.price)));
  // Raw text like the prices, checked on save: a cleared field can be retyped.
  const [oQty, setOQty] = useState<string[]>((initial?.offers ?? []).map((o) => String(o.quantity)));
  // Read once, to tell which end dates have passed.
  const [now] = useState(() => Date.now());
  const [pending, start] = useTransition();
  const [translating, setTranslating] = useState(false);
  // On by default; the choice is remembered in this browser (read after hydration, so the page never disagrees).
  const stored = useSyncExternalStore(noopSubscribe, readAuto, () => "1");
  const [autoPick, setAuto] = useState<boolean | null>(null);
  const auto = autoPick ?? stored !== "0";
  const set = <K extends keyof ProductInput>(k: K, v: ProductInput[K]) => setP((x) => ({ ...x, [k]: v }));

  /** Asks the server for the translation and puts it in the form; nothing is saved here. */
  async function translate(from: ProductInput, mode: "fill" | "to-ar"): Promise<ProductInput | null> {
    setTranslating(true);
    try {
      const r = await translateTexts(textsOf(from), mode);
      if (!r.ok) {
        setMsg({ ok: false, text: r.error });
        return null;
      }
      const next = withTexts(from, r.texts);
      setP(next);
      return next;
    } finally {
      setTranslating(false);
    }
  }

  const price = parseTND(money.price);
  const cost = money.cost ? parseTND(money.cost) : null;
  const margin = price && cost != null ? price - cost : null;

  // The live offers as the shop lists them: its 1-unit offer gives the card price and the "instead of" of bigger packs.
  const live = (o: ProductInput["offers"][number]) => o.active && (!o.endsOn || Date.parse(`${o.endsOn}T00:00:00Z`) + 23 * 3_600_000 > now);
  const liveOffers = p.offers.flatMap((o, i) => {
    const quantity = offerQty(oQty[i]);
    const total = parseTND(oPrices[i] ?? "");
    return quantity && total && live(o) ? [{ quantity, price: total }] : [];
  });
  const unitOffer = liveOffers.find((o) => o.quantity === 1)?.price ?? null;
  const ownPriced = p.offers.length > 0 && vPrices.some((s) => s.trim() && parseTND(s) !== price);

  const moveOffer = (i: number) => {
    if (i === 0) return;
    const up = <T,>(a: T[]) => { const b = [...a]; [b[i - 1], b[i]] = [b[i], b[i - 1]]; return b; };
    set("offers", up(p.offers));
    setOPrices(up(oPrices));
    setOQty(up(oQty));
  };
  const removeOffer = (i: number) => {
    const rm = <T,>(a: T[]) => a.filter((_, j) => j !== i);
    set("offers", rm(p.offers));
    setOPrices(rm(oPrices));
    setOQty(rm(oQty));
  };

  function save() {
    const priceM = parseTND(money.price);
    const compareM = money.compareAt.trim() ? parseTND(money.compareAt) : null;
    const costM = money.cost.trim() ? parseTND(money.cost) : null;
    if (priceM == null || priceM <= 0) return setMsg({ ok: false, text: "Prix invalide (ex. 59,900)." });
    if (money.compareAt.trim() && compareM == null) return setMsg({ ok: false, text: "Ancien prix invalide." });
    if (money.cost.trim() && costM == null) return setMsg({ ok: false, text: "Coût invalide." });
    const variants = p.variants.map((v, i) => ({ ...v, price: vPrices[i]?.trim() ? parseTND(vPrices[i]) : null }));
    if (variants.some((v, i) => vPrices[i]?.trim() && v.price == null)) return setMsg({ ok: false, text: "Prix de variante invalide." });
    const offers = p.offers.map((o, i) => ({ ...o, quantity: offerQty(oQty[i]) ?? 0, price: parseTND(oPrices[i] ?? "") ?? 0 }));
    const badQty = offers.findIndex((o) => o.quantity < 1);
    if (badQty >= 0) return setMsg({ ok: false, text: `Offre ${badQty + 1} : la quantité doit être un nombre entier entre 1 et 50.` });
    const badOffer = offers.findIndex((o) => !o.label.trim() || o.price <= 0);
    if (badOffer >= 0) return setMsg({ ok: false, text: `Offre ${badOffer + 1} : nom, quantité et prix total sont obligatoires.` });
    start(async () => {
      // Automatic translation of what is missing, then the save.
      let texts = p;
      let translated = false;
      if (aiReady && auto && missing(p)) {
        const t = await translate(p, "fill");
        if (t) {
          texts = t;
          translated = true;
        }
      }
      const r = await saveProduct(id, { ...p, ...textsOf(texts), price: priceM, compareAt: compareM, cost: costM, variants: variants.map((v, i) => ({ ...v, nameAr: texts.variants[i]?.nameAr ?? v.nameAr })), offers: offers.map((o, i) => ({ ...o, labelAr: texts.offers[i]?.labelAr ?? o.labelAr, label: texts.offers[i]?.label ?? o.label })) });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      setMsg({ ok: true, text: translated ? "Produit enregistré, avec la traduction automatique : relisez les textes en arabe." : (r.message ?? "Enregistré.") });
      if (!id && r.id) router.replace(`/admin/produits/${r.id}`);
      else router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card title="Texte" hint="La boutique s'affiche d'abord en arabe. Écrivez dans une langue : la traduction automatique écrit l'autre (en arabe tunisien), et les mots-clés de recherche. Relisez toujours ce qu'elle écrit.">
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-sea-soft p-2.5" data-testid="translate-bar">
              {aiReady ? (
                <>
                  <button type="button" disabled={translating || pending} className={btn.sea} onClick={() => translate(p, "fill").then((t) => t && setMsg({ ok: true, text: "Traduction ajoutée dans les champs vides. Relisez puis enregistrez." }))}>
                    {translating ? "Traduction…" : "Traduire ce qui manque"}
                  </button>
                  <button type="button" disabled={translating || pending} className={btn.ghost} onClick={() => confirm("Réécrire tous les textes arabes à partir du français ?") && translate(p, "to-ar").then((t) => t && setMsg({ ok: true, text: "Textes arabes réécrits depuis le français. Relisez puis enregistrez." }))}>
                    Retraduire l&apos;arabe depuis le français
                  </button>
                  <label className="ms-auto flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={auto}
                      onChange={(e) => {
                        setAuto(e.target.checked);
                        try {
                          localStorage.setItem(AUTO, e.target.checked ? "1" : "0");
                        } catch {}
                      }}
                    />
                    Traduire automatiquement en enregistrant
                  </label>
                </>
              ) : (
                <p className="text-sm text-ink-2">Traduction automatique en arabe tunisien : ajoutez la variable <code>ANTHROPIC_API_KEY</code> dans Vercel, puis redéployez (voir docs/DEPLOIEMENT.md).</p>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>Nom (français)<input className={input} value={p.name} onChange={(e) => set("name", e.target.value)} onBlur={() => !p.slug && set("slug", slugify(p.name))} /></label>
              <label className={label}>Nom (arabe)<input className={input} dir="rtl" value={p.nameAr} onChange={(e) => set("nameAr", e.target.value)} /></label>
            </div>
            <p className="-mt-1 text-xs text-muted">Comme sur Amazon, mettez dans le nom les mots que les clients tapent sur Google : « Lampe de chevet tactile LED rechargeable, 3 intensités » plutôt que « Lampe ». C&apos;est le titre de la page et le début du résultat Google.</p>
            <label className={label}>
              Adresse de la page
              <span className="flex items-center gap-1 text-xs text-muted">/produit/<input className={input} value={p.slug} onChange={(e) => set("slug", e.target.value)} /></span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Counted label="Description courte, sous le nom (français)" value={p.summary} max={300} onChange={(v) => set("summary", v)} rows={3} placeholder="Ex. : Lumière douce, trois intensités, se recharge en USB." />
              <Counted label="Description courte (arabe)" value={p.summaryAr} max={300} onChange={(v) => set("summaryAr", v)} rows={3} rtl placeholder="مثلا: ضو مريح، 3 درجات، يتشحن بـ USB." />
            </div>
            <p className="-mt-1 text-xs text-muted">Une ou deux phrases, le premier texte lu : à quoi sert le produit et ce qui le rend utile.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>Description détaillée (français)<textarea rows={7} className={`${input} h-auto py-2`} value={p.description} onChange={(e) => set("description", e.target.value)} /></label>
              <label className={label}>Description détaillée (arabe)<textarea rows={7} dir="rtl" className={`${input} h-auto py-2`} value={p.descriptionAr} onChange={(e) => set("descriptionAr", e.target.value)} /></label>
            </div>
            <p className="-mt-1 text-xs text-muted">Affichée sous le formulaire de commande, avec les caractéristiques et les images de description. Une ligne vide sépare deux paragraphes.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>Caractéristiques (français)<textarea rows={5} className={`${input} h-auto py-2`} value={p.specs} onChange={(e) => set("specs", e.target.value)} placeholder={"Matière : inox\nDimensions : 32 × 20 cm\nDans la boîte : 1 lampe, 1 câble USB-C"} /></label>
              <label className={label}>Caractéristiques (arabe)<textarea rows={5} dir="rtl" className={`${input} h-auto py-2`} value={p.specsAr} onChange={(e) => set("specsAr", e.target.value)} placeholder={"المادة: إينوكس\nالقياس: 32 × 20 صم\nفي الكرطونة: لمبة وكابل USB-C"} /></label>
            </div>
            <p className="-mt-1 text-xs text-muted">
              Une par ligne, « nom : valeur ». {parseSpecs(p.specs).length > 0 && `${parseSpecs(p.specs).length} ligne(s) lue(s).`}
            </p>
            <label className={label}>
              Vidéo (facultatif)
              <input className={input} value={p.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} placeholder="https://youtu.be/… ou https://…/video.mp4" dir="ltr" />
              <span className={`text-xs font-normal ${p.videoUrl.trim() && !parseVideo(p.videoUrl) ? "text-danger" : "text-muted"}`}>
                {p.videoUrl.trim() && !parseVideo(p.videoUrl)
                  ? "Lien non reconnu : un lien YouTube (vidéo ou Short) ou l'adresse https d'un fichier .mp4."
                  : "Un lien YouTube (vidéo ou Short) ou l'adresse d'un fichier .mp4. Elle s'affiche en 2e position dans les photos, et ne se charge que si le client appuie dessus."}
              </span>
            </label>
          </div>
        </Card>

        <Seo p={p} set={set} price={unitOffer ?? price ?? 0} category={categories.find((c) => c.id === p.categoryId) ?? null} shopName={shopName} siteUrl={siteUrl} everywhere={everywhere} oldSlugs={oldSlugs} />

        {id ? (
          <>
            <Images productId={id} kind="GALLERY" images={images.filter((i) => i.kind === "GALLERY")} />
            <Images productId={id} kind="DETAIL" images={images.filter((i) => i.kind === "DETAIL")} />
          </>
        ) : (
          <Card title="Photos"><p className="text-sm text-muted">Enregistrez le produit une première fois pour ajouter des photos.</p></Card>
        )}

        <Card title="Offres" hint="Ce que le client choisit en haut du formulaire de commande : « 1 unité », « 2 unités », « Achetez 2, la 3e offerte »… Le prix est le total pour la quantité. Sans offre, le client choisit simplement une quantité. Prix barré : sur l'offre de 1 unité, l'ancien prix du produit s'il est rempli ; sur les lots, le prix de l'offre de 1 unité multiplié par la quantité (sans offre de 1 unité active, rien n'est barré). Une date de fin n'est montrée que si vous la fixez.">
          <p className={`-mt-1 mb-2 text-xs ${ownPriced ? "text-danger" : "text-muted"}`}>
            Les offres utilisent le prix du produit : avec des offres, les variantes ne peuvent pas avoir leur propre prix.
          </p>
          <div className="flex flex-col gap-2">
            {p.offers.map((o, i) => {
              const total = parseTND(oPrices[i] ?? "");
              const q = offerQty(oQty[i]);
              // The shop's own rule: a pack against its live 1-unit offer; the 1-unit offer against the product's former price.
              const insteadOf = q != null && total ? offerCompareAt(liveOffers, { quantity: q, price: total }, money.compareAt.trim() ? parseTND(money.compareAt) : null) : null;
              const setO = (patch: Partial<typeof o>) => set("offers", p.offers.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <div key={o.id ?? `n${i}`} className="flex flex-col gap-2 rounded-xl border border-line p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
                    <input className={input} placeholder="Nom (ex. Achetez 2, la 3e offerte)" value={o.label} onChange={(e) => setO({ label: e.target.value })} />
                    <input className={input} dir="rtl" placeholder="الاسم بالعربي (اختياري)" value={o.labelAr} onChange={(e) => setO({ labelAr: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-[100px_140px_1fr]">
                    <label className={label}>
                      Quantité
                      <input type="number" min={1} max={50} className={input} aria-invalid={q == null} value={oQty[i] ?? ""} onChange={(e) => setOQty(oQty.map((x, j) => (j === i ? e.target.value : x)))} />
                      {q == null && <span className="text-xs font-normal text-danger">{oQty[i]?.trim() ? "Nombre entier de 1 à 50." : "Obligatoire."}</span>}
                    </label>
                    <label className={label}>Prix total (DT)<input className={input} inputMode="decimal" placeholder="99,000" value={oPrices[i] ?? ""} onChange={(e) => setOPrices(oPrices.map((x, j) => (j === i ? e.target.value : x)))} /></label>
                    <label className={label}>Dernier jour (facultatif)<input type="date" className={input} value={o.endsOn} onChange={(e) => setO({ endsOn: e.target.value })} /></label>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={o.freeDelivery} onChange={(e) => setO({ freeDelivery: e.target.checked })} />Livraison offerte</label>
                    <label className="flex items-center gap-1.5"><input type="checkbox" checked={o.active} onChange={(e) => setO({ active: e.target.checked })} />Active</label>
                    {total != null && total > 0 && q != null && (
                      <span className="text-muted">
                        {formatTND(Math.round(total / q))} l&apos;unité
                        {insteadOf != null && <span className="text-olive"> · au lieu de {formatTND(insteadOf)}, économie client {formatTND(insteadOf - total)}</span>}
                        {cost != null && <span className={total - cost * q > 0 ? "text-olive" : "text-danger"}> · marge {formatTND(total - cost * q)}</span>}
                      </span>
                    )}
                    <span className="ms-auto flex gap-3">
                      <button type="button" className="text-muted" onClick={() => moveOffer(i)} aria-label="Monter">↑</button>
                      <button type="button" className="text-clay" onClick={() => removeOffer(i)}>Retirer</button>
                    </span>
                  </div>
                </div>
              );
            })}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={btn.ghost}
                onClick={() => {
                  set("offers", [...p.offers, { label: "", labelAr: "", quantity: p.offers.length + 1, price: 0, freeDelivery: false, endsOn: "", active: true }]);
                  setOPrices([...oPrices, ""]);
                  setOQty([...oQty, String(p.offers.length + 1)]);
                }}
              >
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
                    setOQty(["1", "3"]);
                  }}
                >
                  Proposer « 1 » et « 2 + 1 offerte »
                </button>
              ) : null}
            </div>
          </div>
        </Card>

        <Card title="Variantes" hint="Taille, couleur… Laissez vide si le produit n'a pas d'option. Le prix d'une variante remplace celui du produit s'il est rempli, sur un produit sans offre.">
          <div className="flex flex-col gap-2">
            {p.variants.map((v, i) => (
              <div key={v.id ?? `n${i}`} className="grid grid-cols-2 gap-2 rounded-xl border border-line p-2 sm:grid-cols-[1fr_1fr_110px_90px_auto_auto]">
                <input className={input} placeholder="Nom (Noir / M)" value={v.name} onChange={(e) => set("variants", p.variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input className={input} dir="rtl" placeholder="بالعربي (أكحل)" value={v.nameAr ?? ""} onChange={(e) => set("variants", p.variants.map((x, j) => (j === i ? { ...x, nameAr: e.target.value } : x)))} />
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
            <button type="button" className={`${btn.ghost} self-start`} onClick={() => { set("variants", [...p.variants, { name: "", nameAr: "", sku: "", price: null, stockQty: 0, available: true }]); setVPrices([...vPrices, ""]); }}>
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
          {unitOffer != null && price != null && price !== unitOffer && (
            <p className="mt-1.5 text-xs text-clay">
              L&apos;offre de 1 unité est à {formatTND(unitOffer)} : c&apos;est ce prix que la boutique affiche sur les cartes et la fiche produit, pas le prix de vente.
            </p>
          )}
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

/**
 * What Google will show, in both languages, with the shop's own title and
 * description when they are typed, and the automatic ones (made from the
 * name, the category, the short description and the price) otherwise. The
 * keywords feed the shop's own search.
 */
function Seo({ p, set, price, category, shopName, siteUrl, everywhere, oldSlugs }: { p: ProductInput; set: <K extends keyof ProductInput>(k: K, v: ProductInput[K]) => void; price: number; category: Opt | null; shopName: string; siteUrl: string; everywhere: boolean; oldSlugs: string[] }) {
  const base = { ...p, price, category: category ? { name: category.name, nameAr: category.nameAr ?? null } : null, offers: [], variants: [] };
  const host = siteUrl.replace(/^https?:\/\//, "");
  const preview = (lang: "ar" | "fr") => ({
    url: `${host}${lang === "fr" ? "/fr" : ""}/produit/${p.slug || slugify(p.name)}`,
    title: `${productTitle(base, lang)} · ${shopName}`,
    description: productDescription(base, lang, everywhere),
  });
  return (
    <Card title="Google et recherche" hint="Laissez vide pour que la boutique compose le titre et la description à partir du nom, de la catégorie, de la description courte et du prix ; l'aperçu montre le résultat. Google affiche environ 60 caractères de titre et 155 de description.">
      <div className="grid gap-3">
        <label className={label}>
          Mots-clés de recherche
          <textarea rows={2} className={`${input} h-auto py-2`} value={p.keywords} onChange={(e) => set("keywords", e.target.value)} placeholder="veilleuse, lampe de nuit, lamba, lampa, ضو سرير" />
          <span className="text-xs font-normal text-muted">Séparés par des virgules : autres noms, fautes fréquentes, mots en arabe et en tunisien écrit en lettres latines. Jamais affichés ; la recherche de la boutique les trouve.</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <Counted label="Titre pour Google (français)" value={p.seoTitle} max={SEO_TITLE_MAX} onChange={(v) => set("seoTitle", v)} rows={2} placeholder={productTitle({ ...base, seoTitle: "" }, "fr")} />
          <Counted label="Titre pour Google (arabe)" value={p.seoTitleAr} max={SEO_TITLE_MAX} onChange={(v) => set("seoTitleAr", v)} rows={2} rtl placeholder={productTitle({ ...base, seoTitleAr: "" }, "ar")} />
          <Counted label="Description pour Google (français)" value={p.seoDescription} max={SEO_DESCRIPTION_MAX} onChange={(v) => set("seoDescription", v)} rows={3} placeholder={productDescription({ ...base, seoDescription: "" }, "fr", everywhere)} />
          <Counted label="Description pour Google (arabe)" value={p.seoDescriptionAr} max={SEO_DESCRIPTION_MAX} onChange={(v) => set("seoDescriptionAr", v)} rows={3} rtl placeholder={productDescription({ ...base, seoDescriptionAr: "" }, "ar", everywhere)} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["ar", "fr"] as const).map((lang) => {
            const g = preview(lang);
            return (
              <div key={lang} className="rounded-xl border border-line bg-white p-3" dir={lang === "ar" ? "rtl" : "ltr"}>
                <p className="text-[11px] uppercase tracking-wide text-muted" dir="ltr">Aperçu Google · {lang === "ar" ? "arabe" : "français"}</p>
                <p className="mt-1 truncate text-xs text-[#202124]" dir="ltr">{g.url}</p>
                <p className="mt-0.5 text-[17px] leading-snug text-[#1a0dab]">{g.title}</p>
                <p className="mt-0.5 text-[13px] leading-snug text-[#4d5156]">{g.description}</p>
              </div>
            );
          })}
        </div>
        {oldSlugs.length > 0 && (
          <p className="text-xs text-muted">
            Anciennes adresses, redirigées vers l&apos;adresse actuelle : {oldSlugs.map((s) => `/produit/${s}`).join(", ")}
          </p>
        )}
      </div>
    </Card>
  );
}

/** A text field with its character count, so the short description stays short. */
function Counted({ label: text, value, max, onChange, rows, rtl, placeholder }: { label: string; value: string; max: number; onChange: (v: string) => void; rows: number; rtl?: boolean; placeholder?: string }) {
  return (
    <label className={label}>
      <span className="flex items-baseline justify-between gap-2">
        {text}
        <span className={`text-xs font-normal tabular-nums ${value.length > max ? "text-danger" : "text-muted"}`}>{value.length}/{max}</span>
      </span>
      <textarea rows={rows} dir={rtl ? "rtl" : undefined} className={`${input} h-auto py-2`} value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

const KIND = {
  GALLERY: {
    title: "Photos du produit",
    hint: "En haut de la fiche, à faire glisser, et en plein écran quand le client appuie dessus. La première est la photo principale (aussi sur les cartes). Format carré conseillé, 4 à 8 photos : le produit seul, en situation, de près, ses dimensions.",
    add: "Ajouter des photos",
  },
  DETAIL: {
    title: "Images de description (longues)",
    hint: "Les grandes images verticales qui expliquent le produit (avantages, mode d'emploi, dimensions), comme sur Amazon. Elles s'affichent l'une sous l'autre, en pleine largeur, sous la description. Largeur conseillée 1080 à 1600 px, toute hauteur.",
    add: "Ajouter des images de description",
  },
} as const;

function Images({ productId, images, kind }: { productId: string; images: Img[]; kind: "GALLERY" | "DETAIL" }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const k = KIND[kind];
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setErr(r.ok ? null : r.error ?? "Erreur.");
      router.refresh();
    });
  return (
    <Card title={k.title} hint={k.hint}>
      {kind === "DETAIL" ? (
        <div className="flex flex-col gap-2">
          {images.length === 0 && <p className="text-sm text-muted">Aucune image de description pour le moment.</p>}
          {images.map((img, i) => (
            <div key={img.id} className="flex items-center gap-3 rounded-xl border border-line p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/img/${img.mediaId}/256`} alt="" className="h-24 w-16 shrink-0 rounded-lg bg-sand object-cover object-top" />
              <input defaultValue={img.alt} placeholder="Ce que dit l'image (pour les malvoyants et Google)" className="h-9 min-w-0 flex-1 rounded-lg border border-line px-2 text-xs" onBlur={(e) => e.target.value !== img.alt && run(() => setImageAlt(img.id, e.target.value))} />
              <span className="flex shrink-0 flex-col gap-1 text-xs">
                <button type="button" disabled={pending || i === 0} onClick={() => run(() => moveImage(img.id, -1))} className="px-1 disabled:opacity-30" aria-label="Monter">↑</button>
                <button type="button" disabled={pending || i === images.length - 1} onClick={() => run(() => moveImage(img.id, 1))} className="px-1 disabled:opacity-30" aria-label="Descendre">↓</button>
              </span>
              <button type="button" disabled={pending} onClick={() => confirm("Supprimer cette image ?") && run(() => deleteImage(img.id))} className="text-xs text-clay">Suppr.</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((img, i) => (
            <div key={img.id} className="flex flex-col gap-1">
              <div className="relative aspect-square overflow-hidden rounded-xl bg-sand">
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
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={file}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (!files.length) return;
            // One picture per request, made lighter in the browser first: a phone photo
            // of 6 MB goes up as a few hundred kB, under the host's request limit.
            start(async () => {
              let error: string | null = null;
              for (const [n, f] of files.entries()) {
                setProgress(`Envoi ${n + 1}/${files.length}…`);
                const fd = new FormData();
                fd.append("kind", kind);
                fd.append("files", await shrinkForUpload(f, kind === "DETAIL" ? 16_000 : 3200));
                const r = await uploadImages(productId, fd);
                if (!r.ok) error = r.error;
              }
              setProgress(null);
              setErr(error);
              router.refresh();
            });
          }}
        />
        <button type="button" disabled={pending} className={btn.primary} onClick={() => file.current?.click()}>{pending ? (progress ?? "Envoi…") : k.add}</button>
      </div>
      <div className="mt-2 flex gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Ou coller le lien d'une image du fournisseur" className={input} />
        <button type="button" disabled={pending || !url} className={btn.ghost} onClick={() => run(async () => { const r = await importImage(productId, url, kind); if (r.ok) setUrl(""); return r; })}>Importer</button>
      </div>
      {err && <p className="mt-2 text-sm text-danger">{err}</p>}
    </Card>
  );
}
