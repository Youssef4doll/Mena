import { profit } from "../profit";
import { unitMargin } from "./breakeven";
import { shrink } from "./stats";
import type { AdRow, Baseline, Costs, Funnel, Level, Platform } from "./types";

/**
 * Every number a media buyer reads for one row (a source, a campaign or an
 * ad), from what the shop counted and what the platform reported. Each KPI
 * is null when an input is missing or its denominator is 0: a missing input
 * is never turned into a 0. Money in millimes, rates as fractions. Pure.
 *
 * Cash on delivery puts the truth at the end of the funnel: the cost per
 * DELIVERED order against the margin per delivered order. Young rows still
 * have open orders, so they also get a projection (open orders × the chance
 * they end delivered, the row's rates pulled toward the shop's), always
 * labelled as one.
 *
 *   kpis(row, costs, baseline, opts?) → Kpis
 *   totalRow(rows, key?)         → AdRow       sum of rows (a platform count only when every row that spent has it)
 *   pendingOf(funnel)            → number      orders still waiting for their call
 *   funnelSteps(row)             → FunnelStep[] impressions → … → delivered, with the rate from the step before
 *   kpiValue(k, key)             → number | null
 *   whyMissing(k, key)           → Input[]     the missing inputs that leave this KPI empty
 *   KPI_DEFS, INPUT_LABELS       French labels, one-line explanations, units
 */

/** Virtual called orders a row's confirmation rate is pulled toward the shop's with: under ~20 calls the shop's rate weighs more. */
export const CONFIRM_PRIOR_ORDERS = 20;
/** The same for the delivery rate, in parcels that reached the end (delivered or back). */
export const DELIVERY_PRIOR_PARCELS = 20;
/** Delivered orders a row's own margin needs before it outweighs the shop's margin. */
export const MARGIN_PRIOR_DELIVERED = 5;

/** Inputs whose absence leaves a KPI empty. */
export type Input = "spend" | "impressions" | "clicks" | "reach" | "purchases" | "productCost" | "carrierCost" | "returnCost" | "baseline";

export const INPUT_LABELS: Record<Input, string> = {
  spend: "dépense non saisie ni importée",
  impressions: "impressions non importées",
  clicks: "clics non importés",
  reach: "couverture non importée",
  purchases: "achats de la plateforme non importés",
  productCost: "coût fournisseur inconnu sur des commandes livrées",
  carrierCost: "coût du transporteur non renseigné",
  returnCost: "coût d'un retour non renseigné",
  baseline: "pas encore de taux de la boutique",
};

export type Projection = {
  /** Delivered + open orders × their chance of ending delivered. Not an integer. */
  delivered: number;
  costPerDelivered: number | null;
  /** Projected delivered / placed orders. */
  netDeliveryRate: number | null;
  /** The rates used: the row's, pulled toward the shop's. */
  confirmExpect: number | null;
  deliveryExpect: number | null;
  /** Projected delivered × margin per delivered − spend. */
  contribution: number | null;
  /** True when open orders were counted: the figures are a projection, not a result. */
  projected: boolean;
  /** One French sentence saying what the projection is made of. */
  note: string;
};

export type Kpis = {
  // Platform
  cpm: number | null;
  ctr: number | null;
  cpc: number | null;
  frequency: number | null;
  // Landing
  landingRate: number | null;
  costPerVisit: number | null;
  // Funnel
  viewRate: number | null;
  /** Form started / product page viewed. */
  formStartRate: number | null;
  /** Orders / form started. */
  formCompletion: number | null;
  /** Orders / visits (CVR). */
  orderRate: number | null;
  // Cash on delivery
  /** Orders still waiting for their call, orders whose call is done, orders that are final. */
  pending: number;
  decided: number;
  final: number;
  /** Over the orders whose call is done. */
  confirmRate: number | null;
  cancelRate: number | null;
  /** Delivered / (delivered + back). */
  deliveryRate: number | null;
  /** Delivered / final orders (cancelled, delivered or back). */
  netDeliveryRate: number | null;
  openShare: number | null;
  // Money
  aov: number | null;
  unitsPerOrder: number | null;
  multiUnitShare: number | null;
  newCustomerShare: number | null;
  cpaPlaced: number | null;
  costPerConfirmed: number | null;
  costPerDelivered: number | null;
  roasDelivered: number | null;
  /** As src/lib/profit.ts: delivered revenue − product − carrier × parcels sent − returns, for the period. */
  profitBeforeAds: number | null;
  contribution: number | null;
  /** Profit before ads per 1 of ads: above 1 the ads pay for themselves. */
  poas: number | null;
  /** Unit economics: what one delivered order leaves before ads, refusals' costs included. */
  marginPerDelivered: number | null;
  /** Where the margin comes from: this row, this row blended with the shop's (or the account's), the shop alone, or the account's delivered orders of the period. */
  marginBasis: "row" | "blend" | "shop" | "account" | null;
  breakEvenCpd: number | null;
  breakEvenCpa: number | null;
  breakEvenRoas: number | null;
  projection: Projection | null;
  /** Platform purchases per real order at the stage the platform is told about (placed, confirmed or delivered). */
  overReporting: number | null;
  missing: Input[];
};

const ratio = (n: number, d: number | null | undefined): number | null => (d != null && d > 0 ? n / d : null);
const money = (n: number | null | undefined, d: number | null | undefined): number | null => (n != null && d != null && d > 0 ? Math.round(n / d) : null);

/** Orders still waiting for their confirmation call: the field when given, else orders − confirmed − cancelled. */
export function pendingOf(f: Funnel): number {
  if (f.pending != null) return Math.max(0, Math.min(f.pending, f.open));
  return Math.max(0, Math.min(f.open, f.orders - f.confirmed - f.cancelled));
}

/** What the caller knows beyond the row: the account's own margin, and when the platforms are told about a purchase. */
export type KpiOptions = {
  /**
   * Margin per delivered order of the whole account over the period. Stands
   * in for the shop's when the baseline has none, so a row with no delivered
   * order yet is still judged on a margin, not on the account's average cost.
   */
  accountMargin?: number | null;
  /** The platforms only hear of a purchase at this stage: their count is compared with the orders that reached it. */
  purchaseAt?: "placed" | "confirmed" | "delivered";
};

/** The orders a platform's purchase count should match: those it was told about. */
export function reportedOrders(f: Funnel, purchaseAt: KpiOptions["purchaseAt"] = "placed"): number {
  return purchaseAt === "confirmed" ? f.confirmed : purchaseAt === "delivered" ? f.delivered : f.orders;
}

export function kpis(row: AdRow, costs: Costs, baseline: Baseline | null, opts: KpiOptions = {}): Kpis {
  const f = row.funnel;
  const p = row.platform;
  const spend = p.spend;
  const missing: Input[] = [];
  if (spend == null) missing.push("spend");
  if (p.impressions == null) missing.push("impressions");
  if (p.clicks == null) missing.push("clicks");
  if (p.reach == null) missing.push("reach");
  if (p.purchases == null) missing.push("purchases");

  const pending = pendingOf(f);
  const decided = Math.max(0, f.orders - pending);
  const final = Math.max(0, f.orders - f.open);
  const parcelsFinal = f.delivered + f.back;
  const kept = f.orders - f.cancelled;

  // The row's rates pulled toward the shop's: what an open order is expected to become.
  const confirmExpect = shrink(f.confirmed, decided, baseline?.confirmRate, CONFIRM_PRIOR_ORDERS);
  const deliveryExpect = shrink(f.delivered, parcelsFinal, baseline?.deliveryRate, DELIVERY_PRIOR_PARCELS);

  // Unit margin: the row's own when it has delivered orders with known costs, blended with the shop's.
  if (f.costUnknownDelivered > 0) missing.push("productCost");
  if (costs.carrierPerParcel == null) missing.push("carrierCost");
  if (costs.returnPerParcel == null && (f.back > 0 || (deliveryExpect != null && deliveryExpect < 1))) missing.push("returnCost");
  const rowMargin =
    f.delivered > 0 && f.costUnknownDelivered === 0
      ? unitMargin({
          revenue: f.revenueDelivered / f.delivered,
          productCost: f.productCostDelivered / f.delivered,
          carrierPerParcel: costs.carrierPerParcel,
          returnPerParcel: costs.returnPerParcel,
          deliveryRate: deliveryExpect,
        })
      : null;
  const shopMargin = baseline?.marginPerDelivered ?? opts.accountMargin ?? null;
  const fromShop = baseline?.marginPerDelivered != null;
  let marginPerDelivered: number | null = null;
  let marginBasis: Kpis["marginBasis"] = null;
  if (rowMargin != null && shopMargin != null) {
    marginPerDelivered = Math.round((f.delivered * rowMargin + MARGIN_PRIOR_DELIVERED * shopMargin) / (f.delivered + MARGIN_PRIOR_DELIVERED));
    marginBasis = "blend";
  } else if (rowMargin != null) {
    marginPerDelivered = rowMargin;
    marginBasis = "row";
  } else if (shopMargin != null) {
    marginPerDelivered = shopMargin;
    marginBasis = fromShop ? "shop" : "account";
  }

  const projection = project(f, pending, confirmExpect, deliveryExpect, spend, marginPerDelivered);
  if (projection == null && f.open > 0) missing.push("baseline");

  const pr = profit({
    deliveredRevenue: f.revenueDelivered,
    delivered: f.delivered,
    productCost: f.productCostDelivered,
    costUnknown: f.costUnknownDelivered,
    parcels: f.shipped,
    backParcels: f.back,
    carrierPerParcel: costs.carrierPerParcel,
    returnPerParcel: costs.returnPerParcel,
    adSpend: spend,
  });

  const revenuePerDelivered = f.delivered > 0 ? f.revenueDelivered / f.delivered : kept > 0 ? f.revenuePlaced / kept : null;
  const expectedNet = projection?.netDeliveryRate ?? baseline?.netDeliveryRate ?? (baseline?.confirmRate != null && baseline.deliveryRate != null ? baseline.confirmRate * baseline.deliveryRate : null);
  const breakEvenCpd = marginPerDelivered == null ? null : Math.max(0, marginPerDelivered);

  return {
    cpm: spend != null && p.impressions ? Math.round((spend * 1000) / p.impressions) : null,
    ctr: p.clicks != null ? ratio(p.clicks, p.impressions) : null,
    cpc: money(spend, p.clicks),
    frequency: p.impressions != null ? ratio(p.impressions, p.reach) : null,
    landingRate: ratio(f.sessions, p.clicks),
    costPerVisit: money(spend, f.sessions),
    viewRate: ratio(f.productViews, f.sessions),
    formStartRate: ratio(f.formStarts, f.productViews),
    formCompletion: ratio(f.orders, f.formStarts),
    orderRate: ratio(f.orders, f.sessions),
    pending,
    decided,
    final,
    confirmRate: ratio(f.confirmed, decided),
    cancelRate: ratio(f.cancelled, decided),
    deliveryRate: ratio(f.delivered, parcelsFinal),
    netDeliveryRate: ratio(f.delivered, final),
    openShare: ratio(f.open, f.orders),
    aov: money(f.revenuePlaced, kept),
    unitsPerOrder: ratio(f.units, kept),
    multiUnitShare: ratio(f.multiUnitOrders, kept),
    newCustomerShare: ratio(f.newCustomers, f.orders),
    cpaPlaced: money(spend, f.orders),
    costPerConfirmed: money(spend, f.confirmed),
    costPerDelivered: money(spend, f.delivered),
    roasDelivered: spend != null ? ratio(f.revenueDelivered, spend) : null,
    profitBeforeAds: pr.beforeAds,
    contribution: pr.contribution,
    poas: pr.beforeAds != null && spend != null ? ratio(pr.beforeAds, spend) : null,
    marginPerDelivered,
    marginBasis,
    breakEvenCpd,
    breakEvenCpa: breakEvenCpd != null && expectedNet != null ? Math.round(breakEvenCpd * expectedNet) : null,
    breakEvenRoas: marginPerDelivered != null && marginPerDelivered > 0 && revenuePerDelivered != null ? revenuePerDelivered / marginPerDelivered : null,
    projection,
    overReporting: p.purchases != null ? ratio(p.purchases, reportedOrders(f, opts.purchaseAt)) : null,
    missing,
  };
}

/**
 * Open orders that already passed their call end delivered at the delivery
 * rate; those still waiting must first be confirmed. Null when an open order
 * exists and no rate is known, neither the row's nor the shop's.
 */
function project(f: Funnel, pending: number, cr: number | null, dr: number | null, spend: number | null, margin: number | null): Projection | null {
  if (f.orders === 0) return null;
  const afterCall = Math.max(0, f.open - pending);
  if (f.open > 0 && (dr == null || (pending > 0 && cr == null))) return null;
  const expected = f.open === 0 ? 0 : afterCall * (dr ?? 0) + pending * (cr ?? 0) * (dr ?? 0);
  const delivered = f.delivered + expected;
  const projected = f.open > 0;
  const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x * 100)} %`);
  // French takes the singular under 2: "0 livrée", "1 devrait être livrée".
  const many = (n: number, one: string, other: string) => `${n} ${n < 2 ? one : other}`;
  const note = projected
    ? `Projection : ${many(f.delivered, "livrée", "livrées")} + ${f.open} en cours, dont environ ${many(Math.round(expected), "devrait être livrée", "devraient être livrées")} (confirmation ${pct(cr)}, livraison ${pct(dr)} : taux de la ligne ajustés sur ceux de la boutique).`
    : "Toutes les commandes sont terminées : chiffres réels, pas de projection.";
  return {
    delivered,
    costPerDelivered: spend != null && delivered > 0 ? Math.round(spend / delivered) : null,
    netDeliveryRate: delivered / f.orders,
    confirmExpect: cr,
    deliveryExpect: dr,
    contribution: margin != null && spend != null ? Math.round(delivered * margin - spend) : null,
    projected,
    note,
  };
}

const FUNNEL_KEYS = [
  "sessions", "visitors", "productViews", "formStarts", "orders", "confirmed", "cancelled", "shipped", "delivered", "back", "open",
  "revenuePlaced", "revenueDelivered", "productCostDelivered", "costUnknownDelivered", "units", "multiUnitOrders", "newCustomers",
] as const;
const PLATFORM_KEYS = ["spend", "impressions", "clicks", "reach", "purchases"] as const;

/**
 * The sum of rows, for the account line. A platform count (impressions,
 * clicks, reach, purchases) is only summed when every row that spent has it,
 * as data.ts does for one row: clicks of one campaign against the visits of
 * all of them would give a false landing rate, and the whole spend over part
 * of the impressions a false CPM. Rows with no spend add no count. Reach is
 * summed too: people reached by two campaigns count twice, so the frequency
 * is a floor.
 */
export function totalRow(rows: AdRow[], key = "total", level: Level = "source"): AdRow {
  const funnel = Object.fromEntries(FUNNEL_KEYS.map((k) => [k, rows.reduce((s, r) => s + r.funnel[k], 0)])) as Funnel;
  if (rows.length > 0 && rows.every((r) => r.funnel.pending != null)) funnel.pending = rows.reduce((s, r) => s + (r.funnel.pending ?? 0), 0);
  const platform = Object.fromEntries(
    PLATFORM_KEYS.map((k) => {
      const known = rows.map((r) => r.platform[k]).filter((v): v is number => v != null);
      const partial = k !== "spend" && rows.some((r) => r.platform.spend != null && r.platform[k] == null);
      return [k, known.length && !partial ? known.reduce((s, v) => s + v, 0) : null];
    }),
  ) as Platform;
  return { level, key, source: key, campaign: null, ad: null, funnel, platform };
}

export type FunnelStep = { key: "impressions" | "clicks" | "sessions" | "productViews" | "formStarts" | "orders" | "confirmed" | "delivered"; label: string; count: number | null; rate: number | null };

/** The funnel bar of a row: each step with its count and the share of the step before (null when unknown). */
export function funnelSteps(row: AdRow): FunnelStep[] {
  const f = row.funnel;
  const p = row.platform;
  const steps: Omit<FunnelStep, "rate">[] = [
    { key: "impressions", label: "Affichages", count: p.impressions },
    { key: "clicks", label: "Clics sur le lien", count: p.clicks },
    { key: "sessions", label: "Visites", count: f.sessions },
    { key: "productViews", label: "Fiche vue", count: f.productViews },
    { key: "formStarts", label: "Formulaire commencé", count: f.formStarts },
    { key: "orders", label: "Commandes", count: f.orders },
    { key: "confirmed", label: "Confirmées", count: f.confirmed },
    { key: "delivered", label: "Livrées", count: f.delivered },
  ];
  return steps.map((s, i) => {
    const prev = i > 0 ? steps[i - 1].count : null;
    return { ...s, rate: s.count != null && prev != null ? ratio(s.count, prev) : null };
  });
}

export type KpiKey = Exclude<keyof Kpis, "missing" | "projection" | "marginBasis" | "pending" | "decided" | "final"> | "projectedDelivered" | "projectedCpd" | "projectedContribution";

export type KpiDef = {
  label: string;
  /** One line in French, for a tooltip or the first mention on a page. */
  help: string;
  unit: "money" | "rate" | "multiple" | "number";
  /** Which way is good; null when neither (frequency, open share). */
  better: "higher" | "lower" | null;
  /** Inputs it cannot do without. */
  needs: Input[];
};

export const KPI_DEFS: Record<KpiKey, KpiDef> = {
  cpm: { label: "CPM", help: "Coût de 1 000 affichages de la publicité.", unit: "money", better: "lower", needs: ["spend", "impressions"] },
  ctr: { label: "CTR lien", help: "Part des affichages qui donnent un clic sur le lien.", unit: "rate", better: "higher", needs: ["impressions", "clicks"] },
  cpc: { label: "CPC lien", help: "Coût d'un clic sur le lien.", unit: "money", better: "lower", needs: ["spend", "clicks"] },
  frequency: { label: "Fréquence", help: "Nombre moyen de fois qu'une personne a vu la publicité. Haute : l'audience se lasse. Importée jour par jour, c'est la moyenne d'une journée : sur toute la période, elle est plus haute.", unit: "number", better: null, needs: ["impressions", "reach"] },
  landingRate: { label: "Clics arrivés", help: "Visites comptées par la boutique pour 100 clics comptés par la plateforme. Bas : page lente, mauvais lien ou clics par erreur.", unit: "rate", better: "higher", needs: ["clicks"] },
  costPerVisit: { label: "Coût par visite", help: "Dépense divisée par les visites arrivées sur la boutique.", unit: "money", better: "lower", needs: ["spend"] },
  viewRate: { label: "Fiche vue", help: "Part des visites qui ouvrent une fiche produit.", unit: "rate", better: "higher", needs: [] },
  formStartRate: { label: "Formulaire commencé", help: "Part des fiches vues où le visiteur commence à remplir la commande.", unit: "rate", better: "higher", needs: [] },
  formCompletion: { label: "Formulaire fini", help: "Part des formulaires commencés qui deviennent une commande.", unit: "rate", better: "higher", needs: [] },
  orderRate: { label: "Taux de commande", help: "Commandes pour 100 visites (CVR).", unit: "rate", better: "higher", needs: [] },
  confirmRate: { label: "Confirmation", help: "Part des commandes déjà appelées qui sont confirmées au téléphone.", unit: "rate", better: "higher", needs: [] },
  cancelRate: { label: "Annulation", help: "Part des commandes déjà appelées qui sont annulées avant l'envoi.", unit: "rate", better: "lower", needs: [] },
  deliveryRate: { label: "Livraison", help: "Colis livrés sur les colis arrivés au bout (livrés ou revenus).", unit: "rate", better: "higher", needs: [] },
  netDeliveryRate: { label: "Livrées sur commandes", help: "Commandes livrées sur les commandes terminées : ce qui reste après annulations et refus.", unit: "rate", better: "higher", needs: [] },
  openShare: { label: "En cours", help: "Part des commandes pas encore terminées : les chiffres de livraison vont encore bouger.", unit: "rate", better: null, needs: [] },
  aov: { label: "Panier moyen", help: "Montant moyen d'une commande non annulée, livraison comprise.", unit: "money", better: "higher", needs: [] },
  unitsPerOrder: { label: "Articles par commande", help: "Nombre moyen d'articles dans une commande non annulée.", unit: "number", better: "higher", needs: [] },
  multiUnitShare: { label: "Commandes de 2 articles ou plus", help: "Part des commandes qui prennent un pack ou plusieurs articles.", unit: "rate", better: "higher", needs: [] },
  newCustomerShare: { label: "Nouveaux clients", help: "Part des commandes venant d'un numéro qui n'avait jamais commandé.", unit: "rate", better: null, needs: [] },
  cpaPlaced: { label: "CPA", help: "Coût par commande passée. Trompeur seul : une partie ne sera jamais livrée.", unit: "money", better: "lower", needs: ["spend"] },
  costPerConfirmed: { label: "Coût par confirmée", help: "Dépense divisée par les commandes confirmées au téléphone.", unit: "money", better: "lower", needs: ["spend"] },
  costPerDelivered: { label: "Coût par livrée", help: "Dépense divisée par les commandes livrées : le vrai coût d'un client qui a payé.", unit: "money", better: "lower", needs: ["spend"] },
  roasDelivered: { label: "ROAS livré", help: "Chiffre d'affaires livré pour 1 DT de publicité.", unit: "multiple", better: "higher", needs: ["spend"] },
  profitBeforeAds: { label: "Marge avant pub", help: "Livré − coût des produits − transporteur − retours, sur la période.", unit: "money", better: "higher", needs: ["productCost", "carrierCost", "returnCost"] },
  contribution: { label: "Résultat après pub", help: "Ce qu'il reste une fois la publicité payée.", unit: "money", better: "higher", needs: ["spend", "productCost", "carrierCost", "returnCost"] },
  poas: { label: "POAS", help: "Marge avant pub pour 1 DT de publicité. Au-dessus de 1, la publicité rapporte plus qu'elle ne coûte.", unit: "multiple", better: "higher", needs: ["spend", "productCost", "carrierCost", "returnCost"] },
  marginPerDelivered: { label: "Marge par livrée", help: "Ce que laisse une commande livrée avant la publicité, refus et retours compris.", unit: "money", better: "higher", needs: ["productCost", "carrierCost", "returnCost"] },
  breakEvenCpd: { label: "Coût max par livrée", help: "Au-dessus, chaque client livré fait perdre de l'argent.", unit: "money", better: null, needs: ["productCost", "carrierCost", "returnCost"] },
  breakEvenCpa: { label: "CPA max", help: "Coût max par commande passée, une fois les annulations et les refus comptés.", unit: "money", better: null, needs: ["productCost", "carrierCost", "returnCost"] },
  breakEvenRoas: { label: "ROAS minimum", help: "ROAS livré en dessous duquel la publicité perd de l'argent.", unit: "multiple", better: null, needs: ["productCost", "carrierCost", "returnCost"] },
  overReporting: { label: "Achats plateforme par commande", help: "Achats comptés par Meta ou TikTok pour 1 commande réelle (passée, confirmée ou livrée, selon le moment où l'achat leur est envoyé). Au-dessus de 1, la plateforme s'attribue des ventes qui n'existent pas.", unit: "multiple", better: null, needs: ["purchases"] },
  projectedDelivered: { label: "Livrées (projection)", help: "Livrées + commandes en cours × leur chance d'être livrées. Une projection, pas un résultat.", unit: "number", better: "higher", needs: ["baseline"] },
  projectedCpd: { label: "Coût par livrée (projection)", help: "Dépense divisée par les livrées projetées : le coût attendu quand les commandes en cours seront terminées.", unit: "money", better: "lower", needs: ["spend", "baseline"] },
  projectedContribution: { label: "Résultat après pub (projection)", help: "Livrées projetées × marge par livrée − dépense.", unit: "money", better: "higher", needs: ["spend", "baseline", "productCost", "carrierCost", "returnCost"] },
};

export function kpiValue(k: Kpis, key: KpiKey): number | null {
  if (key === "projectedDelivered") return k.projection?.delivered ?? null;
  if (key === "projectedCpd") return k.projection?.costPerDelivered ?? null;
  if (key === "projectedContribution") return k.projection?.contribution ?? null;
  return k[key];
}

/** The missing inputs behind an empty KPI; empty when the KPI is empty only because nothing was counted yet. */
export function whyMissing(k: Kpis, key: KpiKey): Input[] {
  return KPI_DEFS[key].needs.filter((n) => k.missing.includes(n));
}
