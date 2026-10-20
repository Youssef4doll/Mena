"use client";

import { useState } from "react";
import { btn, input } from "@/components/admin/ui";

/**
 * Copy buttons for the Idées tab. Without a clipboard (an old browser, a
 * page not served over https) the text is shown selected, to copy by hand.
 */

export function CopyButton({ text, label = "Copier", className = btn.ghost }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={!text}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setState("copied");
          } catch {
            setState("manual");
          }
        }}
      >
        {state === "copied" ? "Copié" : label}
      </button>
      {state === "manual" && <textarea readOnly autoFocus aria-label="Texte à copier" className={`${input} h-28 basis-full py-2 font-mono text-xs`} value={text} onFocus={(e) => e.currentTarget.select()} />}
    </>
  );
}

/** One ad text in derja and French, each with its copy button and the rules it breaks. */
export function TextPair({ title, fr, ar, warn }: { title: string; fr: string; ar: string; warn?: (text: string) => string[] }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <OneText title={`${title} · derja`} text={ar} lang="ar" warnings={warn?.(ar) ?? []} />
      <OneText title={`${title} · français`} text={fr} lang="fr" warnings={warn?.(fr) ?? []} />
    </div>
  );
}

export function OneText({ title, text, lang, warnings = [] }: { title: string; text: string; lang: "ar" | "fr"; warnings?: string[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-line bg-cream/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{title}</span>
        <CopyButton text={text} className={`${btn.ghost} h-10 px-3 text-[13px]`} />
      </div>
      <p dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} className={`whitespace-pre-line break-words text-ink ${lang === "ar" ? "text-[15px] leading-relaxed" : "text-sm"}`}>
        {text || <span className="text-muted">—</span>}
      </p>
      {warnings.length > 0 && (
        <ul className="text-xs text-[#8a5a00]">
          {warnings.map((w) => (
            <li key={w}>À revoir : {w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
