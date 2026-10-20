"use client";

import { useMemo, useState, useTransition } from "react";
import { buildBrief, type BriefInput } from "@/lib/ads/brief";
import type { BriefProductOption } from "@/lib/ads/brief-data";
import { loadAdBrief } from "../ideas-actions";
import { Card, input as inputCls, label } from "@/components/admin/ui";
import { BriefView } from "./BriefView";
import { Concepts } from "./Concepts";
import { LinkBuilder, type LinkState } from "./LinkBuilder";

/**
 * The Idées tab in the browser: the product picker (another product's input
 * comes from loadAdBrief, without reloading the page), its brief, the new
 * concepts and the link builder. An angle's or a concept's ad name can be
 * sent to the link with one tap.
 */
export function IdeasTab({ options, initial, aiReady, site, known, today }: { options: BriefProductOption[]; initial: BriefInput; aiReady: boolean; site: string; known: { campaigns: string[]; ads: string[] }; today: string }) {
  const [input, setInput] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, start] = useTransition();
  const [link, setLink] = useState<LinkState>({ platform: "meta", lang: "ar", source: "", campaign: "", adSet: "", ad: "" });
  const brief = useMemo(() => buildBrief(input), [input]);
  const current = options.find((o) => o.id === input.product.id);

  function pick(id: string) {
    start(async () => {
      setError(null);
      try {
        const r = await loadAdBrief(id);
        if (!r.ok) return setError(r.error);
        setInput(r.input);
        setLink((l) => ({ ...l, campaign: "", ad: "" }));
        // The address keeps the product, so a reload or a shared link opens on it.
        const url = new URL(window.location.href);
        url.searchParams.set("produit", id);
        window.history.replaceState(null, "", url);
      } catch {
        setError("Chargement impossible : vérifiez la connexion, puis réessayez.");
      }
    });
  }

  function sendToLink(name: string) {
    setLink((l) => ({ ...l, ad: name }));
    document.getElementById("liens")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <label className={`${label} min-w-0 flex-1 basis-64`}>
            Produit
            <select value={input.product.id} onChange={(e) => pick(e.target.value)} disabled={loading} className={inputCls}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                  {o.active ? "" : " (hors ligne)"} · {o.orders} commande{o.orders > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </label>
          {loading && <span className="flex h-10 items-center text-sm text-muted">Chargement…</span>}
          {current && <span className="flex h-10 items-center text-xs text-muted">Commandes en {brief.days} jours, hors back-office</span>}
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      </Card>

      <section id="brief" className="scroll-mt-16" aria-busy={loading}>
        <Card title={`Brief : ${input.product.name}`} hint="Construit à partir de la fiche, des réglages et des chiffres réels du produit. Les textes sont prêts à copier ; relisez-les avant de publier.">
          <BriefView brief={brief} input={input} onUseName={sendToLink} />
        </Card>
      </section>

      <section id="idees" className="scroll-mt-16">
        <Card title="Nouvelles idées" hint={aiReady ? "Écrites à partir des mêmes faits et règles que le brief." : "Sans clé d'API : la demande se copie dans claude.ai, et sa réponse se colle ici."}>
          <Concepts key={input.product.id} input={input} aiReady={aiReady} onUseName={sendToLink} />
        </Card>
      </section>

      <section id="liens" className="scroll-mt-16">
        <Card title="Lien de la publicité" hint="Le même nom de campagne et de publicité dans le lien et dans le gestionnaire : c'est ainsi que les visites, les commandes et les dépenses importées se retrouvent.">
          <LinkBuilder state={link} onChange={setLink} site={site} slug={input.product.slug} today={today} known={known} />
        </Card>
      </section>
    </>
  );
}
