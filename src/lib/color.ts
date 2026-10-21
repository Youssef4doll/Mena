/** "#1F2937", "1f2937" or "#fff" → "#1f2937"; null when it is not a colour code. */
export function readHex(s: string): string | null {
  const m = s.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return `#${h.toLowerCase()}`;
}

/** A colour so light that its dot needs a darker ring to be seen on white (white, cream, pale yellow). */
export function isPale(hex: string): boolean {
  const h = readHex(hex);
  if (!h) return false;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  // Relative luminance (WCAG).
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) > 0.8;
}
