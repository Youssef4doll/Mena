"use client";

import { useState } from "react";
import { KIND_LABEL, imagePrompt, longImagePrompt, manualIdeasRequest, readIdeasAnswer, type IdeaTexts, type ImageIdea } from "@/lib/image-ideas";
import { planImages } from "@/app/admin/(panel)/produits/actions";
import { btn, input } from "./ui";

type Lang = "ar" | "fr";

/**
 * The tall pictures to make in an image generator (Gemini, ChatGPT): one
 * request for one long picture with every part, and one per part, written
 * out in full so the owner sees what is asked, in the language of the text
 * on the picture.
 */
export function ImageIdeas({ ideas, photo }: { ideas: ImageIdea[]; photo: string | null }) {
  const [lang, setLang] = useState<Lang>("ar");
  return (
    <div className="flex flex-col gap-4" data-testid="image-ideas">
      <ol className="flex list-decimal flex-col gap-1 rounded-xl bg-sea-soft/40 p-3 ps-8 text-sm text-ink-2">
        <li>
          Ouvrez <a href="https://gemini.google.com/app" target="_blank" rel="noopener" className="text-sea underline underline-offset-4">Gemini</a> (ou ChatGPT) et joignez la photo du produit (bouton +).
          {photo && <> <a href={photo} target="_blank" rel="noopener" className="text-sea underline underline-offset-4">Ouvrir la photo</a> pour l&apos;enregistrer.</>}
        </li>
        <li>Copiez une demande ci-dessous et collez-la à côté de la photo.</li>
        <li>Téléchargez l&apos;image obtenue et vérifiez le texte lettre par lettre. Si une lettre est fausse, demandez « corrige le texte, garde tout le reste ».</li>
        <li>Ajoutez-la ici, dans « Images de description », avec sa langue ({lang === "ar" ? "Arabe" : "Français"}).</li>
      </ol>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-2">Texte sur l&apos;image :</span>
        {(["ar", "fr"] as const).map((l) => (
          <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)} className={`h-10 rounded-full border px-4 font-medium ${lang === l ? "border-sea bg-sea text-white" : "border-line bg-white text-ink"}`}>
            {l === "ar" ? "Arabe" : "Français"}
          </button>
        ))}
      </div>

      {ideas.length > 1 && (
        <Prompt
          title="Une seule grande image, avec toutes les parties"
          hint={`${ideas.length} parties l'une sous l'autre, comme les longues images d'Amazon. Le plus rapide ; si le texte sort mal, faites plutôt les images une par une.`}
          text={longImagePrompt(ideas, lang)}
        />
      )}
      {ideas.map((idea, i) => (
        <Prompt
          key={i}
          title={`${i + 1}. ${KIND_LABEL[idea.kind]}`}
          hint={(lang === "ar" ? idea.headlineAr : idea.headlineFr) || undefined}
          rtlHint={lang === "ar"}
          text={imagePrompt(idea, lang)}
        />
      ))}
    </div>
  );
}

/** One request, shown whole in a box large enough to read, with its copy button. */
function Prompt({ title, hint, rtlHint, text }: { title: string; hint?: string; rtlHint?: boolean; text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // No clipboard (page not in https): the box is selected, to copy by hand.
      window.prompt("Copiez la demande :", text);
    }
  }
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          {hint && <p className={`text-sm text-ink-2 ${rtlHint ? "font-semibold" : ""}`} dir={rtlHint ? "rtl" : undefined}>{hint}</p>}
        </div>
        <button type="button" className={btn.sea} onClick={copy}>{copied ? "Demande copiée" : "Copier la demande"}</button>
      </div>
      <textarea
        readOnly
        aria-label={`Demande : ${title}`}
        value={text}
        rows={Math.min(18, Math.max(8, Math.ceil(text.length / 90)))}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full resize-y rounded-lg border border-line bg-sand/40 p-3 text-[14px] leading-relaxed text-ink outline-none focus:border-sea"
      />
    </section>
  );
}

/**
 * In the product editor: the tall pictures planned from the product's texts,
 * by the AI with the key, or with claude.ai without it.
 */
export function ImagePlanner({ texts, aiReady, photo }: { texts: IdeaTexts; aiReady: boolean; photo: string | null }) {
  const [ideas, setIdeas] = useState<ImageIdea[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [reply, setReply] = useState("");
  const [copied, setCopied] = useState(false);
  const empty = !texts.name.trim() && !texts.nameAr.trim();

  async function plan() {
    setBusy(true);
    setError(null);
    const r = await planImages(texts).catch(() => ({ ok: false as const, error: "Pas de réponse du serveur : vérifiez la connexion." }));
    setBusy(false);
    if (r.ok) setIdeas(r.ideas);
    else setError(r.error);
  }
  async function copyRequest() {
    const text = manualIdeasRequest(texts);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      window.prompt("Copiez la demande :", text);
    }
  }

  if (ideas) return (
    <div className="flex flex-col gap-3">
      <ImageIdeas ideas={ideas} photo={photo} />
      <button type="button" className={`${btn.ghost} self-start`} disabled={busy} onClick={() => (aiReady ? plan() : setIdeas(null))}>{busy ? "Préparation…" : "Refaire les idées"}</button>
    </div>
  );
  return (
    <div className="flex flex-col gap-2 text-sm text-ink-2">
      <p>L&apos;IA prépare 3 à 5 images comme sur Amazon (avantage principal, points forts fléchés, avant / après, dimensions, contenu de la boîte…), à partir des textes de ce produit, avec une demande complète pour Gemini.</p>
      {aiReady ? (
        <button type="button" className={`${btn.sea} self-start`} disabled={busy || empty} onClick={plan} data-testid="plan-images">
          {busy ? "Préparation… (environ 20 secondes)" : "Préparer les grandes images"}
        </button>
      ) : !manual ? (
        <button type="button" className={`${btn.sea} self-start`} disabled={empty} onClick={() => setManual(true)} data-testid="plan-images">Préparer les grandes images avec claude.ai (gratuit)</button>
      ) : (
        <div className="grid gap-2">
          <p>1. <button type="button" className={btn.sea} onClick={copyRequest}>{copied ? "Demande copiée" : "Copier la demande"}</button></p>
          <p>2. Ouvrez <a href="https://claude.ai/new" target="_blank" rel="noopener" className="text-sea underline underline-offset-4">claude.ai</a>, collez la demande et envoyez-la.</p>
          <p>3. Copiez toute sa réponse et collez-la ici :</p>
          <textarea aria-label="Réponse de l'IA pour les images" dir="auto" className={`${input} h-28 font-mono text-xs`} value={reply} onChange={(e) => { setReply(e.target.value); setError(null); }} />
          <button
            type="button"
            className={`${btn.sea} self-start`}
            disabled={!reply.trim()}
            onClick={() => {
              const found = readIdeasAnswer(reply);
              if (found) setIdeas(found);
              else setError("Réponse incomplète : copiez toute la réponse de l'IA, du premier « { » au dernier « } ».");
            }}
          >
            Utiliser cette réponse
          </button>
        </div>
      )}
      {empty && <p className="text-xs text-muted">Écrivez d&apos;abord le nom et la description du produit.</p>}
      {error && <p className="text-clay">{error}</p>}
    </div>
  );
}
