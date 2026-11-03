import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ContentScriptContext } from 'wxt/utils/content-script-context';
import { startChildFrame, watchFrame } from '@/lib/child-frame';
import { isMessage, type FrameItemMessage } from '@/lib/messages';
import { highLevelOriginsItem } from '@/lib/storage';
import { calendarFrame, workflowFrame } from './fixtures';
import { sleep, waitFor } from './helpers';

let ctx: ContentScriptContext;
let sent: FrameItemMessage[];

beforeEach(() => {
  fakeBrowser.reset();
  document.body.innerHTML = '';
  ctx = new ContentScriptContext('test');
  sent = [];
  fakeBrowser.runtime.onMessage.addListener((message: unknown) => {
    if (isMessage(message, 'ghl:frame-item')) sent.push(message);
  });
});

afterEach(() => {
  ctx.notifyInvalidated();
  delete (document as { referrer?: string }).referrer;
});

const last = () => `last message: ${JSON.stringify(sent.at(-1))}`;

describe('watchFrame', () => {
  it('reports the name, then clears it when the editor is hidden by a style change', async () => {
    document.body.innerHTML = `<div id="editor">${calendarFrame('Discovery Call')}</div>`;
    watchFrame(ctx);
    await waitFor(() => sent.at(-1)?.name === 'Discovery Call', last);
    expect(sent.at(-1)?.kind).toBe('calendar');

    // Only an attribute changes: no nodes are added or removed.
    document.getElementById('editor')!.setAttribute('style', 'display: none');
    await waitFor(() => sent.at(-1)?.name === null, last);
  });

  it('re-sends its current name when the page asks', async () => {
    document.body.innerHTML = workflowFrame('New Lead Follow-up');
    watchFrame(ctx);
    await waitFor(() => sent.length === 1, last);
    await fakeBrowser.runtime.onMessage.trigger(
      { type: 'ghl:frames-resend' },
      { id: fakeBrowser.runtime.id },
      () => {},
    );
    await waitFor(() => sent.length === 2, last);
    expect(sent[1]?.name).toBe('New Lead Follow-up');
  });
});

describe('startChildFrame', () => {
  const setReferrer = (value: string) =>
    Object.defineProperty(document, 'referrer', { value, configurable: true });

  it('starts when the top page origin is recorded after the frame loaded', async () => {
    setReferrer('https://ghl.example.com/v2/location/abc/automation/workflow/1');
    document.body.innerHTML = workflowFrame('New Lead Follow-up');
    const started = startChildFrame(ctx);
    // The top frame records its origin a moment later (first visit).
    await highLevelOriginsItem.setValue(['https://ghl.example.com']);
    await started;
    await waitFor(() => sent.at(-1)?.name === 'New Lead Follow-up', last);
  });

  it('stays idle when the top page is not HighLevel', async () => {
    setReferrer('https://news.example.com/article');
    await highLevelOriginsItem.setValue(['https://ghl.example.com']);
    document.body.innerHTML = workflowFrame('Looks like a workflow');
    await startChildFrame(ctx);
    await sleep(400);
    expect(sent).toEqual([]);
  });
});
