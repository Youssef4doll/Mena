/**
 * Sends an import from the browser: the new categories and suppliers once,
 * then the rows three at a time and their pictures four at a time, through
 * route handlers (Server Actions would go one by one). Every request is safe
 * to send twice: the same row gives the same product, the same picture is
 * skipped. So a stopped, failed or expired run is simply run again.
 */
import type { RowData } from "../product-csv";
import type { Kind, Picture } from "./import-plan";

/** `isNew`: the preview found no product for this row. */
export type Job = { line: number; row: RowData; pictures: Picture[]; isNew?: boolean };

export type PicState = "waiting" | "sending" | "added" | "skipped" | "failed";

export type RowRun = {
  state: "waiting" | "saving" | "saved" | "failed";
  error?: string;
  id?: string;
  created?: boolean;
  translated?: boolean;
  /** An updated product whose French changed: its old Arabic was removed and waits for a translation. */
  arabicToRedo?: boolean;
  /** Pictures the product already had, per kind: the new ones go after them. */
  base?: Record<Kind, number>;
  /** One per picture of the job, in the same order. */
  pics: PicState[];
  picErrors: (string | null)[];
};

export type Outcome = "done" | "stopped" | "expired" | "error";

export type Counts = {
  rows: number; saved: number; failed: number; created: number; updated: number;
  pictures: number; added: number; skipped: number; picFailed: number;
};

export type Snapshot = { rows: Map<number, RowRun>; counts: Counts; stopping: boolean; error: string | null };

type Answer = { ok: true; [k: string]: unknown } | { ok: false; error: string };

/** 401 from a route: the admin session ended. Nothing more can be sent until the admin signs in again. */
export class SessionExpired extends Error {}

export type Deps = {
  fetch: typeof fetch;
  shrink: (file: File, maxH: number) => Promise<File>;
  /** Called after every change; the page redraws at its own pace. */
  onChange: () => void;
  wait?: (ms: number) => Promise<void>;
};

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const jsonPost = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });

/**
 * One request, tried again twice (after a short wait) when the network or
 * the server fails. The answer is the route's JSON, or an error to show.
 */
export async function send(deps: Pick<Deps, "fetch" | "wait">, url: string, init: RequestInit): Promise<Answer> {
  const wait = deps.wait ?? pause;
  for (let attempt = 0; ; attempt++) {
    let res: Response | null = null;
    try {
      res = await deps.fetch(url, init);
    } catch {
      res = null;
    }
    if ((!res || res.status >= 500) && attempt < 2) {
      await wait(700 * (attempt + 1));
      continue;
    }
    if (!res) return { ok: false, error: "Pas de réponse du serveur : vérifiez la connexion." };
    if (res.status === 401) throw new SessionExpired();
    const body: unknown = await res.json().catch(() => null);
    if (body && typeof body === "object" && "ok" in body) {
      const b = body as Answer;
      return b.ok ? b : { ok: false, error: b.error || `Erreur ${res.status}.` };
    }
    return { ok: false, error: res.status === 413 ? "Fichier trop lourd pour l'envoi." : `Erreur du serveur (${res.status}).` };
  }
}

/** At most `size` tasks at once; the others wait their turn, first come first served. */
export function limiter(size: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async function <T>(task: () => Promise<T>): Promise<T> {
    // A finished task hands its place to the next one directly, so nobody overtakes the queue.
    if (active >= size) await new Promise<void>((r) => queue.push(r));
    else active++;
    try {
      return await task();
    } finally {
      const next = queue.shift();
      if (next) next();
      else active--;
    }
  };
}

export const ROWS_AT_ONCE = 3;
export const PICTURES_AT_ONCE = 4;

/**
 * One import, kept between runs: "Reprendre" calls run() again, which sends
 * what failed or was not sent yet, and nothing that already went through.
 */
export class ImportRun {
  private rows = new Map<number, RowRun>();
  private prepared = false;
  private stopping = false;
  private expired = false;
  private error: string | null = null;

  constructor(
    private jobs: Job[],
    private opts: { activateNew: boolean; translate: boolean },
    private prepare: { categories: { name: string; nameAr?: string }[]; suppliers: string[] },
    private deps: Deps,
  ) {
    for (const j of jobs) this.rows.set(j.line, { state: "waiting", pics: j.pictures.map(() => "waiting"), picErrors: j.pictures.map(() => null) });
  }

  /** Lets the requests on their way finish, and sends no more. */
  stop() {
    this.stopping = true;
    this.deps.onChange();
  }

  snapshot(): Snapshot {
    return { rows: new Map(this.rows), counts: this.counts(), stopping: this.stopping, error: this.error };
  }

  counts(): Counts {
    const c: Counts = { rows: this.jobs.length, saved: 0, failed: 0, created: 0, updated: 0, pictures: 0, added: 0, skipped: 0, picFailed: 0 };
    for (const j of this.jobs) {
      const r = this.rows.get(j.line)!;
      if (r.state === "saved") {
        c.saved++;
        if (r.created) c.created++;
        else c.updated++;
      }
      if (r.state === "failed") {
        c.failed++;
        continue;
      }
      // The pictures of a row that failed will not be sent: they are not counted.
      c.pictures += r.pics.length;
      for (const p of r.pics) {
        if (p === "added") c.added++;
        else if (p === "skipped") c.skipped++;
        else if (p === "failed") c.picFailed++;
      }
    }
    return c;
  }

  async run(): Promise<Outcome> {
    this.stopping = false;
    this.expired = false;
    this.error = null;
    // What failed last time is tried again.
    for (const [line, r] of this.rows) {
      if (r.state === "failed") this.set(line, { state: "waiting", error: undefined });
      if (r.pics.includes("failed")) this.set(line, { pics: r.pics.map((p) => (p === "failed" ? "waiting" : p)), picErrors: r.picErrors.map((e, i) => (r.pics[i] === "failed" ? null : e)) });
    }

    try {
      if (!this.prepared && (this.prepare.categories.length || this.prepare.suppliers.length)) {
        const r = await send(this.deps, "/admin/produits/import/prepare", jsonPost(this.prepare));
        if (!r.ok) {
          this.error = `Catégories et fournisseurs non créés : ${r.error}`;
          this.deps.onChange();
          return "error";
        }
      }
      this.prepared = true;
    } catch (e) {
      if (!(e instanceof SessionExpired)) throw e;
      this.expired = true;
      this.deps.onChange();
      return "expired";
    }

    const rowSlot = limiter(ROWS_AT_ONCE);
    const picSlot = limiter(PICTURES_AT_ONCE);
    const pictures: Promise<void>[] = [];
    const queuePictures = (job: Job) =>
      job.pictures.forEach((_, i) => {
        if (this.rows.get(job.line)!.pics[i] === "waiting") pictures.push(picSlot(() => this.picture(job, i)));
      });

    await Promise.all(
      this.jobs.map((job) => {
        if (this.rows.get(job.line)!.state === "saved") return queuePictures(job);
        return rowSlot(async () => {
          if (await this.saveRow(job)) queuePictures(job);
        });
      }),
    );
    // Every saved row has queued its pictures by now.
    await Promise.all(pictures);
    this.deps.onChange();
    return this.expired ? "expired" : this.stopping ? "stopped" : "done";
  }

  private set(line: number, patch: Partial<RowRun>) {
    this.rows.set(line, { ...this.rows.get(line)!, ...patch });
    this.deps.onChange();
  }

  private async saveRow(job: Job): Promise<boolean> {
    if (this.stopping || this.expired) return false;
    this.set(job.line, { state: "saving" });
    let tries = 0;
    const counted: Deps["fetch"] = (url, init) => (tries++, this.deps.fetch(url, init));
    try {
      const r = await send({ ...this.deps, fetch: counted }, "/admin/produits/import/rows", jsonPost({ row: job.row, ...this.opts }));
      if (!r.ok) {
        this.set(job.line, { state: "failed", error: r.error });
        return false;
      }
      const images = r.images as Record<Kind, number> | undefined;
      // A first try that was saved but whose answer was lost: the retry finds the product it made, and it is still a new one.
      const created = Boolean(r.created) || (tries > 1 && Boolean(job.isNew));
      this.set(job.line, { state: "saved", id: String(r.id), created, translated: Boolean(r.translated), arabicToRedo: Boolean(r.arabicToRedo), base: { GALLERY: images?.GALLERY ?? 0, DETAIL: images?.DETAIL ?? 0 } });
      return true;
    } catch (e) {
      if (!(e instanceof SessionExpired)) throw e;
      this.expired = true;
      this.set(job.line, { state: "waiting" });
      return false;
    }
  }

  private setPic(line: number, i: number, state: PicState, error: string | null = null) {
    const r = this.rows.get(line)!;
    this.set(line, { pics: r.pics.map((p, n) => (n === i ? state : p)), picErrors: r.picErrors.map((e, n) => (n === i ? error : e)) });
  }

  private async picture(job: Job, i: number): Promise<void> {
    if (this.stopping || this.expired) return;
    const p = job.pictures[i];
    const row = this.rows.get(job.line)!;
    this.setPic(job.line, i, "sending");
    // The place after the pictures the product had, in the order of the cell: the same on every run.
    const sort = (row.base?.[p.kind] ?? 0) + p.index;
    try {
      let init: RequestInit;
      if (p.url) init = jsonPost({ url: p.url, kind: p.kind, sort });
      else {
        const original = p.file!;
        const small = await this.deps.shrink(original, p.kind === "DETAIL" ? 16_000 : 3200).catch(() => original);
        const form = new FormData();
        form.append("file", small);
        form.append("kind", p.kind);
        form.append("sort", String(sort));
        // The original's name and size: the same file chosen again is recognised, however it was shrunk.
        form.append("source", `file:${original.name}:${original.size}`);
        init = { method: "POST", body: form, cache: "no-store" };
      }
      const r = await send(this.deps, `/admin/produits/${row.id}/images`, init);
      if (r.ok) this.setPic(job.line, i, r.skipped ? "skipped" : "added");
      else this.setPic(job.line, i, "failed", `${p.label} : ${r.error}`);
    } catch (e) {
      if (!(e instanceof SessionExpired)) throw e;
      this.expired = true;
      this.setPic(job.line, i, "waiting");
    }
  }
}
