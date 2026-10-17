import { test } from "node:test";
import assert from "node:assert/strict";
import { linksIn, pictureName, sendPictures, type Deps, type Outgoing } from "./send-pictures";

const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const file = (name: string, size = 10) => new File([new Uint8Array(size)], name, { type: "image/jpeg" });

/** A fake images route: records what each request asked for; `answer` decides per picture name. */
function fakeRoute(answer: (name: string) => Response | null = () => null) {
  const log: { url: string; name: string; kind: string; sort: number; source: string | null }[] = [];
  let running = 0;
  let most = 0;
  const fetch = async (url: string, init: RequestInit) => {
    running++;
    most = Math.max(most, running);
    let entry;
    if (init.body instanceof FormData) {
      const f = init.body.get("file") as File;
      entry = { url, name: f.name, kind: String(init.body.get("kind")), sort: Number(init.body.get("sort")), source: String(init.body.get("source")) };
    } else {
      const b = JSON.parse(String(init.body));
      entry = { url, name: b.url, kind: b.kind, sort: b.sort, source: null };
    }
    log.push(entry);
    // Answers arrive in another order than the requests.
    await new Promise((r) => setTimeout(r, entry.name.length % 3));
    running--;
    return answer(entry.name) ?? ok({ ok: true, id: `img-${log.length}`, skipped: false });
  };
  const deps: Deps = { fetch: fetch as typeof globalThis.fetch, shrink: async (f) => new File([f], `small-${f.name}`, { type: f.type }), wait: async () => {} };
  return { deps, log, most: () => most };
}

test("pictures go three at a time, each to its own place after the last one of its kind", async () => {
  const route = fakeRoute();
  const items: Outgoing[] = [
    { kind: "GALLERY", file: file("a.jpg") },
    { kind: "GALLERY", file: file("bb.jpg") },
    { kind: "DETAIL", file: file("long.jpg") },
    { kind: "GALLERY", file: file("cccc.jpg") },
    { kind: "GALLERY", url: "https://example.com/p/d.jpg" },
    { kind: "DETAIL", file: file("long2.jpg") },
  ];
  const progress: string[] = [];
  const r = await sendPictures("prod1", items, { GALLERY: 4, DETAIL: 0 }, (n, t) => progress.push(`${n}/${t}`), route.deps);
  assert.deepEqual(r, { added: 6, skipped: 0, errors: [], expired: false });
  assert.equal(route.most(), 3);
  const place = Object.fromEntries(route.log.map((e) => [e.name, `${e.kind}:${e.sort}`]));
  assert.deepEqual(place, {
    "small-a.jpg": "GALLERY:4",
    "small-bb.jpg": "GALLERY:5",
    "small-long.jpg": "DETAIL:0",
    "small-cccc.jpg": "GALLERY:6",
    "https://example.com/p/d.jpg": "GALLERY:7",
    "small-long2.jpg": "DETAIL:1",
  });
  assert.ok(route.log.every((e) => e.url === "/admin/produits/prod1/images"));
  // The source is the file as chosen, not as shrunk: the same photo chosen again is recognised.
  assert.equal(route.log.find((e) => e.name === "small-a.jpg")?.source, "file:a.jpg:10");
  assert.deepEqual(progress, ["0/6", "1/6", "2/6", "3/6", "4/6", "5/6", "6/6"]);
});

test("refused pictures are listed by name in the order chosen; known ones are counted apart", async () => {
  const route = fakeRoute((name) =>
    name === "small-x.png" ? ok({ ok: false, error: "Format non accepté (JPEG, PNG, WebP, AVIF)." }, 422)
    : name.includes("drive") ? ok({ ok: false, error: "Ce lien mène à une page, pas à une image." }, 422)
    : name === "small-same.jpg" ? ok({ ok: true, id: "old", skipped: true })
    : null,
  );
  const r = await sendPictures("p", [
    { kind: "GALLERY", url: "https://drive.example.com/file/d/123/view?usp=sharing" },
    { kind: "GALLERY", file: file("ok.jpg") },
    { kind: "GALLERY", file: file("x.png") },
    { kind: "GALLERY", file: file("same.jpg") },
  ], { GALLERY: 0, DETAIL: 0 }, () => {}, route.deps);
  assert.equal(r.added, 1);
  assert.equal(r.skipped, 1);
  assert.deepEqual(r.errors, ["drive.example.com/…/view : Ce lien mène à une page, pas à une image.", "x.png : Format non accepté (JPEG, PNG, WebP, AVIF)."]);
});

test("one picture alone: its error as the route wrote it, without its name", async () => {
  const route = fakeRoute(() => ok({ ok: false, error: "Ce lien mène à une page, pas à une image." }, 422));
  const r = await sendPictures("p", [{ kind: "GALLERY", url: "https://drive.google.com/file/d/123/view" }], { GALLERY: 0, DETAIL: 0 }, () => {}, route.deps);
  assert.deepEqual(r.errors, ["Ce lien mène à une page, pas à une image."]);
});

test("an expired session stops the pictures not sent yet", async () => {
  const route = fakeRoute(() => ok({ ok: false, error: "Session expirée : reconnectez-vous." }, 401));
  const items: Outgoing[] = Array.from({ length: 7 }, (_, i) => ({ kind: "GALLERY", file: file(`${i}.jpg`) }));
  const r = await sendPictures("p", items, { GALLERY: 0, DETAIL: 0 }, () => {}, route.deps);
  assert.equal(r.expired, true);
  assert.equal(r.added, 0);
  // The first three were already on their way; none after them.
  assert.equal(route.log.length, 3);
});

test("links pasted in the field: one or several, nothing else", () => {
  assert.deepEqual(linksIn("  https://a.com/1.jpg "), ["https://a.com/1.jpg"]);
  assert.deepEqual(linksIn("https://a.com/1.jpg\nhttp://b.com/2.png https://c.com/x?y=1"), ["https://a.com/1.jpg", "http://b.com/2.png", "https://c.com/x?y=1"]);
  assert.equal(linksIn(""), null);
  assert.equal(linksIn("photo.jpg"), null);
  assert.equal(linksIn("https://a.com/1.jpg et https://b.com/2.jpg"), null);
});

test("a picture is named by its file, or by its site and the end of its address", () => {
  assert.equal(pictureName({ kind: "GALLERY", file: file("Lampe 1.jpg") }), "Lampe 1.jpg");
  assert.equal(pictureName({ kind: "GALLERY", url: "https://cdn.example.com/img/abc/lampe.webp?w=800#top" }), "cdn.example.com/…/lampe.webp");
  assert.equal(pictureName({ kind: "GALLERY", url: "https://www.shop.tn/lampe%20noire.jpg" }), "shop.tn/lampe noire.jpg");
  assert.equal(pictureName({ kind: "GALLERY", url: "https://shop.tn/" }), "shop.tn");
  assert.equal(pictureName({ kind: "DETAIL", url: `https://x.com/${"a".repeat(60)}.jpg` }).length, 40);
});
