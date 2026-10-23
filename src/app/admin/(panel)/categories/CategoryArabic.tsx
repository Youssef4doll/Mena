"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { manualCategoriesRequest, readCategoriesAnswer, type CategoryText } from "@/lib/category-ar";
import { btn, input } from "@/components/admin/ui";
import { saveCategoryArabic, translateCategories, type Outcome } from "./actions";

/**
 * The categories without their Arabic name (or card title): written at once
 * for the common ones, by the AI with the key, or with claude.ai without it.
 * Only what is empty is written.
 */
export function CategoryArabic({ missing, aiReady }: { missing: CategoryText[]; aiReady: boolean }) {
  const router = useRouter();
  const [left, setLeft] = useState<CategoryText[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  const todo = left ?? missing;

  const after = (r: Outcome) => {
    setLeft(r.left);
    setError(r.ok ? null : r.error);
    if (r.ok) setMessage(r.done ? `${r.done} catégorie${r.done > 1 ? "s" : ""} traduite${r.done > 1 ? "s" : ""}. Relisez l'arabe ci-dessous.` : null);
    router.refresh();
  };

  if (!todo.length) return message ? <p className="mb-4 rounded-xl bg-olive-soft/60 px-4 py-3 text-sm text-ink" role="status">{message}</p> : null;
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-sea/30 bg-sea-soft/30 p-4 text-sm text-ink-2" data-testid="category-arabic">
      <p className="text-ink">
        <b>{todo.length} catégorie{todo.length > 1 ? "s" : ""} sans arabe</b> : {todo.map((c) => c.name).join(", ")}.
      </p>
      {message && <p role="status">{message}</p>}
      {left == null || aiReady ? (
        <button type="button" className={`${btn.sea} self-start`} disabled={pending} onClick={() => start(async () => after(await translateCategories()))}>
          {pending ? "Traduction…" : "Traduire en arabe"}
        </button>
      ) : (
        <div className="grid gap-2">
          <p>Les noms connus sont faits. Pour les autres (pas de clé <code>ANTHROPIC_API_KEY</code>), avec claude.ai, gratuit :</p>
          <p>
            1.{" "}
            <button
              type="button"
              className={btn.sea}
              onClick={async () => {
                const text = manualCategoriesRequest(todo);
                try {
                  await navigator.clipboard.writeText(text);
                  setCopied(true);
                } catch {
                  window.prompt("Copiez la demande :", text);
                }
              }}
            >
              {copied ? "Demande copiée" : "Copier la demande"}
            </button>
          </p>
          <p>2. Ouvrez <a href="https://claude.ai/new" target="_blank" rel="noopener" className="text-sea underline underline-offset-4">claude.ai</a>, collez la demande et envoyez-la.</p>
          <p>3. Copiez toute sa réponse et collez-la ici :</p>
          <textarea aria-label="Réponse de l'IA pour les catégories" dir="auto" className={`${input} h-24 font-mono text-xs`} value={reply} onChange={(e) => { setReply(e.target.value); setError(null); }} />
          <button
            type="button"
            className={`${btn.sea} self-start`}
            disabled={pending || !reply.trim()}
            onClick={() => {
              const found = readCategoriesAnswer(reply);
              if (!found) return setError("Réponse incomplète : copiez toute la réponse de l'IA, du premier « { » au dernier « } ».");
              start(async () => after(await saveCategoryArabic(found)));
            }}
          >
            Mettre les traductions
          </button>
        </div>
      )}
      {error && <p className="text-clay">{error}</p>}
    </div>
  );
}
