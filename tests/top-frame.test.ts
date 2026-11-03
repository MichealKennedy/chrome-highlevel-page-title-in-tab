import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ContentScriptContext } from 'wxt/utils/content-script-context';
import { isMessage, type FrameItemRelayMessage } from '@/lib/messages';
import { enabledItem, templateItem } from '@/lib/storage';
import { startTopFrame } from '@/lib/top-frame';
import { contactDetail, LOCATION_ID, switchyardPage } from './fixtures';
import { sleep, waitFor } from './helpers';

const CRM = { key: 'group:crm', label: 'CRM' };
const CONTACTS = [CRM, { key: 'item:crm.contacts', label: 'Contacts', current: true }];
const INBOX = [
  CRM,
  { key: 'item:crm.conversations', label: 'Conversations' },
  { key: 'item:crm.conversations.inbox', label: 'Inbox', current: true },
];
const CONTACT_TITLE = 'John Doe | Contacts | Acme Training';

let ctx: ContentScriptContext;
const title = () => `title was "${document.title}"`;

beforeEach(() => {
  fakeBrowser.reset();
  document.title = 'Acme Agency';
  history.replaceState({}, '', `/v2/location/${LOCATION_ID}/contacts/detail/abc`);
  document.body.innerHTML = switchyardPage({ crumbs: CONTACTS, body: contactDetail('John Doe') });
  ctx = new ContentScriptContext('test');
});

afterEach(() => {
  ctx.notifyInvalidated();
});

describe('top-frame controller', () => {
  it('sets the title, and puts it back when the page changes it', async () => {
    startTopFrame(ctx);
    await waitFor(() => document.title === CONTACT_TITLE, title);
    document.title = 'Acme Agency';
    await waitFor(() => document.title === CONTACT_TITLE, title);
  });

  it("hands the title back to the page when there's nothing to show", async () => {
    await templateItem.setValue('{item}');
    startTopFrame(ctx);
    await waitFor(() => document.title === 'John Doe', title);

    // In-app navigation to a list page: no item, so `{item}` renders nothing.
    history.pushState({}, '', `/v2/location/${LOCATION_ID}/conversations/conversations`);
    document.body.innerHTML = switchyardPage({ crumbs: INBOX });
    await waitFor(() => document.title === 'Acme Agency', title);

    // The page's own titles are left alone from then on.
    document.title = 'Inbox - HighLevel';
    await sleep(400);
    expect(document.title).toBe('Inbox - HighLevel');
  });

  it('restores the page title when switched off, and re-applies when switched on', async () => {
    startTopFrame(ctx);
    await waitFor(() => document.title === CONTACT_TITLE, title);
    await enabledItem.setValue(false);
    await waitFor(() => document.title === 'Acme Agency', title);
    await enabledItem.setValue(true);
    await waitFor(() => document.title === CONTACT_TITLE, title);
  });

  it('asks frames to re-send their names when it starts', async () => {
    // A frame that reported before HighLevel was detected sent its name to nobody.
    history.replaceState({}, '', `/v2/location/${LOCATION_ID}/form-builder-v2/FORM1`);
    document.body.innerHTML = switchyardPage({});
    const seen: unknown[] = [];
    fakeBrowser.runtime.onMessage.addListener((message: unknown) => {
      seen.push(message);
      if (!isMessage(message, 'ghl:frames-resend')) return;
      // Stand-in for the background relaying the builder frame's answer.
      const relay: FrameItemRelayMessage = {
        type: 'ghl:frame-item-relay',
        kind: 'form-builder',
        name: 'Seminar Signup',
        frameId: 3,
        frameUrl: 'https://leadgen-apps-form-survey-builder.leadconnectorhq.com/form-builder-v2/FORM1',
      };
      void fakeBrowser.runtime.onMessage.trigger(relay, { id: fakeBrowser.runtime.id }, () => {});
    });

    startTopFrame(ctx);
    await waitFor(() => document.title === 'Seminar Signup | Forms | Acme Training', title);
    expect(seen).toContainEqual({ type: 'ghl:frames-resend' });
  });

  it('ignores relayed names that do not come from the extension', async () => {
    history.replaceState({}, '', `/v2/location/${LOCATION_ID}/form-builder-v2/FORM1`);
    document.body.innerHTML = switchyardPage({});
    startTopFrame(ctx);
    await waitFor(() => document.title === 'Forms | Acme Training', title);
    await fakeBrowser.runtime.onMessage.trigger(
      {
        type: 'ghl:frame-item-relay',
        kind: 'form-builder',
        name: 'Spoofed',
        frameId: 9,
        frameUrl: 'https://evil.example.com/form-builder-v2/FORM1',
      },
      { id: 'some-other-extension' },
      () => {},
    );
    await sleep(400);
    expect(document.title).toBe('Forms | Acme Training');
  });
});
