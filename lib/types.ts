/** Kinds of item names that live inside HighLevel's embedded app frames. */
export type FrameKind = 'form-builder' | 'workflow' | 'calendar';

/** One entry of HighLevel's top-bar breadcrumb (`[data-switchyard-breadcrumb]`). */
export interface Crumb {
  /** e.g. `group:crm`, `item:crm.contacts`. */
  key: string;
  label: string;
  current: boolean;
  /** Groups are the top-level menu areas (CRM, Sites, Marketing...). */
  group: boolean;
}

/** Everything read from the top-level HighLevel page that the title depends on. */
export interface PageSnapshot {
  /** `switchyard` is the 2026 UI; `legacy` is the older UI still used on agency pages. */
  ui: 'switchyard' | 'legacy' | 'unknown';
  host: string;
  path: string;
  /** Path after `/v2/location/<id>/`, without a leading slash. Whole path on agency pages. */
  rest: string;
  locationId: string | null;
  /** Sub-account name shown in the sidebar header. */
  accountName: string | null;
  /** Agency name from the account switcher. */
  agencyName: string | null;
  crumbs: Crumb[];
  /** Active sidebar item in the legacy (agency) UI. */
  legacyNavLabel: string | null;
}

/** A name reported by a content script running inside an embedded frame. */
export interface FrameReport {
  frameId: number;
  kind: FrameKind;
  name: string | null;
  frameUrl: string;
  at: number;
}

export interface TitleParts {
  /** Most specific first, e.g. `['Step 2', 'Webinar Funnel']`. Empty when no item is open. */
  item: string[];
  section: string | null;
  account: string | null;
}

export interface Nickname {
  /** The real name, kept so the popup can list nicknames by name. */
  name: string;
  nickname: string;
}

export interface Settings {
  enabled: boolean;
  template: string;
  /** Keyed by location ID, or `agency@<host>` for agency-level pages. */
  nicknames: Record<string, Nickname>;
}

/** Names learned on earlier visits, used when the page doesn't show them. */
export interface Caches {
  /** `<locationId>/<smartListId>` → smart list name. */
  smartListNames: Record<string, string>;
  /** locationId → sub-account name. */
  accountNames: Record<string, string>;
  /** host → agency name. */
  agencyNames: Record<string, string>;
}

export type Learned =
  | { kind: 'smartList'; key: string; name: string }
  | { kind: 'account'; key: string; name: string }
  | { kind: 'agency'; key: string; name: string };

export interface Resolution {
  /** Which page rule matched, e.g. `smart-list`. */
  routeId: string;
  parts: TitleParts;
  /** Where each part came from, e.g. `dom:#funnel-name`, `crumb:module`, `nickname`. */
  sources: { item: string | null; section: string | null; account: string | null };
  /** Nickname key for the current sub-account or agency. */
  accountKey: string | null;
  /** Real account name before any nickname is applied. */
  accountName: string | null;
  title: string | null;
  learned: Learned[];
}

/** What the popup shows in its debug panel. */
export interface DebugInfo {
  version: string;
  url: string;
  ui: PageSnapshot['ui'];
  enabled: boolean;
  routeId: string;
  title: string | null;
  currentTitle: string;
  nativeTitle: string | null;
  parts: TitleParts;
  sources: Resolution['sources'];
  accountKey: string | null;
  accountName: string | null;
  crumbs: Crumb[];
  frames: FrameReport[];
  notes: string[];
}
