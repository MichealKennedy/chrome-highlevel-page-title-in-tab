import { storage } from '#imports';
import type { TabIconOverride } from './icon';
import { DEFAULT_TEMPLATE } from './title';
import type { Learned, Nickname } from './types';

// Settings, synced across the user's Chrome profiles.
export const enabledItem = storage.defineItem<boolean>('sync:enabled', { fallback: true });
export const templateItem = storage.defineItem<string>('sync:template', {
  fallback: DEFAULT_TEMPLATE,
});
export const nicknamesItem = storage.defineItem<Record<string, Nickname>>('sync:nicknames', {
  fallback: {},
});
export const tabIconsEnabledItem = storage.defineItem<boolean>('sync:tabIcons', { fallback: true });
/** Per-sub-account icon letter/colour changes, keyed by location ID. */
export const iconOverridesItem = storage.defineItem<Record<string, TabIconOverride>>(
  'sync:iconOverrides',
  { fallback: {} },
);

// Names learned while browsing, kept on this computer only.
export const smartListNamesItem = storage.defineItem<Record<string, string>>(
  'local:smartListNames',
  { fallback: {} },
);
export const accountNamesItem = storage.defineItem<Record<string, string>>('local:accountNames', {
  fallback: {},
});
export const agencyNamesItem = storage.defineItem<Record<string, string>>('local:agencyNames', {
  fallback: {},
});

/**
 * Origins where a HighLevel page was detected. Content scripts in embedded frames only start
 * when their top-level page is one of these, so frames on other sites stay idle.
 */
export const highLevelOriginsItem = storage.defineItem<string[]>('local:highLevelOrigins', {
  fallback: [],
});

export const MAX_ORIGINS = 50;

const LEARNED_ITEMS = {
  smartList: { item: smartListNamesItem, max: 1000 },
  account: { item: accountNamesItem, max: 500 },
  agency: { item: agencyNamesItem, max: 50 },
} as const;

/**
 * Stores one learned name. Re-reads the stored map first, so names learned in other tabs since
 * this tab loaded aren't overwritten. Oldest entries are dropped past the size limit.
 */
export async function rememberName(entry: Learned): Promise<void> {
  const { item, max } = LEARNED_ITEMS[entry.kind];
  const current = await item.getValue();
  if (current[entry.key] === entry.name) return;
  // Re-insert the key so it moves to the end (most recent).
  const { [entry.key]: _previous, ...rest } = current;
  const next: Record<string, string> = { ...rest, [entry.key]: entry.name };
  const keys = Object.keys(next);
  for (const old of keys.slice(0, Math.max(0, keys.length - max))) delete next[old];
  await item.setValue(next);
}
