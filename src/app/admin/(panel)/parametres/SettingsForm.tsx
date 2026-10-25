"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { Settings, Secrets } from "@/lib/settings-schema";
import { GOVERNORATES } from "@/lib/governorates";
import { parseTND, toInputTND } from "@/lib/money";
import { saveAll, uploadHero } from "./actions";
import { heroSlides, type HeroSlide } from "@/lib/settings-schema";
import { Card, btn, input, label } from "@/components/admin/ui";

type Targets = { categories: { slug: string; name: string }[]; products: { slug: string; name: string }[] };

export function SettingsForm({ initial, secretsSet, targets }: { initial: Settings; secretsSet: Record<keyof Secrets, boolean>; targets: Targets }) {
  const router = useRouter();
  // The single picture of before becomes the first banner of the list.
  const [s, setS] = useState<Settings>(() => ({ ...initial, hero: { ...initial.hero, slides: heroSlides(initial.hero), imageId: null } }));
  const [sec, setSec] = useState<Partial<Secrets>>({});
  const [fee, setFee] = useState(toInputTND(initial.delivery.fee));
  const [threshold, setThreshold] = useState(toInputTND(initial.delivery.freeThreshold));
  const [carrierCost, setCarrierCost] = useState(toInputTND(initial.costs?.carrierPerParcel ?? null));
  const [returnCost, setReturnCost] = useState(toInputTND(initial.costs?.returnPerParcel ?? null));
  const [bulk, setBulk] = useState({ min: "", max: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const up = <K extends keyof Settings>(k: K, patch: Partial<Settings[K]>) => setS((x) => ({ ...x, [k]: { ...x[k], ...patch } }));
  const text = <K extends keyof Settings>(k: K, f: keyof Settings[K] & string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => ({
    value: String(s[k][f] ?? ""),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => up(k, { [f]: e.target.value } as Partial<Settings[K]>),
    className: input,
    ...extra,
  });
  const check = <K extends keyof Settings>(k: K, f: keyof Settings[K] & string) => ({
    type: "checkbox" as const,
    checked: Boolean(s[k][f]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => up(k, { [f]: e.target.checked } as Partial<Settings[K]>),
    className: "h-5 w-5",
  });
  const secret = (k: keyof Secrets, title: string) => (
    <label className={label}>
      {title} {secretsSet[k] ? <span className="text-xs font-normal text-olive">· enregistré</span> : <span className="text-xs font-normal text-muted">· non renseigné</span>}
      <input type="password" autoComplete="off" placeholder={secretsSet[k] ? "laisser vide pour garder" : ""} value={sec[k] ?? ""} onChange={(e) => setSec({ ...sec, [k]: e.target.value })} className={input} />
    </label>
  );

  function save() {
    const deliveryFee = parseTND(fee);
    if (deliveryFee == null) return setMsg({ ok: false, text: "Frais de livraison invalides." });
    const ft = threshold.trim() ? parseTND(threshold) : null;
    if (threshold.trim() && ft == null) return setMsg({ ok: false, text: "Seuil de livraison offerte invalide." });
    const cc = carrierCost.trim() ? parseTND(carrierCost) : null;
    const rc = returnCost.trim() ? parseTND(returnCost) : null;
    if ((carrierCost.trim() && cc == null) || (returnCost.trim() && rc == null)) return setMsg({ ok: false, text: "Coût de transport invalide." });
    start(async () => {
      const r = await saveAll({ ...s, delivery: { ...s.delivery, fee: deliveryFee, freeThreshold: ft }, costs: { carrierPerParcel: cc, returnPerParcel: rc } }, sec);
      setMsg(r.ok ? { ok: true, text: "Paramètres enregistrés." } : { ok: false, text: r.error });
      if (r.ok) {
        setSec({});
        router.refresh();
      }
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title="Boutique">
        <div className="grid grid-cols-2 gap-2">
          <label className={label}>Nom<input {...text("shop", "name")} /></label>
          <label className={label}>Téléphone affiché<input {...text("shop", "phone")} /></label>
          <label className={`${label} col-span-2`}>Phrase d&apos;accroche<input {...text("shop", "tagline")} /></label>
          <label className={`${label} col-span-2`}>Phrase d&apos;accroche (arabe)<input dir="rtl" {...text("shop", "taglineAr")} /></label>
          {/* A cautious buyer checks who sells before a cash-on-delivery order: say it while it is missing. */}
          {(!s.shop.address.trim() || !s.shop.legalId.trim()) && (
            <p className="col-span-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Adresse (ou au moins la ville) et matricule fiscal manquent : ils s&apos;affichent en bas du site et sur la page Contact, et rassurent les clients qui hésitent.
            </p>
          )}
          <label className={`${label} col-span-2`}>Vendeur (nom de la société ou de la personne)<input {...text("shop", "legalName")} placeholder="Par défaut : le nom de la boutique" /></label>
          <label className={label}>E-mail<input {...text("shop", "email")} /></label>
          <label className={label}>Matricule fiscal / RNE<input {...text("shop", "legalId")} /></label>
          <label className={`${label} col-span-2`}>Adresse ou ville<input {...text("shop", "address")} /></label>
          <label className={label}>Instagram (adresse du profil, ou vide)<input {...text("shop", "instagram")} placeholder="https://www.instagram.com/votre.page" /></label>
          <label className={label}>Facebook (adresse de la page, ou vide)<input {...text("shop", "facebook")} placeholder="https://www.facebook.com/votre.page" /></label>
          <label className={label}>TikTok (adresse du profil, ou vide)<input {...text("shop", "tiktok")} placeholder="https://www.tiktok.com/@votre.page" /></label>
        </div>
      </Card>

      <Card title="Page d'accueil">
        <div className="grid gap-2">
          <label className={label}>Titre<input {...text("hero", "title")} /></label>
          <label className={label}>Titre (arabe)<input dir="rtl" {...text("hero", "titleAr")} /></label>
          <Banners
            slides={s.hero.slides}
            targets={targets}
            onChange={(slides) => up("hero", { slides })}
            onUpload={(f) =>
              start(async () => {
                const fd = new FormData();
                fd.append("file", f);
                const r = await uploadHero(fd);
                if (r.ok) setS((x) => ({ ...x, hero: { ...x.hero, slides: [...x.hero.slides, { imageId: r.id, link: "", alt: "", altAr: "" }].slice(0, 8) } }));
                else setMsg({ ok: false, text: r.error });
              })
            }
          />
          <p className="text-xs text-muted">Jusqu&apos;à 8 photos, qui défilent l&apos;une après l&apos;autre (format large, environ 1600 × 700 px : les bords peuvent être coupés sur téléphone). Sans photo, l&apos;accueil commence par la phrase de bienvenue puis les catégories. Enregistrez en bas de la page.</p>
        </div>
      </Card>

      <Card title="Contact client">
        <div className="grid grid-cols-2 gap-2">
          <label className={label}>WhatsApp (8 chiffres)<input {...text("contact", "whatsapp", { inputMode: "tel" })} /></label>
          <label className={label}>Messenger (nom d&apos;utilisateur de la page, celui de m.me/…, ou vide)<input {...text("contact", "messenger")} placeholder="votre.page" /></label>
        </div>
        <p className="mt-2 text-xs text-muted">Vide = les boutons WhatsApp disparaissent de la boutique.</p>
      </Card>

      <Card title="Commande et retours">
        <p className="text-xs text-muted">Le formulaire de commande de la fiche produit est en paiement à la livraison, sans e-mail.</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className={label}>Commandes / numéro / 24 h avant alerte<input type="number" min={1} max={20} value={s.checkout.maxOrdersPerPhonePerDay} onChange={(e) => up("checkout", { maxOrdersPerPhonePerDay: Math.max(1, Number(e.target.value) || 1) })} className={input} /></label>
          <label className={label}>Délai de retour (jours, 10 minimum)<input type="number" min={10} max={60} value={s.returns.days} onChange={(e) => up("returns", { days: Math.max(10, Number(e.target.value) || 10) })} className={input} /></label>
        </div>
      </Card>

      <Card title="Livraison" hint="Un seul tarif pour tous les gouvernorats : c'est ce que la boutique affiche et ce que le serveur facture. Les délais, par gouvernorat, sont des fourchettes en jours ouvrés après confirmation." className="xl:col-span-2">
        <div className="grid gap-2 sm:grid-cols-4">
          <label className={label}>Frais de livraison, tous les gouvernorats (DT)<input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="decimal" className={input} data-testid="delivery-fee" /></label>
          <label className={label}>Nom affiché<input {...text("delivery", "carrierName")} /></label>
          <label className={label}>Livraison offerte dès (DT, vide = jamais)<input value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="decimal" className={input} /></label>
          <label className="flex items-center gap-2 pt-5 text-sm"><input {...check("delivery", "openBeforePaying")} />Le client peut ouvrir le colis avant de payer</label>
        </div>
        {/* Private: only the analytics read them, to compute what the shop really keeps. */}
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className={label}>Ce que le transporteur vous facture par colis (DT, jamais affiché)<input value={carrierCost} onChange={(e) => setCarrierCost(e.target.value)} inputMode="decimal" className={input} placeholder="vide = inconnu" /></label>
          <label className={label}>Coût en plus d&apos;un colis refusé ou retourné (DT, jamais affiché)<input value={returnCost} onChange={(e) => setReturnCost(e.target.value)} inputMode="decimal" className={input} placeholder="vide = inconnu" /></label>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-cream p-3">
          <span className="text-xs text-muted">Délais pour tous :</span>
          <input placeholder="Min j" type="number" value={bulk.min} onChange={(e) => setBulk({ ...bulk, min: e.target.value })} className={`${input} w-20`} />
          <input placeholder="Max j" type="number" value={bulk.max} onChange={(e) => setBulk({ ...bulk, max: e.target.value })} className={`${input} w-20`} />
          <button
            type="button"
            className={btn.ghost}
            onClick={() => {
              const zones = { ...s.delivery.zones };
              for (const g of Object.keys(zones)) zones[g] = { ...zones[g], ...(bulk.min ? { minDays: Number(bulk.min) } : {}), ...(bulk.max ? { maxDays: Number(bulk.max) } : {}) };
              up("delivery", { zones });
            }}
          >
            Appliquer
          </button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead className="text-xs text-muted">
              <tr><th className="py-2 text-start">Gouvernorat</th><th className="text-start">Livré</th><th className="text-start">Min (j)</th><th className="text-start">Max (j)</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {GOVERNORATES.map((g) => {
                const z = s.delivery.zones[g.id];
                const setZ = (patch: Partial<typeof z>) => up("delivery", { zones: { ...s.delivery.zones, [g.id]: { ...z, ...patch } } });
                return (
                  <tr key={g.id}>
                    <td className="py-1.5">{g.id}</td>
                    <td><input type="checkbox" checked={z.enabled} onChange={(e) => setZ({ enabled: e.target.checked })} className="h-5 w-5" /></td>
                    <td><input type="number" min={0} max={30} value={z.minDays} onChange={(e) => setZ({ minDays: Number(e.target.value) || 0 })} className={`${input} w-20`} /></td>
                    <td><input type="number" min={0} max={30} value={z.maxDays} onChange={(e) => setZ({ maxDays: Number(e.target.value) || 0 })} className={`${input} w-20`} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Pixels publicitaires" hint="Chargés seulement si le visiteur accepte les cookies. Les jetons serveur (API Conversions) envoient les achats depuis le serveur, ce qui résiste aux bloqueurs.">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className={label}>Meta Pixel ID<input {...text("tracking", "metaPixelId")} /></label>
          {secret("metaCapiToken", "Meta — jeton API Conversions")}
          <label className={label}>TikTok Pixel ID<input {...text("tracking", "tiktokPixelId")} /></label>
          {secret("tiktokToken", "TikTok — jeton Events API")}
          <label className={label}>GA4 ID (G-…)<input {...text("tracking", "ga4Id")} /></label>
          {secret("ga4ApiSecret", "GA4 — secret Measurement Protocol")}
        </div>
        <label className={`${label} mt-3`}>
          Signaler l&apos;achat aux publicités
          <select value={s.tracking.purchaseAt} onChange={(e) => up("tracking", { purchaseAt: e.target.value as "placed" | "confirmed" | "delivered" })} className={input}>
            <option value="placed">Dès que la commande est passée</option>
            <option value="confirmed">Quand la commande est confirmée par téléphone</option>
            <option value="delivered">Quand la commande est livrée et payée</option>
          </select>
        </label>
        <p className="mt-1 text-xs text-muted">« Confirmée » : les publicités apprennent sur de vraies commandes, sans les faux numéros. « Livrée » : seulement sur les clients qui ont payé, ce qui compte en paiement à la livraison, mais il faut assez de livraisons par semaine pour que la publicité apprenne. Les achats arrivent plus tard dans le gestionnaire de publicités. Il faut le jeton API Conversions (Meta) ou Events API (TikTok) : le navigateur n&apos;est plus ouvert à ce moment-là.</p>
      </Card>

      <Card title="SMS et e-mails" hint="N'importe quelle passerelle SMS HTTP. Dans l'adresse et le corps : {to} (21622123456), {text}, {sender}, {key}. Sans passerelle, les messages sont gardés dans la commande pour un envoi manuel.">
        <div className="grid gap-2">
          <label className={label}>Adresse de la passerelle<input {...text("notify", "smsUrl")} placeholder="https://…/send?to={to}&text={text}&key={key}" /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className={label}>Méthode<select value={s.notify.smsMethod} onChange={(e) => up("notify", { smsMethod: e.target.value as "GET" | "POST" })} className={input}><option>GET</option><option>POST</option></select></label>
            <label className={label}>Expéditeur<input {...text("notify", "smsSender")} maxLength={11} /></label>
          </div>
          {s.notify.smsMethod === "POST" && <label className={label}>Corps JSON<input {...text("notify", "smsBody")} placeholder='{"to":"{to}","message":"{text}"}' /></label>}
          {secret("smsKey", "Clé de la passerelle")}
          <label className="flex items-center justify-between text-sm">SMS à la commande<input {...check("notify", "smsOnPlaced")} /></label>
          <label className="flex items-center justify-between text-sm">SMS à l&apos;expédition<input {...check("notify", "smsOnShipped")} /></label>
          <label className={label}>Recevoir chaque nouvelle commande à (votre e-mail)<input {...text("notify", "orderAlertTo")} placeholder={s.shop.email || "vous@exemple.com"} type="email" /></label>
          <p className="text-xs text-muted">Un seul e-mail, à vous seulement, à chaque nouvelle commande : client, téléphone, adresse, articles, total et lien vers la commande. Aucun e-mail n&apos;est envoyé aux clients. Vide : l&apos;e-mail de la boutique. Il faut aussi l&apos;expéditeur et la clé Resend ci-dessous (compte sur resend.com).</p>
          <label className={label}>E-mail expéditeur (Resend)<input {...text("notify", "emailFrom")} placeholder="Mena <commandes@mena.tn>" /></label>
          {secret("resendKey", "Clé API Resend")}
        </div>
      </Card>

      <Card title="Paiement par carte (Konnect)" hint="Non proposé aux clients : le formulaire de commande de la fiche produit est en paiement à la livraison, sans e-mail. Les identifiants ci-dessous restent enregistrés.">
        <div className="grid gap-2">
          <label className={label}>Konnect wallet ID<input {...text("payments", "konnectWalletId")} /></label>
          {secret("konnectApiKey", "Konnect — clé API")}
          <label className="flex items-center justify-between text-sm">Mode test (sandbox)<input {...check("payments", "konnectSandbox")} /></label>
        </div>
      </Card>

      <div className="sticky bottom-3 z-10 flex items-center gap-3 rounded-2xl border border-line bg-white/95 p-3 shadow-soft backdrop-blur xl:col-span-2">
        <button type="button" disabled={pending} onClick={save} className={btn.sea}>{pending ? "Enregistrement…" : "Enregistrer les paramètres"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-olive" : "text-danger"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

/** A link of a banner, chosen among the shop's pages, or typed. */
function LinkPicker({ value, targets, onChange }: { value: string; targets: Targets; onChange: (v: string) => void }) {
  const known = value === "" || value === "/boutique" || targets.categories.some((c) => `/categorie/${c.slug}` === value) || targets.products.some((p) => `/produit/${p.slug}` === value);
  const [typed, setTyped] = useState(!known);
  return (
    <div className="grid gap-1.5">
      <select
        aria-label="Lien de la photo"
        className={input}
        value={typed ? "custom" : value}
        onChange={(e) => {
          if (e.target.value === "custom") {
            setTyped(true);
            return;
          }
          setTyped(false);
          onChange(e.target.value);
        }}
      >
        <option value="">Sans lien</option>
        <option value="/boutique">Toute la boutique</option>
        <optgroup label="Catégories">
          {targets.categories.map((c) => <option key={c.slug} value={`/categorie/${c.slug}`}>{c.name}</option>)}
        </optgroup>
        <optgroup label="Produits en ligne">
          {targets.products.map((p) => <option key={p.slug} value={`/produit/${p.slug}`}>{p.name}</option>)}
        </optgroup>
        <option value="custom">Autre adresse (promotion, recherche…)</option>
      </select>
      {typed && <input className={input} value={value} onChange={(e) => onChange(e.target.value)} placeholder="/recherche?q=lampe ou https://…" aria-label="Adresse du lien" />}
    </div>
  );
}

/** The home page's banners: added, put in order, linked, removed. */
function Banners({ slides, targets, onChange, onUpload }: { slides: HeroSlide[]; targets: Targets; onChange: (s: HeroSlide[]) => void; onUpload: (f: File) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const set = (i: number, patch: Partial<HeroSlide>) => onChange(slides.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= slides.length) return;
    const next = [...slides];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-3" data-testid="banners">
      {slides.map((b, i) => (
        <div key={`${b.imageId}-${i}`} className="flex flex-col gap-2 rounded-xl border border-line p-3 sm:flex-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/img/${b.imageId}/256`} alt="" className="aspect-[16/7] w-full rounded-lg object-cover sm:w-48" />
          <div className="grid min-w-0 flex-1 gap-2">
            <LinkPicker value={b.link} targets={targets} onChange={(link) => set(i, { link })} />
            <div className="grid gap-2 sm:grid-cols-2">
              <input className={input} value={b.alt} onChange={(e) => set(i, { alt: e.target.value })} placeholder="Ce que montre la photo (français)" aria-label="Description de la photo" maxLength={120} />
              <input className={input} dir="rtl" value={b.altAr} onChange={(e) => set(i, { altAr: e.target.value })} placeholder="شنوّة في التصويرة" aria-label="Description de la photo (arabe)" maxLength={120} />
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="text-muted">Photo {i + 1}</span>
              <button type="button" className="text-sea underline disabled:opacity-40" disabled={i === 0} onClick={() => move(i, -1)}>Avant</button>
              <button type="button" className="text-sea underline disabled:opacity-40" disabled={i === slides.length - 1} onClick={() => move(i, 1)}>Après</button>
              <button type="button" className="text-clay underline" onClick={() => onChange(slides.filter((_, n) => n !== i))}>Retirer</button>
            </div>
          </div>
        </div>
      ))}
      <input
        ref={file}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = "";
        }}
      />
      {slides.length < 8 && (
        <button type="button" className={`${btn.ghost} self-start`} onClick={() => file.current?.click()}>
          {slides.length ? "Ajouter une photo d'accueil" : "Photo d'accueil"}
        </button>
      )}
    </div>
  );
}
