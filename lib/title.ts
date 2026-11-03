import { cleanText } from './dom';
import type { TitleParts } from './types';

export const DEFAULT_TEMPLATE = '{item} | {section} | {account}';

export const TOKENS = ['item', 'section', 'account'] as const;
type Token = (typeof TOKENS)[number];

const TOKEN_PATTERN = /\{(item|section|account)\}/g;

export function hasTokens(template: string): boolean {
  return new RegExp(TOKEN_PATTERN.source).test(template);
}

/**
 * Fills a template like `{item} | {section} | {account}`.
 *
 * Empty parts are dropped together with the separator in front of them, so a list page
 * renders as `Contacts | Acme Training`. An item with several parts (a funnel step inside a funnel)
 * is joined with the template's own separator: `Step 2 | Webinar Funnel | Funnels | Acme Training`.
 *
 * Returns `null` when every part is empty, meaning "leave the title alone".
 */
export function renderTitle(template: string, parts: TitleParts): string | null {
  const source = hasTokens(template) ? template : DEFAULT_TEMPLATE;

  const tokens: { token: Token; start: number; end: number }[] = [];
  for (const match of source.matchAll(TOKEN_PATTERN)) {
    tokens.push({
      token: match[1] as Token,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  if (!first || !last) return null;

  // Literal text between consecutive tokens; separators[i] sits in front of tokens[i + 1].
  const separators = tokens.slice(1).map((t, i) => source.slice(tokens[i]!.end, t.start));
  const itemSeparator = separators.find((s) => s.length > 0) ?? ' | ';

  const values = tokens.map(({ token }) => valueOf(token, parts, itemSeparator));

  let body = '';
  values.forEach((value, i) => {
    if (!value) return;
    body += body ? (separators[i - 1] ?? itemSeparator) + value : value;
  });
  if (!body) return null;

  return cleanText(source.slice(0, first.start) + body + source.slice(last.end)) || null;
}

function valueOf(token: Token, parts: TitleParts, itemSeparator: string): string {
  switch (token) {
    case 'item':
      return parts.item.map(cleanText).filter(Boolean).join(itemSeparator);
    case 'section':
      return cleanText(parts.section);
    case 'account':
      return cleanText(parts.account);
  }
}
