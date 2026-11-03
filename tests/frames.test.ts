import { beforeEach, describe, expect, it } from 'vitest';
import { currentFrameReports, extractFrameItem, FRAME_STALE_GRACE_MS } from '@/lib/frames';
import type { FrameReport } from '@/lib/types';
import { calendarFrame, formBuilderFrame, workflowFrame } from './fixtures';

describe('currentFrameReports', () => {
  const report = (frameId: number, at: number): FrameReport => ({
    frameId,
    kind: 'workflow',
    name: `Workflow ${frameId}`,
    frameUrl: 'https://client-app-automation-workflows.leadconnectorhq.com/',
    at,
  });
  const navigatedAt = 10_000;
  const before = report(1, navigatedAt - 5000);
  const after = report(2, navigatedAt + 100);

  it('keeps reports from before a navigation while frames re-send', () => {
    expect(currentFrameReports([before, after], navigatedAt, navigatedAt + 200)).toEqual([before, after]);
  });

  it('drops reports nobody re-sent once the grace period is over', () => {
    expect(
      currentFrameReports([before, after], navigatedAt, navigatedAt + FRAME_STALE_GRACE_MS + 1),
    ).toEqual([after]);
  });
});

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('extractFrameItem', () => {
  it('reads the form/survey builder name', () => {
    document.body.innerHTML = formBuilderFrame('Seminar Signup');
    expect(extractFrameItem(document)).toEqual({ kind: 'form-builder', name: 'Seminar Signup' });
  });

  it('reads the workflow name', () => {
    document.body.innerHTML = workflowFrame('New Lead Follow-up');
    expect(extractFrameItem(document)).toEqual({ kind: 'workflow', name: 'New Lead Follow-up' });
  });

  it('reads the calendar name, not the meeting invite title', () => {
    document.body.innerHTML = calendarFrame('Discovery Call');
    expect(extractFrameItem(document)).toEqual({ kind: 'calendar', name: 'Discovery Call' });
  });

  it('returns null for an empty builder name and for unrelated frames', () => {
    document.body.innerHTML = formBuilderFrame('');
    expect(extractFrameItem(document)).toBeNull();
    document.body.innerHTML = '<div class="ad-slot"><h1>Ad</h1><input value="Buy now"></div>';
    expect(extractFrameItem(document)).toBeNull();
  });
});
