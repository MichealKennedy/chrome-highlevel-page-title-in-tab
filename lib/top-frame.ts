import { browser, type ContentScriptContext } from '#imports';
import { currentFrameReports, FRAME_STALE_GRACE_MS } from './frames';
import { isMessage, type FramesResendMessage } from './messages';
import { looksLikeHighLevel, readPage } from './page';
import { resolve } from './resolve';
import {
  accountNamesItem,
  agencyNamesItem,
  enabledItem,
  highLevelOriginsItem,
  MAX_ORIGINS,
  nicknamesItem,
  rememberName,
  smartListNamesItem,
  templateItem,
} from './storage';
import { DEFAULT_TEMPLATE } from './title';
import type { Caches, DebugInfo, FrameReport, Learned, PageSnapshot, Resolution, Settings } from './types';

const DETECT_INTERVAL_MS = 2000;
const UPDATE_DEBOUNCE_MS = 200;
const UPDATE_MAX_WAIT_MS = 1000;
/** If HighLevel keeps resetting the title, back off instead of fighting it in a tight loop. */
const MAX_APPLIES_PER_WINDOW = 40;
const APPLY_WINDOW_MS = 3000;
const BACKOFF_MS = 5000;

const CACHE_FIELD = {
  smartList: 'smartListNames',
  account: 'accountNames',
  agency: 'agencyNames',
} as const satisfies Record<Learned['kind'], keyof Caches>;

/**
 * Runs in the top-level page of every http(s) tab. Stays idle (one cheap DOM check every
 * 2 seconds) until the page turns out to be HighLevel, on any domain.
 */
export function startTopFrame(ctx: ContentScriptContext): void {
  let started = false;
  const check = () => {
    if (started || !looksLikeHighLevel(document)) return;
    started = true;
    clearInterval(timer);
    new TitleController(ctx).start();
  };
  const timer = ctx.setInterval(check, DETECT_INTERVAL_MS);
  check();
}

class TitleController {
  private settings: Settings = { enabled: true, template: DEFAULT_TEMPLATE, nicknames: {} };
  private caches: Caches = { smartListNames: {}, accountNames: {}, agencyNames: {} };
  private ready = false;

  private readonly frames = new Map<number, FrameReport>();
  /** When the URL last changed. Frame reports from before then must be re-sent to count. */
  private navigatedAt = 0;
  /** HighLevel's own title: the last title set by anyone but us. May be empty. */
  private nativeTitle: string = document.title;
  private lastApplied: string | null = null;
  private applyTimes: number[] = [];
  private pausedUntil = 0;

  private page: PageSnapshot | null = null;
  private resolution: Resolution | null = null;

  private timer: number | undefined;
  private firstScheduledAt = 0;

  constructor(private readonly ctx: ContentScriptContext) {}

  start(): void {
    const { ctx } = this;
    void this.rememberOrigin();
    void this.loadState();

    ctx.onInvalidated(enabledItem.watch((v) => this.setSetting('enabled', v)));
    ctx.onInvalidated(templateItem.watch((v) => this.setSetting('template', v)));
    ctx.onInvalidated(nicknamesItem.watch((v) => this.setSetting('nicknames', v)));
    // Keep learned names current when other tabs learn new ones.
    ctx.onInvalidated(smartListNamesItem.watch((v) => (this.caches.smartListNames = v ?? {})));
    ctx.onInvalidated(accountNamesItem.watch((v) => (this.caches.accountNames = v ?? {})));
    ctx.onInvalidated(agencyNamesItem.watch((v) => (this.caches.agencyNames = v ?? {})));

    const observer = new MutationObserver(() => this.onMutations());
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['aria-selected', 'aria-label'],
    });
    ctx.onInvalidated(() => observer.disconnect());

    ctx.addEventListener(window, 'wxt:locationchange', () => {
      this.navigatedAt = Date.now();
      this.requestFrameResend();
      this.schedule(0);
      // Drop reports that no frame re-sent once the grace period is over.
      ctx.setTimeout(() => this.schedule(0), FRAME_STALE_GRACE_MS + 50);
    });

    const onMessage = (
      message: unknown,
      sender: Browser.runtime.MessageSender,
      sendResponse: (response?: unknown) => void,
    ) => {
      if (sender.id !== browser.runtime.id) return;
      if (isMessage(message, 'ghl:frame-item-relay')) {
        if (message.name) {
          this.frames.set(message.frameId, {
            frameId: message.frameId,
            kind: message.kind,
            name: message.name,
            frameUrl: message.frameUrl,
            at: Date.now(),
          });
        } else {
          this.frames.delete(message.frameId);
        }
        this.schedule(0);
      } else if (isMessage(message, 'ghl:get-debug')) {
        sendResponse(this.debugInfo());
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    ctx.onInvalidated(() => browser.runtime.onMessage.removeListener(onMessage));
    ctx.onInvalidated(() => this.restoreNativeTitle());

    // Frames that loaded before HighLevel was detected sent their names to nobody.
    this.requestFrameResend();
  }

  private async loadState(): Promise<void> {
    const [enabled, template, nicknames, smartListNames, accountNames, agencyNames] =
      await Promise.all([
        enabledItem.getValue(),
        templateItem.getValue(),
        nicknamesItem.getValue(),
        smartListNamesItem.getValue(),
        accountNamesItem.getValue(),
        agencyNamesItem.getValue(),
      ]);
    this.settings = { enabled, template, nicknames };
    this.caches = { smartListNames, accountNames, agencyNames };
    this.ready = true;
    this.schedule(0);
  }

  private setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.settings = { ...this.settings, [key]: value };
    this.schedule(0);
  }

  /** Lets content scripts in embedded frames know this origin is HighLevel. */
  private async rememberOrigin(): Promise<void> {
    const origins = await highLevelOriginsItem.getValue();
    if (origins.includes(location.origin)) return;
    await highLevelOriginsItem.setValue([location.origin, ...origins].slice(0, MAX_ORIGINS));
  }

  private requestFrameResend(): void {
    const message: FramesResendMessage = { type: 'ghl:frames-resend' };
    browser.runtime.sendMessage(message).catch(() => {});
  }

  private onMutations(): void {
    const current = document.title;
    if (current !== this.lastApplied) {
      // HighLevel (or someone) changed the title. Remember theirs and put ours back.
      this.nativeTitle = current;
      if (this.settings.enabled && this.lastApplied !== null) this.apply(this.lastApplied);
    }
    this.schedule();
  }

  /** Debounced update that still runs at least once per UPDATE_MAX_WAIT_MS under constant change. */
  private schedule(delay = UPDATE_DEBOUNCE_MS): void {
    const now = performance.now();
    if (this.timer === undefined) this.firstScheduledAt = now;
    else clearTimeout(this.timer);
    const wait = Math.max(0, Math.min(delay, this.firstScheduledAt + UPDATE_MAX_WAIT_MS - now));
    this.timer = this.ctx.setTimeout(() => {
      this.timer = undefined;
      this.update();
    }, wait);
  }

  private update(): void {
    if (!this.ready || this.ctx.isInvalid) return;

    const frames = currentFrameReports([...this.frames.values()], this.navigatedAt, Date.now());
    for (const id of this.frames.keys()) {
      if (!frames.some((f) => f.frameId === id)) this.frames.delete(id);
    }

    this.page = readPage(document, new URL(location.href));
    this.resolution = resolve({
      doc: document,
      page: this.page,
      frames,
      nativeTitle: this.nativeTitle,
      caches: this.caches,
      settings: this.settings,
    });
    this.learn(this.resolution.learned);

    if (this.settings.enabled && this.resolution.title) this.apply(this.resolution.title);
    else this.restoreNativeTitle();
  }

  private apply(title: string): void {
    const now = performance.now();
    if (now < this.pausedUntil) return;
    if (document.title === title) {
      this.lastApplied = title;
      return;
    }
    this.applyTimes = this.applyTimes.filter((t) => now - t < APPLY_WINDOW_MS);
    if (this.applyTimes.length >= MAX_APPLIES_PER_WINDOW) {
      this.pausedUntil = now + BACKOFF_MS;
      this.ctx.setTimeout(() => this.schedule(0), BACKOFF_MS);
      return;
    }
    this.applyTimes.push(now);
    this.lastApplied = title;
    document.title = title;
  }

  /** Hands the title back to HighLevel if ours is showing. */
  private restoreNativeTitle(): void {
    const ours = this.lastApplied;
    this.lastApplied = null;
    if (ours !== null && document.title === ours) document.title = this.nativeTitle;
  }

  private learn(learned: Learned[]): void {
    for (const entry of learned) {
      const field = CACHE_FIELD[entry.kind];
      if (this.caches[field][entry.key] === entry.name) continue;
      // Update memory right away so later updates don't queue the same write again.
      this.caches[field] = { ...this.caches[field], [entry.key]: entry.name };
      void rememberName(entry).catch(() => {});
    }
  }

  private debugNotes(): string[] {
    const notes: string[] = [];
    if (performance.now() < this.pausedUntil) {
      notes.push('Paused for a few seconds: HighLevel kept resetting the title.');
    }
    if (this.resolution && !this.resolution.title) {
      notes.push("Nothing to show yet, so HighLevel's own title is kept.");
    }
    return notes;
  }

  private debugInfo(): DebugInfo {
    const r = this.resolution;
    return {
      version: browser.runtime.getManifest().version,
      url: location.href,
      ui: this.page?.ui ?? 'unknown',
      enabled: this.settings.enabled,
      routeId: r?.routeId ?? 'not-ready',
      title: r?.title ?? null,
      currentTitle: document.title,
      nativeTitle: this.nativeTitle,
      parts: r?.parts ?? { item: [], section: null, account: null },
      sources: r?.sources ?? { item: null, section: null, account: null },
      accountKey: r?.accountKey ?? null,
      accountName: r?.accountName ?? null,
      crumbs: this.page?.crumbs ?? [],
      frames: [...this.frames.values()],
      notes: this.debugNotes(),
    };
  }
}
