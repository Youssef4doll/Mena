"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { applyTranslations, translateStored, translationsDone, type Outcome } from "./actions";
import type { ProductTexts } from "@/lib/translate-merge";
import { batchRequest, readBatchReply, splitBatches } from "@/lib/translate-batch";
import { Badge, Card, Empty, btn, input } from "@/components/admin/ui";

type Item = { id: string; name: string; texts: ProductTexts };

/** "1 produit traduit", "3 produits traduits". */
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Translating many products at once. With an API key, one product after the
 * other on the server; without one, batches copied into claude.ai (free) and
 * their replies pasted back. Either way the server fills only the empty
 * fields. The list stays as first shown: once a run is over the page
 * re-renders with fewer products, and the results must stay on screen.
 * `chosen`: only the products of "?ids=", so the empty state speaks of them.
 */
export function TranslateBatch({ products, aiReady, chosen }: { products: Item[]; aiReady: boolean; chosen: boolean }) {
  const [items] = useState(products);
  if (items.length === 0) return <Empty>{chosen ? "Les produits choisis ont leurs textes dans les deux langues." : "Tous les produits ont leurs textes dans les deux langues."}</Empty>;
  return (
    <>
      <Card>
        <p className="text-sm text-ink-2">
          {count(items.length, "produit a", "produits ont")} un texte dans une seule langue, ou pas encore de mots-clés de recherche.
        </p>
        <p className="mt-1 text-sm text-ink-2">Seuls les champs vides sont remplis : rien de ce qui est déjà écrit n&apos;est remplacé.</p>
        <p className="mt-1 text-sm font-medium text-ink">Relisez les textes arabes : la traduction peut se tromper.</p>
      </Card>
      {aiReady ? <AutoRun items={items} /> : <ManualRun items={items} />}
    </>
  );
}

/** One product's result. "Pas traduit": the reply had nothing for it. */
function OutcomeBadge({ o }: { o: Outcome }) {
  if (o.status === "translated") return o.left ? <Badge tone="warn">Traduit en partie</Badge> : <Badge tone="ok">Traduit</Badge>;
  if (o.status === "nothing") return o.left ? <Badge tone="warn">Pas traduit</Badge> : <Badge>Déjà traduit</Badge>;
  if (o.status === "missing") return <Badge tone="danger">Introuvable</Badge>;
  return <Badge tone="danger">Trop long</Badge>;
}

/** What to do about a result, when there is something to do. */
const outcomeNote = (o: Outcome) => (o.status === "invalid" ? "Traduction trop longue pour être enregistrée : traduisez ce produit dans sa fiche." : undefined);

/** A product of the list, with a link to read it again in its editor (in a new tab, so the run goes on; not prefetched: up to 500 of them). */
function ProductLine({ item, note, children }: { item: Item; note?: string; children?: React.ReactNode }) {
  return (
    <li className="flex min-w-0 items-center gap-2 py-1.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{item.name}</span>
        {children && <span className="mt-0.5 flex flex-wrap gap-1">{children}</span>}
        {note && <span className="mt-0.5 block text-xs text-danger">{note}</span>}
      </span>
      <Link href={`/admin/produits/${item.id}`} target="_blank" prefetch={false} className="inline-flex h-10 shrink-0 items-center px-1 text-sm text-sea underline underline-offset-4">
        Ouvrir
      </Link>
    </li>
  );
}

/** How far a run has gone. */
function Progress({ value, max }: { value: number; max: number }) {
  return (
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-sand" role="progressbar" aria-label="Avancement" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className="h-full rounded-full bg-sea transition-[width]" style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
    </div>
  );
}

type Run = { state: "running" } | { state: "done"; outcome: Outcome } | { state: "error"; error: string };

/**
 * With the API key: one action per product, one after the other (actions are
 * sent one at a time anyway). Each product is saved as soon as it is
 * translated, so stopping loses nothing; the shop is refreshed once, at the end.
 */
function AutoRun({ items }: { items: Item[] }) {
  const [runs, setRuns] = useState<Record<string, Run>>({});
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const stop = useRef(false);

  const todo = items.filter((p) => runs[p.id]?.state !== "done");
  const finished = items.length - todo.length;
  const translated = items.filter((p) => {
    const r = runs[p.id];
    return r?.state === "done" && r.outcome.status === "translated";
  }).length;
  const failed = items.filter((p) => runs[p.id]?.state === "error").length;

  async function start() {
    stop.current = false;
    setStopping(false);
    setNotice(null);
    setRunning(true);
    let wrote = false;
    for (const p of todo) {
      if (stop.current) break;
      setRuns((x) => ({ ...x, [p.id]: { state: "running" } }));
      const r = await translateStored(p.id).catch(() => ({ ok: false as const, error: "Pas de connexion : réessayez.", stop: true }));
      if (r.ok) {
        if (r.result.status === "translated") wrote = true;
        setRuns((x) => ({ ...x, [p.id]: { state: "done", outcome: r.result } }));
        continue;
      }
      if (r.stop) {
        // Not this product's fault (key, limit, service down): it waits for the next run, the reason is said once.
        setRuns((x) => Object.fromEntries(Object.entries(x).filter(([id]) => id !== p.id)));
        setNotice(r.error);
        break;
      }
      setRuns((x) => ({ ...x, [p.id]: { state: "error", error: r.error } }));
    }
    if (wrote) await translationsDone().catch(() => {});
    setRunning(false);
  }

  return (
    <Card title="Traduction automatique" hint="Un produit après l'autre, enregistré dès qu'il est traduit. Arrêter garde ce qui est déjà fait.">
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <button
            type="button"
            className={btn.ghost}
            disabled={stopping}
            onClick={() => {
              stop.current = true;
              setStopping(true);
            }}
          >
            {stopping ? "Arrêt après ce produit…" : "Arrêter"}
          </button>
        ) : (
          todo.length > 0 && (
            <button type="button" className={btn.sea} onClick={start}>
              {todo.length === 1 ? "Traduire le produit" : `Traduire les ${todo.length} produits`}
            </button>
          )
        )}
        <span className="text-sm tabular-nums text-muted">{finished} sur {items.length}</span>
      </div>
      <Progress value={finished} max={items.length} />
      {notice && <p className="mt-3 text-sm text-danger">{notice}</p>}
      {!running && (finished > 0 || failed > 0) && (
        <p className="mt-3 text-sm text-ink-2">
          {count(translated, "produit traduit", "produits traduits")} sur {items.length}.
          {failed > 0 && ` ${count(failed, "erreur", "erreurs")} : relancez pour réessayer ${failed === 1 ? "ce produit" : "ces produits"}.`}
        </p>
      )}
      <ul className="mt-2 divide-y divide-line">
        {items.map((p) => {
          const r = runs[p.id];
          return (
            <ProductLine key={p.id} item={p} note={r?.state === "error" ? r.error : r?.state === "done" ? outcomeNote(r.outcome) : undefined}>
              {!r ? <Badge>En attente</Badge> : r.state === "running" ? <Badge tone="info">En cours</Badge> : r.state === "error" ? <Badge tone="danger">Erreur</Badge> : <OutcomeBadge o={r.outcome} />}
            </ProductLine>
          );
        })}
      </ul>
    </Card>
  );
}

/** A batch of products; once its reply is in, what happened to each, and the batches its leftovers went to. */
type Batch = { items: Item[]; outcomes?: Record<string, Outcome>; again?: { count: number; from: number; to: number } };

/**
 * Without an API key: batches of at most 8 products, each copied into
 * claude.ai and its reply pasted back, in any order. Products missing from a
 * reply, or still missing a text, go into a new batch at the end. One reply is
 * sent at a time; the shop is refreshed once every batch is in.
 */
function ManualRun({ items }: { items: Item[] }) {
  const [batches, setBatches] = useState<Batch[]>(() => splitBatches(items).map((b) => ({ items: b })));
  const [busy, setBusy] = useState(false);
  // Products, not results: a product asked again in a later batch is counted once.
  const translatedIn = (bs: Batch[]) => new Set(bs.flatMap((b) => Object.values(b.outcomes ?? {}).flatMap((o) => (o.status === "translated" ? [o.id] : [])))).size;
  const done = batches.filter((b) => b.outcomes).length;

  async function apply(index: number, reply: string): Promise<string | null> {
    const batch = batches[index];
    const { found, read } = readBatchReply(batch.items, reply);
    if (found.length === 0 && read > 0) return "Cette réponse est celle d'un autre lot : collez-la dans le lot dont vous avez copié la demande.";
    if (found.length === 0) return "Réponse illisible : copiez toute la réponse, du premier « [ » au dernier « ] ».";
    setBusy(true);
    try {
      const r = await applyTranslations(found.map((f) => ({ id: f.item.id, texts: f.texts }))).catch(() => null);
      if (!r) return "Envoi impossible : vérifiez la connexion et réessayez.";
      if (!r.ok) return r.error;
      const outcomes = Object.fromEntries(r.results.map((o) => [o.id, o]));
      // Asked again: absent from the reply, or still a text in one language only (with the texts as saved now).
      const again = batch.items.flatMap((p) => {
        const o = outcomes[p.id];
        if (!o) return [p];
        return o.left && (o.status === "translated" || o.status === "nothing") ? [{ ...p, texts: o.texts ?? p.texts }] : [];
      });
      const extra = splitBatches(again).map((b) => ({ items: b }));
      const next: Batch[] = [
        ...batches.map((b, i) => (i === index ? { ...b, outcomes, again: extra.length ? { count: again.length, from: batches.length + 1, to: batches.length + extra.length } : undefined } : b)),
        ...extra,
      ];
      setBatches(next);
      if (next.every((b) => b.outcomes) && translatedIn(next) > 0) await translationsDone().catch(() => {});
      return null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card title="Avec claude.ai (gratuit)" hint="Pas de clé ANTHROPIC_API_KEY : pour chaque lot, copiez la demande, envoyez-la dans claude.ai, puis collez toute sa réponse dans le lot. Les lots se font dans n'importe quel ordre.">
        <p className="text-sm font-medium tabular-nums text-ink">
          {count(done, "lot fait", "lots faits")} sur {batches.length} · {count(translatedIn(batches), "produit traduit", "produits traduits")}
        </p>
        <Progress value={done} max={batches.length} />
        {done === batches.length && <p className="mt-3 text-sm text-ink-2">Tous les lots sont faits.</p>}
      </Card>
      {batches.map((b, i) => (
        <BatchCard key={i} n={i + 1} total={batches.length} batch={b} busy={busy} onApply={(reply) => apply(i, reply)} />
      ))}
    </>
  );
}

/** One batch: copy its request, paste the reply back. A done batch keeps its result, its products folded. */
function BatchCard({ n, total, batch, busy, onApply }: { n: number; total: number; batch: Batch; busy: boolean; onApply: (reply: string) => Promise<string | null> }) {
  const [shown, setShown] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const size = batch.items.length;
  const title = `Lot ${n} sur ${total} · ${count(size, "produit", "produits")}`;

  if (batch.outcomes) {
    const outcomes = batch.outcomes;
    const translated = batch.items.filter((p) => outcomes[p.id]?.status === "translated").length;
    return (
      <Card title={title} aside={<Badge tone="ok">Fait</Badge>}>
        <p className="text-sm text-ink-2">
          {count(translated, "produit traduit", "produits traduits")} sur {size}.
          {batch.again && ` ${count(batch.again.count, "produit remis", "produits remis")} ${batch.again.from === batch.again.to ? `dans le lot ${batch.again.from}` : `dans les lots ${batch.again.from} à ${batch.again.to}`}.`}
        </p>
        <details className="mt-1">
          <summary className="flex h-10 cursor-pointer items-center text-sm text-sea">Voir les produits</summary>
          <ul className="divide-y divide-line">
            {batch.items.map((p) => (
              <ProductLine key={p.id} item={p} note={outcomes[p.id] && outcomeNote(outcomes[p.id])}>
                {outcomes[p.id] ? <OutcomeBadge o={outcomes[p.id]} /> : <Badge tone="warn">Pas dans la réponse</Badge>}
              </ProductLine>
            ))}
          </ul>
        </details>
      </Card>
    );
  }

  async function copy() {
    const text = batchRequest(batch.items);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setShown(null);
    } catch {
      // No clipboard (old browser, page not in https): the text is shown to copy by hand.
      setShown(text);
    }
  }

  async function send() {
    setError(null);
    setSending(true);
    const e = await onApply(reply);
    setSending(false);
    if (e) setError(e);
  }

  return (
    <Card title={title} aside={<Badge>À faire</Badge>}>
      <p className="break-words text-xs leading-relaxed text-muted">{batch.items.map((p) => p.name).join(" · ")}</p>
      <div className="mt-3 grid gap-3 text-sm text-ink-2">
        <Step n={1}>
          <button type="button" className={btn.sea} onClick={copy}>{copied ? "Demande copiée" : "Copier la demande"}</button>
        </Step>
        {shown && (
          <label className="grid gap-1 text-xs text-muted">
            Copie impossible ici : sélectionnez tout le texte ci-dessous et copiez-le.
            <textarea readOnly aria-label="Demande à copier" className={`${input} h-28 font-mono text-xs`} value={shown} onFocus={(e) => e.currentTarget.select()} />
          </label>
        )}
        <Step n={2}>
          <a href="https://claude.ai/new" target="_blank" rel="noopener" className={btn.ghost}>Ouvrez claude.ai (gratuit)</a>
          <span>collez la demande et envoyez-la.</span>
        </Step>
        <Step n={3}>
          <span>Collez toute la réponse ici :</span>
        </Step>
        <textarea
          aria-label="Réponse de l'IA"
          className={`${input} h-28 py-2 font-mono text-xs`}
          dir="auto"
          value={reply}
          onChange={(e) => {
            setReply(e.target.value);
            setError(null);
          }}
        />
        {error && <p className="text-danger">{error}</p>}
        <div>
          <button type="button" className={btn.sea} disabled={busy || !reply.trim()} onClick={send}>
            {sending ? "Envoi…" : "Mettre les traductions"}
          </button>
        </div>
      </div>
    </Card>
  );
}

/** A numbered step of a batch, its number kept in its own column when the line wraps. */
function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="flex h-10 w-4 shrink-0 items-center">{n}.</span>
      <div className="flex min-h-10 min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
