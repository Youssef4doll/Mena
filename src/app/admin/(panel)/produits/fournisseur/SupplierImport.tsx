"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatTND, parseTND, toInputTND } from "@/lib/money";
import { slugify } from "@/lib/slug";
import { isWebAddress, type RowData } from "@/lib/product-csv";
import {
  DEFAULT_RULE, frenchCategory, imagesFromHtml, pageText, priceFromRule, productCode, readSupplierList, type ListItem, type PriceRule,
} from "@/lib/supplier-page";
import { imagePrompt, manualDraftRequest, readDraftAnswer, type Draft, type ImageIdea } from "@/lib/supplier-prompt";
import { ImportRun, type Job, type Outcome, type Snapshot } from "@/lib/client/import-run";
import type { Picture } from "@/lib/client/import-plan";
import { Badge, Card, btn, input, label } from "@/components/admin/ui";
import { matchProducts, writeDraft, type Found } from "./actions";

type Pasted = { html: string; text: string; n: number };

const RULE_KEY = "mena_supplier_rule";
const CATS_KEY = "mena_supplier_categories";
const SUPPLIER = "Ecomness";
const EXPIRED = "Session expirée : reconnectez-vous dans un autre onglet, puis cliquez à nouveau.";

// window.fetch called as a method of another object throws "Illegal invocation".
const browserFetch: typeof fetch = (url, init) => fetch(url, init);
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const decimal = (s: string) => {
  const n = Number(s.replace(",", ".").trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** The owner's choices, remembered on this computer only; the page works the same without them. */
function remembered<T extends object>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
}
function remember(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private window or blocked storage: the choice is simply not kept.
  }
}

/**
 * Products from Ecomness (or another supplier) in two ways: the list of
 * products copied by a scraping extension (many offline products at once:
 * photo, name, cost, code, link), or one product page copied whole (all its
 * photos at full size, and texts written by the AI in French and Tunisian
 * Arabic). The rows go through the same route as the CSV import, which
 * checks everything again; a product already in the shop is completed, not
 * copied.
 */
export function SupplierImport({ aiReady, categories }: { aiReady: boolean; categories: string[] }) {
  const [pasted, setPasted] = useState<Pasted | null>(null);
  const count = useRef(0);
  const list = useMemo(() => (pasted ? readSupplierList(pasted.text) : null), [pasted]);
  const reset = () => setPasted(null);

  if (!pasted) return <PasteCard aiReady={aiReady} onPaste={(p) => setPasted({ ...p, n: ++count.current })} />;
  return list ? (
    <ListMode key={pasted.n} items={list} aiReady={aiReady} categories={categories} onReset={reset} />
  ) : (
    <PageMode key={pasted.n} html={pasted.html} text={pasted.text} aiReady={aiReady} categories={categories} onReset={reset} />
  );
}

function PasteCard({ aiReady, onPaste }: { aiReady: boolean; onPaste: (p: { html: string; text: string }) => void }) {
  return (
    <Card>
      <div className="flex flex-col gap-3 text-sm text-ink-2">
        <ol className="flex list-decimal flex-col gap-1.5 ps-5">
          <li>
            <b className="text-ink">Un produit complet</b> : sur Ecomness, ouvrez la page du produit, appuyez sur <Kbd>Ctrl</Kbd>+<Kbd>A</Kbd> puis <Kbd>Ctrl</Kbd>+<Kbd>C</Kbd>.
          </li>
          <li>
            <b className="text-ink">Ou plusieurs produits</b> : copiez la liste prise par votre extension (Instant Data Scraper…), comme celle de « My products ».
          </li>
          <li>
            Ici, cliquez dans le cadre et appuyez sur <Kbd>Ctrl</Kbd>+<Kbd>V</Kbd>.
          </li>
        </ol>
        <textarea
          aria-label="Coller la page ou la liste ici"
          data-testid="supplier-paste"
          placeholder="Cliquez ici, puis Ctrl+V"
          className="h-40 w-full resize-none rounded-2xl border-2 border-dashed border-sea/40 bg-sea-soft/30 p-4 text-center text-base text-ink outline-none placeholder:text-sea-2 focus:border-sea"
          onPaste={(e) => {
            const html = e.clipboardData.getData("text/html");
            const text = e.clipboardData.getData("text/plain");
            if (!html.trim() && !text.trim()) return;
            e.preventDefault();
            onPaste({ html, text });
          }}
          // Typed or dropped text (no paste event): read when the box is left.
          onBlur={(e) => e.currentTarget.value.trim() && onPaste({ html: "", text: e.currentTarget.value })}
        />
        <p className="text-xs text-muted">
          {aiReady
            ? "L'IA écrit la fiche (français et arabe tunisien) seulement à partir de ce que dit la page : rien n'est inventé. Vous relisez avant de créer, et le produit est créé hors ligne."
            : "Sans clé ANTHROPIC_API_KEY, la fiche s'écrit avec claude.ai (gratuit) : vous copiez la demande, vous collez la réponse. Le produit est créé hors ligne."}
        </p>
      </div>
    </Card>
  );
}

const Kbd = ({ children }: { children: React.ReactNode }) => <kbd className="rounded border border-line bg-sand px-1.5 py-0.5 font-mono text-[12px] text-ink">{children}</kbd>;

/* ------------------------------------------------------------------ */
/* Sending through the import's routes                                 */
/* ------------------------------------------------------------------ */

/** A run of the import for these jobs, its snapshot kept in the page. */
function useRun(aiReady: boolean) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [started, setStarted] = useState(false);
  const run = useRef<ImportRun | null>(null);

  /** `fresh`: a new run with these jobs (the form may have changed); otherwise "Reprendre" sends again what failed, and nothing that went through. */
  async function start(jobs: Job[], prepare: { categories: { name: string }[]; suppliers: string[] }, fresh = false) {
    if (running) return;
    if (fresh) run.current = null;
    const r = (run.current ??= new ImportRun(jobs, { activateNew: false, translate: aiReady }, prepare, {
      fetch: browserFetch,
      shrink: async (f) => f,
      onChange: () => setSnap(run.current!.snapshot()),
    }));
    setRunning(true);
    setStarted(true);
    setOutcome(null);
    try {
      setOutcome(await r.run());
    } catch {
      setOutcome("error");
    } finally {
      setSnap(r.snapshot());
      setRunning(false);
    }
  }
  return { snap, running, outcome, start, started };
}

function RunNote({ outcome, snap }: { outcome: Outcome | null; snap: Snapshot | null }) {
  if (outcome === "expired") return <p className="text-sm text-clay">{EXPIRED}</p>;
  if (snap?.error) return <p className="text-sm text-clay">{snap.error}</p>;
  if (outcome === "error") return <p className="text-sm text-clay">L&apos;envoi s&apos;est arrêté. Réessayez.</p>;
  return null;
}

/* ------------------------------------------------------------------ */
/* A list of products                                                  */
/* ------------------------------------------------------------------ */

function ListMode({ items, aiReady, categories, onReset }: { items: ListItem[]; aiReady: boolean; categories: string[]; onReset: () => void }) {
  const [rule, setRule] = useState<PriceRule>(() => remembered(RULE_KEY, DEFAULT_RULE));
  const [ruleText, setRuleText] = useState(() => ({ times: String(rule.times).replace(".", ","), plus: String(rule.plus).replace(".", ",") }));
  const [catMap, setCatMap] = useState<Record<string, string>>(() => remembered(CATS_KEY, {}));
  const [chosen, setChosen] = useState(() => items.map(() => true));
  const [names, setNames] = useState(() => items.map((i) => i.name));
  // null: the price the rule gives.
  const [prices, setPrices] = useState<(string | null)[]>(() => items.map(() => null));
  const [found, setFound] = useState<Found[] | null>(null);
  const [checkError, setCheckError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { snap, running, outcome, start, started } = useRun(aiReady);

  useEffect(() => {
    let live = true;
    matchProducts(items.map((i) => ({ ref: i.ref, slug: slugify(i.name) })))
      .then((f) => live && setFound(f))
      .catch(() => live && setCheckError(true));
    return () => {
      live = false;
    };
  }, [items]);

  /** The shop's category for one of the supplier's: the one chosen before, else the one of the same name, else a new one in French. */
  function categoryFor(c: string): string {
    if (!c) return "";
    const saved = catMap[c];
    if (saved !== undefined && (saved === "" || categories.includes(saved) || saved === frenchCategory(c))) return saved;
    const fr = frenchCategory(c);
    return categories.find((x) => norm(x) === norm(fr) || norm(x) === norm(c)) ?? fr;
  }
  const supplierCats = [...new Set(items.filter((it, i) => chosen[i] && !found?.[i]?.match).map((it) => it.category).filter(Boolean))];

  const priceOf = (i: number): number | null => {
    const typed = prices[i];
    if (typed != null) return parseTND(typed);
    return items[i].cost != null ? priceFromRule(items[i].cost!, rule) : null;
  };
  const isNew = (i: number) => !found?.[i]?.match;
  const picked = items.map((_, i) => i).filter((i) => chosen[i]);
  const noPrice = picked.filter((i) => isNew(i) && !priceOf(i));
  const noName = picked.filter((i) => isNew(i) && !names[i].trim());
  const newCount = picked.filter(isNew).length;
  const updCount = picked.length - newCount;

  function setRuleField(k: keyof PriceRule, v: string) {
    setRuleText((t) => ({ ...t, [k]: v }));
    const n = decimal(v);
    if (n == null) return;
    const next = { ...rule, [k]: n };
    setRule(next);
    remember(RULE_KEY, next);
  }

  async function create() {
    setError(null);
    let fresh: Found[];
    try {
      // Checked again now, with the names as they are: nothing is made twice.
      fresh = await matchProducts(items.map((it, i) => ({ ref: it.ref, slug: slugify(names[i]) })));
    } catch {
      return setError("Vérification impossible : vérifiez la connexion, puis réessayez.");
    }
    setFound(fresh);
    const used = new Set<string>();
    const jobs: Job[] = [];
    for (const i of picked) {
      const it = items[i];
      const m = fresh[i].match;
      const common: RowData = { cost: it.cost ?? undefined, supplier: SUPPLIER, ...(it.ref ? { supplierRef: it.ref } : {}), ...(it.link && isWebAddress(it.link) ? { supplierUrl: it.link } : {}) };
      const photo: Picture[] = it.photo ? [{ kind: "GALLERY", index: 0, label: "Photo", url: it.photo }] : [];
      if (m) {
        // Already in the shop: its supplier price, code and link are brought up to date; its name, price and texts stay.
        jobs.push({ line: i + 1, row: { slug: m.slug, ...common }, pictures: m.photos === 0 ? photo : [], isNew: false });
        continue;
      }
      const price = priceOf(i);
      const name = names[i].trim();
      if (!price || !name) continue;
      // Two products of the same name keep two pages: the second address carries its code.
      let slug = slugify(name);
      if (fresh[i].slugTaken || used.has(slug)) slug = `${slug}-${slugify(it.ref || String(i + 1))}`;
      used.add(slug);
      const category = categoryFor(it.category);
      jobs.push({ line: i + 1, row: { ...common, slug, name, price, ...(category ? { category } : {}) }, pictures: photo, isNew: true });
    }
    const newCats = [...new Set(jobs.map((j) => j.row.category).filter((c): c is string => Boolean(c) && !categories.includes(c!)))];
    await start(jobs, { categories: newCats.map((name) => ({ name })), suppliers: [SUPPLIER] });
  }

  const created = snap ? items.flatMap((_, i) => (snap.rows.get(i + 1)?.state === "saved" && snap.rows.get(i + 1)?.created ? [snap.rows.get(i + 1)!.id!] : [])) : [];
  const counts = snap?.counts;

  return (
    <div className="flex flex-col gap-4">
      <Card
        title={`${plural(items.length, "produit trouvé", "produits trouvés")} dans la liste`}
        hint="Les nouveaux sont créés hors ligne avec leur photo en grand, leur coût, leur code et leur lien Ecomness. Ceux déjà dans la boutique gardent leur nom, leur prix et leurs textes : seuls leur coût, leur code et leur lien sont mis à jour."
        aside={<button type="button" className={btn.ghost} onClick={onReset} disabled={running}>Coller autre chose</button>}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 rounded-xl bg-sand/60 p-3 text-sm text-ink-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">Prix de vente des nouveaux = coût ×</span>
              <input aria-label="Multiplier le coût par" inputMode="decimal" className={`${input.replace("w-full", "w-16")} text-center`} value={ruleText.times} onChange={(e) => setRuleField("times", e.target.value)} />
              <span className="font-medium text-ink">+</span>
              <input aria-label="Ajouter (DT)" inputMode="decimal" className={`${input.replace("w-full", "w-16")} text-center`} value={ruleText.plus} onChange={(e) => setRuleField("plus", e.target.value)} />
              <span className="font-medium text-ink">DT</span>
            </div>
            <p className="text-xs text-muted">Arrondi à ,900. Changez un prix dans sa ligne si besoin.</p>
          </div>

          {supplierCats.length > 0 && (
            <div className="flex flex-col gap-2 text-sm">
              <p className="font-medium text-ink">Catégories</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {supplierCats.map((c) => {
                  const value = categoryFor(c);
                  const fr = frenchCategory(c);
                  return (
                    <label key={c} className="flex items-center gap-2">
                      <span className="w-28 shrink-0 truncate text-ink-2">{c}</span>
                      <span aria-hidden className="text-muted">→</span>
                      <select
                        className={input}
                        value={value}
                        onChange={(e) => {
                          const next = { ...catMap, [c]: e.target.value };
                          setCatMap(next);
                          remember(CATS_KEY, next);
                        }}
                      >
                        {categories.map((x) => <option key={x} value={x}>{x}</option>)}
                        {!categories.includes(fr) && <option value={fr}>Nouvelle : {fr}</option>}
                        <option value="">Sans catégorie</option>
                      </select>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {checkError && <p className="text-sm text-clay">Impossible de savoir quels produits sont déjà dans la boutique. Rechargez la page.</p>}
          <ul className="flex flex-col divide-y divide-line" data-testid="supplier-list">
            {items.map((it, i) => {
              const m = found?.[i]?.match ?? null;
              const r = snap?.rows.get(i + 1);
              const price = priceOf(i);
              return (
                <li key={`${it.ref}-${i}`} className="flex gap-3 py-3">
                  <input type="checkbox" aria-label={`Prendre ${it.name}`} className="mt-4 h-5 w-5 shrink-0 accent-sea" checked={chosen[i]} disabled={running || started} onChange={(e) => setChosen((c) => c.map((v, n) => (n === i ? e.target.checked : v)))} />
                  {it.thumb || it.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.thumb ?? it.photo!} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg border border-line bg-sand object-cover" />
                  ) : (
                    <span className="h-14 w-14 shrink-0 rounded-lg bg-sand" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    {m ? (
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                        <Link href={`/admin/produits/${m.id}`} className="underline-offset-4 hover:underline">{m.name}</Link>
                        <Badge tone="info">Déjà dans la boutique</Badge>
                      </p>
                    ) : (
                      <input aria-label="Nom du produit" className={input} value={names[i]} disabled={running || started} onChange={(e) => setNames((n) => n.map((v, k) => (k === i ? e.target.value : v)))} />
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <span>Coût <b className="font-medium text-ink-2">{it.cost != null ? formatTND(it.cost) : "—"}</b></span>
                      {m ? (
                        <span>Prix {formatTND(m.price)}</span>
                      ) : (
                        <label className="inline-flex items-center gap-1">
                          Prix
                          <input
                            aria-label={`Prix de vente de ${it.name}`}
                            inputMode="decimal"
                            className={`h-8 w-24 rounded-lg border px-2 text-sm text-ink outline-none focus:border-sea ${chosen[i] && !price ? "border-clay" : "border-line"}`}
                            value={prices[i] ?? toInputTND(price)}
                            disabled={running || started}
                            onChange={(e) => setPrices((p) => p.map((v, k) => (k === i ? e.target.value : v)))}
                          />
                        </label>
                      )}
                      {!m && it.category && <span>{categoryFor(it.category) || "Sans catégorie"}</span>}
                      {it.ref && <span className="font-mono">{it.ref}</span>}
                      {it.link && <a href={it.link} target="_blank" rel="noopener" className="text-sea underline underline-offset-4">Ecomness</a>}
                      {r && <RowState state={r.state} created={r.created} error={r.error} pics={r.pics} />}
                      {r?.state === "saved" && r.id && <Link href={`/admin/produits/${r.id}`} className="text-sea underline underline-offset-4">Ouvrir</Link>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          {(noPrice.length > 0 || noName.length > 0) && !started && (
            <p className="text-sm text-clay">
              {noPrice.length > 0 && `${plural(noPrice.length, "produit sans prix", "produits sans prix")} : écrivez le prix ou décochez. `}
              {noName.length > 0 && `${plural(noName.length, "produit sans nom", "produits sans nom")}.`}
            </p>
          )}
          {error && <p className="text-sm text-clay">{error}</p>}
          <RunNote outcome={outcome} snap={snap} />

          <div className="flex flex-wrap items-center gap-2">
            {outcome !== "done" && (
              <button type="button" className={btn.sea} disabled={running || !found || picked.length === 0 || noPrice.length > 0 || noName.length > 0} onClick={create} data-testid="supplier-create">
                {running
                  ? `Envoi… ${counts ? `${counts.saved + counts.failed}/${counts.rows}` : ""}`
                  : started
                    ? "Reprendre"
                    : newCount && updCount
                      ? `Créer ${plural(newCount, "produit", "produits")} hors ligne et mettre à jour ${updCount}`
                      : newCount
                        ? `Créer ${plural(newCount, "produit", "produits")} hors ligne`
                        : `Mettre à jour ${plural(updCount, "produit", "produits")}`}
              </button>
            )}
            {outcome === "done" && counts && (
              <p className="text-sm text-ink-2" role="status">
                {[counts.created && plural(counts.created, "produit créé", "produits créés"), counts.updated && plural(counts.updated, "mis à jour", "mis à jour"), counts.failed && plural(counts.failed, "échec", "échecs")].filter(Boolean).join(", ")}
                {counts.picFailed > 0 && `, ${plural(counts.picFailed, "photo non reçue", "photos non reçues")}`}.
              </p>
            )}
          </div>
        </div>
      </Card>

      {outcome === "done" && (
        <Card title="Ensuite">
          <div className="flex flex-col gap-2 text-sm text-ink-2">
            <p>
              Pour la description et toutes les photos d&apos;un produit : ouvrez-le chez Ecomness (lien « Ecomness » de sa ligne), <Kbd>Ctrl</Kbd>+<Kbd>A</Kbd> puis <Kbd>Ctrl</Kbd>+<Kbd>C</Kbd>, et collez la page ici. Le produit déjà créé est complété, pas copié.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn.sea} onClick={onReset}>Coller une page produit</button>
              <Link href="/admin/produits" className={btn.ghost}>Voir les produits</Link>
              {!aiReady && created.length > 0 && <a href={`/admin/produits/traduction?ids=${created.join(",")}`} className={btn.ghost}>Traduire les noms en arabe</a>}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function RowState({ state, created, error, pics }: { state: string; created?: boolean; error?: string; pics: string[] }) {
  if (state === "waiting") return <Badge>En attente</Badge>;
  if (state === "saving") return <Badge tone="info">Envoi…</Badge>;
  if (state === "failed") return <span className="text-clay">{error ?? "Échec"}</span>;
  const lost = pics.filter((p) => p === "failed").length;
  return (
    <>
      <Badge tone="ok">{created ? "Créé" : "Mis à jour"}</Badge>
      {lost > 0 && <span className="text-clay">photo non reçue</span>}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* One product page                                                    */
/* ------------------------------------------------------------------ */

type Form = { name: string; price: string; cost: string; category: string; link: string; replace: boolean };

function PageMode({ html, text, aiReady, categories, onReset }: { html: string; text: string; aiReady: boolean; categories: string[]; onReset: () => void }) {
  const page = useMemo(() => pageText(text), [text]);
  const ecomness = useMemo(() => Boolean(productCode(page)) || /ecomness/i.test(page), [page]);
  const [photos, setPhotos] = useState(() => imagesFromHtml(html));
  const [draft, setDraft] = useState<Draft | null>(null);
  const [found, setFound] = useState<Found | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { snap, running, outcome, start } = useRun(aiReady);
  const asked = useRef(false);
  const empty = page.length < 20;

  const pickCategory = (c: string) => categories.find((x) => norm(x) === norm(c)) ?? c.trim();

  /** The draft is there: is the product already in the shop, and what the form starts with. */
  async function accept(d: Draft) {
    setError(null);
    const ref = d.supplierRef || productCode(page);
    let f: Found = { match: null, slugTaken: false };
    try {
      [f] = await matchProducts([{ ref, slug: slugify(d.name) }]);
    } catch {
      setError("Impossible de savoir si ce produit est déjà dans la boutique : vérifiez la connexion.");
    }
    const m = f.match;
    const rule = remembered(RULE_KEY, DEFAULT_RULE);
    const cost = parseTND(d.supplierPrice);
    setFound(f);
    setForm({
      name: d.name,
      price: toInputTND(m ? m.price : cost != null ? priceFromRule(cost, rule) : null),
      cost: toInputTND(m?.cost ?? cost),
      category: m?.category ?? (d.category ? pickCategory(d.category) : ""),
      link: m?.supplierUrl ?? "",
      // A product made from the list has only its name: everything is written. One with its own texts keeps them unless asked.
      replace: !m || (!m.filled.description && !m.filled.summary),
    });
    setDraft(d);
  }

  async function write() {
    setWriting(true);
    setError(null);
    const r = await writeDraft(page).catch(() => ({ ok: false as const, error: "Pas de réponse du serveur : vérifiez la connexion." }));
    setWriting(false);
    if (r.ok) await accept(r.draft);
    else setError(r.error);
  }

  useEffect(() => {
    // Once per paste, even when React runs the effect twice.
    if (!aiReady || empty || asked.current) return;
    asked.current = true;
    void write();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create() {
    if (!draft || !form) return;
    setError(null);
    const price = parseTND(form.price);
    const cost = form.cost.trim() ? parseTND(form.cost) : null;
    if (!form.name.trim()) return setError("Écrivez le nom du produit.");
    if (!price) return setError("Écrivez le prix de vente.");
    if (form.cost.trim() && cost == null) return setError("Coût illisible : écrivez par exemple 54,000.");
    const ref = draft.supplierRef || productCode(page);
    let f: Found;
    try {
      [f] = await matchProducts([{ ref, slug: slugify(form.name) }]);
    } catch {
      return setError("Vérification impossible : vérifiez la connexion, puis réessayez.");
    }
    setFound(f);
    const m = f.match;
    const all = !m || form.replace;
    // A text is written when the product has none yet, or when the owner asked to replace them; an empty text never erases one.
    const pair = (has: boolean, fr: "summary" | "description" | "specs"): RowData => {
      const out: RowData = {};
      if ((!all && has) || !draft[fr]) return out;
      const ar = `${fr}Ar` as const;
      out[fr] = draft[fr];
      if (draft[ar]) out[ar] = draft[ar];
      return out;
    };
    const row: RowData = {
      slug: m ? m.slug : f.slugTaken ? `${slugify(form.name)}-${slugify(ref || String(Date.now() % 100_000))}` : slugify(form.name),
      ...(all ? { name: form.name.trim(), ...(draft.nameAr ? { nameAr: draft.nameAr } : {}), ...(draft.keywords ? { keywords: draft.keywords } : {}) } : {}),
      ...pair(Boolean(m?.filled.summary), "summary"),
      ...pair(Boolean(m?.filled.description), "description"),
      ...pair(Boolean(m?.filled.specs), "specs"),
      price,
      ...(cost != null ? { cost } : {}),
      ...(form.category ? { category: form.category } : {}),
      ...(ecomness ? { supplier: SUPPLIER } : {}),
      ...(ref ? { supplierRef: ref } : {}),
      ...(isWebAddress(form.link.trim()) ? { supplierUrl: form.link.trim() } : {}),
      // Options only for a product without any: existing ones keep their orders and their history.
      ...(draft.variants.length && !m?.filled.variants
        ? { variants: draft.variants.map((v) => ({ name: v.name, ...(v.nameAr ? { nameAr: v.nameAr } : {}), ...(v.colorHex ? { colorHex: v.colorHex } : {}) })) }
        : {}),
    };
    const pictures: Picture[] = photos.map((url, i) => ({ kind: "GALLERY", index: i, label: `Photo ${i + 1}`, url }));
    const newCats = form.category && !categories.includes(form.category) ? [{ name: form.category }] : [];
    // Sent again as it is now: the same product and the same photos are found, not made twice.
    await start([{ line: 1, row, pictures, isNew: !m }], { categories: newCats, suppliers: ecomness ? [SUPPLIER] : [] }, true);
  }

  const r = snap?.rows.get(1);
  // Finished once the product and every photo have gone through (a photo that failed is said).
  const saved = outcome === "done" && r?.state === "saved" && r.id ? r : null;
  const sent = r ? r.pics.filter((p) => p !== "waiting" && p !== "sending").length : 0;
  const m = found?.match ?? null;

  if (empty && photos.length === 0)
    return (
      <Card>
        <div className="flex flex-col gap-3 text-sm text-ink-2">
          <p>Rien d&apos;utilisable dans ce qui a été collé. Sur la page du produit, appuyez sur <Kbd>Ctrl</Kbd>+<Kbd>A</Kbd> (tout sélectionner) avant <Kbd>Ctrl</Kbd>+<Kbd>C</Kbd>.</p>
          <button type="button" className={`${btn.sea} self-start`} onClick={onReset}>Coller à nouveau</button>
        </div>
      </Card>
    );

  return (
    <div className="flex flex-col gap-4">
      <Card
        title={plural(photos.length, "photo trouvée", "photos trouvées")}
        hint="En grand, telles que le fournisseur les a mises en ligne. La première est la photo principale. Retirez celles d'autres produits."
        aside={<button type="button" className={btn.ghost} onClick={onReset} disabled={running}>Coller autre chose</button>}
      >
        {photos.length === 0 ? (
          <p className="text-sm text-ink-2">Aucune photo dans ce qui a été collé : sur la page du produit, faites <Kbd>Ctrl</Kbd>+<Kbd>A</Kbd> avant <Kbd>Ctrl</Kbd>+<Kbd>C</Kbd>. Vous pourrez aussi les ajouter dans l&apos;éditeur.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6" data-testid="supplier-photos">
            {photos.map((u, i) => (
              <li key={u} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt={`Photo ${i + 1}`} loading="lazy" className="aspect-square w-full rounded-xl border border-line bg-sand object-cover" />
                {i === 0 ? (
                  <span className="absolute start-1 top-1 rounded-full bg-ink/80 px-2 py-0.5 text-[11px] text-white">Principale</span>
                ) : (
                  <button type="button" disabled={running || Boolean(saved)} className="absolute start-1 top-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] text-ink shadow" onClick={() => setPhotos((p) => [u, ...p.filter((x) => x !== u)])}>
                    En premier
                  </button>
                )}
                <button type="button" aria-label={`Retirer la photo ${i + 1}`} disabled={running || Boolean(saved)} className="absolute end-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-base leading-none text-clay shadow" onClick={() => setPhotos((p) => p.filter((x) => x !== u))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {!draft && (
        <Card title="Les textes">
          {aiReady ? (
            writing ? (
              <p className="text-sm text-ink-2" role="status">L&apos;IA lit la page et écrit la fiche en français et en arabe tunisien… (environ 30 secondes)</p>
            ) : (
              <div className="flex flex-col gap-2 text-sm">
                {error && <p className="text-clay">{error}</p>}
                <button type="button" className={`${btn.sea} self-start`} onClick={write} disabled={empty}>Écrire la fiche avec l&apos;IA</button>
              </div>
            )
          ) : (
            <ManualDraft request={manualDraftRequest({ text: page, categories })} onDraft={accept} />
          )}
        </Card>
      )}

      {draft && form && (
        <Card
          title={m ? `Compléter « ${m.name} »` : "Le nouveau produit"}
          hint={m ? "Ce produit est déjà dans la boutique (même code fournisseur ou même nom) : il est complété, pas copié." : "Créé hors ligne : vous le relisez dans l'éditeur, puis vous le mettez en ligne."}
        >
          <div className="flex flex-col gap-3 text-sm">
            {m && (
              <label className="flex items-start gap-2 text-ink-2">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-sea" checked={form.replace} disabled={running || Boolean(saved)} onChange={(e) => setForm({ ...form, replace: e.target.checked })} />
                <span>Remplacer aussi son nom et ses textes déjà écrits (sinon seuls les textes vides sont remplis)</span>
              </label>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {(!m || form.replace) && (
                <label className={`${label} sm:col-span-2`}>
                  Nom
                  <input className={input} value={form.name} disabled={running || Boolean(saved)} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </label>
              )}
              <label className={label}>
                Prix de vente (DT)
                <input className={input} inputMode="decimal" value={form.price} disabled={running || Boolean(saved)} onChange={(e) => setForm({ ...form, price: e.target.value })} data-testid="supplier-price" />
              </label>
              <label className={label}>
                Coût fournisseur (DT)
                <input className={input} inputMode="decimal" value={form.cost} disabled={running || Boolean(saved)} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
              </label>
              <label className={label}>
                Catégorie
                <select className={input} value={form.category} disabled={running || Boolean(saved)} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {categories.map((x) => <option key={x} value={x}>{x}</option>)}
                  {form.category && !categories.includes(form.category) && <option value={form.category}>Nouvelle : {form.category}</option>}
                  <option value="">Sans catégorie</option>
                </select>
              </label>
              <label className={label}>
                Lien chez le fournisseur
                <input className={input} placeholder="https://www.ecomness.com/…" value={form.link} disabled={running || Boolean(saved)} onChange={(e) => setForm({ ...form, link: e.target.value })} />
              </label>
            </div>
            {(draft.supplierRef || productCode(page)) && <p className="text-xs text-muted">Code fournisseur : <span className="font-mono">{draft.supplierRef || productCode(page)}</span></p>}
            <DraftTexts draft={draft} />
            {error && <p className="text-clay">{error}</p>}
            <RunNote outcome={outcome} snap={snap} />
            {r?.state === "failed" && <p className="text-clay">{r.error}</p>}
            {!saved ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btn.sea} disabled={running} onClick={create} data-testid="supplier-create">
                  {running
                    ? r?.state === "saved" && r.pics.length ? `Photos… ${sent}/${r.pics.length}` : "Envoi…"
                    : m ? "Compléter le produit" : `Créer le produit hors ligne${photos.length ? ` avec ${plural(photos.length, "photo", "photos")}` : ""}`}
                </button>
                {aiReady && <button type="button" className={btn.ghost} disabled={running || writing} onClick={write}>{writing ? "Écriture…" : "Réécrire"}</button>}
              </div>
            ) : (
              <div className="flex flex-col gap-2 rounded-xl bg-olive-soft/60 p-3" role="status">
                <p className="text-ink">
                  {r?.created === false ? "Produit complété" : "Produit créé hors ligne"}
                  {saved.pics.length > 0 && ` : ${plural(saved.pics.filter((p) => p === "added").length, "photo ajoutée", "photos ajoutées")}`}
                  {saved.pics.includes("skipped") && `, ${plural(saved.pics.filter((p) => p === "skipped").length, "déjà là", "déjà là")}`}
                  {saved.pics.includes("failed") && `, ${plural(saved.pics.filter((p) => p === "failed").length, "photo non reçue", "photos non reçues")}`}.
                </p>
                {saved.picErrors.some(Boolean) && <p className="text-xs text-clay">{saved.picErrors.filter(Boolean).join(" ")}</p>}
                <div className="flex flex-wrap gap-2">
                  <Link href={`/admin/produits/${saved.id}`} className={btn.primary}>Ouvrir dans l&apos;éditeur</Link>
                  <button type="button" className={btn.ghost} onClick={onReset}>Coller un autre produit</button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {draft && draft.imageIdeas.length > 0 && <ImageIdeas ideas={draft.imageIdeas} photo={photos[0] ?? null} />}
    </div>
  );
}

/** What the AI wrote, both languages side by side; everything can be corrected in the editor afterwards. */
function DraftTexts({ draft }: { draft: Draft }) {
  const side = (lang: "fr" | "ar") => {
    const t = lang === "fr"
      ? { name: draft.name, summary: draft.summary, description: draft.description, specs: draft.specs, variants: draft.variants.map((v) => v.name) }
      : { name: draft.nameAr, summary: draft.summaryAr, description: draft.descriptionAr, specs: draft.specsAr, variants: draft.variants.map((v) => v.nameAr) };
    return (
      <div dir={lang === "ar" ? "rtl" : "ltr"} lang={lang} className="flex min-w-0 flex-col gap-2 rounded-xl border border-line p-3">
        <p className="font-semibold text-ink">{t.name || "—"}</p>
        {t.summary && <p className="text-ink-2">{t.summary}</p>}
        {t.description && <p className="whitespace-pre-line text-ink-2">{t.description}</p>}
        {t.specs && <p className="whitespace-pre-line text-xs text-muted">{t.specs}</p>}
        {t.variants.some(Boolean) && <p className="text-xs text-muted">{t.variants.filter(Boolean).join(" · ")}</p>}
      </div>
    );
  };
  return (
    <details open className="rounded-xl bg-sand/40 p-2">
      <summary className="cursor-pointer px-1 py-1 text-[13px] font-medium text-ink-2">Textes écrits (à relire ; tout se corrige ensuite dans l&apos;éditeur)</summary>
      <div className="mt-2 grid gap-2 md:grid-cols-2" data-testid="supplier-texts">
        {side("fr")}
        {side("ar")}
      </div>
    </details>
  );
}

/** Without an API key: the request goes to any chat assistant, its reply comes back here. */
function ManualDraft({ request, onDraft }: { request: string; onDraft: (d: Draft) => void }) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(false);
  const [reply, setReply] = useState("");
  const [bad, setBad] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(request);
      setCopied(true);
    } catch {
      // No clipboard (old browser, page not in https): the text is shown to copy by hand.
      setShown(true);
    }
  }
  function use() {
    const d = readDraftAnswer(reply);
    if (d) onDraft(d);
    else setBad(true);
  }
  return (
    <div className="grid gap-2 text-sm text-ink-2">
      <p>Pas d&apos;IA automatique (pas de clé <code>ANTHROPIC_API_KEY</code>) : la fiche s&apos;écrit avec claude.ai, gratuit.</p>
      <p>
        1. <button type="button" className={btn.sea} onClick={copy}>{copied ? "Demande copiée" : "Copier la demande"}</button>
      </p>
      {shown && <textarea readOnly aria-label="Demande à copier" className={`${input} h-28 font-mono text-xs`} value={request} onFocus={(e) => e.currentTarget.select()} />}
      <p>
        2. Ouvrez <a href="https://claude.ai/new" target="_blank" rel="noopener" className="text-sea underline underline-offset-4">claude.ai</a> (ou une autre IA), collez la demande et envoyez-la.
      </p>
      <p>3. Copiez toute sa réponse et collez-la ici :</p>
      <textarea aria-label="Réponse de l'IA" dir="auto" className={`${input} h-28 font-mono text-xs`} value={reply} onChange={(e) => { setReply(e.target.value); setBad(false); }} />
      {bad && <p className="text-clay">Réponse incomplète : copiez toute la réponse de l&apos;IA, du premier « {"{"} » au dernier « {"}"} ».</p>}
      <button type="button" className={`${btn.sea} self-start`} disabled={!reply.trim()} onClick={use}>Utiliser cette réponse</button>
    </div>
  );
}

/** The tall pictures to make in an image generator: one request per idea, to paste with the product's photo. */
function ImageIdeas({ ideas, photo }: { ideas: ImageIdea[]; photo: string | null }) {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
    } catch {
      window.prompt("Copiez la demande :", text);
    }
  }
  return (
    <Card
      title="Grandes images à faire (Gemini, ChatGPT…)"
      hint="Chaque idée vient d'un vrai point de la page. Dans l'outil d'images : joignez la photo du produit, collez la demande. Ajoutez ensuite l'image dans l'éditeur, partie « Images de description », avec sa langue. Faites-les d'abord pour les produits qui se vendent."
    >
      <div className="flex flex-col gap-3">
        {photo && <a href={photo} target="_blank" rel="noopener" className="self-start text-sm text-sea underline underline-offset-4">Ouvrir la photo principale (à enregistrer puis joindre)</a>}
        <ol className="flex flex-col divide-y divide-line">
          {ideas.map((idea, i) => (
            <li key={i} className="flex flex-col gap-1.5 py-2.5 text-sm">
              <p dir="rtl" lang="ar" className="font-semibold text-ink">{idea.headlineAr}</p>
              <p className="text-ink-2">{idea.headlineFr}</p>
              <p className="text-xs text-muted">{idea.scene}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btn.ghost} onClick={() => copy(`${i}ar`, imagePrompt(idea, "ar"))}>{copied === `${i}ar` ? "Copiée" : "Copier la demande (arabe)"}</button>
                <button type="button" className={btn.ghost} onClick={() => copy(`${i}fr`, imagePrompt(idea, "fr"))}>{copied === `${i}fr` ? "Copiée" : "Copier la demande (français)"}</button>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}
