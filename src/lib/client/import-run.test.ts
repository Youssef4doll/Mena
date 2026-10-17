import { test } from "node:test";
import assert from "node:assert/strict";
import { ImportRun, limiter, send, SessionExpired, type Job } from "./import-run";

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const noWait = async () => {};

test("a limiter never runs more than its size at once, and keeps the order", async () => {
  const slot = limiter(2);
  let running = 0;
  let most = 0;
  const order: number[] = [];
  await Promise.all(
    [1, 2, 3, 4, 5].map((n) =>
      slot(async () => {
        running++;
        most = Math.max(most, running);
        order.push(n);
        await new Promise((r) => setTimeout(r, 5));
        running--;
      }),
    ),
  );
  assert.equal(most, 2);
  assert.deepEqual(order, [1, 2, 3, 4, 5]);
});

test("send tries again after a network error or a 5xx, not after a 4xx", async () => {
  let calls = 0;
  const flaky = async () => {
    calls++;
    if (calls === 1) throw new TypeError("network");
    if (calls === 2) return new Response("oops", { status: 502 });
    return ok({ ok: true, id: "x" });
  };
  assert.deepEqual(await send({ fetch: flaky as typeof fetch, wait: noWait }, "/u", {}), { ok: true, id: "x" });
  assert.equal(calls, 3);

  calls = 0;
  const refused = async () => {
    calls++;
    return ok({ ok: false, error: "Nouveau produit sans prix." }, 422);
  };
  assert.deepEqual(await send({ fetch: refused as typeof fetch, wait: noWait }, "/u", {}), { ok: false, error: "Nouveau produit sans prix." });
  assert.equal(calls, 1);

  const down = async () => new Response("<html>", { status: 503 });
  assert.match((await send({ fetch: down as typeof fetch, wait: noWait }, "/u", {}) as { error: string }).error, /503/);
  await assert.rejects(send({ fetch: (async () => ok({ ok: false }, 401)) as typeof fetch, wait: noWait }, "/u", {}), SessionExpired);
});

/** A fake shop: rows get ids, pictures are recorded with their place; `fail` decides per request. */
function fakeServer(fail: (url: string, n: number) => Response | null = () => null) {
  const log: { url: string; body: unknown }[] = [];
  let n = 0;
  const fetch = async (url: string, init: RequestInit) => {
    n++;
    const body = init.body instanceof FormData ? Object.fromEntries([...init.body.entries()].map(([k, v]) => [k, v instanceof File ? v.name : v])) : JSON.parse(String(init.body));
    log.push({ url, body });
    const forced = fail(url, n);
    if (forced) return forced;
    if (url.endsWith("/rows")) {
      const row = (body as { row: { name: string } }).row;
      return ok({ ok: true, id: `id${row.name}`, created: row.name !== "B", translated: false, images: { GALLERY: row.name === "B" ? 2 : 0, DETAIL: 0 } });
    }
    return ok({ ok: true, id: "img", skipped: false });
  };
  return { fetch: fetch as unknown as typeof globalThis.fetch, log };
}

const jobs = (): Job[] => [
  { line: 2, row: { name: "A" }, pictures: [{ kind: "GALLERY", index: 0, label: "https://a.com/1.jpg", url: "https://a.com/1.jpg" }, { kind: "DETAIL", index: 0, label: "long.png", file: new File([new Uint8Array(30)], "long.png", { type: "image/png" }) }] },
  { line: 3, row: { name: "B" }, pictures: [{ kind: "GALLERY", index: 1, label: "https://a.com/2.jpg", url: "https://a.com/2.jpg" }] },
  { line: 4, row: { name: "C" }, pictures: [] },
];

test("prepares once, saves the rows, then sends each picture after the ones the product has", async () => {
  const server = fakeServer();
  const run = new ImportRun(jobs(), { activateNew: false, translate: false }, { categories: [{ name: "Maison" }], suppliers: [] }, { fetch: server.fetch, shrink: async (f) => f, onChange: () => {}, wait: noWait });
  assert.equal(await run.run(), "done");
  assert.equal(server.log[0].url, "/admin/produits/import/prepare");
  assert.equal(server.log.filter((l) => l.url.endsWith("/rows")).length, 3);
  const pics = server.log.filter((l) => l.url.includes("/images"));
  assert.deepEqual(pics.map((p) => p.url).sort(), ["/admin/produits/idA/images", "/admin/produits/idA/images", "/admin/produits/idB/images"]);
  assert.deepEqual(pics.find((p) => p.url.includes("idB"))?.body, { url: "https://a.com/2.jpg", kind: "GALLERY", sort: 3 });
  assert.deepEqual(pics.find((p) => (p.body as { kind: string }).kind === "DETAIL")?.body, { file: "long.png", kind: "DETAIL", sort: "0", source: "file:long.png:30" });
  assert.deepEqual(run.counts(), { rows: 3, saved: 3, failed: 0, created: 2, updated: 1, pictures: 3, added: 3, skipped: 0, picFailed: 0 });
});

test("a row refused by the server fails alone; running again retries only what failed", async () => {
  let refuse = true;
  const server = fakeServer();
  const fetch = (async (url: string, init: RequestInit) => {
    if (refuse && url.endsWith("/rows") && JSON.parse(String(init.body)).row.name === "C") return ok({ ok: false, error: "Ligne refusée." }, 422);
    if (refuse && url.includes("idB")) return ok({ ok: false, error: "Image introuvable." }, 422);
    return server.fetch(url, init);
  }) as typeof globalThis.fetch;
  const run = new ImportRun(jobs(), { activateNew: true, translate: false }, { categories: [], suppliers: [] }, { fetch, shrink: async (f) => f, onChange: () => {}, wait: noWait });
  assert.equal(await run.run(), "done");
  const snap = run.snapshot();
  assert.equal(snap.rows.get(4)?.state, "failed");
  assert.equal(snap.rows.get(4)?.error, "Ligne refusée.");
  assert.deepEqual(snap.rows.get(3)?.picErrors, ["https://a.com/2.jpg : Image introuvable."]);
  assert.equal(run.counts().picFailed, 1);

  refuse = false;
  server.log.length = 0;
  assert.equal(await run.run(), "done");
  // Only row C and B's picture are sent again.
  assert.deepEqual(server.log.map((l) => l.url).sort(), ["/admin/produits/idB/images", "/admin/produits/import/rows"]);
  assert.deepEqual(run.counts(), { rows: 3, saved: 3, failed: 0, created: 2, updated: 1, pictures: 3, added: 3, skipped: 0, picFailed: 0 });
});

test("an expired session stops everything; the rows not sent wait for the next run", async () => {
  let expired = true;
  const server = fakeServer((url, n) => (expired && url.endsWith("/rows") && n > 1 ? ok({ ok: false, error: "Session expirée" }, 401) : null));
  const run = new ImportRun(jobs(), { activateNew: false, translate: false }, { categories: [], suppliers: [] }, { fetch: server.fetch, shrink: async (f) => f, onChange: () => {}, wait: noWait });
  assert.equal(await run.run(), "expired");
  const c = run.counts();
  assert.equal(c.saved + c.failed < 3, true);
  assert.equal(c.failed, 0, "an expired session is not a failed row");

  expired = false;
  assert.equal(await run.run(), "done");
  assert.equal(run.counts().saved, 3);
});

test("stop lets the requests on their way finish and sends nothing more", async () => {
  const server = fakeServer();
  const box: { run?: ImportRun } = {};
  const fetch = (async (url: string, init: RequestInit) => {
    const r = await server.fetch(url, init);
    if (url.endsWith("/rows")) box.run?.stop();
    return r;
  }) as typeof globalThis.fetch;
  const run = (box.run = new ImportRun(jobs(), { activateNew: false, translate: false }, { categories: [], suppliers: [] }, { fetch, shrink: async (f) => f, onChange: () => {}, wait: noWait }));
  assert.equal(await run.run(), "stopped");
  // The three rows were already on their way (three at a time); no picture left after the stop.
  assert.equal(server.log.filter((l) => l.url.includes("/images")).length, 0);
  assert.equal(run.counts().saved, 3);
  assert.equal(await run.run(), "done");
  assert.equal(run.counts().added, 3);
});

test("a new row whose answer was lost and sent again still counts as created", async () => {
  // The first try is saved by the server but the answer never arrives; the retry finds the product it made.
  let made = false;
  const fetch = (async () => {
    if (!made) {
      made = true;
      throw new TypeError("network");
    }
    return ok({ ok: true, id: "idN", created: false, translated: false, images: { GALLERY: 0, DETAIL: 0 } });
  }) as typeof globalThis.fetch;
  const job: Job = { line: 2, row: { name: "Lampe" }, pictures: [], isNew: true };
  const run = new ImportRun([job], { activateNew: false, translate: false }, { categories: [], suppliers: [] }, { fetch, shrink: async (f) => f, onChange: () => {}, wait: noWait });
  assert.equal(await run.run(), "done");
  assert.equal(run.snapshot().rows.get(2)?.created, true);

  // Answered at the first try: the server's word is kept.
  const once = (async () => ok({ ok: true, id: "idU", created: false, translated: false, images: { GALLERY: 0, DETAIL: 0 } })) as typeof globalThis.fetch;
  const other = new ImportRun([job], { activateNew: false, translate: false }, { categories: [], suppliers: [] }, { fetch: once, shrink: async (f) => f, onChange: () => {}, wait: noWait });
  await other.run();
  assert.equal(other.snapshot().rows.get(2)?.created, false);
});
