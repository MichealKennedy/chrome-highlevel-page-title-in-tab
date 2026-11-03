import { browser, defineBackground } from '#imports';
import { isMessage, type FrameItemRelayMessage, type FramesResendMessage } from '@/lib/messages';

const DEFAULT_ACTION_TITLE = 'GHL Tab Title';
const BADGE_COLOR = '#d97706';

/**
 * - Relays item names from embedded HighLevel frames to the top-level page of the same tab.
 *   Going through the extension (instead of window.postMessage) means pages can't spoof the
 *   messages, and it works across origins.
 * - Shows a "!" badge on the toolbar icon for tabs where the page reports something missing.
 *
 * Keeps no state, so it's safe to be suspended.
 */
export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown, sender) => {
    const tabId = sender.tab?.id;
    if (tabId === undefined || sender.id !== browser.runtime.id) return;

    if (isMessage(message, 'ghl:frame-item') && sender.frameId) {
      const relay: FrameItemRelayMessage = {
        type: 'ghl:frame-item-relay',
        kind: message.kind,
        name: message.name,
        frameUrl: message.frameUrl,
        frameId: sender.frameId,
      };
      browser.tabs.sendMessage(tabId, relay, { frameId: 0 }).catch(() => {});
    } else if (isMessage(message, 'ghl:frames-resend')) {
      const resend: FramesResendMessage = { type: 'ghl:frames-resend' };
      browser.tabs.sendMessage(tabId, resend).catch(() => {});
    } else if (isMessage(message, 'ghl:health') && sender.frameId === 0) {
      void setBadge(tabId, message.problem);
    }
  });

  // Tab badges stay until cleared, so clear them when a tab starts loading a new page.
  // HighLevel pages report again once they've loaded.
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') void setBadge(tabId, null);
  });
});

async function setBadge(tabId: number, problem: string | null): Promise<void> {
  try {
    await browser.action.setBadgeText({ tabId, text: problem ? '!' : '' });
    await browser.action.setTitle({
      tabId,
      title: problem ? `${DEFAULT_ACTION_TITLE}: ${problem} Open for details.` : DEFAULT_ACTION_TITLE,
    });
    if (problem) {
      await browser.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
      await browser.action.setBadgeTextColor?.({ tabId, color: '#ffffff' });
    }
  } catch {
    // The tab may have closed in the meantime.
  }
}
