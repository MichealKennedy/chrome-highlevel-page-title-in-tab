import { browser, type ContentScriptContext } from '#imports';
import { extractFrameItem, topOrigin } from './frames';
import { isMessage, type FrameItemMessage } from './messages';
import { highLevelOriginsItem } from './storage';
import type { FrameKind } from './types';

const DEBOUNCE_MS = 250;

/**
 * Runs in every embedded frame. Does nothing unless the frame's top-level page is a
 * HighLevel origin (recorded by the top frame), so frames on other sites stay idle.
 */
export async function startChildFrame(ctx: ContentScriptContext): Promise<void> {
  const origin = topOrigin();
  if (!origin) return;

  let started = false;
  const activate = () => {
    if (started || ctx.isInvalid) return;
    started = true;
    unwatch();
    watchFrame(ctx);
  };
  // Subscribe before reading, so the top frame recording its origin in between isn't missed.
  // (On a first visit the top frame may record it a moment after this frame loads.)
  const unwatch = highLevelOriginsItem.watch((next) => {
    if (next?.includes(origin)) activate();
  });
  ctx.onInvalidated(unwatch);

  const origins = await highLevelOriginsItem.getValue();
  if (origins.includes(origin)) activate();
}

/** Watches this frame for a known item name and reports changes to the page. */
export function watchFrame(ctx: ContentScriptContext): void {
  let last: { kind: FrameKind; name: string | null } | null = null;
  let timer: number | undefined;

  const send = (kind: FrameKind, name: string | null) => {
    const message: FrameItemMessage = { type: 'ghl:frame-item', kind, name, frameUrl: location.href };
    browser.runtime.sendMessage(message).catch(() => {});
  };

  /** With `force`, re-sends the current name even if it hasn't changed (the page asked). */
  const report = (force: boolean) => {
    const found = extractFrameItem(document);
    if (found) {
      if (force || last?.kind !== found.kind || last.name !== found.name) {
        last = found;
        send(found.kind, found.name);
      }
    } else if (last?.name) {
      last = { kind: last.kind, name: null };
      send(last.kind, null);
    }
  };
  const schedule = () => {
    if (timer !== undefined) return;
    timer = ctx.setTimeout(() => {
      timer = undefined;
      report(false);
    }, DEBOUNCE_MS);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    // Editors can be hidden by a class or style change without any other DOM change.
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden'],
  });
  ctx.onInvalidated(() => observer.disconnect());
  // Typing in an input doesn't mutate the DOM.
  ctx.addEventListener(document, 'input', schedule, { capture: true });
  ctx.addEventListener(window, 'pagehide', () => {
    if (last?.name) send(last.kind, null);
  });

  const onMessage = (message: unknown, sender: Browser.runtime.MessageSender) => {
    if (sender.id !== browser.runtime.id || !isMessage(message, 'ghl:frames-resend')) return;
    report(true);
  };
  browser.runtime.onMessage.addListener(onMessage);
  ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(onMessage));

  report(false);
}
