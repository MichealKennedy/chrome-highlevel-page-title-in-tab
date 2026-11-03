import { beforeEach, describe, expect, it } from 'vitest';
import { looksLikeHighLevel, readPage } from '@/lib/page';
import { resolve } from '@/lib/resolve';
import { DEFAULT_TEMPLATE } from '@/lib/title';
import type { Caches, FrameReport, Settings } from '@/lib/types';
import {
  centralPanel,
  contactDetail,
  emailBuilder,
  funnelPage,
  legacyAgencyPage,
  LOCATION_ID,
  locationUrl,
  opportunityDrawer,
  opportunityModal,
  ORIGIN,
  smartListBar,
  switchyardPage,
} from './fixtures';

const CRM = { key: 'group:crm', label: 'CRM' };

let settings: Settings;
let caches: Caches;

beforeEach(() => {
  document.body.innerHTML = '';
  settings = { enabled: true, template: DEFAULT_TEMPLATE, nicknames: {} };
  caches = { smartListNames: {}, accountNames: {}, agencyNames: {} };
});

function titleFor(
  url: URL,
  html: string,
  extra: { frames?: FrameReport[]; nativeTitle?: string | null } = {},
) {
  document.body.innerHTML = html;
  const page = readPage(document, url);
  return resolve({
    doc: document,
    page,
    frames: extra.frames ?? [],
    nativeTitle: extra.nativeTitle ?? null,
    caches,
    settings,
  });
}

function frame(kind: FrameReport['kind'], name: string, frameUrl = 'https://x.leadconnectorhq.com/'): FrameReport {
  return { frameId: 7, kind, name, frameUrl, at: Date.now() };
}

describe('detection and page reading', () => {
  it('recognises the switchyard UI and reads its parts', () => {
    document.body.innerHTML = switchyardPage({
      crumbs: [CRM, { key: 'item:crm.contacts', label: 'Contacts', current: true }],
    });
    expect(looksLikeHighLevel(document)).toBe(true);
    const page = readPage(document, locationUrl('contacts/smart_list/all'));
    expect(page).toMatchObject({
      ui: 'switchyard',
      locationId: LOCATION_ID,
      rest: 'contacts/smart_list/all',
      accountName: 'Acme Training',
      agencyName: 'Acme Agency',
    });
    expect(page.crumbs.map((c) => c.label)).toEqual(['CRM', 'Contacts']);
    expect(page.crumbs[0]?.group).toBe(true);
    expect(page.crumbs[1]?.current).toBe(true);
  });

  it('ignores pages that are not HighLevel', () => {
    document.body.innerHTML = '<header><nav aria-label="Breadcrumb"><a>Home</a></nav></header>';
    expect(looksLikeHighLevel(document)).toBe(false);
  });
});

describe('titles by page type', () => {
  it('list page: last breadcrumb and sub-account', () => {
    const r = titleFor(
      locationUrl('conversations/conversations'),
      switchyardPage({
        crumbs: [
          CRM,
          { key: 'item:crm.conversations', label: 'Conversations' },
          { key: 'item:crm.conversations.inbox', label: 'Inbox', current: true },
        ],
      }),
    );
    expect(r.title).toBe('Inbox | Acme Training');
    expect(r.sources.section).toBe('crumb:last');
  });

  it('smart list: open list name, fixed section', () => {
    const r = titleFor(
      locationUrl('contacts/smart_list/list111aaa222bbb333c'),
      switchyardPage({
        crumbs: [CRM, { key: 'item:crm.contacts', label: 'Contacts', current: true }],
        body: smartListBar([{ label: 'All', all: true }, { label: 'Hot Leads', active: true }], 296),
      }),
    );
    expect(r.title).toBe('Hot Leads | Smart Lists | Acme Training');
    expect(r.routeId).toBe('smart-list');
    expect(r.learned).toContainEqual({
      kind: 'smartList',
      key: `${LOCATION_ID}/list111aaa222bbb333c`,
      name: 'Hot Leads',
    });
  });

  it('smart list "All" is treated like any other list', () => {
    const r = titleFor(
      locationUrl('contacts/smart_list/all'),
      switchyardPage({
        crumbs: [CRM, { key: 'item:crm.contacts', label: 'Contacts', current: true }],
        body: smartListBar([{ label: 'All', all: true, active: true }]),
      }),
    );
    expect(r.title).toBe('All | Smart Lists | Acme Training');
  });

  it('smart list hidden in the "More" menu falls back to the remembered name', () => {
    caches.smartListNames[`${LOCATION_ID}/abc123`] = 'Hot Leads';
    const r = titleFor(
      locationUrl('contacts/smart_list/abc123'),
      switchyardPage({
        crumbs: [CRM, { key: 'item:crm.contacts', label: 'Contacts', current: true }],
        body: smartListBar([{ label: 'All', all: true }], 298),
      }),
    );
    expect(r.title).toBe('Hot Leads | Smart Lists | Acme Training');
    expect(r.sources.item).toBe('cache:smart-list');
  });

  it('smart list with no known name shows the section only', () => {
    const r = titleFor(
      locationUrl('contacts/smart_list/unknown1'),
      switchyardPage({
        crumbs: [CRM, { key: 'item:crm.contacts', label: 'Contacts', current: true }],
        body: smartListBar([{ label: 'All', all: true }], 298),
      }),
    );
    expect(r.title).toBe('Smart Lists | Acme Training');
  });

  it('contact detail: contact name and module', () => {
    const r = titleFor(
      locationUrl('contacts/detail/contact1aaa222bbb333'),
      switchyardPage({
        crumbs: [CRM, { key: 'item:crm.contacts', label: 'Contacts', current: true }],
        body: contactDetail('John Doe'),
      }),
    );
    expect(r.title).toBe('John Doe | Contacts | Acme Training');
    expect(r.sources.section).toBe('crumb:module');
  });

  it('conversation: contact name with the module, not the inbox', () => {
    const r = titleFor(
      locationUrl('conversations/conversations/convo111aaa222bbb333'),
      switchyardPage({
        crumbs: [
          CRM,
          { key: 'item:crm.conversations', label: 'Conversations' },
          { key: 'item:crm.conversations.inbox', label: 'Inbox', current: true },
        ],
        body: centralPanel('Jane Roe'),
      }),
    );
    expect(r.title).toBe('Jane Roe | Conversations | Acme Training');
  });

  it('opportunities: drawer contact name when open, list name otherwise', () => {
    const crumbs = [
      CRM,
      { key: 'item:crm.opportunities', label: 'Opportunities' },
      { key: 'item:crm.opportunities.list', label: 'Opportunity List', current: true },
    ];
    expect(
      titleFor(locationUrl('opportunities?smartlistId=x'), switchyardPage({ crumbs })).title,
    ).toBe('Opportunity List | Acme Training');
    expect(
      titleFor(
        locationUrl('opportunities'),
        switchyardPage({ crumbs, body: opportunityDrawer('Sam Carter') }),
      ).title,
    ).toBe('Sam Carter | Opportunities | Acme Training');
  });

  it('opportunities: name from the edit modal opened by clicking a card', () => {
    const crumbs = [CRM, { key: 'item:crm.opportunities', label: 'Opportunities', current: true }];
    const url = locationUrl('opportunities/opp1111aaa222bbb3333?tab=Opportunity+details');
    const r = titleFor(url, switchyardPage({ crumbs, body: opportunityModal('Acme Annual Review') }));
    expect(r.title).toBe('Acme Annual Review | Opportunities | Acme Training');
    expect(r.sources.item).toContain('Enter opportunity name');
    // If the name field isn't rendered, the heading `Edit "…"` is used.
    const fromHeading = titleFor(
      url,
      switchyardPage({ crumbs, body: opportunityModal('Acme Annual Review', { withInput: false }) }),
    );
    expect(fromHeading.title).toBe('Acme Annual Review | Opportunities | Acme Training');
  });

  it('form builder: name from the builder frame, only if the frame is for this form', () => {
    const url = locationUrl('form-builder-v2/form111aaa222bbb3333');
    const html = switchyardPage({ crumbs: [] });
    const frameUrl = 'https://leadgen-apps-form-survey-builder.leadconnectorhq.com/form-builder-v2/';
    expect(
      titleFor(url, html, { frames: [frame('form-builder', 'Seminar Signup', `${frameUrl}form111aaa222bbb3333`)] })
        .title,
    ).toBe('Seminar Signup | Forms | Acme Training');
    expect(
      titleFor(url, html, { frames: [frame('form-builder', 'Old Form', `${frameUrl}someOtherForm`)] }).title,
    ).toBe('Forms | Acme Training');
  });

  it('survey builder: same frame app, Surveys section', () => {
    const r = titleFor(locationUrl('survey-builder-v2/survey11aaa222bbb333'), switchyardPage({}), {
      frames: [
        frame(
          'form-builder',
          'Exit Survey',
          'https://leadgen-apps-form-survey-builder.leadconnectorhq.com/survey-builder-v2/survey11aaa222bbb333',
        ),
      ],
    });
    expect(r.title).toBe('Exit Survey | Surveys | Acme Training');
  });

  it('workflow: name from the workflow frame, or HighLevel\'s own title as a fallback', () => {
    const url = locationUrl('automation/workflow/00000000-0000-4000-8000-000000000001');
    const html = switchyardPage({
      crumbs: [
        { key: 'group:automation', label: 'Automations' },
        { key: 'item:auto.workflows', label: 'Workflows', current: true },
      ],
    });
    expect(titleFor(url, html, { frames: [frame('workflow', 'New Lead Follow-up')] }).title).toBe(
      'New Lead Follow-up | Workflows | Acme Training',
    );
    const fallback = titleFor(url, html, { nativeTitle: 'New Lead Follow-up' });
    expect(fallback.title).toBe('New Lead Follow-up | Workflows | Acme Training');
    expect(fallback.sources.item).toBe('native-title');
    // HighLevel's generic titles are not workflow names.
    expect(titleFor(url, html, { nativeTitle: 'Acme Agency' }).title).toBe('Workflows | Acme Training');
    expect(titleFor(url, html, { nativeTitle: 'Workflows list' }).title).toBe('Workflows | Acme Training');
  });

  it('funnel step: step and funnel', () => {
    const crumbs = [
      { key: 'group:content', label: 'Sites' },
      { key: 'item:content.funnels', label: 'Funnels', current: true },
    ];
    expect(
      titleFor(
        locationUrl('funnels-websites/funnels/funnel11aaa222bbb333/steps/step0001/overview'),
        switchyardPage({ crumbs, body: funnelPage('Webinar Funnel', 'Step 2') }),
      ).title,
    ).toBe('Step 2 | Webinar Funnel | Funnels | Acme Training');
  });

  it('website without a selected page: website name', () => {
    const r = titleFor(
      locationUrl('funnels-websites/websites/site1111aaa222bbb333/pages'),
      switchyardPage({
        crumbs: [
          { key: 'group:content', label: 'Sites' },
          { key: 'item:content.sites', label: 'Websites', current: true },
        ],
        body: funnelPage('Company Site'),
      }),
    );
    expect(r.title).toBe('Company Site | Websites | Acme Training');
  });

  it('email template builder: template name', () => {
    const r = titleFor(
      locationUrl('marketing/emails/templates/0123456789abcdef01234567/editor'),
      switchyardPage({
        crumbs: [
          { key: 'group:marketing', label: 'Marketing' },
          { key: 'item:mkt.email-builder', label: 'Emails', current: true },
        ],
        body: emailBuilder('November Newsletter'),
      }),
    );
    expect(r.title).toBe('November Newsletter | Emails | Acme Training');
  });

  it('calendar settings: calendar name from the calendar frame, module section', () => {
    const crumbs = [
      CRM,
      { key: 'item:crm.calendars', label: 'Calendars' },
      { key: 'item:crm.calendars.meetings', label: 'Meeting Calendars', current: true },
    ];
    expect(titleFor(locationUrl('settings/calendars'), switchyardPage({ crumbs })).title).toBe(
      'Meeting Calendars | Acme Training',
    );
    expect(
      titleFor(locationUrl('settings/calendars'), switchyardPage({ crumbs }), {
        frames: [frame('calendar', 'Discovery Call')],
      }).title,
    ).toBe('Discovery Call | Calendars | Acme Training');
  });

  it('ignores frame reports from another sub-account', () => {
    const crumbs = [
      CRM,
      { key: 'item:crm.calendars', label: 'Calendars' },
      { key: 'item:crm.calendars.meetings', label: 'Meeting Calendars', current: true },
    ];
    const otherAccount = frame(
      'calendar',
      'Other Account Calendar',
      'https://calendar-app.leadconnectorhq.com/v2/location/SOMEOTHERLOC/settings/calendars',
    );
    expect(
      titleFor(locationUrl('settings/calendars'), switchyardPage({ crumbs }), { frames: [otherAccount] })
        .title,
    ).toBe('Meeting Calendars | Acme Training');
    const sameAccount = frame(
      'calendar',
      'Discovery Call',
      `https://calendar-app.leadconnectorhq.com/v2/location/${LOCATION_ID}/settings/calendars`,
    );
    expect(
      titleFor(locationUrl('settings/calendars'), switchyardPage({ crumbs }), { frames: [sameAccount] })
        .title,
    ).toBe('Discovery Call | Calendars | Acme Training');
  });

  it('page without a breadcrumb: section from the URL', () => {
    const r = titleFor(locationUrl('media-storage'), switchyardPage({}));
    expect(r.title).toBe('Media Storage | Acme Training');
    expect(r.sources.section).toBe('path');
  });

  it('agency page in the older UI: active menu item and agency name', () => {
    const r = titleFor(
      new URL(`${ORIGIN}/agency_dashboard/?tab=summary`),
      legacyAgencyPage('Agency Dashboard'),
      { nativeTitle: 'Acme Agency' },
    );
    expect(r.title).toBe('Agency Dashboard | Acme Agency');
    expect(r.routeId).toBe('agency');
    expect(r.sources.account).toBe('native-title');
  });

  it('agency page prefers the agency name learned on sub-account pages', () => {
    caches.agencyNames['ghl.example.com'] = 'Acme Agency LLC';
    const r = titleFor(new URL(`${ORIGIN}/accounts`), legacyAgencyPage('Sub-Accounts'), {
      nativeTitle: 'Acme Agency',
    });
    expect(r.title).toBe('Sub-Accounts | Acme Agency LLC');
  });
});

describe('accounts and nicknames', () => {
  it('uses a nickname for the sub-account when set', () => {
    settings.nicknames[LOCATION_ID] = { name: 'Acme Training', nickname: 'AT' };
    const r = titleFor(
      locationUrl('contacts/detail/abc'),
      switchyardPage({
        crumbs: [CRM, { key: 'item:crm.contacts', label: 'Contacts', current: true }],
        body: contactDetail('John Doe'),
      }),
    );
    expect(r.title).toBe('John Doe | Contacts | AT');
    expect(r.accountName).toBe('Acme Training');
    expect(r.accountKey).toBe(LOCATION_ID);
  });

  it('falls back to the remembered sub-account name', () => {
    caches.accountNames[LOCATION_ID] = 'Acme Training';
    const r = titleFor(
      locationUrl('dashboard'),
      '<header data-switchyard-topbar=""><nav data-switchyard-breadcrumbs=""></nav></header>',
    );
    expect(r.title).toBe('Dashboard | Acme Training');
    expect(r.sources.account).toBe('cache');
  });

  it('records names it can learn', () => {
    const r = titleFor(locationUrl('dashboard'), switchyardPage({}));
    expect(r.learned).toContainEqual({ kind: 'account', key: LOCATION_ID, name: 'Acme Training' });
    expect(r.learned).toContainEqual({ kind: 'agency', key: 'ghl.example.com', name: 'Acme Agency' });
  });

  it('applies a custom template', () => {
    settings.template = '{account}: {item} ({section})';
    const r = titleFor(
      locationUrl('contacts/detail/abc'),
      switchyardPage({
        crumbs: [CRM, { key: 'item:crm.contacts', label: 'Contacts', current: true }],
        body: contactDetail('John Doe'),
      }),
    );
    expect(r.title).toBe('Acme Training: John Doe (Contacts)');
  });
});
