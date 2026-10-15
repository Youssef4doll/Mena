/**
 * The shop's search, done in the server's memory: the catalogue of a small
 * shop fits in it many times over, and this way French, Tunisian Arabic and
 * the Latin spellings people type on their phones ("lamba") are all treated
 * the same, with no database extension.
 *
 * - Everything is compared in a plain form: lower case, no accents, Arabic
 *   letters unified (أ إ آ → ا, ة → ه, ى → ي, no tashkeel), Arabic digits as 0-9.
 * - A word matches exactly, as the start of a longer word (the customer is
 *   still typing), inside a word, or with a typing mistake: one wrong, missing,
 *   extra or swapped letter in a word of 4 or 5 letters, two from 6 letters.
 * - Pure functions: the same code runs in the tests.
 */

/** The plain form of a text, the one the search compares. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    // Latin accents and Arabic short vowels are combining marks.
    .replace(/[̀-ًͯ-ٰٟۖ-ۭ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ـ/g, "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Words of two letters or more; an Arabic word with "ال" also counts without it. */
export function tokenize(s: string): string[] {
  const out: string[] = [];
  for (const w of normalize(s).split(" ")) {
    if (w.length < 2 && !/\d/.test(w)) continue;
    out.push(w);
    if (w.startsWith("ال") && w.length > 4) out.push(w.slice(2));
  }
  return out;
}

/** Edits between two words (a swap of two neighbours counts as one), stopping early past `max`. */
export function distance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = new Array(b.length + 1).fill(0);
  let prev: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      rowMin = Math.min(rowMin, v);
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev2[j] = prev[j];
    prev = cur;
  }
  return prev[b.length];
}

/** Typing mistakes forgiven for a word of this length. */
const allowed = (n: number) => (n <= 3 ? 0 : n <= 5 ? 1 : 2);

export type Match = { score: number; word: string; exact: boolean };

/**
 * How well one typed word matches one word of the catalogue (0 = not at all).
 * `last`: the word being typed, which may be the start of a longer one.
 */
export function matchWord(typed: string, word: string, last: boolean): number {
  if (typed === word) return 1;
  if (typed.length >= 2 && word.startsWith(typed)) return last ? 0.92 : 0.75;
  if (typed.length >= 3 && word.includes(typed)) return 0.6;
  // Short typed words must be right ("sac" is not "bac"); otherwise the shorter of the two
  // decides how many mistakes are forgiven: "makina" is not "main", "kess" is "kes".
  const max = typed.length <= 3 ? 0 : allowed(Math.max(4, Math.min(typed.length, word.length)));
  if (max === 0) return 0;
  const d = distance(typed, word, max);
  if (d <= max) return 0.8 - 0.15 * d;
  // Still typing, with a mistake: "difus" against the start of "diffuseur" (a letter more or less included).
  // Only from five letters: shorter starts with a mistake match half the catalogue.
  if (last && typed.length >= 5 && word.length > typed.length) {
    let dp = max + 1;
    for (let n = typed.length - 1; n <= typed.length + 1; n++) if (n >= 2 && n <= word.length) dp = Math.min(dp, distance(typed, word.slice(0, n), max));
    if (dp <= max) return 0.7 - 0.15 * dp;
  }
  return 0;
}

export type Field = { tokens: string[]; weight: number };
export type Doc = { id: string; fields: Field[] };

/** "noire" and "noir", "verres" and "verre": the same word for a "did you mean". */
const stem = (w: string) => w.replace(/(es|e|s|x)$/, "");

/** The best match of one typed word in a document: its score (field weight included) and the word it found. */
function bestIn(typed: string, doc: Doc, last: boolean): Match {
  let best: Match = { score: 0, word: "", exact: false };
  for (const f of doc.fields) {
    for (const w of f.tokens) {
      const m = matchWord(typed, w, last) * f.weight;
      if (m > best.score) best = { score: m, word: w, exact: typed === w || w.startsWith(typed) || stem(typed) === stem(w) };
    }
  }
  return best;
}

export type Ranked = { id: string; score: number; corrected: Map<string, string> };

/**
 * The documents that match a query, best first. Every typed word must be
 * found (a query of three words or more may miss one, at a cost), so "lampe
 * noire" does not bring every black product.
 */
export function rank(query: string, docs: Doc[], opts: { prefix?: boolean; limit?: number } = {}): Ranked[] {
  const words = tokenize(query).filter((w, i, a) => a.indexOf(w) === i);
  if (words.length === 0) return [];
  const out: Ranked[] = [];
  for (const doc of docs) {
    let total = 0;
    let missed = 0;
    const corrected = new Map<string, string>();
    for (const [i, w] of words.entries()) {
      const m = bestIn(w, doc, Boolean(opts.prefix) && i === words.length - 1);
      if (m.score === 0) missed++;
      else {
        total += m.score;
        if (!m.exact) corrected.set(w, m.word);
      }
    }
    if (missed > (words.length >= 3 ? 1 : 0)) continue;
    out.push({ id: doc.id, score: total / words.length - missed * 0.3, corrected });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, opts.limit ?? 60);
}

/**
 * Google's completions: phrases from the catalogue (product names, categories,
 * keywords) that start with what is typed, or match it, the typed part first.
 */
export function complete(query: string, phrases: string[], limit = 4): string[] {
  const q = normalize(query);
  const words = tokenize(query);
  if (q.length < 2 || words.length === 0) return [];
  const scored: { p: string; s: number }[] = [];
  const seen = new Set<string>();
  for (const p of phrases) {
    const n = normalize(p);
    if (!n || seen.has(n) || n === q) continue;
    seen.add(n);
    let s = 0;
    if (n.startsWith(q)) s = 2 + 1 / n.length;
    else {
      const doc: Doc = { id: p, fields: [{ tokens: tokenize(p), weight: 1 }] };
      const r = rank(query, [doc], { prefix: true })[0];
      if (r) s = r.score;
    }
    if (s >= 0.5) scored.push({ p, s });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.p);
}
