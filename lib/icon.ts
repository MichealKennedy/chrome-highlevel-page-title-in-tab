/**
 * Per-sub-account tab icons: a letter on a colour, so HighLevel tabs for different
 * sub-accounts can be told apart even when their titles are cut off.
 */

/** Colours picked automatically, chosen to be distinct and to work with a white letter. */
export const ICON_PALETTE = [
  '#0d9488', // teal
  '#ea580c', // orange
  '#7c3aed', // violet
  '#2563eb', // blue
  '#e11d48', // rose
  '#16a34a', // green
  '#0891b2', // cyan
  '#c026d3', // fuchsia
  '#4f46e5', // indigo
  '#475569', // slate
] as const;

export interface TabIconStyle {
  /** 1–2 characters. */
  letter: string;
  /** CSS hex colour, e.g. `#0d9488`. */
  color: string;
}

/** A user's changes for one sub-account. Missing fields use the automatic choice. */
export interface TabIconOverride {
  letter?: string;
  color?: string;
  /** Sub-account name when the change was made, for listing in the popup. */
  name?: string;
}

/** Stable colour for a sub-account, from its location ID. */
export function defaultIconColor(locationId: string): string {
  let hash = 0;
  for (const char of locationId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return ICON_PALETTE[hash % ICON_PALETTE.length]!;
}

/** First letter or digit of the name, upper-cased. `?` if there is none. */
export function defaultIconLetter(name: string | null | undefined): string {
  const match = (name ?? '').match(/[\p{L}\p{N}]/u);
  return match ? match[0].toLocaleUpperCase() : '?';
}

export function cleanIconLetter(value: string | null | undefined): string {
  return [...(value ?? '').trim()].slice(0, 2).join('').toLocaleUpperCase();
}

export function isHexColor(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}

/** The icon for a sub-account: the user's choices where set, automatic otherwise. */
export function resolveIconStyle(
  locationId: string,
  displayName: string | null,
  override: TabIconOverride | undefined,
): TabIconStyle {
  const letter = cleanIconLetter(override?.letter) || defaultIconLetter(displayName);
  const color = isHexColor(override?.color) ? override.color.toLowerCase() : defaultIconColor(locationId);
  return { letter, color };
}

/**
 * White letters, as in the palette, except on light backgrounds (yellows, pastels, white)
 * where white would wash out.
 */
export function letterColorFor(background: string): string {
  const hex = isHexColor(background) ? background : '#000000';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear(r!) + 0.7152 * linear(g!) + 0.0722 * linear(b!);
  return luminance > 0.45 ? '#111111' : '#ffffff';
}

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** SVG markup for the icon (32×32, rounded square). */
export function iconSvg(style: TabIconStyle): string {
  const raw = cleanIconLetter(style.letter) || '?';
  const letter = escapeXml(raw);
  const color = isHexColor(style.color) ? style.color : ICON_PALETTE[0];
  const fontSize = [...raw].length > 1 ? 15 : 21;
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
    `<rect width="32" height="32" rx="7" fill="${color}"/>` +
    `<text x="16" y="16" dy="0.35em" text-anchor="middle" font-family="Segoe UI,Arial,Helvetica,sans-serif" ` +
    `font-size="${fontSize}" font-weight="700" fill="${letterColorFor(color)}">${letter}</text></svg>`
  );
}

/** Data URL for use as a favicon or image source. */
export function iconDataUrl(style: TabIconStyle): string {
  return `data:image/svg+xml,${encodeURIComponent(iconSvg(style))}`;
}
