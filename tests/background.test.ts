import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import background from '@/entrypoints/background';
import type { HealthMessage } from '@/lib/messages';
import { sleep } from './helpers';

const TAB = 5;

beforeEach(() => {
  fakeBrowser.reset();
  background.main();
});

const health = (problem: string | null, frameId = 0) => {
  const message: HealthMessage = { type: 'ghl:health', problem };
  return fakeBrowser.runtime.onMessage.trigger(
    message,
    { id: fakeBrowser.runtime.id, tab: { id: TAB } as Browser.tabs.Tab, frameId },
    () => {},
  );
};
const badge = () => fakeBrowser.action.getBadgeText({ tabId: TAB });

describe('warning badge', () => {
  it('shows "!" with the problem in the tooltip, and clears it', async () => {
    await health("Couldn't find the contact name.");
    await sleep(50);
    expect(await badge()).toBe('!');
    expect(await fakeBrowser.action.getTitle({ tabId: TAB })).toContain("Couldn't find the contact name.");

    await health(null);
    await sleep(50);
    expect(await badge()).toBe('');
    expect(await fakeBrowser.action.getTitle({ tabId: TAB })).toBe('GHL Tab Title');
  });

  it('ignores reports from embedded frames', async () => {
    await health('Something is wrong.', 3);
    await sleep(50);
    expect(await badge()).toBe('');
  });

  it('clears the badge when the tab loads a new page', async () => {
    await health("Couldn't find the form name.");
    await sleep(50);
    expect(await badge()).toBe('!');
    await fakeBrowser.tabs.onUpdated.trigger(TAB, { status: 'loading' }, { id: TAB } as Browser.tabs.Tab);
    await sleep(50);
    expect(await badge()).toBe('');
  });
});
