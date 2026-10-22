import { currentAdmin } from "@/lib/admin-auth";
import { getAnalytics } from "@/lib/analytics";
import { parseRange, ratio } from "@/lib/analytics-range";
import { csvResponse, dt, toCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";

const pct = (v: number | null) => (v == null ? "" : (v * 100).toFixed(1));

/** Every dashboard table as CSV, for the same period the page shows. */
export async function GET(request: Request) {
  if (!(await currentAdmin())) return new Response("Unauthorized", { status: 401 });
  const sp = new URL(request.url).searchParams;
  const report = sp.get("report") ?? "daily";
  const r = parseRange({ p: sp.get("p") ?? undefined, from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
  const tag = `${r.from.toISOString().slice(0, 10)}_${r.to.toISOString().slice(0, 10)}`;

  if (report === "customers") {
    const rows = await prisma.$queryRaw<{ phone: string; name: string | null; blacklisted: boolean; orders: number; delivered: number; refused: number; spent: number; first: Date | null; last: Date | null }[]>`
      SELECT c.phone, c.name, c.blacklisted, COUNT(o.id)::int AS orders,
        COUNT(o.id) FILTER (WHERE o.status = 'DELIVERED')::int AS delivered,
        COUNT(o.id) FILTER (WHERE o.status = 'REFUSED')::int AS refused,
        COALESCE(SUM(o.total) FILTER (WHERE o.status = 'DELIVERED'), 0)::int AS spent,
        MIN(o."createdAt") AS first, MAX(o."createdAt") AS last
      FROM "Customer" c LEFT JOIN "Order" o ON o."customerId" = c.id
      GROUP BY c.id ORDER BY last DESC NULLS LAST LIMIT 50000`;
    return csvResponse(`clients.csv`, toCsv(["telephone", "nom", "liste_noire", "commandes", "livrees", "refusees", "taux_refus_pct", "depense_livree_dt", "premiere", "derniere"],
      rows.map((c) => [c.phone, c.name, c.blacklisted ? "oui" : "non", c.orders, c.delivered, c.refused, pct(ratio(c.refused, c.delivered + c.refused)), dt(c.spent), c.first?.toISOString() ?? "", c.last?.toISOString() ?? ""])));
  }

  const a = await getAnalytics(r);
  switch (report) {
    case "funnel":
      return csvResponse(`entonnoir_${tag}.csv`, toCsv(["etape", "nombre", "depuis_precedente_pct", "depuis_visites_pct"], a.funnel.map((s, i) => [s.step, s.count, i ? pct(ratio(s.count, a.funnel[i - 1].count)) : "", pct(ratio(s.count, a.funnel[0].count))])));
    case "sources":
    case "campaigns": {
      const rows = report === "sources" ? a.sources : a.campaigns;
      return csvResponse(`${report}_${tag}.csv`, toCsv(["source", "campagne", "visites", "commandes", "conversion_pct", "confirmees", "livrees", "refusees", "taux_refus_pct", "ca_livre_dt"],
        rows.map((s) => [s.source, s.campaign ?? "", s.sessions, s.orders, pct(ratio(s.orders, s.sessions)), s.confirmed, s.delivered, s.refused, pct(ratio(s.refused, s.delivered + s.refused)), dt(s.revenue)])));
    }
    case "devices":
      return csvResponse(`appareils_${tag}.csv`, toCsv(["appareil", "visites", "commandes", "conversion_pct", "ca_dt"], a.devices.map((d) => [d.device, d.sessions, d.orders, pct(ratio(d.orders, d.sessions)), dt(d.revenue)])));
    case "products":
      return csvResponse(`produits_${tag}.csv`, toCsv(["produit", "vues", "formulaires", "commandes", "vue_commande_pct", "unites", "ca_dt"], a.products.map((p) => [p.name, p.views, p.forms, p.orders, pct(ratio(p.orders, p.views)), p.units, dt(p.revenue)])));
    case "details": {
      // The long pictures on a phone, product by product, then every product together.
      const seen = a.details.since != null;
      return csvResponse(`details_images_${tag}.csv`, toCsv(
        ["produit", "visites_telephone", "images_vues", "images_vues_pct", "jusqu_au_bout", "jusqu_au_bout_pct", "lien_details", "barre_formulaire", "barre_fenetre", "barre_non_precise", "fenetre_depuis_barre", "fenetre_depuis_fin",
          "commandes", "cmd_fiche_produit", "cmd_fenetre_de_commande", "cmd_commande_rapide", "cmd_panier", "cmd_origine_non_enregistree", "confirmees", "livrees", "refusees", "livrees_par_visite_pct", "taux_refus_pct", "visites_barre", "commandes_visites_barre"],
        [...a.details.products, a.details.total].map((x) => [
          x.name, x.sessions, seen ? x.seen : "", seen ? pct(ratio(x.seen, x.sessions)) : "", seen ? x.ended : "", seen ? pct(ratio(x.ended, x.sessions)) : "", x.links, x.bar.scroll, x.bar.sheet, x.bar.other, x.opened.bar, x.opened.end,
          x.orders.all, x.orders.product, x.orders.sheet, x.orders.quick, x.orders.cart, x.orders.other, x.confirmed, x.delivered, x.refused, pct(ratio(x.delivered, x.sessions)), pct(ratio(x.refused, x.delivered + x.refused)), x.barSessions, x.barOrders,
        ]),
      ));
    }
    case "searches":
      return csvResponse(`recherches_${tag}.csv`, toCsv(["recherche", "nombre", "resultats"], [...a.searches.top, ...a.searches.none].map((s) => [s.q, s.count, s.results])));
    case "governorates":
      return csvResponse(`gouvernorats_${tag}.csv`, toCsv(["gouvernorat", "commandes", "livrees", "refusees", "taux_refus_pct", "ca_livre_dt"], a.governorates.map((g) => [g.governorate, g.orders, g.delivered, g.refused, pct(ratio(g.refused, g.delivered + g.refused)), dt(g.revenue)])));
    case "contacts":
      return csvResponse(`contacts_${tag}.csv`, toCsv(["canal", "clics"], [["whatsapp", a.contacts.whatsapp], ["telephone", a.contacts.phone]]));
    case "cohorts":
      return csvResponse(`cohortes.csv`, toCsv(["mois", "clients", "m1", "m2", "m3", "m4", "m5"], a.cohorts.map((c) => [c.month, c.size, ...c.retained.map((v) => (v == null ? "" : v))])));
    default:
      return csvResponse(`jours_${tag}.csv`, toCsv(["jour", "visites", "commandes", "confirmees", "ca_commande_dt"], a.days.map((d) => [d.day, d.sessions, d.orders, d.confirmed, dt(d.revenue)])));
  }
}
