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
  /**
   * For the breakage warning: describes what's missing when the page doesn't look as this rule
   * expects (for example, an item page with no item name). `null` means the page looks fine.
   */
  check?: (ctx: RouteContext, item: ItemResult | null) => string | null;
}

const ID = '([^/?#]+)';
/** HighLevel record IDs that are 24-character hex strings. */
const HEX_ID = '([0-9a-f]{24})';

/** The page should always show an item; complain if it doesn't. */
function expectItem(what: string) {
  return (_ctx: RouteContext, item: ItemResult | null) => (item ? null : `Couldn't find the ${what}.`);
}

export const ROUTES: readonly RouteRule[] = [
  {
    id: 'smart-list',
    pattern: new RegExp(`^contacts/smart_list/${ID}`),
    section: 'Smart Lists',
    item: smartListName,
    // The open list can legitimately be hidden in the "N More" menu, so only the tab bar
    // itself going missing counts as a problem.
    check: (ctx) =>
      ctx.doc.querySelector('#smart-list-views-bar') ? null : "Couldn't find the smart list tabs.",
  },
  {
    id: 'contact',
    pattern: new RegExp(`^contacts/detail/${ID}`),
    item: fromDom(['#record-details-lhs p.hr-text-semibold > span', '[data-testid="CENTRALPANEL_NAME"]']),
    check: expectItem('contact name'),
  },
  {
    id: 'conversation',
    pattern: new RegExp(`^conversations/conversations/${ID}`),
    item: fromDom(['[data-testid="CENTRALPANEL_NAME"]']),
    check: expectItem('contact name'),
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
    check: expectItem('form name'),
  },
  {
    id: 'survey-builder',
    pattern: new RegExp(`^survey-builder-v2/${ID}`),
    section: 'Surveys',
    item: fromFrame('form-builder', { idInFrameUrl: true }),
    check: expectItem('survey name'),
  },
  {
    id: 'quiz-builder',
    pattern: new RegExp(`^quiz-builder-v2/${ID}`),
    section: 'Quizzes',
    item: fromFrame('form-builder', { idInFrameUrl: true }),
    check: expectItem('quiz name'),
  },
  {
    id: 'workflow',
    pattern: new RegExp(`^automation/workflow/${ID}`),
    item: (ctx) => fromFrame('workflow')(ctx) ?? workflowFromNativeTitle(ctx),
    check: expectItem('workflow name'),
  },
  {
    id: 'funnel',
    pattern: new RegExp(`^funnels-websites/funnels/${ID}`),
    item: funnelName,
    check: expectItem('funnel name'),
  },
  {
    id: 'website',
    pattern: new RegExp(`^funnels-websites/websites/${ID}`),
    item: funnelName,
    check: expectItem('website name'),
  },
  {
    id: 'email',
    pattern: /^marketing\/emails(?:\/|$)/,
    item: fromDom([
      '#emailBuilderMfa .email-builder-header [contenteditable]',
      '.email-builder-header [contenteditable]',
      '.email-builder-header .truncate',
    ]),
    // Only the builder (a template or campaign being edited) has a name to show.
    check: (ctx, item) =>
      !item && /^marketing\/emails\/(?:templates|campaigns)\/[^/]+/.test(ctx.page.rest)
        ? "Couldn't find the email name."
        : null,
  },
  {
    // The calendar editor opens inside the calendar app's frame; the URL doesn't change.
    id: 'calendars',
    pattern: /^(?:settings\/calendars|calendars)(?:\/|$)/,
    item: fromFrame('calendar'),
  },
  {
    id: 'custom-report',
    pattern: new RegExp(`^reporting/reports/[^/]+/${ID}`),
    item: fromDom(['#report_builder-text-report_title']),
    check: expectItem('report name'),
  },
  {
    id: 'course',
    pattern: /^memberships\/courses\/course-creator-studio(?:\/|$)/,
    item: fromDom(['.course-title-bar .hr-text-2xl', '.course-title-bar p']),
    check: expectItem('course name'),
  },
  {
    id: 'invoice',
    pattern: new RegExp(`^payments/invoices/${HEX_ID}(?:/|$)`),
    item: invoiceName,
    check: expectItem('invoice name'),
  },
  {
    id: 'document',
    pattern: new RegExp(`^payments/proposals-estimates/edit/${ID}`),
    item: fromFrame('document', { idInFrameUrl: true }),
    check: expectItem('document name'),
  },
  {
    id: 'payment-link',
    pattern: new RegExp(`^payments/v2/paymentlinks/edit/${ID}`),
    item: fromDom(['input[placeholder="Enter Link Name"]']),
    check: expectItem('payment link name'),
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

/** Invoice number and name, e.g. `INV-000042 Consultation Fee`. */
function invoiceName(ctx: RouteContext): ItemResult | null {
  const value = (selector: string) => textOf(ctx.doc.querySelector(selector));
  const prefix = value('#invoice-prefix-input input') ?? '';
  const number = value('#invoice-number-input input');
  const name = value('#invoice-name input');
  const text = [number ? `${prefix}${number}` : null, name].filter(Boolean).join(' ');
  return text ? { parts: [text], source: 'dom:#invoice-number-input + #invoice-name' } : null;
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
