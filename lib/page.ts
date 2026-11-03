import { cleanText, textOf } from './dom';
import type { Crumb, PageSnapshot } from './types';

/**
 * Elements that only HighLevel pages have. The new "switchyard" UI marks its top bar and
 * sidebar with data attributes; the older agency UI has the location switcher.
 */
export const HIGHLEVEL_MARKERS = [
  '[data-switchyard-topbar]',
  '[data-switchyard-breadcrumbs]',
  '[data-switchyard-workspace-identity]',
  '#location-switcher-sidbar-v2',
].join(', ');

export function looksLikeHighLevel(doc: Document): boolean {
  return doc.querySelector(HIGHLEVEL_MARKERS) !== null;
}

const LOCATION_PATH = /^\/(?:v2\/)?location\/([^/?#]+)\/?(.*)$/;

export function readPage(doc: Document, url: URL): PageSnapshot {
  const match = LOCATION_PATH.exec(url.pathname);
  const locationId = match?.[1] ?? null;
  const rest = match ? (match[2] ?? '') : url.pathname.replace(/^\/+/, '');

  const ui = doc.querySelector('[data-switchyard-topbar], [data-switchyard-breadcrumbs]')
    ? 'switchyard'
    : doc.querySelector('#location-switcher-sidbar-v2')
      ? 'legacy'
      : 'unknown';

  return {
    ui,
    host: url.host,
    path: url.pathname,
    rest: rest.replace(/\/+$/, ''),
    locationId,
    accountName: readAccountName(doc, locationId),
    agencyName: readAgencyName(doc),
    crumbs: readCrumbs(doc),
    legacyNavLabel: textOf(
      doc.querySelector(
        'a[id^="sb_"].active, a[id^="sb_"].router-link-exact-active, a[id^="sb_"].router-link-active',
      ),
    ),
  };
}

function readCrumbs(doc: Document): Crumb[] {
  const nodes = doc.querySelectorAll('[data-switchyard-breadcrumbs] [data-switchyard-breadcrumb]');
  const crumbs: Crumb[] = [];
  for (const node of nodes) {
    const key = node.getAttribute('data-switchyard-breadcrumb') ?? '';
    if (!key || key === 'home') continue;
    const label = textOf(node.querySelector('.switchyard-breadcrumb-label-text') ?? node);
    if (!label) continue;
    crumbs.push({
      key,
      label,
      current: node.classList.contains('is-current') || node.getAttribute('aria-current') === 'page',
      group: key.startsWith('group:'),
    });
  }
  return crumbs;
}

function readAccountName(doc: Document, locationId: string | null): string | null {
  const identity = doc.querySelector('[data-switchyard-workspace-identity]');
  const fromIdentity =
    cleanText(identity?.getAttribute('aria-label')) ||
    textOf(identity?.querySelector('.switchyard-workspace-label'));
  if (fromIdentity) return fromIdentity;

  if (locationId && /^[\w-]+$/.test(locationId)) {
    // The account switcher lists each sub-account with its location ID in the element ID.
    const option = doc.querySelector(`[id^="switchyard-account-option-all-${locationId}"]`);
    const fromOption = cleanText(option?.getAttribute('aria-label'));
    if (fromOption) return fromOption;
  }
  return null;
}

function readAgencyName(doc: Document): string | null {
  const label = doc.querySelector('[aria-label^="Agency account:"]')?.getAttribute('aria-label');
  return cleanText(label?.replace(/^Agency account:\s*/, '')) || null;
}
