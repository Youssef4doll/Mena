/**
 * The shapes the "Publicités" section passes around: what the shop measured
 * for one source, campaign or ad (its own visits and orders, never guessed),
 * what the ad platform said (copied or imported by the owner), and what the
 * advisor makes of them. Money is in millimes, as everywhere in the shop.
 */

/** One row is a traffic source ("facebook"), a campaign (utm_campaign) or an ad (utm_content). */
export type Level = "source" | "campaign" | "ad";

/** What the shop itself counted for visits that came with this attribution (first touch of the visit). */
export type Funnel = {
  /** Visits (sessions) that landed with this attribution. */
  sessions: number;
  /** Distinct browsers among them. */
  visitors: number;
  /** Visits that opened a product page. */
  productViews: number;
  /** Visits that started the order form (first field typed). */
  formStarts: number;
  /** Orders placed (admin-entered orders excluded), any status. */
  orders: number;
  /** Orders that reached "confirmed" or later at some point (confirmedAt set). */
  confirmed: number;
  /** Orders cancelled before shipping. */
  cancelled: number;
  /** Parcels handed to the carrier: shipped, delivered, refused or returned. */
  shipped: number;
  delivered: number;
  /** Refused at the door or returned afterwards: parcels that came back. */
  back: number;
  /** Not final yet: pending, confirmed, ordered from the supplier, or on the way. */
  open: number;
  /**
   * Of the open orders, those still waiting for their confirmation call
   * (status PENDING). Optional: without it the engine estimates it as
   * orders − confirmed − cancelled, which undercounts when confirmed orders
   * were cancelled later.
   */
  pending?: number;
  /**
   * Of those pending orders, the ones placed more than STALE_PENDING_HOURS
   * before the figures were read, still never confirmed: far fewer of them
   * end delivered. Optional: without it every pending order counts as fresh.
   */
  pendingStale?: number;
  /** Totals (delivery fee included) of the orders not cancelled. */
  revenuePlaced: number;
  /** Totals of the delivered orders. */
  revenueDelivered: number;
  /** Supplier cost of the delivered orders whose cost is known, and how many delivered orders have no known cost. */
  productCostDelivered: number;
  costUnknownDelivered: number;
  /** Units in the orders not cancelled, and how many of those orders took more than one unit (packs, upsell). */
  units: number;
  multiUnitOrders: number;
  /** Orders from a phone number that had never ordered before. */
  newCustomers: number;
};

/** What the ad platform reported for the same row and period. Null: not entered or not imported. */
export type Platform = {
  spend: number | null;
  impressions: number | null;
  /** Link clicks (not all clicks). */
  clicks: number | null;
  reach: number | null;
  /** Purchases the platform counted (its pixel), to compare with the real orders. */
  purchases: number | null;
};

export type AdRow = {
  level: Level;
  /** Stable key: "facebook", "facebook|lampe-oct", "facebook|lampe-oct|video-1". */
  key: string;
  source: string;
  campaign: string | null;
  ad: string | null;
  funnel: Funnel;
  platform: Platform;
};

/** The shop's own costs, from the settings. Null: the owner has not given it. */
export type Costs = { carrierPerParcel: number | null; returnPerParcel: number | null };

/**
 * Rates of the whole shop over a long window, used to read young or small
 * rows: how many orders usually get confirmed and delivered.
 */
export type Baseline = {
  orders: number;
  confirmRate: number | null;
  /** Delivered / (delivered + back), over final parcels. */
  deliveryRate: number | null;
  /** Delivered / orders placed, over orders old enough to be final. */
  netDeliveryRate: number | null;
  aov: number | null;
  /** Average days from order to delivery. */
  daysToDeliver: number | null;
  /**
   * What one delivered order leaves before ads, refusals' carrier and return
   * costs included (millimes), over the same window. Optional: null or absent
   * when a cost is unknown. Gives young rows a margin to be judged against.
   */
  marginPerDelivered?: number | null;
  /**
   * Of the shop's final orders that were still pending STALE_PENDING_HOURS
   * after being placed, the share that ended delivered. Measured, never
   * assumed: null or absent when too few orders were in that case.
   */
  staleDeliveredRate?: number | null;
};

/** Hours after which an order nobody has confirmed yet counts as stale. */
export const STALE_PENDING_HOURS = 48;

/**
 * Confirmation by how long the first call took after the order was placed,
 * over orders that are no longer pending. "never": decided without a logged
 * call. Labels are French ("moins d'1 h", "1 à 4 h", "4 à 24 h", "plus de 24 h").
 */
export type CallDelayRow = { bucket: "1h" | "4h" | "24h" | "later" | "never"; label: string; orders: number; confirmed: number };

/** One day of a row, for trends (fatigue, pacing). */
export type DayPoint = { day: string; spend: number | null; impressions: number | null; clicks: number | null; sessions: number; orders: number; delivered: number };

export type Severity = "critical" | "warning" | "good" | "info";

/** One thing the advisor wants the owner to know, in plain French. */
export type Insight = {
  severity: Severity;
  /** Row it is about, or null for the whole account. */
  key: string | null;
  title: string;
  /** What the numbers show, with the numbers. */
  evidence: string;
  /** What to do next, concretely. */
  action: string;
  /** Where the owner fixes it, when it is a page of the back office (the UI turns it into a link). */
  fix?: Fix;
};

/**
 * Back-office places an insight can send the owner to: the costs or tracking
 * settings, the manual spend page, the import tab, the products (supplier
 * cost), the ad link builder, the creative brief, the order forms started
 * and not finished (their phone numbers, to call back).
 */
export type Fix = "costs" | "tracking" | "spend" | "import" | "productCost" | "links" | "brief" | "carts" | "orders";

/** What to do with a row now. "wait": not enough data to judge; "tracking": the measure itself is broken. */
export type Verdict = "scale" | "keep" | "fix" | "cut" | "wait" | "tracking";

export type Advice = {
  key: string;
  verdict: Verdict;
  confidence: "low" | "medium" | "high";
  /** Suggested budget change in percent (+20, −50…), or null. */
  budgetChange: number | null;
  reasons: string[];
};
