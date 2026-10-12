"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { Settings, Secrets } from "@/lib/settings-schema";
import { GOVERNORATES } from "@/lib/governorates";
import { parseTND, toInputTND } from "@/lib/money";
import { saveAll, uploadHero } from "./actions";
import { Card, btn, input, label } from "@/components/admin/ui";

export function SettingsForm({ initial, secretsSet }: { initial: Settings; secretsSet: Record<keyof Secrets, boolean> }) {
  const router = useRouter();
  const [s, setS] = useState<Settings>(initial);
  const [sec, setSec] = useState<Partial<Secrets>>({});
  const [fees, setFees] = useState<Record<string, string>>(Object.fromEntries(Object.entries(initial.delivery.zones).map(([g, z]) => [g, toInputTND(z.fee)])));
  const [threshold, setThreshold] = useState(toInputTND(initial.delivery.freeThreshold));
  const [bulk, setBulk] = useState({ fee: "", min: "", max: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const heroFile = useRef<HTMLInputElement>(null);

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
    const zones = { ...s.delivery.zones };
    for (const g of Object.keys(zones)) {
      const fee = parseTND(fees[g] ?? "");
      if (fee == null) return setMsg({ ok: false, text: `Frais de livraison invalides pour ${g}.` });
      zones[g] = { ...zones[g], fee };
    }
    const ft = threshold.trim() ? parseTND(threshold) : null;
    if (threshold.trim() && ft == null) return setMsg({ ok: false, text: "Seuil de livraison offerte invalide." });
    start(async () => {
      const r = await saveAll({ ...s, delivery: { ...s.delivery, zones, freeThreshold: ft } }, sec);
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
          <label className={label}>E-mail<input {...text("shop", "email")} /></label>
          <label className={label}>Matricule fiscal / RNE<input {...text("shop", "legalId")} /></label>
          <label className={`${label} col-span-2`}>Adresse<input {...text("shop", "address")} /></label>
          <label className={label}>Instagram (lien)<input {...text("shop", "instagram")} /></label>
          <label className={label}>Facebook (lien)<input {...text("shop", "facebook")} /></label>
          <label className={label}>TikTok (lien)<input {...text("shop", "tiktok")} /></label>
        </div>
      </Card>

      <Card title="Page d'accueil">
        <div className="grid gap-2">
          <label className={label}>Titre<input {...text("hero", "title")} /></label>
          <label className={label}>Titre (arabe)<input dir="rtl" {...text("hero", "titleAr")} /></label>
          <label className={label}>Sous-titre<input {...text("hero", "subtitle")} /></label>
          <label className={label}>Sous-titre (arabe)<input dir="rtl" {...text("hero", "subtitleAr")} /></label>
          <div className="flex items-center gap-3">
            {s.hero.imageId && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/img/${s.hero.imageId}/128`} alt="" className="h-20 w-16 rounded-lg object-cover" />
            )}
            <input
              ref={heroFile}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const fd = new FormData();
                fd.append("file", f);
                start(async () => {
                  const r = await uploadHero(fd);
                  if (r.ok) up("hero", { imageId: r.id });
                  else setMsg({ ok: false, text: r.error });
                });
              }}
            />
            <button type="button" className={btn.ghost} onClick={() => heroFile.current?.click()}>Photo d&apos;accueil</button>
            {s.hero.imageId && <button type="button" className="text-sm text-clay underline" onClick={() => up("hero", { imageId: null })}>Retirer</button>}
          </div>
          <p className="text-xs text-muted">Sans photo, l&apos;accueil montre le premier produit de « Notre sélection ».</p>
        </div>
      </Card>

      <Card title="Contact client">
        <div className="grid grid-cols-2 gap-2">
          <label className={label}>WhatsApp (8 chiffres)<input {...text("contact", "whatsapp", { inputMode: "tel" })} /></label>
          <label className={label}>Messenger (nom de la page)<input {...text("contact", "messenger")} /></label>
        </div>
        <p className="mt-2 text-xs text-muted">Vide = les boutons WhatsApp disparaissent de la boutique.</p>
      </Card>

      <Card title="Commande et retours">
        <label className="flex items-center justify-between py-1 text-sm">Demander l&apos;e-mail (toujours facultatif)<input {...check("checkout", "askEmail")} /></label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className={label}>Commandes / numéro / 24 h avant alerte<input type="number" min={1} max={20} value={s.checkout.maxOrdersPerPhonePerDay} onChange={(e) => up("checkout", { maxOrdersPerPhonePerDay: Math.max(1, Number(e.target.value) || 1) })} className={input} /></label>
          <label className={label}>Délai de retour (jours, 10 minimum)<input type="number" min={10} max={60} value={s.returns.days} onChange={(e) => up("returns", { days: Math.max(10, Number(e.target.value) || 10) })} className={input} /></label>
        </div>
      </Card>

      <Card title="Livraison" hint="Frais et délais par gouvernorat : c'est ce que la fiche produit affiche et ce que le serveur facture. Les délais sont des fourchettes en jours ouvrés après confirmation." className="xl:col-span-2">
        <div className="grid gap-2 sm:grid-cols-3">
          <label className={label}>Nom affiché<input {...text("delivery", "carrierName")} /></label>
          <label className={label}>Livraison offerte dès (DT, vide = jamais)<input value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="decimal" className={input} /></label>
          <label className="flex items-center gap-2 pt-5 text-sm"><input {...check("delivery", "openBeforePaying")} />Le client peut ouvrir le colis avant de payer</label>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-cream p-3">
          <span className="text-xs text-muted">Appliquer à tous :</span>
          <input placeholder="Frais DT" value={bulk.fee} onChange={(e) => setBulk({ ...bulk, fee: e.target.value })} className={`${input} w-24`} />
          <input placeholder="Min j" type="number" value={bulk.min} onChange={(e) => setBulk({ ...bulk, min: e.target.value })} className={`${input} w-20`} />
          <input placeholder="Max j" type="number" value={bulk.max} onChange={(e) => setBulk({ ...bulk, max: e.target.value })} className={`${input} w-20`} />
          <button
            type="button"
            className={btn.ghost}
            onClick={() => {
              if (bulk.fee) setFees(Object.fromEntries(Object.keys(fees).map((g) => [g, bulk.fee])));
              const zones = { ...s.delivery.zones };
              for (const g of Object.keys(zones)) zones[g] = { ...zones[g], ...(bulk.min ? { minDays: Number(bulk.min) } : {}), ...(bulk.max ? { maxDays: Number(bulk.max) } : {}) };
              up("delivery", { zones });
            }}
          >
            Appliquer
          </button>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-xs text-muted">
              <tr><th className="py-2 text-start">Gouvernorat</th><th className="text-start">Livré</th><th className="text-start">Frais (DT)</th><th className="text-start">Min (j)</th><th className="text-start">Max (j)</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {GOVERNORATES.map((g) => {
                const z = s.delivery.zones[g.id];
                const setZ = (patch: Partial<typeof z>) => up("delivery", { zones: { ...s.delivery.zones, [g.id]: { ...z, ...patch } } });
                return (
                  <tr key={g.id}>
                    <td className="py-1.5">{g.id}</td>
                    <td><input type="checkbox" checked={z.enabled} onChange={(e) => setZ({ enabled: e.target.checked })} className="h-5 w-5" /></td>
                    <td><input value={fees[g.id] ?? ""} onChange={(e) => setFees({ ...fees, [g.id]: e.target.value })} inputMode="decimal" className={`${input} w-24`} /></td>
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
          <select value={s.tracking.purchaseAt} onChange={(e) => up("tracking", { purchaseAt: e.target.value as "placed" | "confirmed" })} className={input}>
            <option value="placed">Dès que la commande est passée</option>
            <option value="confirmed">Quand la commande est confirmée par téléphone</option>
          </select>
        </label>
        <p className="mt-1 text-xs text-muted">« Confirmée » : les publicités apprennent sur de vraies commandes, sans les faux numéros. Les achats arrivent plus tard dans le gestionnaire de publicités.</p>
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
          <label className={label}>E-mail expéditeur (Resend)<input {...text("notify", "emailFrom")} placeholder="Mena <commandes@mena.tn>" /></label>
          {secret("resendKey", "Clé API Resend")}
        </div>
      </Card>

      <Card title="Paiement par carte (Konnect)" hint="Désactivé par défaut : la boutique fonctionne en paiement à la livraison. À activer seulement avec un compte Konnect validé.">
        <label className="flex items-center justify-between text-sm">Proposer la carte bancaire<input {...check("payments", "card")} /></label>
        <div className="mt-2 grid gap-2">
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
