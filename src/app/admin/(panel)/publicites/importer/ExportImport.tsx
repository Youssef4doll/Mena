"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { formatTND } from "@/lib/money";
import { decodeText, readPlatformExport, type ExportOptions, type ExportRow, type PlatformExport } from "@/lib/ads/platform-csv";
import { rowKey } from "@/lib/ads/match";
import { importAdSpend, previewImport, type ImportResult } from "../import-actions";
import { exportKnownKeys } from "./actions";
import { Badge, Card, btn, input, label } from "@/components/admin/ui";

/**
 * The import, step by step: a file (or text pasted from the export), the
 * preview read in the browser with what was skipped and why, which
 * campaigns and ads the site already saw on those days and which rows
 * already imported the file replaces, then the import and its result.
 * Nothing is saved before the button.
 */

/** Rows shown in the preview table; the import takes them all. */
const PREVIEW_ROWS = 200;
const SOURCES = ["facebook", "instagram", "tiktok", "snapchat", "google"];
const CURRENCIES = ["TND", "EUR", "USD"];
const PLATFORM_LABEL = { meta: "Meta", tiktok: "TikTok" } as const;

type Known = { range: string; campaigns: Set<string>; ads: Set<string> } | { range: string; error: string };
/** What the import would do to the spend already saved, for one reading of the file. */
type Plan = { exp: PlatformExport; replaced: number; warning: string | null } | { exp: PlatformExport; error: string };

const int = (v: number | null) => (v == null ? "—" : v.toLocaleString("fr-FR"));
/** "2026-09-03" → "3/9/2026", the way the rest of the back office writes a day. */
const dayText = (d: string | null) => (d ? d.split("-").reverse().map((x, i) => (i < 2 ? String(Number(x)) : x)).join("/") : "—");
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("fr-FR")} ${n > 1 ? many : one}`;
/** The rows as the server takes them (the preview's line numbers stay here). */
const spendRows = (exp: PlatformExport) =>
  exp.rows.map((r) => ({ day: r.day, days: r.days, source: r.source, campaign: r.campaign, adSet: r.adSet, ad: r.ad, account: r.account, amount: r.amount, impressions: r.impressions, clicks: r.clicks, reach: r.reach, purchases: r.purchases }));

export function ExportImport() {
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [paste, setPaste] = useState("");
  const [source, setSource] = useState("");
  const [currency, setCurrency] = useState("");
  const [rate, setRate] = useState("");
  const [known, setKnown] = useState<Known | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [saving, start] = useTransition();

  const opts = useMemo<ExportOptions>(() => {
    const r = Number(rate.replace(",", "."));
    return { ...(source.trim() ? { source: source.trim() } : {}), ...(currency ? { currency } : {}), ...(rate.trim() && Number.isFinite(r) ? { rate: r } : {}) };
  }, [source, currency, rate]);
  const exp = useMemo<PlatformExport | null>(() => (text == null ? null : readPlatformExport(text, opts)), [text, opts]);
  const range = exp && !exp.error && exp.total.from && exp.total.to ? `${exp.total.from}|${exp.total.to}` : null;

  // Campaigns and ads the site saw on the export's days, asked again only when those days change.
  useEffect(() => {
    if (!range) return;
    let live = true;
    const [from, to] = range.split("|");
    exportKnownKeys(from, to)
      .then((r) => live && setKnown(r.ok ? { range, campaigns: new Set(r.campaigns), ads: new Set(r.ads) } : { range, error: r.error }))
      .catch(() => live && setKnown({ range, error: "Campagnes connues introuvables : vérifiez la connexion." }));
    return () => {
      live = false;
    };
  }, [range]);
  const knownNow = known && known.range === range ? known : null;

  // Rows already imported that this file would replace, or leave on the same days: asked again for each reading.
  useEffect(() => {
    if (!exp || exp.error || exp.rows.length === 0) return;
    let live = true;
    previewImport({ rows: spendRows(exp) })
      .then((r) => live && setPlan(r.ok ? { exp, replaced: r.replaced, warning: r.warning } : { exp, error: r.error }))
      .catch(() => live && setPlan({ exp, error: "Lignes déjà importées introuvables : vérifiez la connexion." }));
    return () => {
      live = false;
    };
  }, [exp]);
  const planNow = plan && plan.exp === exp ? plan : null;

  async function pick(file: File | undefined) {
    if (!file) return;
    setResult(null);
    setFileName(file.name);
    setText(decodeText(new Uint8Array(await file.arrayBuffer())));
  }

  function save() {
    if (!exp || exp.error || exp.rows.length === 0) return;
    const rows = spendRows(exp);
    const note = `Import ${exp.platform ? PLATFORM_LABEL[exp.platform] : ""} ${fileName || "texte collé"}`.replace(/\s+/g, " ").trim().slice(0, 200);
    start(async () => {
      try {
        setResult(await importAdSpend({ rows, note }));
      } catch {
        setResult({ ok: false, error: "Import impossible : vérifiez la connexion, puis réessayez." });
      }
    });
  }

  return (
    <>
      <Card title="1. Le fichier">
        <div className="grid gap-4 lg:grid-cols-2">
          <label
            className={`${label} cursor-pointer rounded-xl border border-dashed border-line p-4 focus-within:border-sea`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void pick(e.dataTransfer.files[0]);
            }}
          >
            Export CSV de Meta ou TikTok
            <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
            <span className="mt-1 flex flex-wrap items-center gap-3">
              <span className={btn.primary}>Choisir un fichier</span>
              <span className="min-w-0 break-all text-xs font-normal text-muted">{fileName || "ou déposez-le ici"}</span>
            </span>
          </label>
          <div className="flex flex-col gap-2">
            <label className={label}>
              Ou collez le contenu de l&apos;export
              <textarea value={paste} onChange={(e) => setPaste(e.target.value)} className={`${input} h-24 py-2 font-mono text-xs`} spellCheck={false} />
            </label>
            <button
              type="button"
              className={`${btn.ghost} self-start`}
              disabled={!paste.trim()}
              onClick={() => {
                setResult(null);
                setFileName("");
                setText(paste);
              }}
            >
              Lire le texte collé
            </button>
          </div>
        </div>
        <details className="group mt-3 rounded-xl border border-line" open={exp?.needs != null}>
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
            Source et devise
            <span aria-hidden className="text-muted transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="grid gap-3 px-3 pb-3 sm:grid-cols-3">
            <label className={label}>
              Source des lignes
              <input value={source} onChange={(e) => setSource(e.target.value)} list="import-sources" placeholder="automatique" className={`${input} ${exp?.needs === "source" ? "border-[#c98a00]" : ""}`} />
              <datalist id="import-sources">
                {SOURCES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              <span className="text-xs font-normal text-muted">Vide : facebook pour Meta, tiktok pour TikTok. Le même mot que utm_source dans vos liens.</span>
            </label>
            <label className={label}>
              Devise du compte
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={`${input} ${exp?.needs === "currency" ? "border-[#c98a00]" : ""}`}>
                <option value="">celle du fichier</option>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className={label}>
              Dinars pour 1 unité de devise
              <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="3,45" className={`${input} ${exp?.needs === "rate" ? "border-[#c98a00]" : ""}`} />
              <span className="text-xs font-normal text-muted">Seulement si le compte paie en euros ou en dollars : taux de la banque, frais compris.</span>
            </label>
          </div>
        </details>
      </Card>

      {exp && <Preview exp={exp} known={knownNow} loadingKnown={range != null && knownNow == null} plan={planNow} saved={result?.ok === true} />}

      {exp && !exp.error && exp.rows.length > 0 && (
        <Card title="3. Importer">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={btn.primary} disabled={saving || result?.ok === true} onClick={save}>
              {saving ? "Import…" : `Importer ${plural(exp.rows.length, "ligne", "lignes")} · ${formatTND(exp.total.amount)}`}
            </button>
            {result?.ok === true && (
              <button
                type="button"
                className={btn.ghost}
                onClick={() => {
                  setResult(null);
                  setText(null);
                  setPaste("");
                  setFileName("");
                }}
              >
                Importer un autre fichier
              </button>
            )}
          </div>
          {result && (
            <p role="status" className={`mt-3 text-sm ${result.ok ? "text-olive" : "text-danger"}`}>
              {result.ok ? result.message : result.error}
            </p>
          )}
          {result?.ok && (
            <p className="mt-2 text-sm text-ink-2">
              Les chiffres sont dans <Link href="/admin/publicites" className="text-sea underline">Vue d&apos;ensemble</Link> et <Link href="/admin/publicites/campagnes" className="text-sea underline">Campagnes</Link>. Les lignes importées sont listées dans <Link href="/admin/depenses" className="text-sea underline">Dépenses pub</Link>.
            </p>
          )}
        </Card>
      )}
    </>
  );
}

/** What the file says, before anything is saved: totals, the rows it replaces, what was skipped and why, and the rows with their match. */
function Preview({ exp, known, loadingKnown, plan, saved }: { exp: PlatformExport; known: Known | null; loadingKnown: boolean; plan: Plan | null; saved: boolean }) {
  if (exp.error) {
    return (
      <Card title="2. Aperçu">
        <p role="alert" className="text-sm text-danger">{exp.error}</p>
        {exp.needs && <p className="mt-1 text-sm text-ink-2">Complétez « Source et devise » ci-dessus : l&apos;aperçu se met à jour.</p>}
      </Card>
    );
  }
  const ok = known && "campaigns" in known ? known : null;
  const campaignKnown = (r: ExportRow) => (ok && r.campaign ? ok.campaigns.has(rowKey("campaign", r.source, r.campaign)) : null);
  const adKnown = (r: ExportRow) => (ok && r.ad ? ok.ads.has(rowKey("ad", r.source, r.campaign, r.ad)) : null);

  // The export's campaigns, with their spend and whether the site saw them on those days.
  const byCampaign = new Map<string, { key: string; name: string | null; amount: number; rows: number; ads: Set<string>; known: boolean | null }>();
  for (const r of exp.rows) {
    const key = rowKey("campaign", r.source, r.campaign);
    const c = byCampaign.get(key) ?? { key, name: r.campaign, amount: 0, rows: 0, ads: new Set<string>(), known: campaignKnown(r) };
    c.amount += r.amount;
    c.rows++;
    if (r.ad) c.ads.add(r.ad);
    byCampaign.set(key, c);
  }
  const campaigns = [...byCampaign.values()].sort((a, b) => b.amount - a.amount);
  const alone = campaigns.filter((c) => c.known === false);

  return (
    <Card title="2. Aperçu" hint={saved ? "Ces lignes sont enregistrées." : "Rien n'est encore enregistré."}>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-muted">Plateforme</dt><dd className="font-semibold text-ink">{exp.platform ? PLATFORM_LABEL[exp.platform] : "non reconnue"}</dd></div>
        <div><dt className="text-xs text-muted">Source enregistrée</dt><dd className="font-semibold text-ink">{exp.source}</dd></div>
        <div><dt className="text-xs text-muted">Dépense</dt><dd className="font-semibold tabular-nums text-ink">{formatTND(exp.total.amount)}</dd><dd className="text-xs text-muted">{exp.currency !== "TND" ? `converti de ${exp.currency}` : "TND"}</dd></div>
        <div><dt className="text-xs text-muted">Jours couverts</dt><dd className="font-semibold tabular-nums text-ink">{exp.total.from === exp.total.to ? dayText(exp.total.from) : `${dayText(exp.total.from)} → ${dayText(exp.total.to)}`}</dd><dd className="text-xs text-muted">{plural(exp.rows.length, "ligne", "lignes")}</dd></div>
      </dl>

      {!saved && (
        <div className="mt-3 text-sm" role="status">
          {plan == null ? (
            <p className="text-muted">Recherche des lignes déjà importées sur ces jours…</p>
          ) : "error" in plan ? (
            <p className="text-danger">{plan.error}</p>
          ) : (
            <>
              <p className="text-ink-2">
                {plan.replaced > 0
                  ? `${plural(plan.replaced, "ligne", "lignes")} d'un import précédent ${plan.replaced > 1 ? "seront remplacées" : "sera remplacée"} : même campagne, et tous leurs jours sont dans ce fichier.`
                  : "Aucune ligne déjà importée ne sera remplacée."}
              </p>
              {plan.warning && <p className="mt-1 text-[#8a5a00]">{plan.warning}</p>}
            </>
          )}
        </div>
      )}

      {exp.warnings.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-sm text-[#8a5a00]">
          {exp.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <details className="mt-1 text-sm">
        <summary className="cursor-pointer py-3 text-xs text-muted">Colonnes lues</summary>
        <ul className="mt-1 grid gap-x-4 text-xs text-ink-2 sm:grid-cols-2">
          {Object.entries(exp.columns).map(([field, col]) => (
            <li key={field}><span className="text-muted">{FIELD_LABEL[field] ?? field} :</span> {col}</li>
          ))}
        </ul>
      </details>
      {exp.skipped.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer py-3 text-xs text-muted">{plural(exp.skipped.length, "ligne ignorée", "lignes ignorées")}</summary>
          <ul className="mt-1 max-h-48 overflow-auto text-xs text-ink-2">
            {exp.skipped.map((s) => (
              <li key={s.line}>Ligne {s.line} : {s.reason}</li>
            ))}
          </ul>
        </details>
      )}

      <h3 className="mt-4 text-[13px] font-semibold text-ink">Campagnes du fichier</h3>
      <p className="text-xs text-muted">
        {loadingKnown ? "Recherche des visites et commandes de ces jours…" : known && "error" in known ? known.error : "« Reconnue » : la boutique a des visites ou des commandes avec ce nom de campagne sur ces jours."}
      </p>
      <ul className="mt-2 flex flex-col divide-y divide-line rounded-xl border border-line">
        {campaigns.map((c) => (
          <li key={c.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
            <span className="min-w-0 basis-full break-all text-ink sm:basis-auto sm:flex-1">{c.name ?? <span className="text-muted">sans campagne</span>}</span>
            <span className="text-xs text-muted">{plural(c.ads.size, "publicité", "publicités")}</span>
            <span className="tabular-nums text-ink">{formatTND(c.amount)}</span>
            {c.name == null ? <span className="text-xs text-muted">comptée pour la source</span> : <MatchBadge known={c.known} loading={loadingKnown} />}
          </li>
        ))}
      </ul>
      {alone.length > 0 && (
        <p className="mt-2 text-sm text-ink-2">
          {alone.length > 1 ? `${alone.length} campagnes n'ont` : "Une campagne n'a"} ni visite ni commande à son nom sur ces jours : ses liens n&apos;ont pas d&apos;utm_campaign, ou le nom diffère. La dépense sera comptée pour la source, sans être reliée à des commandes. Faites les liens avec le <Link href="/admin/publicites/idees#liens" className="text-sea underline">générateur de liens</Link>.
        </p>
      )}

      <h3 className="mt-4 text-[13px] font-semibold text-ink">Lignes</h3>
      <div className="-mx-4 mt-1 max-h-[480px] overflow-auto px-4 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead className="sticky top-0 bg-white text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pe-3 text-start font-medium">Jour</th>
              <th className="px-2 text-start font-medium">Campagne</th>
              <th className="px-2 text-start font-medium">Ensemble</th>
              <th className="px-2 text-start font-medium">Publicité</th>
              <th className="px-2 text-end font-medium">Montant</th>
              <th className="px-2 text-end font-medium">Impressions</th>
              <th className="px-2 text-end font-medium">Clics lien</th>
              <th className="px-2 text-end font-medium">Couverture</th>
              <th className="px-2 text-end font-medium">Achats</th>
              <th className="ps-2 text-start font-medium">Publicité reconnue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line tabular-nums">
            {exp.rows.slice(0, PREVIEW_ROWS).map((r) => (
              <tr key={`${r.line}`}>
                <td className="whitespace-nowrap py-1.5 pe-3">{dayText(r.day)}{r.days > 1 && <span className="text-muted"> +{r.days - 1} j</span>}</td>
                <td className="whitespace-nowrap px-2">{r.campaign ?? "—"}</td>
                <td className="whitespace-nowrap px-2">{r.adSet ?? "—"}</td>
                <td className="whitespace-nowrap px-2">{r.ad ?? "—"}{r.lines > 1 && <span className="block text-[11px] text-muted">{r.lines} lignes additionnées</span>}</td>
                <td className="whitespace-nowrap px-2 text-end">{formatTND(r.amount)}</td>
                <td className="px-2 text-end">{int(r.impressions)}</td>
                <td className="px-2 text-end">{int(r.clicks)}</td>
                <td className="px-2 text-end">{int(r.reach)}</td>
                <td className="px-2 text-end">{int(r.purchases)}</td>
                <td className="ps-2">{r.ad ? <MatchBadge known={adKnown(r)} loading={loadingKnown} /> : <span className="text-xs text-muted">sans nom</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {exp.rows.length > PREVIEW_ROWS && <p className="mt-1 text-xs text-muted">Et {plural(exp.rows.length - PREVIEW_ROWS, "autre ligne", "autres lignes")}, importées aussi.</p>}
    </Card>
  );
}

const FIELD_LABEL: Record<string, string> = {
  accountId: "Compte (identifiant)",
  accountName: "Compte",
  day: "Jour",
  starts: "Début",
  ends: "Fin",
  campaign: "Campagne",
  adSet: "Ensemble",
  ad: "Publicité",
  amount: "Montant",
  currency: "Devise",
  impressions: "Impressions",
  clicks: "Clics sur le lien",
  reach: "Couverture",
  purchases: "Achats",
  results: "Résultats",
  resultIndicator: "Indicateur de résultat",
};

function MatchBadge({ known, loading }: { known: boolean | null; loading: boolean }) {
  if (known == null) return <span className="text-xs text-muted">{loading ? "…" : "—"}</span>;
  return known ? <Badge tone="ok">reconnue</Badge> : <Badge tone="warn">pas de visite</Badge>;
}
