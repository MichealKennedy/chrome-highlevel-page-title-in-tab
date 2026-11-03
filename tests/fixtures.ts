/**
 * Trimmed copies of HighLevel's real markup (captured November 2026, new "switchyard" UI).
 * Names are made up. Keep the attributes and class names the extension relies on.
 */

export const LOCATION_ID = 'LocAbc123XyZ456DefGh';
export const ORIGIN = 'https://ghl.example.com';

export function locationUrl(rest: string): URL {
  return new URL(`${ORIGIN}/v2/location/${LOCATION_ID}/${rest}`);
}

interface CrumbSpec {
  key: string;
  label: string;
  current?: boolean;
}

function crumbHtml({ key, label, current }: CrumbSpec): string {
  return `
    <span class="switchyard-breadcrumb-separator" aria-hidden="true"></span>
    <div class="switchyard-breadcrumb-entry">
      <button class="hr-button switchyard-breadcrumb-label${current ? ' is-current' : ''}"
        type="button" data-switchyard-breadcrumb="${key}" aria-haspopup="menu">
        <span class="hr-button__content"><p class="hr-text">
          <span class="switchyard-breadcrumb-label-content">
            <span class="switchyard-icon" aria-hidden="true"><svg></svg></span>
            <span class="switchyard-breadcrumb-label-text">${label}</span>
          </span>
        </p></span>
      </button>
    </div>`;
}

/** Sidebar + top bar of a sub-account page, with `body` as the page content. */
export function switchyardPage(options: {
  account?: string;
  agency?: string;
  crumbs?: CrumbSpec[];
  body?: string;
}): string {
  const { account = 'Acme Training', agency = 'Acme Agency', crumbs = [], body = '' } = options;
  return `
    <div aria-label="Workspace navigation">
      <header class="switchyard-workspace-header">
        <div class="switchyard-workspace-identity" role="group" tabindex="0"
          aria-label="${account}" data-switchyard-workspace-identity="">
          <span class="switchyard-workspace-logo" aria-hidden="true">${account.charAt(0)}</span>
          <span class="switchyard-workspace-label">${account}</span>
        </div>
      </header>
    </div>
    <section aria-label="Accounts">
      <button type="button" aria-label="Agency account: ${agency}">${agency.charAt(0)}${agency}</button>
      <button id="switchyard-account-option-all-${LOCATION_ID}-sy-1" aria-label="${account}">
        <p id="switchyard-account-option-all-${LOCATION_ID}-sy-1-label">${account.charAt(0)}${account}</p>
      </button>
    </section>
    <header class="switchyard-topbar" aria-label="Application navigation" data-switchyard-topbar="">
      <nav class="switchyard-breadcrumb" aria-label="Breadcrumb" data-switchyard-breadcrumbs="">
        <button class="hr-button switchyard-breadcrumb-home" aria-label="Home"
          data-switchyard-top-home="" data-switchyard-breadcrumb="home"></button>
        ${crumbs.map(crumbHtml).join('')}
      </nav>
    </header>
    <div id="switchyard-main-content">${body}</div>`;
}

export function smartListBar(tabs: { label: string; active?: boolean; all?: boolean }[], more = 0): string {
  const tabHtml = tabs
    .map(
      (t) => `
      <div role="tab" tabindex="0" aria-selected="${t.active ? 'true' : 'false'}"
        class="hl-tabs__tab${t.all ? ' hl-tabs__tab--all' : ' hl-tabs__tab--draggable'}${t.active ? ' hl-tabs__tab--active' : ''}">
        <span class="hl-tabs__label">${t.label}</span>
      </div>`,
    )
    .join('');
  return `
    <div id="smart-list-views-bar" class="d-flex bar-parent">
      <div class="hl-tabs" role="tablist" aria-label="Tabs">
        <div class="hl-tabs__list">
          ${tabHtml}
          ${more ? `<div class="hl-tabs__more-wrapper"><div class="hl-tabs__more-btn" role="button"><span class="hl-tabs__more-label">${more} More</span></div></div>` : ''}
        </div>
      </div>
    </div>`;
}

export function contactDetail(name: string): string {
  return `
    <div id="record-details-lhs" class="flex flex-col h-full overflow-y-auto">
      <div class="flex flex-col flex-1 px-3"><div class="flex flex-col h-full gap-2">
        <div class="flex flex-col border border-gray-200">
          <div class="flex items-center justify-between gap-2"><div class="flex items-center gap-4 flex-1">
            <div class="flex items-center gap-2 min-w-0">
              <p class="hr-text hr-text-lg hr-text-semibold text-gray-900"><span class="block min-w-0 truncate">${name}</span></p>
            </div>
          </div></div>
          <a class="flex items-center gap-2 cursor-pointer"><p class="hr-text hr-text-lg hr-text-regular"><span>someone@example.com</span></p></a>
        </div>
      </div></div>
    </div>
    ${centralPanel(name)}`;
}

export function centralPanel(name: string): string {
  return `
    <div class="relative flex flex-col h-full"><div class="flex justify-between items-center px-3">
      <span><div class="text-[16px] font-medium text-gray-900 font-inter" data-testid="CENTRALPANEL_NAME">${name}</div></span>
    </div></div>`;
}

export function opportunityDrawer(name: string): string {
  return `
    <div class="drawer-panel">
      <div class="hr-wrapper-container full-screen contactDetailsSidebar">
        <div class="drawer-header">
          <div class="flex items-center gap-3 min-w-0">
            <p class="hr-text hr-text-lg hr-text-semibold drawer-contact-name">${name}</p>
          </div>
          <div class="contact-drawer-header-actions"><button class="contact-drawer-icon-btn" title="Close"></button></div>
        </div>
      </div>
    </div>`;
}

/** The modal that opens when you click an opportunity card. */
export function opportunityModal(name: string, options: { withInput?: boolean } = {}): string {
  const { withInput = true } = options;
  return `
    <div class="crm-opportunities-modal">
      <div id="modal" class="hr-card hr-modal crm-opportunities-modal ui-modal">
        <div class="hr-card-header"><div class="hr-card-header__main"><div class="crm-opportunities-modal-header">
          <div class="ui-modal-heading"><div><div class="title">Edit "${name}"</div></div></div>
        </div></div></div>
        <div class="hr-card__content">
          <input type="text" placeholder="Enter email" value="someone@example.com">
          ${withInput ? `<label>Opportunity name *</label><input type="text" placeholder="Enter opportunity name" value="${name}">` : ''}
        </div>
      </div>
    </div>`;
}

export function funnelPage(funnel: string, step?: string): string {
  return `
    <section id="funnels-steps" class="hl_wrapper--inner">
      <section id="header"><div class="flex items-center justify-between"><div class="flex items-center">
        <p id="funnel-name" class="hr-text hr-text-3xl hr-text-medium text-black">${funnel}</p>
      </div></div></section>
      <div id="steps-tab">
        <div class="flex flex-wrap mt-3">
          <div id="steps-sidebar" class="steps-sidebar"><div class="overflow-auto steps-list">
            <div id="step-container" class="flex steps pointer relative border-green-500 border-b bg-white"><div class="flex items-center py-2.5 px-5"><p class="hr-text line-clamp-2">Step 1</p></div></div>
            <div id="step-container" class="flex steps pointer relative"><div class="flex items-center py-2.5 px-5"><p class="hr-text line-clamp-2">Step 2</p></div></div>
          </div></div>
          ${step ? `<div id="funnel-step-details" class="bg-white px-4 funnel-step-details"><div class="flex justify-between items-center w-full"><span class="text-base mt-5 truncate">${step}</span></div></div>` : ''}
        </div>
      </div>
    </section>`;
}

export function emailBuilder(name: string): string {
  return `
    <div class="email-builder-mfa-wrapper hl_without-topbar hl_fullscreen">
      <div id="emailBuilderMfa"><div class="hr-wrapper-container full-screen emailBuilderApp"><div class="hr-config-provider font-sans">
        <div class="email-builder-header flex items-center justify-between">
          <div class="flex flex-1 items-center justify-center">
            <div class="text-xl font-semibold truncate max-w-lg" contenteditable="true">${name}</div>
          </div>
        </div>
      </div></div></div>
    </div>`;
}

/** Agency-level page in the older UI. */
export function legacyAgencyPage(activeNav: string): string {
  return `
    <div id="location-switcher-sidbar-v2" class="flex flex-row items-center"><span class="hl_switcher-loc-name">Click here to switch</span></div>
    <nav>
      <a id="sb_agency-dashboard" href="/agency_dashboard" class="w-full group${activeNav === 'Agency Dashboard' ? ' active' : ''}"><span>Agency Dashboard</span></a>
      <a id="sb_sub-accounts" href="/accounts" class="w-full group${activeNav === 'Sub-Accounts' ? ' active' : ''}"><span>Sub-Accounts</span></a>
    </nav>`;
}

// ---- Markup inside embedded app frames ----

export function formBuilderFrame(name: string): string {
  return `
    <div class="n-config-provider"><div><section class="builder-container"><div id="builder-header">
      <div class="header-toolbar p-0 hl-toolbar dark">
        <div class="hl-toolbar-group"><button id="builder-back" type="button"><span>Back</span></button></div>
        <div class="hl-toolbar-group">
          <div class="builder-form-name flex items-center justify-center text-black">
            <div contenteditable="true" role="textbox" tabindex="0" aria-label="Form Name" class="min-w-[1rem] max-w-2xl text-lg outline-none truncate">${name}</div>
          </div>
        </div>
      </div>
    </div></section></div></div>`;
}

export function workflowFrame(name: string): string {
  return `<div><h1 class="p-1 editable-header-text font-normal" id="cmp-header__txt--edit-workflow-name" aria-label="Workflow name">${name}</h1></div>`;
}

export function calendarFrame(name: string): string {
  return `
    <div class="n-form-item">
      <label class="n-form-item-label"><span class="n-form-item-label__text"><div class="n-form-custom-label"><span><span>Calendar name</span></span></div></span></label>
      <div class="n-form-item-blank">
        <div class="n-input hl-input-text" id="calendar-name-input">
          <div class="n-input-wrapper"><div class="n-input__input"><input type="text" class="n-input__input-el" value="${name}"></div></div>
        </div>
      </div>
    </div>
    <div class="n-input hl-input-text" id="calendar-event-title-input">
      <input type="text" class="n-input__input-el" placeholder="{{contact.name}}" value="Meeting with {{contact.name}}">
    </div>`;
}
