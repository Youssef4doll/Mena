/**
 * Tunisian phone numbers: 8 digits after +216.
 * Mobile: 2x (Ooredoo), 4x, 5x (Orange), 9x (Tunisie Télécom).
 * Fixed: 3x, 7x.
 */
const VALID_FIRST = new Set(["2", "3", "4", "5", "7", "9"]);
const MOBILE_FIRST = new Set(["2", "4", "5", "9"]);

/** Arabic-keyboard digits (٢٢ or ۲۲) as the digits the rest of the shop reads. */
const westernDigits = (s: string) => s.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (c) => String(c.charCodeAt(0) & 0xf));

/** "+216 22 123 456", "0021622123456", "22.123.456", "٢٢١٢٣٤٥٦" → "22123456". Null when it is not a Tunisian number. */
export function normalizePhone(input: string): string | null {
  let d = westernDigits(input).replace(/[^\d+]/g, "");
  if (d.startsWith("+216")) d = d.slice(4);
  else if (d.startsWith("00216")) d = d.slice(5);
  else if (d.length === 11 && d.startsWith("216")) d = d.slice(3);
  d = d.replace(/\D/g, "");
  // A 0 typed out of habit before the eight digits.
  if (d.length === 9 && d.startsWith("0")) d = d.slice(1);
  if (d.length !== 8) return null;
  if (!VALID_FIRST.has(d[0])) return null;
  // 8 times the same digit is never a real line; it is how a fake order looks.
  if (/^(\d)\1{7}$/.test(d)) return null;
  return d;
}

export function isMobile(phone8: string): boolean {
  return MOBILE_FIRST.has(phone8[0]);
}

/** "22 123 456" */
export function formatPhone(phone8: string): string {
  return phone8.replace(/^(\d{2})(\d{3})(\d{3})$/, "$1 $2 $3");
}

/** "21622123456" — the form wa.me and SMS gateways want. */
export function intlPhone(phone8: string): string {
  return `216${phone8}`;
}
