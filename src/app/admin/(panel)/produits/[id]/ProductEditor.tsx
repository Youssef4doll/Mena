"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useLayoutEffect, useOptimistic, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { deleteImage, deleteProduct, duplicateProduct, imagesChanged, moveImage, saveProduct, setImageAlt, setImageLang, translateTexts, type ProductInput } from "../actions";
import { mergeTranslation, needsTranslation, textsOfProduct, withProductTexts, type ProductTexts } from "@/lib/translate-merge";
import { parseTND, toInputTND, formatTND } from "@/lib/money";
import { offerCompareAt } from "@/lib/offer-display";
import { slugify } from "@/lib/slug";
import { parseSpecs, parseVideo } from "@/lib/product-content";
import { readHex } from "@/lib/color";
import { VIDEO_MAX_MB, VIDEO_TYPES, VIDEO_UPLOAD_URL, videoPath } from "@/lib/video-upload";
import { shrinkForUpload } from "@/lib/client/shrink-image";
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, productDescription, productTitle } from "@/lib/seo";
import { Badge, Card, btn, input, label } from "@/components/admin/ui";
import { afterSave, carriedDraft, carriedMessage, carryMessage, dropCarried, formKey, setUnsaved, type Held } from "./editor-state";
import { linksIn, pictureName, sendPictures, type Kind, type Outgoing, type SendResult } from "./send-pictures";

type Opt = { id: string; name: string; nameAr?: string | null };
/** The page a long picture shows on; null: both. */
type PicLang = "ar" | "fr" | null;
type Img = { id: string; mediaId: string; alt: string; kind: Kind; sort: number; lang: PicLang };

const EMPTY: ProductInput = {
  name: "", nameAr: "", slug: "", summary: "", summaryAr: "", description: "", descriptionAr: "", specs: "", specsAr: "", videoUrl: "", keywords: "", seoTitle: "", seoTitleAr: "", seoDescription: "", seoDescriptionAr: "", price: 0, compareAt: null, cost: null, categoryId: null, supplierId: null,
  supplierRef: "", supplierUrl: "", stockMode: "SUPPLIER", stockQty: 0, available: true, active: false, featured: false, variants: [], offers: [],
};

type Msg = { ok: boolean; text: string };
type Props = { id: string | null; version: string; initial: ProductInput | null; images: Img[]; categories: Opt[]; suppliers: Opt[]; shopName: string; siteUrl: string; everywhere: boolean; oldSlugs: string[]; aiReady: boolean;
  /** A Vercel Blob store is connected: videos can be sent from the computer. */
  videoReady: boolean;
  /** The product after this one in the list, for "Enregistrer, puis suivant" (null: the last one, or a new product). */
  nextId: string | null;
  /** The customer's delivery fee and what the carrier charges the shop (null: not given), for the margin of each offer. */
  shipping: { fee: number; carrier: number | null } };

/** A photo chosen before the product exists: shown from the device, sent after the first save. */
type Queued = { key: string; item: Outgoing; preview: string };
let queuedSeq = 0;

/** The text field that had the cursor when a save ended, put back once the form is drawn again from the saved rows. */
let refocus: { id: string; at: number; start: number | null; end: number | null } | null = null;

/** The browser's own fetch (called as a plain function) and the photo shrinking, for the pictures sent from here. */
const DEVICE = { fetch: (...a: Parameters<typeof fetch>) => fetch(...a), shrink: shrinkForUpload };
const EXPIRED = "Session expirée : reconnectez-vous, puis ajoutez de nouveau les photos non envoyées.";

/**
 * The form's state for a stored product. Prices and quantities are kept as
 * the text typed, checked on save, so a cleared field can be retyped.
 */
function formOf(initial: ProductInput | null) {
  const p = initial ?? EMPTY;
  return {
    p,
    money: { price: toInputTND(initial?.price || null), compareAt: toInputTND(initial?.compareAt), cost: toInputTND(initial?.cost) },
    vPrices: p.variants.map((v) => toInputTND(v.price)),
    oPrices: p.offers.map((o) => toInputTND(o.price)),
    oQty: p.offers.map((o) => String(o.quantity)),
  };
}
type FormState = ReturnType<typeof formOf>;

/** The message once a new product's photos are sent: the ones refused, by name, with the reason. */
function afterPictures(saved: string, sent: SendResult): Msg {
  if (sent.expired) return { ok: false, text: `${saved}\n${EXPIRED}` };
  if (sent.errors.length === 0) return { ok: true, text: saved };
  return { ok: false, text: `${saved}\nPhotos non ajoutées :\n${sent.errors.join("\n")}` };
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

/** A product to open after an action; `drawn` is the pictures list this page had before the action. */
type Leave = { to: string; drawn: Img[]; replace?: boolean };

/**
 * Keeps the save message; the form is keyed on `version` (id + updatedAt), so
 * each save remounts it from the saved rows: new offers and variants get their ids.
 * A message can also come from the product opened before ("Copie créée…").
 *
 * Another product opens after a save or a copy only once this page has been
 * drawn again from the action's answer, which brings new props. Opened
 * sooner, the router drops that answer and fetches the other product twice
 * before showing it.
 *
 * A form changed while its save was on its way is not drawn again: that
 * would drop what was typed meanwhile (see `afterSave`).
 */
export function ProductEditor(props: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg | null>(() => carriedMessage(props.id));
  useEffect(dropCarried, []);
  const [held, setHeld] = useState<Held>(null);
  const hold = (typed: boolean, at: string) => setHeld((h) => afterSave(h, typed, at));
  const [leave, setLeave] = useState<Leave | null>(null);
  const latest = useRef(props.images);
  const opened = useRef<Leave | null>(null);
  useEffect(() => {
    latest.current = props.images;
    if (!leave || leave.drawn === props.images || opened.current === leave) return;
    opened.current = leave;
    if (leave.replace) router.replace(leave.to);
    else router.push(leave.to);
  }, [leave, props.images, router]);
  return <Form key={formKey(held, props.version)} {...props} msg={msg} setMsg={setMsg} leaving={leave !== null} drawn={() => latest.current} leave={setLeave} hold={hold} />;
}

type FormProps = Props & {
  msg: Msg | null;
  setMsg: (m: Msg | null) => void;
  /** Told at the end of each save whether the form changed while it was on its way. */
  hold: (typed: boolean, at: string) => void;
  /** True from the end of a save or a copy until the other product opens. */
  leaving: boolean;
  /** The pictures list as last drawn, read just before an action. */
  drawn: () => Img[];
  leave: (l: Leave) => void;
};

function Form({ id, version, nextId, initial, images, categories, suppliers, shopName, siteUrl, everywhere, oldSlugs, aiReady, videoReady, shipping, msg, setMsg, leaving, drawn, leave, hold }: FormProps) {
  const router = useRouter();
  // A new product opens with what was typed during its first save, if anything was, and the address the server gave it.
  const [first] = useState(() => {
    const draft = carriedDraft(id) as FormState | undefined;
    return draft ? { ...draft, p: { ...draft.p, slug: draft.p.slug || (initial?.slug ?? "") } } : formOf(initial);
  });
  const [p, setP] = useState<ProductInput>(first.p);
  const [money, setMoney] = useState(first.money);
  const [vPrices, setVPrices] = useState<string[]>(first.vPrices);
  const [oPrices, setOPrices] = useState<string[]>(first.oPrices);
  const [oQty, setOQty] = useState<string[]>(first.oQty);
  // An offer whose price follows the product's: the units given away ("2 + 1" gives 1), or null once its price is typed by hand.
  const [oFree, setOFree] = useState<(number | null)[]>(() => first.oPrices.map(() => null));
  const [queued, setQueued] = useState<Queued[]>([]);
  // Read once, to tell which end dates have passed.
  const [now] = useState(() => Date.now());
  const [pending, start] = useTransition();
  const saving = pending || leaving;
  // Pictures on their way from a photo card: a save now would draw the cards again and lose what they report.
  const [sending, setSending] = useState(0);
  const busy = saving || sending > 0;
  const [progress, setProgress] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  // On by default; the choice is remembered in this browser (read after hydration, so the page never disagrees).
  const stored = useSyncExternalStore(noopSubscribe, readAuto, () => "1");
  const [autoPick, setAuto] = useState<boolean | null>(null);
  const auto = autoPick ?? stored !== "0";
  const set = <K extends keyof ProductInput>(k: K, v: ProductInput[K]) => setP((x) => ({ ...x, [k]: v }));

  // The form as loaded, to tell when it holds changes not saved yet (the typed prices included).
  const [loaded] = useState(() => JSON.stringify(formOf(initial)));
  // What was just saved, until the form remounts from the saved rows: the marker does not flash back meanwhile.
  const [savedAs, setSavedAs] = useState<string | null>(null);
  const snap = JSON.stringify({ p, money, vPrices, oPrices, oQty });
  // The form as last drawn, read when a save ends: what was typed while it was on its way.
  const onScreen = useRef<FormState>(first);
  useEffect(() => {
    onScreen.current = { p, money, vPrices, oPrices, oQty };
  });
  const dirty = queued.length > 0 || snap !== (savedAs ?? loaded);
  // The form as it was when the message appeared ("Traduction ajoutée…" comes with the change it describes).
  const [msgAt, setMsgAt] = useState({ msg, snap });
  if (msgAt.msg !== msg) setMsgAt({ msg, snap });

  // Closing or reloading the tab warns while something is not saved or pictures are still on their way; the links out of the editor ask too.
  const unsaved = dirty || sending > 0;
  useEffect(() => {
    setUnsaved(unsaved);
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      setUnsaved(false);
    };
  }, [unsaved]);

  // After Ctrl+S the form is drawn again from the saved rows: the cursor goes back where it was, to keep typing.
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const f = refocus;
    refocus = null;
    const el = f && f.id === id ? root.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")[f.at] : null;
    if (!el) return;
    el.focus({ preventScroll: true });
    try {
      el.setSelectionRange(f!.start, f!.end);
    } catch {}
  }, [id]);

  // Ctrl+S (⌘S on a Mac) saves the product instead of the browser saving the page.
  const onSaveKey = useEffectEvent((e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== "s") return;
    e.preventDefault();
    if (!busy) save();
  });
  useEffect(() => {
    const listen = (e: KeyboardEvent) => onSaveKey(e);
    window.addEventListener("keydown", listen);
    return () => window.removeEventListener("keydown", listen);
  }, []);

  // The previews of queued photos are the device's own files, released once removed or when the form closes.
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const all = previews.current;
    return () => all.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  function queue(add: Outgoing[]) {
    const more = add.map((item) => {
      const preview = "file" in item ? URL.createObjectURL(item.file) : item.url;
      if ("file" in item) previews.current.add(preview);
      return { key: `q${++queuedSeq}`, item, preview };
    });
    setQueued((q) => [...q, ...more]);
  }
  function unqueue(key: string) {
    const gone = queued.find((q) => q.key === key);
    if (gone && previews.current.delete(gone.preview)) URL.revokeObjectURL(gone.preview);
    setQueued((q) => q.filter((x) => x.key !== key));
  }
  /** Swaps a queued photo with the one before or after it among the photos of its kind. */
  function moveQueued(key: string, dir: -1 | 1) {
    setQueued((all) => {
      const at = all.findIndex((q) => q.key === key);
      if (at < 0) return all;
      let to = at + dir;
      while (to >= 0 && to < all.length && all[to].item.kind !== all[at].item.kind) to += dir;
      if (to < 0 || to >= all.length) return all;
      const b = [...all];
      [b[at], b[to]] = [b[to], b[at]];
      return b;
    });
  }

  /** Asks the server for the translation and puts it in the form; nothing is saved here. */
  async function translate(from: ProductInput, mode: "fill" | "to-ar"): Promise<ProductInput | null> {
    setTranslating(true);
    try {
      const r = await translateTexts(textsOfProduct(from), mode);
      if (!r.ok) {
        setMsg({ ok: false, text: r.error });
        return null;
      }
      const next = withProductTexts(from, r.texts);
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
    setOFree(up(oFree));
  };
  const removeOffer = (i: number) => {
    const rm = <T,>(a: T[]) => a.filter((_, j) => j !== i);
    set("offers", rm(p.offers));
    setOPrices(rm(oPrices));
    setOQty(rm(oQty));
    setOFree(rm(oFree));
  };
  /** The price of an offer that follows the product's: the units paid for, at the product price; empty until there is a price. */
  const followed = (qty: string | undefined, free: number, unit: number | null) => {
    const q = offerQty(qty);
    return unit && q ? toInputTND(Math.max(1, q - free) * unit) : "";
  };
  /** The product price changes: so do the offers that follow it. */
  const setPrice = (value: string) => {
    setMoney({ ...money, price: value });
    if (oFree.some((f) => f != null)) setOPrices(oPrices.map((x, i) => (oFree[i] != null ? followed(oQty[i], oFree[i]!, parseTND(value)) : x)));
  };

  /** Saves; with "next", then opens the next product of the list (at once when nothing changed). */
  function save(then?: "next") {
    if (then === "next" && nextId && !dirty) return router.push(`/admin/produits/${nextId}`);
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
      if (aiReady && auto && needsTranslation(textsOfProduct(p))) {
        const t = await translate(p, "fill");
        if (t) {
          texts = t;
          translated = true;
        }
      }
      let before = drawn();
      // The version this form was drawn from: a change saved elsewhere since then makes the server refuse, rather than undo it.
      const loadedAt = id ? Number(version.split(":")[1]) : undefined;
      const r = await saveProduct(id, { ...p, ...textsOfProduct(texts), price: priceM, compareAt: compareM, cost: costM, variants: variants.map((v, i) => ({ ...v, nameAr: texts.variants[i]?.nameAr ?? v.nameAr })), offers: offers.map((o, i) => ({ ...o, labelAr: texts.offers[i]?.labelAr ?? o.labelAr, label: texts.offers[i]?.label ?? o.label })) }, loadedAt);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      const saved = translated ? "Produit enregistré, avec la traduction automatique : relisez les textes en arabe." : (r.message ?? "Enregistré.");
      const sent = JSON.stringify({ p: texts, money, vPrices, oPrices, oQty });
      // Changed while the save was on its way: kept on screen, not saved yet (the marker says so), and the next product waits.
      const typed = JSON.stringify(onScreen.current) !== sent;
      if (id) {
        // The answer already holds this page drawn again from the saved rows: nothing to refresh.
        setSavedAs(sent);
        hold(typed, version);
        if (then !== "next" || !nextId || typed) {
          const el = document.activeElement;
          const at = root.current ? [...root.current.querySelectorAll("input, textarea")].indexOf(el as Element) : -1;
          if (!typed && at >= 0 && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) refocus = { id, at, start: el.selectionStart, end: el.selectionEnd };
          return setMsg({ ok: true, text: saved });
        }
        carryMessage(nextId, { ok: true, text: `« ${texts.name.trim()} » enregistré${translated ? ", avec la traduction automatique" : ""}.` });
        return leave({ to: `/admin/produits/${nextId}`, drawn: before });
      }
      if (!r.id) return setMsg({ ok: true, text: saved });
      // A new product: its photos follow in the order chosen, then its own page opens.
      let done: Msg = { ok: true, text: saved };
      if (queued.length > 0) {
        const sentPics = await sendPictures(r.id, queued.map((q) => q.item), { GALLERY: 0, DETAIL: 0 }, (n, total) => setProgress(`Envoi des photos ${n}/${total}…`), DEVICE);
        setProgress(null);
        // Signed out meanwhile: the page cannot be drawn again until the admin signs in, the message says so.
        if (sentPics.added > 0 && !sentPics.expired) {
          before = drawn();
          await imagesChanged();
        }
        done = afterPictures(saved, sentPics);
      }
      carryMessage(r.id, done, JSON.stringify(onScreen.current) !== sent ? onScreen.current : undefined);
      leave({ to: `/admin/produits/${r.id}`, drawn: before, replace: true });
    });
  }

  /** A copy of the product as saved, offline; its page opens. */
  function duplicate() {
    if (!id) return;
    if (dirty && !confirm("Les modifications non enregistrées ne seront pas dans la copie. Copier le produit tel qu'il est enregistré ?")) return;
    start(async () => {
      const before = drawn();
      const r = await duplicateProduct(id);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      if (!r.id) return;
      carryMessage(r.id, { ok: true, text: "Copie créée, hors ligne. Changez le nom et les photos si besoin." });
      leave({ to: `/admin/produits/${r.id}`, drawn: before });
    });
  }

  // A success message gives way to the marker once the form changes after it; an error stays.
  const shown = msg && !(msg.ok && dirty && snap !== msgAt.snap) ? msg : null;

  return (
    <div ref={root} className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card title="Texte" hint="La boutique s'affiche d'abord en arabe. Écrivez dans une langue : la traduction automatique écrit l'autre (en arabe tunisien), et les mots-clés de recherche. Relisez toujours ce qu'elle écrit.">
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-sea-soft p-2.5" data-testid="translate-bar">
              {aiReady ? (
                <>
                  <button type="button" disabled={translating || saving} className={btn.sea} onClick={() => translate(p, "fill").then((t) => t && setMsg({ ok: true, text: "Traduction ajoutée dans les champs vides. Relisez puis enregistrez." }))}>
                    {translating ? "Traduction…" : "Traduire ce qui manque"}
                  </button>
                  <button type="button" disabled={translating || saving} className={btn.ghost} onClick={() => confirm("Réécrire tous les textes arabes à partir du français ?") && translate(p, "to-ar").then((t) => t && setMsg({ ok: true, text: "Textes arabes réécrits depuis le français. Relisez puis enregistrez." }))}>
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
                <ManualTranslate
                  texts={textsOfProduct(p)}
                  todo={needsTranslation(textsOfProduct(p))}
                  onAnswer={(answer) => {
                    setP((x) => withProductTexts(x, mergeTranslation(textsOfProduct(x), answer, "fill")));
                    setMsg({ ok: true, text: "Traduction ajoutée dans les champs vides. Relisez puis enregistrez." });
                  }}
                />
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}><Required empty={p.name.trim().length < 2}>Nom (français)</Required><input className={`${input} ${p.name.trim().length < 2 ? MISSING : ""}`} value={p.name} onChange={(e) => set("name", e.target.value)} onBlur={() => !p.slug && set("slug", slugify(p.name))} /></label>
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
            <p className="-mt-1 text-xs text-muted">Affichée sous le formulaire de commande, juste après les images de description. Une ligne vide sépare deux paragraphes.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={label}>Caractéristiques (français)<textarea rows={5} className={`${input} h-auto py-2`} value={p.specs} onChange={(e) => set("specs", e.target.value)} placeholder={"Matière : inox\nDimensions : 32 × 20 cm\nDans la boîte : 1 lampe, 1 câble USB-C"} /></label>
              <label className={label}>Caractéristiques (arabe)<textarea rows={5} dir="rtl" className={`${input} h-auto py-2`} value={p.specsAr} onChange={(e) => set("specsAr", e.target.value)} placeholder={"المادة: إينوكس\nالقياس: 32 × 20 صم\nفي الكرطونة: لمبة وكابل USB-C"} /></label>
            </div>
            <p className="-mt-1 text-xs text-muted">
              Une par ligne, « nom : valeur ». {parseSpecs(p.specs).length > 0 && `${parseSpecs(p.specs).length} ligne(s) lue(s).`}
            </p>
            <label className={label}>
              Vidéo (facultatif)
              <input className={input} value={p.videoUrl} onChange={(e) => set("videoUrl", e.target.value)} placeholder="https://youtu.be/…, tiktok.com/@…/video/…, instagram.com/reel/…" dir="ltr" />
              <span className={`text-xs font-normal ${p.videoUrl.trim() && !parseVideo(p.videoUrl) ? "text-danger" : "text-muted"}`}>
                {p.videoUrl.trim() && !parseVideo(p.videoUrl)
                  ? "Lien non reconnu : l'adresse complète d'une vidéo YouTube, Vimeo, TikTok, Instagram ou Facebook (pas un lien court vm.tiktok.com ou fb.watch : ouvrez-le et copiez l'adresse affichée), ou l'adresse https d'un fichier .mp4 ou .m3u8."
                  : "Un lien YouTube, Vimeo, TikTok, Instagram ou Facebook, l'adresse d'un fichier .mp4 ou d'une vidéo .m3u8 (comme sur Amazon), ou une vidéo envoyée depuis l'ordinateur. Elle s'affiche en 2e position dans les photos, et ne se charge que si le client appuie dessus."}
              </span>
            </label>
            <VideoUpload ready={videoReady} name={p.slug || p.name} disabled={busy} onSent={(url) => set("videoUrl", url)} />
          </div>
        </Card>

        <Seo p={p} set={set} price={unitOffer ?? price ?? 0} category={categories.find((c) => c.id === p.categoryId) ?? null} shopName={shopName} siteUrl={siteUrl} everywhere={everywhere} oldSlugs={oldSlugs} />

        {(["GALLERY", "DETAIL"] as const).map((kind) =>
          id ? (
            <Images key={kind} productId={id} kind={kind} images={images.filter((i) => i.kind === kind)} saving={saving} onSending={(d) => setSending((n) => n + d)} />
          ) : (
            <QueuedImages key={kind} kind={kind} items={queued.filter((q) => q.item.kind === kind)} busy={busy} onAdd={queue} onMove={moveQueued} onRemove={unqueue} />
          ),
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
                      <input
                        type="number"
                        min={1}
                        max={50}
                        className={input}
                        aria-invalid={q == null}
                        value={oQty[i] ?? ""}
                        onChange={(e) => {
                          setOQty(oQty.map((x, j) => (j === i ? e.target.value : x)));
                          if (oFree[i] != null) setOPrices(oPrices.map((x, j) => (j === i ? followed(e.target.value, oFree[i]!, price) : x)));
                        }}
                      />
                      {q == null && <span className="text-xs font-normal text-danger">{oQty[i]?.trim() ? "Nombre entier de 1 à 50." : "Obligatoire."}</span>}
                    </label>
                    <label className={label}>
                      Prix total (DT)
                      <input
                        className={input}
                        inputMode="decimal"
                        placeholder={oFree[i] != null ? "le prix du produit d'abord" : "99,000"}
                        value={oPrices[i] ?? ""}
                        onChange={(e) => {
                          setOPrices(oPrices.map((x, j) => (j === i ? e.target.value : x)));
                          setOFree(oFree.map((x, j) => (j === i ? null : x)));
                        }}
                      />
                      {oFree[i] != null && (
                        <span className="text-xs font-normal text-muted">
                          Suit le prix du produit{oFree[i] ? ` (${pluralUnits(oFree[i]!)} offerte${oFree[i]! > 1 ? "s" : ""})` : ""} ; tapez un prix pour le fixer.
                        </span>
                      )}
                    </label>
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
                        {/* What one order of this offer leaves once the parcel is paid: the delivery the customer pays (none if offered), minus the carrier. */}
                        {cost != null && shipping.carrier != null && (() => {
                          const left = total + (o.freeDelivery ? 0 : shipping.fee) - cost * q - shipping.carrier;
                          return <span className={left > 0 ? "text-olive" : "text-danger font-medium"}> · après transport {formatTND(left)}</span>;
                        })()}
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
                  const qty = String(p.offers.length + 1);
                  set("offers", [...p.offers, { label: "", labelAr: "", quantity: p.offers.length + 1, price: 0, freeDelivery: false, endsOn: "", active: true }]);
                  // Filled with the product price for that quantity, to be lowered by hand for a discount.
                  setOPrices([...oPrices, followed(qty, 0, price)]);
                  setOQty([...oQty, qty]);
                  setOFree([...oFree, 0]);
                }}
              >
                + Ajouter une offre
              </button>
              {p.offers.length === 0 ? (
                <button
                  type="button"
                  className={btn.ghost}
                  onClick={() => {
                    // Names, quantities and prices filled at once; the prices follow the product price until one is typed by hand.
                    set("offers", [
                      { label: "1 unité", labelAr: "واحدة", quantity: 1, price: 0, freeDelivery: false, endsOn: "", active: true },
                      { label: "Achetez 2, la 3e offerte", labelAr: "الثانية", quantity: 3, price: 0, freeDelivery: true, endsOn: "", active: true },
                    ]);
                    setOPrices([followed("1", 0, price), followed("3", 1, price)]);
                    setOQty(["1", "3"]);
                    setOFree([0, 1]);
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
              <div key={v.id ?? `n${i}`} className="flex flex-col gap-2 rounded-xl border border-line p-2">
                {/* The names on their own line, wide enough to read; the colour, price and stock under them. */}
                <div className="grid grid-cols-2 gap-2">
                  <input className={input} placeholder="Nom (Noir / M)" value={v.name} onChange={(e) => set("variants", p.variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <input className={input} dir="rtl" placeholder="بالعربي (أكحل)" value={v.nameAr ?? ""} onChange={(e) => set("variants", p.variants.map((x, j) => (j === i ? { ...x, nameAr: e.target.value } : x)))} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-44"><ColorField name={v.name} value={v.colorHex ?? ""} onChange={(hex) => set("variants", p.variants.map((x, j) => (j === i ? { ...x, colorHex: hex } : x)))} /></span>
                  <input className={input.replace("w-full", "w-32")} placeholder="Prix (option)" inputMode="decimal" value={vPrices[i] ?? ""} onChange={(e) => setVPrices(vPrices.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Prix de ${v.name.trim() || "cette variante"}`} />
                  {p.stockMode === "TRACKED" ? (
                    <input className={input.replace("w-full", "w-24")} type="number" min={0} placeholder="Stock" value={v.stockQty} onChange={(e) => set("variants", p.variants.map((x, j) => (j === i ? { ...x, stockQty: Math.max(0, Number(e.target.value) || 0) } : x)))} aria-label={`Stock de ${v.name.trim() || "cette variante"}`} />
                  ) : (
                    <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={v.available} onChange={(e) => set("variants", p.variants.map((x, j) => (j === i ? { ...x, available: e.target.checked } : x)))} />Dispo</label>
                  )}
                  <span className="ms-auto flex items-center gap-1">
                    <button type="button" className="rounded-lg px-2 text-sm text-muted" onClick={() => { if (i === 0) return; const a = [...p.variants]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; const b = [...vPrices]; [b[i - 1], b[i]] = [b[i], b[i - 1]]; set("variants", a); setVPrices(b); }} aria-label="Monter">↑</button>
                    <button type="button" className="text-sm text-clay" onClick={() => { set("variants", p.variants.filter((_, j) => j !== i)); setVPrices(vPrices.filter((_, j) => j !== i)); }}>Retirer</button>
                  </span>
                </div>
              </div>
            ))}
            <button type="button" className={`${btn.ghost} self-start`} onClick={() => { set("variants", [...p.variants, { name: "", nameAr: "", colorHex: "", sku: "", price: null, stockQty: 0, available: true }]); setVPrices([...vPrices, ""]); }}>
              + Ajouter une variante
            </button>
          </div>
        </Card>
      </div>

      {/* Placed in the second column on a computer, with the save bar in the same cell (below). */}
      <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-start-1">
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
          {id && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
              <button type="button" disabled={busy} className={btn.ghost} onClick={duplicate}>Dupliquer</button>
              <button
                type="button"
                disabled={busy}
                className={btn.danger}
                onClick={() => {
                  if (!confirm("Supprimer ce produit ? Les commandes passées gardent leur détail.")) return;
                  start(async () => {
                    await deleteProduct(id);
                    // At once: the answer would draw this page again, without its product.
                    router.replace("/admin/produits");
                  });
                }}
              >
                Supprimer
              </button>
            </div>
          )}
        </Card>

        <Card title="Prix">
          <div className="grid grid-cols-2 gap-2">
            <label className={label}><Required empty={!((parseTND(money.price) ?? 0) > 0)}>Prix de vente (DT)</Required><input className={`${input} ${(parseTND(money.price) ?? 0) > 0 ? "" : MISSING}`} inputMode="decimal" placeholder="59,900" value={money.price} onChange={(e) => setPrice(e.target.value)} /></label>
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

      </div>

      {/*
        The save bar: a sibling of the two columns, so it stays at the bottom of the
        screen over the whole form, on a phone too; on a computer it shares the second
        column's cell, at its end.
      */}
      <div data-testid="save-bar" className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-2xl border border-line bg-white/95 p-3 shadow-soft backdrop-blur lg:col-start-2 lg:row-start-1 lg:self-end">
        {shown && <p role="status" className={`max-h-28 overflow-y-auto whitespace-pre-line text-sm ${shown.ok ? "text-olive" : "text-danger"}`}>{shown.text}</p>}
        {dirty && !busy && <span className="self-start"><Badge tone="warn">Modifications non enregistrées</Badge></span>}
        <button type="button" disabled={busy} onClick={() => save()} className={btn.sea}>{pending ? (progress ?? "Enregistrement…") : leaving ? "Ouverture…" : sending > 0 ? "Envoi des photos…" : "Enregistrer"}</button>
        {nextId && (
          <button type="button" disabled={busy} onClick={() => save("next")} className={btn.ghost}>
            Enregistrer, puis suivant
          </button>
        )}
        <p className="hidden text-center text-xs text-muted lg:block">Ctrl+S (⌘S sur Mac) enregistre aussi.</p>
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
        {/* min-w-0: a long address is cut by its own line, not by making the card wider than a phone. */}
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          {(["ar", "fr"] as const).map((lang) => {
            const g = preview(lang);
            return (
              <div key={lang} className="min-w-0 rounded-xl border border-line bg-white p-3" dir={lang === "ar" ? "rtl" : "ltr"}>
                <p className="text-[11px] uppercase tracking-wide text-muted" dir="ltr">Aperçu Google · {lang === "ar" ? "arabe" : "français"}</p>
                <p className="mt-1 truncate text-xs text-[#202124]" dir="ltr">{g.url}</p>
                <p className="mt-0.5 break-words text-[17px] leading-snug text-[#1a0dab]">{g.title}</p>
                <p className="mt-0.5 break-words text-[13px] leading-snug text-[#4d5156]">{g.description}</p>
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
    none: "Aucune photo pour le moment.",
  },
  DETAIL: {
    title: "Images de description (longues)",
    hint: "Les grandes images verticales qui expliquent le produit (avantages, mode d'emploi, dimensions), comme sur Amazon. Elles s'affichent l'une sous l'autre, en pleine largeur, sous le formulaire de commande. Largeur conseillée 1080 à 1600 px.",
    tip: "Conseil : 3 à 5 images, l'avantage principal sur la première, en arabe pour la page arabe. Sur une image de 1200 px de large, un texte d'au moins 53 px de haut (il se lit alors à 16 px sur un téléphone) ; idéalement pas plus de 2 fois plus haute que large.",
    add: "Ajouter des images de description",
    none: "Aucune image de description pour le moment.",
  },
} as const;

/**
 * The pictures of one kind, in their order: squares with the main photo
 * first for the top of the page, tall strips for the description images.
 * Every button is a full finger wide.
 */
function PictureList({ kind, items, busy, onMove, onRemove, onAlt, onLang }: {
  kind: Kind;
  items: { key: string; src: string; alt?: string; caption?: string; remote?: boolean; lang?: PicLang }[];
  busy: boolean;
  onMove: (key: string, dir: -1 | 1) => void;
  onRemove: (key: string) => void;
  onAlt?: (key: string, alt: string) => void;
  /** Long pictures only: the page each one shows on. */
  onLang?: (key: string, lang: PicLang) => void;
}) {
  const step = "flex h-10 w-10 items-center justify-center rounded-lg text-sm disabled:opacity-30";
  if (kind === "DETAIL")
    return (
      <div className="flex flex-col gap-2">
        {items.map((it, i) => (
          <div key={it.key} className="flex items-center gap-2 rounded-xl border border-line p-2">
            <Thumb src={it.src} remote={it.remote} className="h-24 w-16 shrink-0 rounded-lg bg-sand object-cover object-top" />
            {onAlt ? (
              <span className="flex min-w-0 flex-1 flex-col gap-2">
                <input defaultValue={it.alt} aria-label="Ce que dit l'image" placeholder="Ce que dit l'image (pour les malvoyants et Google)" className="h-10 min-w-0 rounded-lg border border-line px-2 text-xs" onBlur={(e) => e.target.value !== it.alt && onAlt(it.key, e.target.value)} />
                {onLang && (
                  <label className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
                    Langue
                    <select value={it.lang ?? ""} onChange={(e) => onLang(it.key, e.target.value === "ar" || e.target.value === "fr" ? e.target.value : null)} className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-white px-2 text-xs text-ink">
                      <option value="">Les deux</option>
                      <option value="ar">Arabe</option>
                      <option value="fr">Français</option>
                    </select>
                  </label>
                )}
              </span>
            ) : (
              <span className="min-w-0 flex-1 truncate text-xs text-muted">{it.caption}</span>
            )}
            <span className="flex shrink-0 flex-col">
              <button type="button" disabled={busy || i === 0} onClick={() => onMove(it.key, -1)} className={step} aria-label="Monter">↑</button>
              <button type="button" disabled={busy || i === items.length - 1} onClick={() => onMove(it.key, 1)} className={step} aria-label="Descendre">↓</button>
            </span>
            <button type="button" disabled={busy} onClick={() => onRemove(it.key)} className="h-10 shrink-0 px-2 text-xs text-clay disabled:opacity-30">Suppr.</button>
          </div>
        ))}
      </div>
    );
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {items.map((it, i) => (
        <div key={it.key} className="flex min-w-0 flex-col gap-1">
          <div className="relative aspect-square overflow-hidden rounded-xl bg-sand">
            <Thumb src={it.src} remote={it.remote} className="h-full w-full object-cover" />
            {i === 0 && <span className="absolute start-1 top-1 rounded-full bg-ink px-1.5 text-[10px] text-white">Principale</span>}
            <button type="button" disabled={busy} onClick={() => onRemove(it.key)} aria-label="Supprimer cette photo" className="absolute end-0 top-0 flex h-10 w-10 items-center justify-center disabled:opacity-30">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-base leading-none text-clay shadow-soft">×</span>
            </button>
          </div>
          <div className="flex justify-between">
            <button type="button" disabled={busy || i === 0} onClick={() => onMove(it.key, -1)} className={step} aria-label="Plus tôt">←</button>
            <button type="button" disabled={busy || i === items.length - 1} onClick={() => onMove(it.key, 1)} className={step} aria-label="Plus tard">→</button>
          </div>
          {onAlt && <input defaultValue={it.alt} aria-label="Texte alternatif" placeholder="Texte alternatif" className="h-10 min-w-0 rounded-lg border border-line px-2 text-xs" onBlur={(e) => e.target.value !== it.alt && onAlt(it.key, e.target.value)} />}
        </div>
      ))}
    </div>
  );
}

/**
 * One small picture. A link pasted before the first save is shown as it is;
 * a share link opens a page, not a picture, so it says so instead of a
 * broken image: the server reads the picture behind it on the save.
 */
function Thumb({ src, remote, className }: { src: string; remote?: boolean; className: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className={`${className} flex items-center justify-center p-1 text-center text-[10px] text-muted`}>Pas d&apos;aperçu</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" referrerPolicy={remote ? "no-referrer" : undefined} className={className} onError={() => setFailed(true)} />;
}

/** The two ways to add pictures: files from the device (several at once), or links pasted. */
function AddPictures({ text, busy, progress, onFiles, onLinks }: { text: string; busy: boolean; progress: string | null; onFiles: (files: File[]) => void; onLinks: (urls: string[], clear: () => void) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [bad, setBad] = useState(false);
  return (
    <>
      <input
        ref={file}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
      <button type="button" disabled={busy} className={`${btn.primary} mt-3`} onClick={() => file.current?.click()}>{busy && progress ? progress : text}</button>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const links = linksIn(url);
          if (!links) return setBad(true);
          onLinks(links, () => setUrl(""));
        }}
      >
        <input value={url} onChange={(e) => { setUrl(e.target.value); setBad(false); }} aria-label="Lien d'une image" placeholder="Ou collez un lien" inputMode="url" className={input} />
        <button type="submit" disabled={busy || !url.trim()} className={btn.ghost}>Importer</button>
      </form>
      <p className={`mt-1 text-xs ${bad ? "text-danger" : "text-muted"}`}>
        {bad
          ? "Collez une adresse qui commence par https://, ou plusieurs séparées par un espace."
          : "Lien du fournisseur, de Google Drive ou de Dropbox (fichier partagé avec « tous ceux qui ont le lien »). Plusieurs liens : séparés par un espace."}
      </p>
    </>
  );
}

/**
 * The pictures of a saved product. New ones go through the images route,
 * three at a time, then one call draws the page again with all of them;
 * moving, describing or deleting one answers with the page drawn again.
 * The form waits for the pictures before saving, and the card waits for the
 * save: a save draws the form again, and this card's messages with it.
 */
function Images({ productId, images, kind, saving, onSending }: { productId: string; images: Img[]; kind: Kind; saving: boolean; onSending: (d: 1 | -1) => void }) {
  const [errors, setErrors] = useState<string[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [own, start] = useTransition();
  const pending = own || saving;
  // A language picked shows at once, and goes back to the saved one if the save fails.
  const [shownImages, pickLang] = useOptimistic(images, (list, c: { id: string; lang: PicLang }) => list.map((i) => (i.id === c.id ? { ...i, lang: c.lang } : i)));
  // A page left with no long picture at all, said under the list (the shop may want it so).
  const bare = kind === "DETAIL" && images.length > 0 ? (["ar", "fr"] as const).filter((l) => !shownImages.some((i) => !i.lang || i.lang === l)) : [];
  const k = KIND[kind];
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setErrors(r.ok ? [] : [r.error ?? "Erreur."]);
    });
  const add = (items: Outgoing[], clear?: () => void) => {
    // Told before the transition starts: an update made inside it would show only once the pictures are sent.
    onSending(1);
    start(async () => {
      try {
        setNote(null);
        // After the last place used, even when a deleted picture left a gap.
        const after = images.reduce((n, i) => Math.max(n, i.sort + 1), 0);
        const r = await sendPictures(productId, items, { GALLERY: after, DETAIL: after }, (n, total) => setProgress(`Envoi ${n}/${total}…`), DEVICE);
        setProgress(null);
        if (r.added > 0 && !r.expired) await imagesChanged();
        setErrors(r.expired ? [EXPIRED] : r.errors);
        if (r.skipped > 0) setNote(r.skipped === 1 ? "Cette image est déjà dans le produit." : `${r.skipped} images étaient déjà dans le produit.`);
        if (!r.expired && r.errors.length === 0) clear?.();
      } finally {
        onSending(-1);
      }
    });
  };
  return (
    <Card title={k.title} hint={k.hint}>
      {"tip" in k && <p className="-mt-1 mb-2 text-xs text-muted">{k.tip}</p>}
      {images.length === 0 && <p className="text-sm text-muted">{k.none}</p>}
      <PictureList
        kind={kind}
        items={shownImages.map((img) => ({ key: img.id, src: `/api/img/${img.mediaId}/256`, alt: img.alt, lang: img.lang }))}
        busy={pending}
        onMove={(key, dir) => run(() => moveImage(key, dir))}
        onRemove={(key) => confirm(kind === "DETAIL" ? "Supprimer cette image ?" : "Supprimer cette photo ?") && run(() => deleteImage(key))}
        onAlt={(key, alt) => run(() => setImageAlt(key, alt))}
        onLang={
          kind === "DETAIL"
            ? (key, lang) =>
                run(() => {
                  pickLang({ id: key, lang });
                  return setImageLang(key, lang);
                })
            : undefined
        }
      />
      {bare.length > 0 && <p className="mt-2 text-xs text-muted">Aucune ne s&apos;affiche sur la page {bare[0] === "ar" ? "arabe" : "française"}.</p>}
      <AddPictures text={k.add} busy={pending} progress={progress} onFiles={(files) => add(files.map((file) => ({ kind, file })))} onLinks={(urls, clear) => add(urls.map((url) => ({ kind, url })), clear)} />
      {note && <p className="mt-2 text-sm text-muted">{note}</p>}
      {errors.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-sm text-danger">
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
    </Card>
  );
}

/** The photos of a product not saved yet: previews from the device, sent in this order on the first save. */
function QueuedImages({ kind, items, busy, onAdd, onMove, onRemove }: { kind: Kind; items: Queued[]; busy: boolean; onAdd: (add: Outgoing[]) => void; onMove: (key: string, dir: -1 | 1) => void; onRemove: (key: string) => void }) {
  const k = KIND[kind];
  return (
    <Card title={k.title} hint={k.hint}>
      {"tip" in k && <p className="-mt-1 mb-2 text-xs text-muted">{k.tip}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-muted">{k.none}</p>
      ) : (
        <>
          <PictureList kind={kind} items={items.map((q) => ({ key: q.key, src: q.preview, caption: pictureName(q.item), remote: "url" in q.item }))} busy={busy} onMove={onMove} onRemove={onRemove} />
          <p className="mt-2 text-xs text-muted">Envoyées au premier enregistrement du produit.</p>
        </>
      )}
      <AddPictures text={k.add} busy={busy} progress={null} onFiles={(files) => onAdd(files.map((file) => ({ kind, file })))} onLinks={(urls, clear) => { onAdd(urls.map((url) => ({ kind, url }))); clear(); }} />
    </Card>
  );
}

type Prompt = typeof import("@/lib/translate-prompt");

/**
 * Translation without an API key: the request is copied, pasted into any chat
 * assistant (claude.ai, free), and its reply pasted back here. Only the empty
 * fields are filled, as with the automatic translation; nothing is saved.
 * The request and the reading of the reply load when the panel opens: they
 * are not needed to edit a product, and keep the editor lighter.
 */
function ManualTranslate({ texts, todo, onAnswer }: { texts: ProductTexts; todo: boolean; onAnswer: (t: ProductTexts) => void }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reply, setReply] = useState("");
  const [bad, setBad] = useState(false);
  const [offline, setOffline] = useState(false);
  const prompt = useRef<Prompt | null>(null);

  /** The helpers, loaded once; already there when the panel has been open a moment, so the copy stays within the tap. */
  async function helpers(): Promise<Prompt | null> {
    try {
      prompt.current ??= await import("@/lib/translate-prompt");
      setOffline(false);
      return prompt.current;
    } catch {
      setOffline(true);
      return null;
    }
  }

  async function copy() {
    const m = prompt.current ?? (await helpers());
    if (!m) return;
    const text = m.manualRequest(texts, "fill");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setShown(null);
    } catch {
      // No clipboard (old browser, page not in https): the text is shown to copy by hand.
      setShown(text);
    }
  }

  if (!open)
    return (
      <>
        <p className="text-sm text-ink-2">Pas de traduction automatique (pas de clé <code>ANTHROPIC_API_KEY</code>).</p>
        <button
          type="button"
          className={btn.sea}
          onClick={() => {
            setOpen(true);
            void helpers();
          }}
          disabled={!todo}
        >
          {todo ? "Traduire avec claude.ai (gratuit)" : "Rien à traduire"}
        </button>
      </>
    );
  return (
    <div className="grid w-full gap-2 text-sm text-ink-2">
      <p>
        1. <button type="button" className={btn.sea} onClick={copy}>{copied ? "Demande copiée" : "Copier la demande"}</button>
      </p>
      {shown && <textarea readOnly aria-label="Demande à copier" className={`${input} h-28 font-mono text-xs`} value={shown} onFocus={(e) => e.currentTarget.select()} />}
      <p>
        2. Ouvrez <a href="https://claude.ai/new" target="_blank" rel="noopener" className="text-sea underline underline-offset-4">claude.ai</a> (ou une autre IA), collez la demande et envoyez-la.
      </p>
      <p>3. Copiez toute sa réponse et collez-la ici :</p>
      <textarea
        aria-label="Réponse de l'IA"
        className={`${input} h-28 font-mono text-xs`}
        dir="auto"
        value={reply}
        onChange={(e) => {
          setReply(e.target.value);
          setBad(false);
        }}
      />
      {bad && <p className="text-danger">{"Réponse illisible : copiez toute la réponse, du premier « { » au dernier « } »."}</p>}
      {offline && <p className="text-danger">Chargement impossible : vérifiez la connexion, puis réessayez.</p>}
      <div className="flex gap-2">
        <button
          type="button"
          className={btn.sea}
          disabled={!reply.trim()}
          onClick={async () => {
            const m = prompt.current ?? (await helpers());
            if (!m) return;
            const answer = m.readManualAnswer(reply);
            if (!answer) return setBad(true);
            onAnswer(answer);
            setOpen(false);
            setReply("");
            setCopied(false);
          }}
        >
          Mettre la traduction dans les champs
        </button>
        <button type="button" className={btn.ghost} onClick={() => setOpen(false)}>Fermer</button>
      </div>
    </div>
  );
}

/** A required field still empty: tinted red, with "obligatoire", so it is seen before saving. */
const MISSING = "!border-danger/60 !bg-[#fdf0ee]";
function Required({ empty, children }: { empty: boolean; children: React.ReactNode }) {
  return (
    <span className="flex items-baseline justify-between gap-2">
      {children}
      {empty && <span className="text-xs font-normal text-danger">obligatoire</span>}
    </span>
  );
}

/**
 * A variant's colour: the picker, and its code to type or paste (#1f2937).
 * Empty: no dot in the shop (a size, a model). A code that cannot be read
 * stays as typed and is refused on save, like every other field.
 */
function ColorField({ name, value, onChange }: { name: string; value: string; onChange: (hex: string) => void }) {
  const hex = readHex(value);
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <input
        type="color"
        value={hex ?? "#ffffff"}
        onChange={(e) => onChange(e.target.value)}
        aria-label={`Couleur de ${name.trim() || "cette variante"}`}
        className={`h-10 w-10 shrink-0 cursor-pointer rounded-lg border bg-white p-1 ${hex ? "border-line" : "border-dashed border-field"}`}
      />
      <input
        className={`${input} min-w-0 font-mono text-xs ${value && !hex ? "!border-danger" : ""}`}
        dir="ltr"
        placeholder="Couleur #…"
        value={value}
        onChange={(e) => onChange(e.target.value.trim())}
        onBlur={() => hex && hex !== value && onChange(hex)}
        aria-label={`Code couleur de ${name.trim() || "cette variante"}`}
        aria-invalid={Boolean(value && !hex)}
      />
    </span>
  );
}

/** "1 unité", "2 unités". */
function pluralUnits(n: number) {
  return `${n} unité${n > 1 ? "s" : ""}`;
}

/**
 * A video from the computer: sent straight to Vercel Blob (see lib/video-upload),
 * then its address goes in the field above and is saved with the product.
 * Without a Blob store connected, it says how to connect one.
 */
function VideoUpload({ ready, name, disabled, onSent }: { ready: boolean; name: string; disabled: boolean; onSent: (url: string) => void }) {
  const [state, setState] = useState<{ pct: number } | { error: string } | null>(null);
  const sending = state != null && "pct" in state;
  async function send(file: File) {
    const path = videoPath(name || file.name, file.type);
    if (!path) return setState({ error: "Vidéo .mp4, .webm ou .mov seulement." });
    if (file.size > VIDEO_MAX_MB * 1024 * 1024) return setState({ error: `${VIDEO_MAX_MB} Mo au plus : raccourcissez ou compressez la vidéo.` });
    setState({ pct: 0 });
    try {
      const { upload } = await import("@vercel/blob/client");
      const blob = await upload(path, file, { access: "public", handleUploadUrl: VIDEO_UPLOAD_URL, contentType: file.type, multipart: file.size > 8 * 1024 * 1024, onUploadProgress: ({ percentage }) => setState({ pct: Math.round(percentage) }) });
      onSent(blob.url);
      setState(null);
    } catch (e) {
      setState({ error: `Envoi impossible : ${e instanceof Error ? e.message : "réessayez."}` });
    }
  }
  if (!ready)
    return (
      <p className="-mt-1 text-xs text-muted">
        Envoyer une vidéo depuis l&apos;ordinateur : connectez d&apos;abord un stockage Vercel Blob au projet (Vercel → projet → Storage → Create → Blob → Connect), puis redéployez. En attendant, collez un lien.
      </p>
    );
  return (
    <div className="-mt-1 flex flex-wrap items-center gap-2 text-sm">
      <label className={`${btn.ghost} cursor-pointer ${sending || disabled ? "pointer-events-none opacity-60" : ""}`}>
        Envoyer une vidéo depuis l&apos;ordinateur
        <input
          type="file"
          accept={VIDEO_TYPES.join(",")}
          className="sr-only"
          disabled={sending || disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void send(f);
          }}
        />
      </label>
      {state && "pct" in state && <span className="text-muted">Envoi… {state.pct} %</span>}
      {state && "error" in state && <span className="text-danger">{state.error}</span>}
      {!state && <span className="text-xs text-muted">.mp4 de préférence (les .mov d&apos;iPhone ne passent pas sur tous les téléphones), {VIDEO_MAX_MB} Mo au plus.</span>}
    </div>
  );
}
