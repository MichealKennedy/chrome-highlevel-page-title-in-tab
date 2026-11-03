import { cleanText, humanize } from './dom';
import { matchRoute, type RouteRule } from './routes';
import { renderTitle } from './title';
import type { Caches, FrameReport, Learned, PageSnapshot, Resolution, Settings } from './types';

export interface ResolveInput {
  doc: Document;
  page: PageSnapshot;
  frames: FrameReport[];
  /** HighLevel's own title (the last one it set, not ours). */
  nativeTitle: string | null;
  caches: Caches;
  settings: Settings;
}

/** Works out `{item} | {section} | {account}` for the current page. */
export function resolve(input: ResolveInput): Resolution {
  const { doc, page, frames, nativeTitle, caches, settings } = input;
  const { rule, match } = matchRoute(page);
  const learned: Learned[] = [];

  const item = rule.item?.({ doc, page, match, frames, nativeTitle, caches }) ?? null;
  if (item?.learned) learned.push(item.learned);

  const section = resolveSection(rule, page, Boolean(item?.parts.length));
  const account = resolveAccount(page, caches, settings, nativeTitle);

  if (page.locationId && page.accountName) {
    learned.push({ kind: 'account', key: page.locationId, name: page.accountName });
  }
  if (page.agencyName) {
    learned.push({ kind: 'agency', key: page.host, name: page.agencyName });
  }

  const parts = {
    item: item?.parts ?? [],
    section: section.value,
    account: account.value,
  };

  return {
    routeId: rule.id,
    parts,
    sources: { item: item?.source ?? null, section: section.source, account: account.source },
    accountKey: account.key,
    accountName: account.name,
    title: renderTitle(settings.template, parts),
    learned,
  };
}

interface Part {
  value: string | null;
  source: string | null;
}

/**
 * Item pages use the module (first breadcrumb after the group): "John Doe | Conversations".
 * List pages use the last breadcrumb: "Inbox | Acme Training".
 */
function resolveSection(rule: RouteRule, page: PageSnapshot, hasItem: boolean): Part {
  if (rule.section) return { value: rule.section, source: 'rule' };

  const crumbs = page.crumbs.filter((c) => !c.group);
  const module = crumbs[0];
  const leaf = crumbs.find((c) => c.current) ?? crumbs[crumbs.length - 1];
  if (hasItem && module) return { value: module.label, source: 'crumb:module' };
  if (leaf) return { value: leaf.label, source: 'crumb:last' };

  if (page.legacyNavLabel) return { value: page.legacyNavLabel, source: 'legacy-nav' };

  const segment = page.rest.split('/')[0];
  if (segment) return { value: humanize(segment), source: 'path' };
  return { value: null, source: null };
}

function resolveAccount(
  page: PageSnapshot,
  caches: Caches,
  settings: Settings,
  nativeTitle: string | null,
): Part & { key: string | null; name: string | null } {
  let key: string;
  let name: string | null;
  let source: string | null;

  if (page.locationId) {
    key = page.locationId;
    name = page.accountName ?? caches.accountNames[key] ?? null;
    source = page.accountName ? 'dom:workspace' : name ? 'cache' : null;
  } else {
    // Agency-level pages. HighLevel's own title on these is the agency name.
    key = `agency@${page.host}`;
    const cached = caches.agencyNames[page.host];
    const native = cleanText(nativeTitle) || null;
    name = page.agencyName ?? cached ?? native;
    source = page.agencyName ? 'dom:agency' : cached ? 'cache' : native ? 'native-title' : null;
  }

  const nickname = cleanText(settings.nicknames[key]?.nickname);
  if (nickname) return { key, name, value: nickname, source: 'nickname' };
  return { key, name, value: name, source };
}
