/**
 * What the editor keeps between two products. Opening another product
 * mounts a new editor, so the message meant for it ("Copie créée…", "…
 * enregistré") waits here, with the form typed during the first save of a
 * new product; and the links that leave the editor read here whether the
 * form holds changes not saved yet.
 */

type Msg = { ok: boolean; text: string };

let carried: { to: string; msg: Msg; draft?: unknown } | null = null;

/** A message for the editor of product `to`, shown when it opens; `draft`: the form to open instead of the saved rows. */
export function carryMessage(to: string, msg: Msg, draft?: unknown) {
  carried = { to, msg, draft };
}

/** The message carried to this product, if any. */
export function carriedMessage(id: string | null): Msg | null {
  return carried && carried.to === id ? carried.msg : null;
}

/** The form carried to this product, if any (the editor knows its shape). */
export function carriedDraft(id: string | null): unknown {
  return carried && carried.to === id ? carried.draft : undefined;
}

/** Called once the editor has shown it: a later visit starts without it. */
export function dropCarried() {
  carried = null;
}

/**
 * A form changed while its save was on its way keeps its key, so it is not
 * drawn again from the saved rows (which would drop what was typed). The
 * hold ends after a later save with nothing typed, once its rows arrive.
 */
export type Held = { key: string; release?: string } | null;

/** The key the form is drawn with: the held one while it holds, otherwise the product's version. */
export function formKey(held: Held, version: string): string {
  return held && (held.release === undefined || held.release === version) ? held.key : version;
}

/** The hold after a save that began at version `at`; `typed`: the form changed meanwhile. */
export function afterSave(held: Held, typed: boolean, at: string): Held {
  const on = held != null && (held.release === undefined || held.release === at);
  if (typed) return { key: on ? held.key : at };
  return on ? { key: held.key, release: at } : null;
}

let unsaved = false;

export function setUnsaved(v: boolean) {
  unsaved = v;
}

/** True when leaving loses nothing, or the admin agrees to lose the changes. */
export function mayLeave(): boolean {
  return !unsaved || window.confirm("Modifications non enregistrées. Quitter sans enregistrer ?");
}
