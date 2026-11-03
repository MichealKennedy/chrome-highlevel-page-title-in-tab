/** Collapses whitespace and trims. */
export function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

/** Text of an element (or value of an input), cleaned. `null` when missing or empty. */
export function textOf(el: Element | null | undefined): string | null {
  if (!el) return null;
  const raw =
    el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : el.textContent;
  return cleanText(raw) || null;
}

/**
 * Whether an element is rendered. Uses `checkVisibility()` where the browser supports it and
 * treats the element as visible otherwise (e.g. in tests, where there is no layout).
 */
export function isShown(el: Element): boolean {
  const check = (el as Element & { checkVisibility?: () => boolean }).checkVisibility;
  return typeof check === 'function' ? check.call(el) : true;
}

/** First selector in the list that yields text. Returns the text and the selector that matched. */
export function firstText(
  root: ParentNode,
  selectors: readonly string[],
  options: { shownOnly?: boolean } = {},
): { text: string; selector: string } | null {
  for (const selector of selectors) {
    for (const el of root.querySelectorAll(selector)) {
      if (options.shownOnly && !isShown(el)) continue;
      const text = textOf(el);
      if (text) return { text, selector };
    }
  }
  return null;
}

/** `media-storage` → `Media Storage`, `agency_dashboard` → `Agency Dashboard`. */
export function humanize(segment: string): string {
  return segment
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
