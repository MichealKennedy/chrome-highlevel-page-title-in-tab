import { cleanText, isShown, textOf } from './dom';
import type { FrameKind, FrameReport } from './types';

/** How long reports from before a navigation still count, while frames re-send theirs. */
export const FRAME_STALE_GRACE_MS = 1500;

/**
 * Reports received before the last navigation only count briefly. Frames that still show an
 * item re-send it when asked; frames that are gone (or never answered) drop out.
 */
export function currentFrameReports(
  reports: FrameReport[],
  navigatedAt: number,
  now: number,
): FrameReport[] {
  if (now - navigatedAt < FRAME_STALE_GRACE_MS) return reports;
  return reports.filter((report) => report.at >= navigatedAt);
}

/**
 * Item names that HighLevel renders inside embedded app frames (served from
 * `*.leadconnectorhq.com`). The content script in the frame reports them to the page.
 */
export const FRAME_EXTRACTORS: readonly { kind: FrameKind; extract: (doc: Document) => string | null }[] = [
  {
    // Form, survey and quiz builders share one app and one header.
    kind: 'form-builder',
    extract: (doc) =>
      textOf(doc.querySelector('.builder-form-name [contenteditable]')) ??
      textOf(doc.querySelector('[contenteditable][aria-label="Form Name"]')),
  },
  {
    kind: 'workflow',
    extract: (doc) =>
      textOf(doc.querySelector('#cmp-header__txt--edit-workflow-name')) ??
      textOf(doc.querySelector('h1[aria-label="Workflow name"]')),
  },
  {
    // Only present while a calendar's settings are open.
    kind: 'calendar',
    extract: (doc) => {
      const input = doc.querySelector<HTMLInputElement>('#calendar-name-input input');
      return input && isShown(input) ? cleanText(input.value) || null : null;
    },
  },
];

export function extractFrameItem(doc: Document): { kind: FrameKind; name: string } | null {
  for (const { kind, extract } of FRAME_EXTRACTORS) {
    const name = extract(doc);
    if (name) return { kind, name };
  }
  return null;
}

/**
 * Origin of the top-level page, so a frame can tell whether it is inside HighLevel.
 * Chrome has `location.ancestorOrigins`; elsewhere the referrer is the parent's origin.
 */
export function topOrigin(): string | null {
  const ancestors = (location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
  if (ancestors && ancestors.length > 0) return ancestors[ancestors.length - 1] ?? null;
  try {
    return document.referrer ? new URL(document.referrer).origin : null;
  } catch {
    return null;
  }
}
