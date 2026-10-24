import { Fragment } from "react";

/**
 * Latin words and measures kept in their own direction inside Arabic text.
 * Without it the browser lays "450 °C" out right to left and shows
 * "C° 450", "110~240 V" as "V 240~110": a voltage or a temperature misread
 * by the customer. Each run (a brand, a model, a number with its unit) is
 * isolated left to right; the Arabic around it is untouched. Text without
 * Arabic letters is returned as it is.
 */
const RUN = /[A-Za-z0-9](?:[A-Za-z0-9 °~.,:/×%+\-'’&]*[A-Za-z0-9°%])?/g;

/** The runs of a text: Arabic parts as strings, Latin parts marked `ltr`. */
export function bidiRuns(text: string): { text: string; ltr: boolean }[] {
  if (!/[؀-ۿ]/.test(text)) return [{ text, ltr: false }];
  const out: { text: string; ltr: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(RUN)) {
    const at = m.index ?? 0;
    // A bare number among Arabic words reads the same either way: only runs with a letter or a symbol are isolated.
    if (/^\d+$/.test(m[0])) continue;
    if (at > last) out.push({ text: text.slice(last, at), ltr: false });
    out.push({ text: m[0], ltr: true });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), ltr: false });
  return out;
}

export function Bidi({ text }: { text: string }) {
  const runs = bidiRuns(text);
  if (runs.length === 1 && !runs[0]!.ltr) return text;
  return (
    <>
      {runs.map((r, i) =>
        r.ltr ? (
          <bdi key={i} dir="ltr">
            {r.text}
          </bdi>
        ) : (
          <Fragment key={i}>{r.text}</Fragment>
        ),
      )}
    </>
  );
}
