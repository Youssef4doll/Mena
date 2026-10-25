"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { applyToProduct, completionDone, readReport, searchProduct, type Candidates } from "./actions";
import { TEXT_KEYS, WEB_BATCH, readWebReply, webBatchRequest, type WebTexts } from "@/lib/web-complete-prompt";
import { readLinks, searchLinks } from "@/lib/web-product";
import { parseVideo } from "@/lib/product-content";
import { Badge, Card, Empty, btn } from "@/components/admin/ui";

export type ToComplete = {
  id: string; name: string; nameAr: string; active: boolean; score: number; lacks: string[];
  photo: string | null; gallery: number; details: number; hasVideo: boolean;
  /** Where the product's pictures came from: a picture found again is not offered twice. */
  sources: string[];
  /** The product's texts now, to say what a found text would replace. */
  current: Record<keyof WebTexts, string>;
};

type State = { s: "busy"; what: string } | { s: "error"; error: string } | { s: "ready"; c: Candidates } | { s: "applied"; summary: string; failed: string[] };

const TEXT_LABELS: Record<keyof WebTexts, string> = {
  summary: "Phrase sous le nom", summaryAr: "Phrase sous le nom (arabe)", description: "Description", descriptionAr: "Description (arabe)",
  specs: "Caractéristiques", specsAr: "Caractéristiques (arabe)", keywords: "Mots-clés de recherche",
  seoTitle: "Titre Google", seoTitleAr: "Titre Google (arabe)", seoDescription: "Description Google", seoDescriptionAr: "Description Google (arabe)",
};
/** A photo this small is a thumbnail or a drawing of the site, not a product photo. */
const MIN_SIDE = 400;
/** Taller than this (height / width): a long picture for under the description, as on Amazon. */
const TALL = 1.6;
const WANT_PHOTOS = 5;
const WANT_LONG = 2;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/**
 * Completing many product pages from the web. With the API key, the AI
 * searches each product, one after the other; without it, the owner sends a
 * request for a few products to claude.ai and pastes its reply. Either way
 * the shop reads the pages found (and the owner's own links) for their large
 * pictures and videos, and each product waits for the owner's choice: which
 * photos, which long pictures, which video, which texts. "Appliquer" saves
 * that product only.
 */
export function CompleteBatch({ products, aiReady }: { products: ToComplete[]; aiReady: boolean }) {
  const [items] = useState(products);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(products.slice(0, 5).map((p) => p.id)));
  const [states, setStates] = useState<Record<string, State>>({});
  const [linksOf, setLinksOf] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const stop = useRef(false);
  const applied = useRef(new Set<string>());

  if (items.length === 0) return <Empty>Toutes les fiches ont leurs photos, leur description et leur vidéo.</Empty>;
  const set = (id: string, st: State) => setStates((x) => ({ ...x, [id]: st }));
  const chosen = items.filter((p) => picked.has(p.id));
  const waiting = chosen.filter((p) => !states[p.id] || states[p.id].s === "error");

  async function search(p: ToComplete) {
    set(p.id, { s: "busy", what: aiReady ? "Recherche sur le web… une à deux minutes" : "Lecture des liens…" });
    const r = await searchProduct(p.id, readLinks(linksOf[p.id] ?? "")).catch(() => ({ ok: false as const, error: "Pas de connexion : réessayez.", stop: true }));
    if (r.ok) set(p.id, { s: "ready", c: r.candidates });
    else set(p.id, { s: "error", error: r.error });
    return r;
  }

  async function searchAll() {
    stop.current = false;
    setNotice(null);
    setRunning(true);
    for (const p of waiting) {
      if (stop.current) break;
      const r = await search(p);
      if (!r.ok && r.stop) {
        setNotice(r.error);
        break;
      }
    }
    setRunning(false);
  }

  async function onApplied(p: ToComplete, summary: string, failed: string[]) {
    set(p.id, { s: "applied", summary, failed });
    applied.current.add(p.id);
    await completionDone([p.id]).catch(() => {});
  }

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <Card title={aiReady ? "Recherche automatique" : "Recherche avec claude.ai (gratuit)"} hint={aiReady ? "L'IA cherche chaque produit coché sur le web, un après l'autre : environ une à deux minutes par produit, payées sur votre compte Anthropic. Essayez d'abord sur quelques produits." : "Pas de clé ANTHROPIC_API_KEY : copiez la demande dans claude.ai (qui cherche sur le web), puis collez sa réponse. Vous pouvez aussi coller vous-même des liens sous chaque produit."}>
        <div className="flex flex-wrap items-center gap-2" data-testid="complete-select">
          <span className="text-sm text-ink-2">{plural(chosen.length, "produit coché", "produits cochés")} sur {items.length}</span>
          <button type="button" className={btn.ghost} onClick={() => setPicked(new Set(items.slice(0, 5).map((p) => p.id)))}>Les 5 plus faibles</button>
          <button type="button" className={btn.ghost} onClick={() => setPicked(new Set(items.map((p) => p.id)))}>Tout cocher</button>
          <button type="button" className={btn.ghost} onClick={() => setPicked(new Set())}>Tout décocher</button>
        </div>
        {aiReady ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {running ? (
              <button type="button" className={btn.ghost} onClick={() => (stop.current = true)}>Arrêter après ce produit</button>
            ) : (
              <button type="button" className={btn.sea} disabled={waiting.length === 0} onClick={searchAll}>
                {waiting.length === 1 ? "Chercher ce produit" : `Chercher les ${waiting.length} produits cochés`}
              </button>
            )}
            {notice && <p className="text-sm text-danger">{notice}</p>}
          </div>
        ) : (
          <ManualSearch products={chosen} onReport={async (p, report) => {
            set(p.id, { s: "busy", what: "Lecture des pages trouvées…" });
            const r = await readReport(p.id, report, readLinks(linksOf[p.id] ?? "")).catch(() => ({ ok: false as const, error: "Pas de connexion : réessayez.", stop: true }));
            set(p.id, r.ok ? { s: "ready", c: r.candidates } : { s: "error", error: r.error });
          }} />
        )}
      </Card>

      <ul className="flex flex-col gap-3" data-testid="complete-list">
        {items.map((p) => (
          <ProductBlock
            key={p.id}
            p={p}
            picked={picked.has(p.id)}
            onPick={() => toggle(p.id)}
            state={states[p.id]}
            links={linksOf[p.id] ?? ""}
            onLinks={(v) => setLinksOf((x) => ({ ...x, [p.id]: v }))}
            onSearch={() => void search(p)}
            aiReady={aiReady}
            running={running}
            onApplied={(summary, failed) => onApplied(p, summary, failed)}
          />
        ))}
      </ul>
    </>
  );
}

/**
 * Without the key: the request for the next few products checked, to send to
 * claude.ai, and its reply pasted back; each product's answer is matched by
 * its "ref" and its pages read by the server.
 */
function ManualSearch({ products, onReport }: { products: ToComplete[]; onReport: (p: ToComplete, report: unknown) => Promise<void> }) {
  const [start, setStart] = useState(0);
  const [reply, setReply] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const batch = products.slice(start, start + WEB_BATCH);
  const refs = batch.map((p, i) => ({ p, ref: `P${start + i + 1}` }));
  if (products.length === 0) return <p className="mt-3 text-sm text-muted">Cochez les produits à compléter.</p>;
  const request = webBatchRequest(refs.map(({ p, ref }) => ({ ref, name: p.name, nameAr: p.nameAr, summary: p.current.summary, description: p.current.description, specs: p.current.specs })));

  async function read() {
    const answers = readWebReply(reply);
    const hits = refs.filter(({ ref }) => answers.has(ref));
    if (!hits.length) {
      setError("Réponse illisible : copiez toute la réponse de claude.ai, du premier « [ » au dernier « ] ».");
      return;
    }
    setError(null);
    setBusy(true);
    for (const { p, ref } of hits) await onReport(p, answers.get(ref));
    setBusy(false);
    setReply("");
    if (start + WEB_BATCH < products.length) setStart(start + WEB_BATCH);
  }

  return (
    <div className="mt-3 flex flex-col gap-2" data-testid="manual-search">
      <p className="text-sm text-ink-2">
        Demande pour {batch.map((p) => `« ${p.name} »`).join(", ")}
        {products.length > WEB_BATCH && ` (${Math.floor(start / WEB_BATCH) + 1} sur ${Math.ceil(products.length / WEB_BATCH)})`}.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btn.sea}
          onClick={async () => {
            await navigator.clipboard.writeText(request).catch(() => {});
            setCopied(true);
          }}
        >
          {copied ? "Demande copiée" : "Copier la demande"}
        </button>
        <a href="https://claude.ai/new" target="_blank" rel="noopener" className={btn.ghost}>Ouvrir claude.ai</a>
        {products.length > WEB_BATCH && (
          <button type="button" className={btn.ghost} onClick={() => { setStart(start + WEB_BATCH >= products.length ? 0 : start + WEB_BATCH); setCopied(false); }}>
            Produits suivants
          </button>
        )}
      </div>
      <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} placeholder="Collez ici toute la réponse de claude.ai" className="w-full rounded-xl border border-line bg-white p-3 text-sm outline-none focus:border-sea" aria-label="Réponse de claude.ai" />
      {error && <p className="text-sm text-danger">{error}</p>}
      <div>
        <button type="button" className={btn.primary} disabled={!reply.trim() || busy} onClick={read}>{busy ? "Lecture des pages…" : "Lire la réponse"}</button>
      </div>
    </div>
  );
}

function ProductBlock({ p, picked, onPick, state, links, onLinks, onSearch, aiReady, running, onApplied }: {
  p: ToComplete; picked: boolean; onPick: () => void; state: State | undefined; links: string; onLinks: (v: string) => void; onSearch: () => void; aiReady: boolean; running: boolean;
  onApplied: (summary: string, failed: string[]) => Promise<void>;
}) {
  const busy = state?.s === "busy";
  return (
    <li className="rounded-2xl border border-line bg-white p-4" data-testid="complete-item">
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={picked} onChange={onPick} className="mt-3 h-5 w-5 shrink-0 accent-[var(--color-sea)]" aria-label={`Choisir ${p.name}`} />
        {p.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/img/${p.photo}/96`} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-line bg-sand object-cover" />
        ) : (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-sand text-[11px] text-muted">—</span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/produits/${p.id}`} target="_blank" prefetch={false} className="text-sm font-medium text-ink underline-offset-4 hover:underline">{p.name}</Link>
            <Badge tone={p.score >= 80 ? "ok" : p.score >= 50 ? "warn" : "danger"}>{p.score}/100</Badge>
            {!p.active && <Badge>Hors ligne</Badge>}
            {state?.s === "applied" && <Badge tone="ok">Complété</Badge>}
          </div>
          <p className="text-[12px] text-muted">{p.lacks.join(" · ")}</p>
          <p className="flex flex-wrap gap-x-3 text-[12px]">
            {searchLinks(p.name).map((l) => (
              <a key={l.label} href={l.url} target="_blank" rel="noopener" className="inline-flex min-h-8 items-center text-sea underline underline-offset-4">{l.label}</a>
            ))}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:ps-8">
        <textarea
          value={links}
          onChange={(e) => onLinks(e.target.value)}
          rows={2}
          placeholder={aiReady ? "Facultatif : vos liens (page du produit chez la marque, Amazon…, ou adresse d'une photo), un par ligne" : "Liens de pages du produit (marque, Amazon…) ou adresses de photos, un par ligne"}
          className="w-full rounded-xl border border-line bg-white p-2.5 text-sm outline-none focus:border-sea"
          aria-label={`Liens pour ${p.name}`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={btn.ghost} disabled={busy || running || (!aiReady && !readLinks(links).length)} onClick={onSearch}>
            {aiReady ? (state?.s === "ready" || state?.s === "applied" ? "Chercher de nouveau" : "Chercher ce produit") : "Lire ces liens"}
          </button>
          {busy && <span className="text-sm text-muted" role="status">{state.what}</span>}
          {state?.s === "error" && <span className="text-sm text-danger">{state.error}</span>}
        </div>
        {state?.s === "ready" && <Choices p={p} c={state.c} onApplied={onApplied} />}
        {state?.s === "applied" && (
          <div className="rounded-xl bg-olive-soft px-3 py-2 text-sm text-olive" role="status">
            {state.summary}
            {state.failed.map((f) => <p key={f} className="text-[12px] text-clay">{f}</p>)}
          </div>
        )}
      </div>
    </li>
  );
}

type Size = { w: number; h: number } | "bad";

/** What was found for one product, to choose from; "Appliquer" saves this product. */
function Choices({ p, c: all, onApplied }: { p: ToComplete; c: Candidates; onApplied: (summary: string, failed: string[]) => Promise<void> }) {
  const [c] = useState(() => ({ ...all, images: all.images.filter((i) => !p.sources.includes(i.url)) }));
  const already = all.images.length - c.images.length;
  // The owner's choice once they made one; until then, the one proposed below.
  const [picked, setPicked] = useState<Record<string, "GALLERY" | "DETAIL"> | null>(null);
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const [video, setVideo] = useState<string | null>(() => (!p.hasVideo && c.videos[0]) || null);
  const [texts, setTexts] = useState<Partial<WebTexts>>(c.texts);
  // A text is taken by default only where the product has none (a description of a few words counts as none).
  const [use, setUse] = useState<Set<keyof WebTexts>>(
    () => new Set(TEXT_KEYS.filter((k) => c.texts[k] && (k === "description" ? p.current.description.trim().length < 60 : !p.current[k].trim()))),
  );
  const [found, setFound] = useState(c.found);
  const [useFound, setUseFound] = useState(!c.texts.description && Boolean(c.found) && p.current.description.trim().length < 60);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Proposed once every picture has answered, in the pages' order: the first large ones as the photos the product
  // lacks, and the first tall ones (a brand's long pictures, like Amazon's) as the long pictures it lacks.
  const settled = c.images.every((i) => sizes[i.url]);
  const proposed = useMemo(() => {
    if (!settled) return {};
    const good = c.images.filter((i) => sizes[i.url] && sizes[i.url] !== "bad");
    const tall = (url: string) => {
      const s = sizes[url] as { w: number; h: number };
      return s.h / s.w >= TALL;
    };
    const photos = good.filter((i) => !tall(i.url)).slice(0, Math.max(0, WANT_PHOTOS - p.gallery));
    const longs = good.filter((i) => tall(i.url)).slice(0, Math.max(0, WANT_LONG - p.details));
    return Object.fromEntries([...photos.map((i) => [i.url, "GALLERY" as const]), ...longs.map((i) => [i.url, "DETAIL" as const])]);
  }, [settled, sizes, c.images, p.gallery, p.details]);
  const kinds = picked ?? proposed;

  const choose = (url: string, kind: "GALLERY" | "DETAIL") => {
    const n = { ...kinds };
    if (n[url] === kind) delete n[url];
    else n[url] = kind;
    setPicked(n);
  };
  const shown = c.images.filter((i) => sizes[i.url] !== "bad");
  const hidden = c.images.length - shown.length;
  const photos = c.images.filter((i) => kinds[i.url] === "GALLERY");
  const longs = c.images.filter((i) => kinds[i.url] === "DETAIL");
  const textCount = use.size + (useFound && found.trim() ? 1 : 0);
  const nothing = !photos.length && !longs.length && !video && !textCount;

  async function apply() {
    setBusy("Enregistrement…");
    setError(null);
    const chosen: Partial<WebTexts> = Object.fromEntries([...use].map((k) => [k, texts[k] ?? ""]));
    if (useFound && found.trim() && !use.has("description")) chosen.description = found.trim();
    const r = await applyToProduct(p.id, { texts: chosen, video }).catch(() => ({ ok: false as const, error: "Pas de connexion : réessayez." }));
    if (!r.ok) {
      setError(r.error);
      setBusy(null);
      return;
    }
    const failed: string[] = [];
    let added = 0;
    const all = [...photos.map((i) => ({ ...i, kind: "GALLERY" as const })), ...longs.map((i) => ({ ...i, kind: "DETAIL" as const }))];
    for (const [n, i] of all.entries()) {
      setBusy(`Photo ${n + 1} sur ${all.length}…`);
      const res = (await fetch(`/admin/produits/${p.id}/images`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: i.url, kind: i.kind }) })
        .then((x) => x.json())
        .catch(() => ({ ok: false, error: "Pas de connexion." }))) as { ok: boolean; skipped?: boolean; error?: string };
      if (res.ok) added += res.skipped ? 0 : 1;
      else failed.push(`${i.from} : ${res.error ?? "photo refusée"}`);
    }
    const parts = [
      added ? plural(added, "photo ajoutée", "photos ajoutées") : null,
      video ? "vidéo ajoutée" : null,
      textCount ? plural(textCount, "texte enregistré", "textes enregistrés") : null,
    ].filter(Boolean);
    setBusy(null);
    await onApplied(parts.length ? `${parts.join(", ")}.` : "Rien de nouveau.", failed);
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-line bg-sand/40 p-3" data-testid="complete-choices">
      {c.notes.length > 0 && <ul className="text-[12px] text-[#8a5a00]">{c.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      {c.pages.length > 0 && (
        <div className="text-[12px] text-ink-2">
          Pages lues :{" "}
          {c.pages.map((pg, i) => (
            <span key={pg.url}>
              {i > 0 && " · "}
              <a href={pg.url} target="_blank" rel="noopener" className="text-sea underline underline-offset-2">{pg.title.slice(0, 60) || host(pg.url)}</a>
              {!pg.sure && " (à vérifier)"}
            </span>
          ))}
        </div>
      )}

      <section>
        <h3 className="text-sm font-semibold text-ink">
          Photos trouvées {photos.length + longs.length > 0 && <span className="font-normal text-muted">· {plural(photos.length, "photo", "photos")}, {plural(longs.length, "grande image", "grandes images")} choisies</span>}
        </h3>
        <p className="text-[12px] text-muted">« Photo » : en haut de la fiche. « Grande image » : sous la description. Préférez les photos de la marque ; celles d&apos;un autre vendeur (ses mises en scène) sont à lui.</p>
        {c.images.length === 0 ? (
          <p className="mt-1 text-sm text-muted">Aucune nouvelle photo trouvée{p.gallery ? "" : " : collez l'adresse d'une photo ou d'une autre page"}.</p>
        ) : (
          <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6" data-testid="found-images">
            {c.images.map((i) => {
              const s = sizes[i.url];
              const k = kinds[i.url];
              return (
                <li key={i.url} className={`${s === "bad" ? "hidden" : "flex"} flex-col gap-1 rounded-lg border p-1.5 ${k ? "border-sea bg-sea-soft/50" : "border-line bg-white"}`}>
                  <a href={i.url} target="_blank" rel="noopener" className="grid h-28 place-items-center overflow-hidden rounded-md bg-white">
                    {/* Shown from the other site as it is: the shop downloads it only if chosen. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={i.url}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="max-h-28 max-w-full object-contain"
                      onLoad={(e) => {
                        const el = e.currentTarget;
                        const ok = Math.min(el.naturalWidth, el.naturalHeight) >= MIN_SIDE || (el.naturalWidth >= MIN_SIDE && el.naturalHeight / el.naturalWidth >= TALL);
                        setSizes((x) => ({ ...x, [i.url]: ok ? { w: el.naturalWidth, h: el.naturalHeight } : "bad" }));
                      }}
                      onError={() => setSizes((x) => ({ ...x, [i.url]: "bad" }))}
                    />
                  </a>
                  <span className="truncate text-[11px] text-muted">{s && s !== "bad" ? `${s.w} × ${s.h} · ` : ""}{i.from}</span>
                  <span className="flex gap-1">
                    <button type="button" aria-pressed={k === "GALLERY"} onClick={() => choose(i.url, "GALLERY")} className={`flex-1 rounded-md border px-1 py-1 text-[11px] ${k === "GALLERY" ? "border-sea bg-sea text-white" : "border-line bg-white text-ink-2"}`}>Photo</button>
                    <button type="button" aria-pressed={k === "DETAIL"} onClick={() => choose(i.url, "DETAIL")} className={`flex-1 rounded-md border px-1 py-1 text-[11px] ${k === "DETAIL" ? "border-sea bg-sea text-white" : "border-line bg-white text-ink-2"}`}>Grande image</button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {hidden > 0 && <p className="mt-1 text-[12px] text-muted">{plural(hidden, "image trop petite ou illisible masquée", "images trop petites ou illisibles masquées")}.</p>}
        {already > 0 && <p className="mt-1 text-[12px] text-muted">{plural(already, "photo déjà sur la fiche", "photos déjà sur la fiche")}.</p>}
      </section>

      {c.videos.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-ink">Vidéo {p.hasVideo && <span className="font-normal text-muted">· la fiche en a déjà une : la choisir la remplace</span>}</h3>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Vidéo">
            {c.videos.map((v) => {
              const yt = parseVideo(v);
              return (
                <label key={v} className={`flex w-48 cursor-pointer flex-col gap-1 rounded-lg border p-1.5 ${video === v ? "border-sea bg-sea-soft/50" : "border-line bg-white"}`}>
                  {yt?.kind === "youtube" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`https://i.ytimg.com/vi/${yt.id}/mqdefault.jpg`} alt="" className="aspect-video w-full rounded-md object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="grid aspect-video place-items-center rounded-md bg-sand text-[12px] text-muted">{host(v)}</span>
                  )}
                  <span className="flex items-center gap-1.5 text-[12px]">
                    <input type="radio" name={`video-${p.id}`} checked={video === v} onChange={() => setVideo(v)} />
                    <a href={v} target="_blank" rel="noopener" className="truncate text-sea underline underline-offset-2">Voir</a>
                  </span>
                </label>
              );
            })}
            <label className="flex items-center gap-1.5 px-2 text-[12px] text-ink-2">
              <input type="radio" name={`video-${p.id}`} checked={video === null} onChange={() => setVideo(null)} />
              Aucune
            </label>
          </div>
        </section>
      )}

      {TEXT_KEYS.some((k) => texts[k]) && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink">Textes écrits par l&apos;IA <span className="font-normal text-muted">· à relire, surtout l&apos;arabe</span></h3>
          {TEXT_KEYS.filter((k) => c.texts[k]).map((k) => {
            const now = p.current[k];
            return (
              <div key={k} className="flex flex-col gap-1">
                <label className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
                  <input type="checkbox" checked={use.has(k)} onChange={() => setUse((u) => { const n = new Set(u); if (n.has(k)) n.delete(k); else n.add(k); return n; })} />
                  {TEXT_LABELS[k]} {now.trim() ? <span className="font-normal text-muted">· remplace le texte actuel</span> : <span className="font-normal text-olive">· vide aujourd&apos;hui</span>}
                </label>
                <textarea
                  value={texts[k] ?? ""}
                  onChange={(e) => setTexts((t) => ({ ...t, [k]: e.target.value }))}
                  rows={k.startsWith("description") || k.startsWith("specs") ? 6 : 2}
                  dir={k.endsWith("Ar") ? "rtl" : "ltr"}
                  className="w-full rounded-xl border border-line bg-white p-2.5 text-sm outline-none focus:border-sea"
                  aria-label={TEXT_LABELS[k]}
                />
              </div>
            );
          })}
        </section>
      )}

      {!c.texts.description && c.found && (
        <section className="flex flex-col gap-1">
          <label className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
            <input type="checkbox" checked={useFound} onChange={() => setUseFound((x) => !x)} />
            Description trouvée sur la page {p.current.description.trim() ? <span className="font-normal text-muted">· remplace la description actuelle</span> : <span className="font-normal text-olive">· vide aujourd&apos;hui</span>}
          </label>
          <p className="text-[12px] text-muted">Le texte d&apos;un autre site : réécrivez-le avec vos mots, en français (Google classe moins bien un texte copié). L&apos;arabe se fait ensuite avec « Traduire en lot ».</p>
          <textarea value={found} onChange={(e) => setFound(e.target.value)} rows={6} className="w-full rounded-xl border border-line bg-white p-2.5 text-sm outline-none focus:border-sea" aria-label="Description trouvée" />
        </section>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn.sea} disabled={busy != null || nothing} onClick={apply} data-testid="complete-apply">
          {busy ?? "Appliquer à ce produit"}
        </button>
        <span className="text-[12px] text-muted">
          {[photos.length && plural(photos.length, "photo", "photos"), longs.length && plural(longs.length, "grande image", "grandes images"), video && "1 vidéo", textCount && plural(textCount, "texte", "textes")].filter(Boolean).join(" · ") || "Rien de choisi"}
        </span>
      </div>
    </div>
  );
}
