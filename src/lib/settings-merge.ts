/**
 * Saving the settings without losing anyone's change. The form sends what it
 * started from (`base`) and what it shows now (`next`); only the fields that
 * differ are written, onto what is stored now. A field changed meanwhile
 * elsewhere (another tab, another device) and changed here too is a
 * conflict, said by name, instead of being silently overwritten; a field
 * changed elsewhere and not here is kept.
 *
 * Fields are compared two levels deep ("tracking.metaPixelId"); deeper
 * values (the banners, the delivery zones) are compared whole.
 */
type Obj = Record<string, unknown>;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const isObj = (v: unknown): v is Obj => v != null && typeof v === "object" && !Array.isArray(v);

export type Change = { path: string; value: unknown };

/** The fields `next` changed from `base`, as "section.field" paths. */
export function changedFields(base: Obj, next: Obj): Change[] {
  const out: Change[] = [];
  for (const section of new Set([...Object.keys(base), ...Object.keys(next)])) {
    const b = base[section];
    const n = next[section];
    if (isObj(b) && isObj(n)) {
      for (const f of new Set([...Object.keys(b), ...Object.keys(n)])) if (!same(b[f], n[f])) out.push({ path: `${section}.${f}`, value: n[f] });
    } else if (!same(b, n)) out.push({ path: section, value: n });
  }
  return out;
}

const read = (o: Obj, path: string) => path.split(".").reduce<unknown>((v, k) => (isObj(v) ? v[k] : undefined), o);

/**
 * The changes written onto what is stored now. `conflicts`: fields this form
 * changed that someone else changed too since the form was opened (to a
 * different value).
 */
export function applyChanges<T extends Obj>(current: T, base: Obj, changes: Change[]): { merged: T; conflicts: string[] } {
  const merged = structuredClone(current) as Obj;
  const conflicts: string[] = [];
  for (const c of changes) {
    const now = read(current, c.path);
    if (!same(now, read(base, c.path)) && !same(now, c.value)) {
      conflicts.push(c.path);
      continue;
    }
    const [section, field] = c.path.split(".");
    if (field === undefined) merged[section] = c.value;
    else merged[section] = { ...(isObj(merged[section]) ? (merged[section] as Obj) : {}), [field]: c.value };
  }
  return { merged: merged as T, conflicts };
}
