import { browser, defineBackground } from '#imports';
import { isMessage, type FrameItemRelayMessage, type FramesResendMessage } from '@/lib/messages';

/**
 * Relays item names from embedded HighLevel frames to the top-level page of the same tab.
 * Going through the extension (instead of window.postMessage) means pages can't spoof the
 * messages, and it works across origins. Keeps no state, so it's safe to be suspended.
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
    }
  });
});
