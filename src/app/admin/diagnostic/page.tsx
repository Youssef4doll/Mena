import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { abandonedCarts } from "@/lib/abandoned";
import { readServerErrors } from "@/lib/server-errors";
import { formatPhone } from "@/lib/phone";
import { formatTND } from "@/lib/money";
import { flagLabel } from "@/lib/order-status";
import { isRisky } from "@/lib/fraud";
import { minutesAgo, tunisMidnight } from "@/lib/analytics-range";
import PanelLayout from "../(panel)/layout";
import Dashboard from "../(panel)/page";

export const dynamic = "force-dynamic";
export const metadata = { title: "Diagnostic" };

type Step = { name: string; ok: boolean; ms: number; detail: string };

const mask = (s: string) =>
  s
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s'"]*@[^\s'"]*/gi, "[adresse masquée]")
    .replace(/\b(sk|re|pk|rk)[-_][A-Za-z0-9_-]{12,}/g, "[clé masquée]")
    .slice(0, 1500);

async function step(name: string, work: () => Promise<unknown> | unknown): Promise<Step> {
  const t = Date.now();
  try {
    const out = await work();
    return { name, ok: true, ms: Date.now() - t, detail: out === undefined ? "" : mask(typeof out === "string" ? out : JSON.stringify(out)).slice(0, 200) };
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    // redirect() and notFound() are not failures.
    if (/NEXT_REDIRECT|NEXT_NOT_FOUND/.test(e.message)) return { name, ok: true, ms: Date.now() - t, detail: e.message };
    return { name, ok: false, ms: Date.now() - t, detail: mask(`${e.name}: ${e.message}\n${(e.stack ?? "").split("\n").slice(1, 7).join("\n")}`) };
  }
}

/**
 * The back office's dashboard taken apart: each thing it does, one at a
 * time, with what failed and its message. For the owner to copy when a page
 * of the back office does not open (the host only shows a code).
 */
export default async function Diagnostic() {
  // The session check itself may be what fails: then only its own message is shown.
  const session = await step("session", () => requireAdmin().then(() => "connecté"));
  if (!session.ok) {
    return (
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold text-ink">Diagnostic du back-office</h1>
        <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl border border-[#d9a0a0] bg-[#fdeeee] p-3 text-xs">{`ÉCHEC · session\n${session.detail}`}</pre>
      </main>
    );
  }
  if (/NEXT_REDIRECT/.test(session.detail)) await requireAdmin();
  const steps: Step[] = [session];
  steps.push(await step("serveur", () => ({ node: process.version, region: process.env.AWS_REGION ?? null, tz: process.env.TZ ?? null, netlify: process.env.NETLIFY ?? null, mem: Math.round(process.memoryUsage().rss / 1e6) + " Mo" })));
  steps.push(await step("dates (fuseau de Tunis)", () => ({ minuit: tunisMidnight(new Date()).toISOString(), il_y_a_5_min: minutesAgo(5).toISOString(), heure: new Date().toLocaleString("fr-TN", { timeZone: "Africa/Tunis" }) })));
  steps.push(await step("compteurs du menu", () => Promise.all([prisma.order.count({ where: { status: "PENDING" } }), prisma.review.count({ where: { status: "PENDING" } }), prisma.returnRequest.count({ where: { status: "REQUESTED" } })])));
  steps.push(await step("commandes du jour", () => prisma.order.aggregate({ where: { createdAt: { gte: tunisMidnight(new Date()) }, status: { not: "CANCELLED" } }, _count: { _all: true }, _sum: { total: true } })));
  const pending = await step("commandes à confirmer", async () => {
    const rows = await prisma.order.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 8, select: { ref: true, phone: true, total: true, flags: true, createdAt: true } });
    return rows.map((o) => ({ ref: o.ref, tel: formatPhone(o.phone), total: formatTND(o.total), risque: isRisky(o.flags), flags: o.flags.map(flagLabel), le: o.createdAt.toISOString() }));
  });
  steps.push(pending);
  steps.push(await step("commandes par état", () => prisma.order.groupBy({ by: ["status"], where: { status: { in: ["PENDING", "CONFIRMED", "SUPPLIER_ORDERED", "SHIPPED"] } }, _count: { _all: true } })));
  steps.push(await step("visiteurs en ce moment", async () => (await prisma.analyticsEvent.findMany({ where: { createdAt: { gte: minutesAgo(5) } }, distinct: ["visitorId"], select: { visitorId: true } })).length));
  steps.push(await step("stock bas", async () => (await prisma.product.findMany({ where: { active: true, OR: [{ stockMode: "TRACKED", stockQty: { lte: 5 }, variants: { none: {} } }, { stockMode: "SUPPLIER", available: false }] }, take: 8, select: { id: true } })).length));
  steps.push(await step("paniers non terminés", async () => (await abandonedCarts(2, 100)).length));
  steps.push(await step("produits de démo", () => prisma.product.count({ where: { isDemo: true } })));
  steps.push(await step("page du tableau de bord", async () => {
    await Dashboard();
    return "construite";
  }));
  steps.push(await step("cadre du back-office (menu)", async () => {
    await PanelLayout({ children: null });
    return "construit";
  }));
  const saved = await readServerErrors();
  const failed = steps.filter((s) => !s.ok);
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-3 p-6">
      <h1 className="text-xl font-semibold text-ink">Diagnostic du back-office</h1>
      <p className="text-sm text-ink-2">{failed.length === 0 ? "Toutes les étapes passent." : `${failed.length} étape(s) en échec, en rouge.`} Copiez tout le texte de cette page pour la réparation.</p>
      <ol className="flex flex-col gap-2">
        {steps.map((s) => (
          <li key={s.name} className={`rounded-xl border p-3 text-sm ${s.ok ? "border-line bg-white" : "border-[#d9a0a0] bg-[#fdeeee]"}`}>
            <p className="font-semibold">{s.ok ? "OK" : "ÉCHEC"} · {s.name} · {s.ms} ms</p>
            {s.detail && <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-xs">{s.detail}</pre>}
          </li>
        ))}
      </ol>
      <section className="rounded-xl border border-line bg-white p-3 text-sm">
        <p className="font-semibold">Erreurs enregistrées : {saved.length}</p>
        {saved.slice(0, 5).map((r, i) => (
          <pre key={i} className="mt-1 overflow-x-auto whitespace-pre-wrap break-words text-xs">{`${r.at} · ${r.path} · ${r.kind} · ${r.digest ?? ""}\n${r.message}\n${r.stack}`}</pre>
        ))}
      </section>
    </main>
  );
}
