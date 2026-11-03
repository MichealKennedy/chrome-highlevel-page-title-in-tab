import { firstText, textOf } from './dom';
import type { Caches, FrameKind, FrameReport, Learned, PageSnapshot } from './types';

/**
 * Page rules. Each rule matches the path after `/v2/location/<id>/` and knows where that page
 * shows the name of the open item. When HighLevel changes its UI, this is the file to update:
 * the popup's debug panel shows which rule matched and where each part came from.
 *
 * Sections come from HighLevel's breadcrumb unless a rule sets `section` (pages without a
 * breadcrumb, or where the breadcrumb label isn't what we want, like Smart Lists).
 */

export interface RouteContext {
  doc: Document;
  page: PageSnapshot;
  /** Result of the rule's pattern against `page.rest`; `[1]` is usually the item's ID. */
  match: RegExpExecArray;
  frames: FrameReport[];
  nativeTitle: string | null;
  caches: Caches;
}

export interface ItemResult {
  /** Most specific first, e.g. `['Step 2', 'My Funnel']`. */
  parts: string[];
  source: string;
  learned?: Learned;
}

export interface RouteRule {
  id: string;
  pattern: RegExp;
  /** Fixed section label. Otherwise the breadcrumb decides. */
  section?: string;
  item?: (ctx: RouteContext) => ItemResult | null;
}

const ID = '([^/?#]+)';

export const ROUTES: readonly RouteRule[] = [
  {
    id: 'smart-list',
    pattern: new RegExp(`^contacts/smart_list/${ID}`),
    section: 'Smart Lists',
    item: smartListName,
  },
  {
    id: 'contact',
    pattern: new RegExp(`^contacts/detail/${ID}`),
    item: fromDom(['#record-details-lhs p.hr-text-semibold > span', '[data-testid="CENTRALPANEL_NAME"]']),
  },
  {
    id: 'conversation',
    pattern: new RegExp(`^conversations/conversations/${ID}`),
    item: fromDom(['[data-testid="CENTRALPANEL_NAME"]']),
  },
  {
    // Clicking a card opens an edit modal (URL becomes opportunities/<id>); clicking the
    // contact's name opens a contact drawer instead (URL unchanged).
    id: 'opportunities',
    pattern: /^opportunities(?:\/|$)/,
    item: (ctx) =>
      fromDom(['.crm-opportunities-modal input[placeholder="Enter opportunity name"]'])(ctx) ??
      opportunityModalHeading(ctx) ??
      fromDom(['.drawer-panel .drawer-contact-name'], { shownOnly: true })(ctx),
  },
  {
    id: 'form-builder',
    pattern: new RegExp(`^form-builder-v2/${ID}`),
    section: 'Forms',
    item: fromFrame('form-builder', { idInFrameUrl: true }),
  },
  {
    id: 'survey-builder',
    pattern: new RegExp(`^survey-builder-v2/${ID}`),
    section: 'Surveys',
    item: fromFrame('form-builder', { idInFrameUrl: true }),
  },
  {
    id: 'quiz-builder',
    pattern: new RegExp(`^quiz-builder-v2/${ID}`),
    section: 'Quizzes',
    item: fromFrame('form-builder', { idInFrameUrl: true }),
  },
  {
    id: 'workflow',
    pattern: new RegExp(`^automation/workflow/${ID}`),
    item: (ctx) => fromFrame('workflow')(ctx) ?? workflowFromNativeTitle(ctx),
  },
  {
    id: 'funnel',
    pattern: new RegExp(`^funnels-websites/funnels/${ID}`),
    item: funnelName,
  },
  {
    id: 'website',
    pattern: new RegExp(`^funnels-websites/websites/${ID}`),
    item: funnelName,
  },
  {
    id: 'email',
    pattern: /^marketing\/emails(?:\/|$)/,
    item: fromDom([
      '#emailBuilderMfa .email-builder-header [contenteditable]',
      '.email-builder-header [contenteditable]',
      '.email-builder-header .truncate',
    ]),
  },
  {
    // The calendar editor opens inside the calendar app's frame; the URL doesn't change.
    id: 'calendars',
    pattern: /^(?:settings\/calendars|calendars)(?:\/|$)/,
    item: fromFrame('calendar'),
  },
];

export const FALLBACK_ROUTE: RouteRule = { id: 'default', pattern: /.*/ };
export const AGENCY_ROUTE: RouteRule = { id: 'agency', pattern: /.*/ };

export function matchRoute(page: PageSnapshot): { rule: RouteRule; match: RegExpExecArray } {
  if (!page.locationId) {
    return { rule: AGENCY_ROUTE, match: AGENCY_ROUTE.pattern.exec(page.rest)! };
  }
  for (const rule of ROUTES) {
    const match = rule.pattern.exec(page.rest);
    if (match) return { rule, match };
  }
  return { rule: FALLBACK_ROUTE, match: FALLBACK_ROUTE.pattern.exec(page.rest)! };
}

function fromDom(selectors: readonly string[], options: { shownOnly?: boolean } = {}) {
  return (ctx: RouteContext): ItemResult | null => {
    const found = firstText(ctx.doc, selectors, options);
    return found ? { parts: [found.text], source: `dom:${found.selector}` } : null;
  };
}

/**
 * Names reported by the content script inside an embedded app frame.
 *
 * - Frames whose URL names a different sub-account (`/location/<id>`) never count.
 * - With `idInFrameUrl`, only frames whose URL contains the item ID from the page URL count, so
 *   a previous form's frame can't leak its name into the next form's title.
 */
function fromFrame(kind: FrameKind, options: { idInFrameUrl?: boolean } = {}) {
  return (ctx: RouteContext): ItemResult | null => {
    const id = ctx.match[1];
    const locationId = ctx.page.locationId;
    const report = ctx.frames
      .filter((f) => f.kind === kind && f.name)
      .filter((f) => {
        const frameLocation = FRAME_LOCATION.exec(f.frameUrl)?.[1];
        return !frameLocation || !locationId || frameLocation === locationId;
      })
      .filter((f) => !options.idInFrameUrl || !id || f.frameUrl.includes(id))
      .sort((a, b) => b.at - a.at)[0];
    return report?.name ? { parts: [report.name], source: `frame:${kind}` } : null;
  };
}

const FRAME_LOCATION = /\/location\/([^/?#]+)/;

/** The workflow app sets the page title to the workflow's name. Used if its frame is silent. */
function workflowFromNativeTitle(ctx: RouteContext): ItemResult | null {
  const title = ctx.nativeTitle?.trim();
  if (!title) return null;
  const agency = ctx.page.agencyName ?? ctx.caches.agencyNames[ctx.page.host];
  if (title === agency || /^workflows?( list)?$/i.test(title)) return null;
  return { parts: [title], source: 'native-title' };
}

/** The opportunity modal's heading reads `Edit "Name"`. */
function opportunityModalHeading(ctx: RouteContext): ItemResult | null {
  const heading = textOf(ctx.doc.querySelector('.crm-opportunities-modal .ui-modal-heading .title'));
  const name = heading?.match(/["“](.+)["”]\s*$/)?.[1]?.trim();
  return name ? { parts: [name], source: 'dom:.crm-opportunities-modal .title' } : null;
}

function smartListName(ctx: RouteContext): ItemResult | null {
  const listId = ctx.match[1] ?? '';
  const key = `${ctx.page.locationId}/${listId}`;
  const bar = ctx.doc.querySelector('#smart-list-views-bar');
  const tab =
    bar?.querySelector('[role="tab"][aria-selected="true"]') ??
    bar?.querySelector('.hl-tabs__tab--active');
  const name = textOf(tab?.querySelector('.hl-tabs__label') ?? tab);
  if (name) {
    return {
      parts: [name],
      source: 'dom:smart-list-tab',
      learned: { kind: 'smartList', key, name },
    };
  }
  // In narrow windows the open list can be tucked into the "N More" menu.
  const cached = ctx.caches.smartListNames[key];
  if (cached) return { parts: [cached], source: 'cache:smart-list' };
  return null;
}

function funnelName(ctx: RouteContext): ItemResult | null {
  const funnel = textOf(ctx.doc.querySelector('#funnel-name'));
  const step = textOf(ctx.doc.querySelector('#funnel-step-details span.truncate'));
  const parts = [step, funnel].filter((p): p is string => Boolean(p));
  if (!parts.length) return null;
  return {
    parts,
    source: step ? 'dom:#funnel-step-details + #funnel-name' : 'dom:#funnel-name',
  };
}
