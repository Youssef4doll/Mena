"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { COLUMNS, decodeText, readSheet, rowKey, type ParsedSheet } from "@/lib/product-csv";
import { formatTND } from "@/lib/money";
import { shrinkForUpload } from "@/lib/client/shrink-image";
import {
  formatDuration, formatSize, indexFiles, isPicture, lacksArabic, namesToCreate, planRows, rowNeedsTranslation, summarize, textsOfRow,
  type Existing, type FileIndex, type PlannedRow,
} from "@/lib/client/import-plan";
import { ImportRun, SessionExpired, jsonPost, send, type Counts, type Outcome, type RowRun, type Snapshot } from "@/lib/client/import-run";
import { Badge, Card, btn, input } from "@/components/admin/ui";
import { activateProducts, finishImport } from "./actions";

type Storage = { photos: number; photoBytes: number; dbBytes: number } | null;
type Check =
  | { state: "idle" | "loading" }
  | { state: "error"; error: string }
  | { state: "ok"; existing: Existing; newCategories: string[]; newSuppliers: string[] };
type Loaded = { name: string; text: string; sheet: ParsedSheet };

/** Rows drawn at a time: 2000 rows stay smooth on a phone. */
const PAGE = 200;
/** Products sent to the translation page in one link. */
const TRANSLATE_LINK = 200;
const NEON_FREE = 512 * 1024 * 1024;
const EXPIRED = "Session expirée : reconnectez-vous dans un autre onglet, puis cliquez sur Reprendre.";
const BUSY = "Un autre onglet envoie déjà un import. Attendez qu'il finisse, puis cliquez sur Reprendre.";

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`;
// window.fetch called as a method of another object throws "Illegal invocation".
const browserFetch: typeof fetch = (url, init) => fetch(url, init);

/**
 * The CSV import in three steps for the owner: choose the file (and the
 * photos it names), check what each row will do, import. The rows go one by
 * one to the server, which checks them again; nothing here is trusted.
 */
export function ImportWizard({ aiReady, storage }: { aiReady: boolean; storage: Storage }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [check, setCheck] = useState<Check>({ state: "idle" });
  const [activateNew, setActivateNew] = useState(false);
  const [translate, setTranslate] = useState(aiReady);
  const [shown, setShown] = useState(PAGE);

  // The run. `frozen` is the plan as it was when the import started: choosing other photos afterwards changes nothing.
  const [frozen, setFrozen] = useState<PlannedRow[] | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | "busy" | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [spent, setSpent] = useState(0);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [activated, setActivated] = useState<{ ids: string[]; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const runRef = useRef<ImportRun | null>(null);
  const flushRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const checkSeq = useRef(0);
  const csvInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const index = useMemo(() => indexFiles(files), [files]);
  const livePlan = useMemo(
    () => (loaded && !loaded.sheet.error && check.state === "ok" ? planRows(loaded.sheet.rows, check.existing, index) : null),
    [loaded, check, index],
  );
  const plan = frozen ?? livePlan;
  const summary = useMemo(() => (plan ? summarize(plan) : null), [plan]);
  const errorRows = useMemo(() => plan?.filter((r) => r.status === "error") ?? [], [plan]);
  const newCategories = useMemo(() => (plan && check.state === "ok" ? namesToCreate(plan, check.newCategories, "category") : []), [plan, check]);
  const newSuppliers = useMemo(() => (plan && check.state === "ok" ? namesToCreate(plan, check.newSuppliers, "supplier") : []), [plan, check]);

  // The clock while sending.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  // Closing the tab would cut the import in the middle.
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  /** Reads the sheet, then asks the server which rows are products it already has. */
  async function load(name: string, text: string) {
    const sheet = readSheet(text);
    const seq = ++checkSeq.current;
    setLoaded({ name, text, sheet });
    setReadError(null);
    setShown(PAGE);
    if (sheet.error || sheet.rows.length === 0) return setCheck({ state: "idle" });
    setCheck({ state: "loading" });
    const distinct = (k: "category" | "supplier") => [...new Set(sheet.rows.map((r) => r.data[k]).filter((v): v is string => Boolean(v)))];
    let next: Check;
    try {
      const r = await send({ fetch: browserFetch }, "/admin/produits/import/check", jsonPost({ keys: [...new Set(sheet.rows.map((r) => rowKey(r.data)).filter(Boolean))], categories: distinct("category"), suppliers: distinct("supplier") }));
      next = r.ok
        ? { state: "ok", existing: r.existing as Existing, newCategories: r.newCategories as string[], newSuppliers: r.newSuppliers as string[] }
        : { state: "error", error: r.error };
    } catch (e) {
      next = { state: "error", error: e instanceof SessionExpired ? "Session expirée : reconnectez-vous dans un autre onglet, puis cliquez sur Réessayer." : "Vérification impossible." };
    }
    // A newer file was chosen meanwhile: its own check wins.
    if (seq === checkSeq.current) setCheck(next);
  }

  async function readFile(f: File) {
    if (/\.(xlsx|xls|ods|numbers)$/i.test(f.name)) {
      setLoaded(null);
      return setReadError("C'est un fichier de tableur, pas un CSV. Dans Excel : Fichier → Enregistrer sous → « CSV UTF-8 ». Dans Google Sheets : Fichier → Télécharger → CSV. Ou copiez les lignes et collez-les ci-dessous.");
    }
    try {
      await load(f.name, decodeText(new Uint8Array(await f.arrayBuffer())));
    } catch {
      setLoaded(null);
      setReadError("Fichier illisible.");
    }
  }

  function addPhotos(list: FileList | null) {
    const picked = Array.from(list ?? []).filter(isPicture);
    if (!picked.length) return;
    setFiles((old) => [...old, ...picked.filter((f) => !old.some((o) => o.name === f.name && o.size === f.size))]);
  }

  /** The page redraws at most every 150 ms while hundreds of requests come back. */
  function scheduleFlush() {
    if (flushRef.current) return;
    flushRef.current = setTimeout(flush, 150);
  }
  function flush() {
    if (flushRef.current) clearTimeout(flushRef.current);
    flushRef.current = null;
    if (runRef.current) setSnap(runRef.current.snapshot());
  }

  async function start() {
    if (!plan || check.state !== "ok") return;
    let run = runRef.current;
    if (!run) {
      const rows = plan.filter((r) => r.status !== "error");
      run = new ImportRun(
        rows.map((r) => ({ line: r.line, row: r.data, pictures: r.pictures, isNew: r.status === "new" })),
        { activateNew, translate: aiReady && translate },
        { categories: newCategories, suppliers: newSuppliers.map((s) => s.name) },
        { fetch: browserFetch, shrink: shrinkForUpload, onChange: scheduleFlush },
      );
      runRef.current = run;
      setFrozen(plan);
    }
    const t0 = Date.now();
    setStartedAt(t0);
    setNow(t0);
    setRunning(true);
    setOutcome(null);
    setFatal(null);
    let result: Outcome | "busy";
    try {
      // Two tabs sending at once would race on the same products and store their pictures twice.
      const sending = run;
      result = navigator.locks ? await navigator.locks.request("mena-import", { ifAvailable: true }, (lock) => (lock ? sending.run() : "busy")) : await sending.run();
    } catch (e) {
      result = "error";
      setFatal(e instanceof Error ? e.message : "Erreur inattendue.");
    }
    flush();
    setSpent((s) => s + Date.now() - t0);
    setRunning(false);
    setOutcome(result);
    // One refresh of the shop and of the lists for the whole import (the session must still be open for it).
    if (result !== "expired" && run.counts().saved > 0) {
      startTransition(async () => {
        await finishImport();
      });
    }
  }

  function restart() {
    runRef.current = null;
    checkSeq.current++;
    setFrozen(null);
    setSnap(null);
    setOutcome(null);
    setFatal(null);
    setSpent(0);
    setActivated(null);
    setLoaded(null);
    setReadError(null);
    setCheck({ state: "idle" });
    setFiles([]);
    setPasted("");
  }

  const started = frozen != null;
  const sheetOk = Boolean(loaded && !loaded.sheet.error && loaded.sheet.rows.length > 0);
  const elapsed = spent + (running ? Math.max(0, now - startedAt) : 0);
  const counts = snap?.counts ?? null;
  const unfinished = counts ? counts.failed > 0 || counts.picFailed > 0 || outcome === "stopped" || outcome === "expired" || outcome === "error" || outcome === "busy" : false;
  // The second click of a double click on "Importer" or "Reprendre" lands where "Arrêter" appears.
  const justStarted = running && now - startedAt < 1000;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <StepHead n={1} title="Fichier" state={sheetOk ? "done" : "now"} />
        <div className="flex flex-col gap-3 text-sm text-ink-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={csvInput}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
              className="hidden"
              aria-label="Fichier CSV"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void readFile(f);
              }}
            />
            <button type="button" className={btn.primary} disabled={started} onClick={() => csvInput.current?.click()}>Choisir le fichier CSV</button>
            {loaded && <span className="min-w-0 truncate text-muted">{loaded.name}</span>}
          </div>
          <label className="flex flex-col gap-1 text-[13px] font-medium text-ink-2">
            Ou collez ici les lignes copiées depuis Excel ou Google Sheets, avec la ligne des titres
            <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} disabled={started} rows={3} className={`${input} h-auto py-2 font-mono text-xs`} spellCheck={false} />
          </label>
          {pasted.trim() && !started && (
            <button type="button" className={`${btn.ghost} self-start`} onClick={() => void load("Lignes collées", pasted)}>Lire les lignes collées</button>
          )}
          {readError && <p className="text-danger">{readError}</p>}

          <div className="flex flex-wrap gap-2">
            <a href="/admin/produits/export?modele=vide" download className={btn.ghost}>Modèle vide</a>
            <a href="/admin/produits/export?modele=exemple" download className={btn.ghost}>Exemple rempli</a>
            <a href="/admin/produits/export" download className={btn.ghost}>Exporter mes produits</a>
          </div>
          <p className="text-xs text-muted">Un fichier exporté se modifie dans Excel puis s&apos;importe ici : c&apos;est le moyen de changer beaucoup de produits d&apos;un coup.</p>
          <ColumnsHelp aiReady={aiReady} />

          <div className="border-t border-line pt-3">
            <h3 className="text-sm font-semibold text-ink">Photos de l&apos;ordinateur <span className="font-normal text-muted">(facultatif)</span></h3>
            <p className="mt-0.5 text-xs text-muted">Quand la colonne « photos » donne des noms de fichiers (lampe-1.jpg), choisissez ces photos ici. Les liens https:// n&apos;en ont pas besoin.</p>
            <input ref={photoInput} type="file" accept="image/*" multiple className="hidden" aria-label="Photos" onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
            <input ref={folderInput} type="file" multiple className="hidden" aria-label="Dossier de photos" {...{ webkitdirectory: "" }} onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" className={btn.ghost} disabled={started} onClick={() => photoInput.current?.click()}>Choisir des photos</button>
              <button type="button" className={btn.ghost} disabled={started} onClick={() => folderInput.current?.click()}>Choisir un dossier</button>
              {index.count > 0 && (
                <>
                  <span className="text-ink">{plural(index.count, "photo choisie", "photos choisies")}</span>
                  {!started && <button type="button" className="h-10 px-1 text-sm text-muted underline" onClick={() => setFiles([])}>Retirer</button>}
                </>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <StepHead n={2} title="Vérifier" state={!sheetOk ? "later" : started ? "done" : "now"} />
        {!loaded ? (
          <p className="text-sm text-muted">Choisissez d&apos;abord un fichier, ou collez des lignes.</p>
        ) : loaded.sheet.error ? (
          <p className="text-sm text-danger">{loaded.sheet.error}</p>
        ) : loaded.sheet.rows.length === 0 ? (
          <p className="text-sm text-danger">Aucune ligne de produit sous la ligne des titres.</p>
        ) : check.state === "loading" || check.state === "idle" ? (
          <p className="text-sm text-muted">Recherche des produits qui existent déjà…</p>
        ) : check.state === "error" ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <p className="text-danger">{check.error}</p>
            <button type="button" className={btn.ghost} onClick={() => void load(loaded.name, loaded.text)}>Réessayer</button>
          </div>
        ) : (
          plan && summary && (
            <Preview
              plan={plan}
              summary={summary}
              unknown={loaded.sheet.unknown}
              newCategories={newCategories.map((c) => c.name)}
              newSuppliers={newSuppliers.map((s) => s.name)}
              errorRows={errorRows}
              storage={storage}
              index={index}
              shown={shown}
              onMore={() => setShown((n) => n + PAGE)}
              runs={snap?.rows ?? null}
            />
          )
        )}
      </Card>

      <Card>
        <StepHead n={3} title="Importer" state={!summary ? "later" : outcome === "done" && !unfinished ? "done" : "now"} />
        {!summary || check.state !== "ok" ? (
          <p className="text-sm text-muted">Après la vérification.</p>
        ) : !started ? (
          <div className="flex flex-col gap-3 text-sm">
            <Choice checked={activateNew} onChange={setActivateNew} title="Mettre en ligne les nouveaux produits tout de suite">
              Sinon ils sont créés hors ligne, à vérifier puis mettre en ligne. Une ligne qui remplit « en_ligne » garde son choix.
            </Choice>
            {aiReady ? (
              <Choice checked={translate} onChange={setTranslate} title="Traduire ce qui manque en arabe tunisien">
                Avec les mots-clés de recherche. Chaque produit prend alors plus de temps.
              </Choice>
            ) : (
              <p className="text-muted">L&apos;arabe laissé vide se traduit après l&apos;import, avec claude.ai (gratuit).</p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={btn.sea} disabled={summary.created + summary.updated === 0} onClick={() => void start()}>
                Importer {plural(summary.created + summary.updated, "produit", "produits")}
              </button>
              {summary.errors > 0 && (
                <span className="text-muted">{summary.errors > 1 ? `${plural(summary.errors, "ligne", "lignes")} avec erreur ne seront pas importées.` : "1 ligne avec erreur ne sera pas importée."}</span>
              )}
            </div>
          </div>
        ) : (
          <Progress
            counts={counts}
            elapsed={elapsed}
            running={running}
            stopping={snap?.stopping ?? false}
            justStarted={justStarted}
            outcome={outcome}
            message={outcome === "expired" ? EXPIRED : outcome === "busy" ? BUSY : outcome === "error" ? (fatal ?? snap?.error ?? "Erreur inattendue.") : null}
            onStop={() => runRef.current?.stop()}
            onResume={unfinished && !running ? () => void start() : null}
          >
            {/* After an expired session these would only lead to the sign-in page, and this page's progress would be lost. */}
            {!running && outcome !== "expired" && counts && counts.saved > 0 && frozen && snap && (
              <AfterImport
                plan={frozen}
                runs={snap.rows}
                activateNew={activateNew}
                activated={activated}
                pending={pending}
                onActivate={(ids) =>
                  startTransition(async () => {
                    const r = await activateProducts(ids);
                    setActivated(r.ok ? { ids, message: `${plural(r.count, "produit mis", "produits mis")} en ligne.` } : { ids: [], message: r.error });
                  })
                }
              />
            )}
            {!running && <Failures plan={frozen ?? []} runs={snap?.rows ?? null} />}
            {!running && (
              <button type="button" className={`${btn.ghost} self-start`} onClick={restart}>Nouvel import</button>
            )}
          </Progress>
        )}
      </Card>
    </div>
  );
}

/** A step's number and name: dark while it is the one to do, green once done, grey before its turn. */
function StepHead({ n, title, state }: { n: number; title: string; state: "now" | "done" | "later" }) {
  return (
    <h2 className="mb-3 flex items-center gap-3 text-[17px] font-semibold">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-base ${state === "done" ? "bg-olive text-white" : state === "now" ? "bg-ink text-white" : "bg-sand text-muted"}`} aria-hidden>
        {state === "done" ? "✓" : n}
      </span>
      <span className={state === "later" ? "text-muted" : "text-ink"}>
        <span className="sr-only">Étape {n} : </span>
        {title}
      </span>
    </h2>
  );
}

/** A checkbox with its explanation, the whole line clickable. */
function Choice({ checked, onChange, title, children }: { checked: boolean; onChange: (v: boolean) => void; title: string; children: React.ReactNode }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-start gap-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-sea" />
      <span>
        <span className="block font-medium text-ink">{title}</span>
        <span className="block text-xs text-muted">{children}</span>
      </span>
    </label>
  );
}

/** Every column the file may have, by theme, with how to fill it. */
function ColumnsHelp({ aiReady }: { aiReady: boolean }) {
  const groups = useMemo(() => {
    const m = new Map<string, typeof COLUMNS>();
    for (const c of COLUMNS) m.set(c.group, [...(m.get(c.group) ?? []), c]);
    return [...m];
  }, []);
  return (
    <details className="rounded-xl border border-line">
      <summary className="flex min-h-10 cursor-pointer items-center px-3 text-sm font-medium text-ink">Les colonnes</summary>
      <div className="flex flex-col gap-3 px-3 pb-3 text-sm">
        <p className="text-ink-2">
          Seules « nom » et « prix » sont obligatoires pour un nouveau produit ; les autres colonnes peuvent manquer ou rester vides. Pour un produit qui existe déjà, une case vide ne change rien.
          L&apos;arabe peut rester vide : {aiReady ? "il se traduit pendant l'import ou après." : "il se traduit après l'import."}
        </p>
        {groups.map(([group, cols]) => (
          <div key={group}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{group}</h3>
            <dl className="mt-1 divide-y divide-line">
              {cols.map((c) => (
                <div key={c.key} className="py-1.5">
                  <dt className="font-mono text-[13px] text-ink">{c.header}</dt>
                  <dd className="text-xs text-muted">{c.help || (c.key.endsWith("Ar") ? "La même chose en arabe." : "")}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </details>
  );
}

/** What the file will do, before anything is sent: counts, what is created, every error, and the rows. */
function Preview(props: {
  plan: PlannedRow[]; summary: ReturnType<typeof summarize>; unknown: string[]; newCategories: string[]; newSuppliers: string[]; errorRows: PlannedRow[];
  storage: Storage; index: FileIndex; shown: number; onMore: () => void; runs: Map<number, RowRun> | null;
}) {
  const { plan, summary: s, storage, shown } = props;
  const over = storage != null && storage.dbBytes + s.bytes > NEON_FREE;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="font-medium text-ink">
        {plural(s.lines, "ligne", "lignes")} · {plural(s.created, "nouveau", "nouveaux")} · {plural(s.updated, "mise à jour", "mises à jour")} · {s.errors} avec erreur
      </p>
      {props.unknown.length > 0 && <p className="break-words text-[#8a5a00]">Colonnes ignorées (nom inconnu) : {props.unknown.join(", ")}.</p>}
      {s.missing > 0 && <p className="text-[#8a5a00]">{s.missing > 1 ? `${plural(s.missing, "photo introuvable", "photos introuvables")} : leurs lignes seront importées sans elles.` : "1 photo introuvable : sa ligne sera importée sans elle."}</p>}
      {props.newCategories.length > 0 && <p className="break-words text-ink-2">{props.newCategories.length > 1 ? "Catégories à créer" : "Catégorie à créer"} : {props.newCategories.join(", ")}.</p>}
      {props.newSuppliers.length > 0 && <p className="break-words text-ink-2">{props.newSuppliers.length > 1 ? "Fournisseurs à créer" : "Fournisseur à créer"} : {props.newSuppliers.join(", ")}.</p>}
      <p className={`text-xs ${over ? "text-danger" : "text-muted"}`}>
        {s.pictures > 0 && <>Cet import ajoutera environ {plural(s.pictures, "photo", "photos")} (environ {formatSize(s.bytes)}){s.updated > 0 ? ", moins si des produits mis à jour les ont déjà" : ""}. </>}
        {storage && <>Photos enregistrées : {storage.photos.toLocaleString("fr-FR")} ({formatSize(storage.photoBytes)}). Base de données : {formatSize(storage.dbBytes)}. </>}
        Le plan gratuit de Neon s&apos;arrête à 0,5 Go.
      </p>

      {props.errorRows.length > 0 && (
        <div className="rounded-xl border border-clay/30 bg-clay-soft/50 p-3">
          <p className="font-medium text-clay">{props.errorRows.length > 1 ? `${plural(props.errorRows.length, "ligne", "lignes")} avec erreur, non importées :` : "1 ligne avec erreur, non importée :"}</p>
          <ul className="mt-1 flex max-h-72 flex-col gap-1 overflow-y-auto text-xs text-ink-2">
            {props.errorRows.map((r) => (
              <li key={r.line} className="break-words">
                <span className="font-medium">Ligne {r.line}</span>
                {r.data.name ? <> (<span dir="auto">{r.data.name}</span>)</> : null} : {r.errors.join(" ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="max-h-[34rem] overflow-y-auto rounded-xl border border-line">
        <ul className="divide-y divide-line">
          {plan.slice(0, shown).map((r) => (
            <RowItem key={r.line} r={r} run={props.runs?.get(r.line)} filesChosen={props.index.count > 0} />
          ))}
        </ul>
        {plan.length > shown && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2 text-xs text-muted">
            <span>{shown.toLocaleString("fr-FR")} lignes affichées sur {plan.length.toLocaleString("fr-FR")}.</span>
            <button type="button" className={btn.ghost} onClick={props.onMore}>Afficher {Math.min(PAGE, plan.length - shown)} de plus</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** One row of the file: what it is, then what happened to it once sent. */
function RowItem({ r, run, filesChosen }: { r: PlannedRow; run?: RowRun; filesChosen: boolean }) {
  const photos = r.pictures.length;
  const through = run ? run.pics.filter((p) => p === "added" || p === "skipped").length : 0;
  const picErrors = run?.picErrors.filter((e): e is string => Boolean(e)) ?? [];
  return (
    <li className="px-3 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate font-medium text-ink" dir="auto">{r.data.name || r.data.nameAr || r.key || "Sans nom"}</span>
        <span className="shrink-0 tabular-nums text-ink-2">{r.data.price != null ? formatTND(r.data.price) : "—"}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1">
        <span className="me-1 text-xs tabular-nums text-muted">Ligne {r.line}</span>
        {r.status === "error" ? (
          <Badge tone="danger">Erreur</Badge>
        ) : r.status === "new" ? (
          <Badge tone="info">Nouveau</Badge>
        ) : (
          <Badge>
            Mise à jour de «&nbsp;<span className="inline-block max-w-[9rem] truncate align-bottom sm:max-w-[18rem]" dir="auto">{r.existing?.name}</span>&nbsp;»
          </Badge>
        )}
        {photos > 0 && <Badge>{run?.state === "saved" ? `${through}/${photos} photo${photos > 1 ? "s" : ""}` : plural(photos, "photo", "photos")}</Badge>}
        {run?.state === "saving" && <Badge tone="info">Envoi…</Badge>}
        {run?.state === "saved" && <Badge tone="ok">{run.created ? "Créé" : "Mis à jour"}</Badge>}
        {run?.state === "saved" && run.translated && <Badge tone="info">Traduit</Badge>}
        {run?.state === "failed" && <Badge tone="danger">Échec</Badge>}
      </div>
      {(r.errors.length > 0 || r.warnings.length > 0 || r.missing.length > 0 || run?.error || picErrors.length > 0) && (
        <ul className="mt-1 flex flex-col gap-0.5 break-words text-xs">
          {r.errors.map((e, i) => <li key={i} className="text-danger">{e}</li>)}
          {run?.error && <li className="text-danger">{run.error}</li>}
          {picErrors.map((e, i) => <li key={i} className="text-danger">{e}</li>)}
          {r.missing.length > 0 && (
            <li className="text-[#8a5a00]">
              {r.missing.length > 1 ? "Photos introuvables" : "Photo introuvable"} : {r.missing.join(", ")}
              {filesChosen ? " (pas parmi les photos choisies)." : `. Choisissez-${r.missing.length > 1 ? "les" : "la"} dans « Photos de l'ordinateur ».`}
            </li>
          )}
          {r.warnings.map((w, i) => <li key={i} className="text-[#8a5a00]">{w}</li>)}
        </ul>
      )}
    </li>
  );
}

/** "Produits 12 / 40" with its bar. */
function Bar({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 100;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-ink-2">{label}</span>
        <span className="tabular-nums text-ink">{done.toLocaleString("fr-FR")} / {total.toLocaleString("fr-FR")}</span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-sand" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <div className="h-full rounded-full bg-sea transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** The run: bars and clock while it sends, then the counts of what it did. */
function Progress({ counts: c, elapsed, running, stopping, justStarted, outcome, message, onStop, onResume, children }: {
  counts: Counts | null; elapsed: number; running: boolean; stopping: boolean; justStarted: boolean; outcome: Outcome | "busy" | null; message: string | null;
  onStop: () => void; onResume: (() => void) | null; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 text-sm" aria-live="polite">
      {c && <Bar label="Produits" done={c.saved + c.failed} total={c.rows} />}
      {c && c.pictures > 0 && <Bar label="Photos" done={c.added + c.skipped + c.picFailed} total={c.pictures} />}
      <p className="text-muted">
        {running ? (stopping ? "Arrêt après les envois en cours… " : "Envoi en cours, gardez cette page ouverte. ") : outcome === "done" ? "Import terminé. " : outcome === "stopped" ? "Import arrêté. " : ""}
        Temps écoulé : {formatDuration(elapsed)}.
      </p>
      {message && <p className="rounded-xl bg-clay-soft px-3 py-2 text-clay">{message}</p>}
      {!running && c && (
        <div className="grid gap-1 rounded-xl bg-sand/60 px-3 py-2 text-ink-2">
          <p>Créés : <b className="text-ink">{c.created}</b> · Mis à jour : <b className="text-ink">{c.updated}</b> · Échecs : <b className={c.failed ? "text-danger" : "text-ink"}>{c.failed}</b></p>
          {c.pictures > 0 && (
            <p>Photos ajoutées : <b className="text-ink">{c.added}</b> · Déjà là : <b className="text-ink">{c.skipped}</b> · Photos en échec : <b className={c.picFailed ? "text-danger" : "text-ink"}>{c.picFailed}</b></p>
          )}
          {c.rows - c.saved - c.failed > 0 && <p>Pas encore envoyés : {c.rows - c.saved - c.failed}</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {running && <button type="button" className={btn.danger} disabled={stopping || justStarted} onClick={onStop}>Arrêter</button>}
        {onResume && <button type="button" className={btn.sea} onClick={onResume}>Reprendre</button>}
      </div>
      {onResume && <p className="text-xs text-muted">Reprendre renvoie les lignes et les photos en échec ou pas encore envoyées. Rien n&apos;est créé deux fois.</p>}
      {children}
    </div>
  );
}

/** The next things to do: see the products, put the new ones online, translate the ones without Arabic. */
function AfterImport({ plan, runs, activateNew, activated, pending, onActivate }: {
  plan: PlannedRow[]; runs: Map<number, RowRun>; activateNew: boolean; activated: { ids: string[]; message: string } | null; pending: boolean; onActivate: (ids: string[]) => void;
}) {
  const created = plan.flatMap((r) => {
    const run = runs.get(r.line);
    return run?.state === "saved" && run.created && run.id ? [{ r, run, id: run.id }] : [];
  });
  const done = new Set(activated?.ids ?? []);
  // A row that says "en_ligne" keeps its choice; the others follow the option.
  const offline = created.filter((c) => !(c.r.data.active ?? activateNew) && !done.has(c.id)).map((c) => c.id);
  const toTranslate = created.filter((c) => !c.run.translated && rowNeedsTranslation(c.r.data));
  const allWithoutArabic = toTranslate.every((c) => lacksArabic(textsOfRow(c.r.data)));
  const chunks: string[][] = [];
  for (let i = 0; i < toTranslate.length; i += TRANSLATE_LINK) chunks.push(toTranslate.slice(i, i + TRANSLATE_LINK).map((c) => c.id));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Link href="/admin/produits" className={btn.primary}>Voir les produits</Link>
        {offline.length > 0 && (
          <button type="button" className={btn.ghost} disabled={pending} onClick={() => onActivate(offline)}>
            Mettre en ligne {offline.length > 1 ? `les ${plural(offline.length, "produit créé", "produits créés")}` : "le produit créé"}
          </button>
        )}
        {chunks.map((ids, i) => (
          <a key={i} href={`/admin/produits/traduction?ids=${ids.join(",")}`} className={btn.sea}>
            {chunks.length > 1
              ? `Traduire les produits ${i * TRANSLATE_LINK + 1} à ${i * TRANSLATE_LINK + ids.length}`
              : allWithoutArabic
                ? `Traduire ${ids.length > 1 ? `les ${plural(ids.length, "produit", "produits")}` : "le produit"} sans arabe`
                : `Compléter l'arabe et les mots-clés de ${plural(ids.length, "produit", "produits")}`}
          </a>
        ))}
      </div>
      {activated && <p className="text-sm text-ink-2">{activated.message}</p>}
    </div>
  );
}

/** Every row and every photo that did not go through, with the server's reason. */
function Failures({ plan, runs }: { plan: PlannedRow[]; runs: Map<number, RowRun> | null }) {
  if (!runs) return null;
  const list = plan.flatMap((r) => {
    const run = runs.get(r.line);
    if (!run) return [];
    const errors = [...(run.state === "failed" && run.error ? [run.error] : []), ...run.picErrors.filter((e): e is string => Boolean(e))];
    return errors.length ? [{ r, errors }] : [];
  });
  if (!list.length) return null;
  return (
    <div className="rounded-xl border border-clay/30 bg-clay-soft/50 p-3">
      <p className="font-medium text-clay">Échecs</p>
      <ul className="mt-1 flex max-h-72 flex-col gap-1 overflow-y-auto text-xs text-ink-2">
        {list.map(({ r, errors }) => (
          <li key={r.line} className="break-words">
            <span className="font-medium">Ligne {r.line}</span>
            {r.data.name ? <> (<span dir="auto">{r.data.name}</span>)</> : null} : {errors.join(" ")}
          </li>
        ))}
      </ul>
    </div>
  );
}
