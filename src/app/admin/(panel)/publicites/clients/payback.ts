/**
 * When the ads that brought a customer are paid back: the period's spend of a
 * source per new customer it brought, against what those customers left 30,
 * 60 and 90 days after their first order (delivered orders only, the first
 * one included). The money left is an estimate: delivered orders × the
 * margin of one delivered order (refusal costs included), since the shop
 * does not know each repeat order's margin before it is delivered. Pure, so
 * it is tested; the Clients tab passes the data layer's cohorts and the
 * engine's margin.
 *
 *   payback(cohort, spend, margin) → Payback
 */

/** Below this many measurable customers, a horizon is shown but not used to say "paid back". */
export const PAYBACK_MIN_CUSTOMERS = 10;

export type Horizon = 30 | 60 | 90;

/** The parts of the data layer's LtvPoint this needs. */
export type LtvInput = { days: Horizon; customers: number; deliveredOrders: number; revenue: number };

export type PaybackPoint = {
  days: Horizon;
  /** Customers old enough to be measured at this horizon. */
  customers: number;
  revenuePerCustomer: number | null;
  deliveredPerCustomer: number | null;
  /** Estimate: delivered orders per customer × margin per delivered order. */
  marginPerCustomer: number | null;
  /** marginPerCustomer / costPerCustomer: at 1 or more the customer has paid for the ads that brought them. */
  ratio: number | null;
  /** Enough customers to read this horizon. */
  enough: boolean;
};

export type Payback = {
  /** Spend of the period / customers acquired in the period. Null: no spend, or no new customer. */
  costPerCustomer: number | null;
  points: PaybackPoint[];
  /** First horizon read on enough customers where the ratio reaches 1; null: not (yet). */
  paidBackAt: Horizon | null;
};

export function payback(cohort: { customers: number; ltv: LtvInput[] }, spend: number | null, marginPerDelivered: number | null): Payback {
  const costPerCustomer = spend != null && spend > 0 && cohort.customers > 0 ? Math.round(spend / cohort.customers) : null;
  const points = cohort.ltv.map((p): PaybackPoint => {
    const measured = p.customers > 0;
    const deliveredPerCustomer = measured ? p.deliveredOrders / p.customers : null;
    const marginPerCustomer = deliveredPerCustomer != null && marginPerDelivered != null ? Math.round(deliveredPerCustomer * marginPerDelivered) : null;
    return {
      days: p.days,
      customers: p.customers,
      revenuePerCustomer: measured ? Math.round(p.revenue / p.customers) : null,
      deliveredPerCustomer,
      marginPerCustomer,
      ratio: marginPerCustomer != null && costPerCustomer != null ? marginPerCustomer / costPerCustomer : null,
      enough: p.customers >= PAYBACK_MIN_CUSTOMERS,
    };
  });
  const hit = points.find((p) => p.enough && p.ratio != null && p.ratio >= 1);
  return { costPerCustomer, points, paidBackAt: hit?.days ?? null };
}
