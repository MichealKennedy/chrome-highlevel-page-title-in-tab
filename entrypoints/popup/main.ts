import { browser } from '#imports';
import {
  cleanIconLetter,
  defaultIconLetter,
  ICON_PALETTE,
  iconDataUrl,
  isHexColor,
  resolveIconStyle,
  type TabIconOverride,
} from '@/lib/icon';
import type { GetDebugMessage } from '@/lib/messages';
import {
  enabledItem,
  iconOverridesItem,
  nicknamesItem,
  tabIconsEnabledItem,
  templateItem,
} from '@/lib/storage';
import { DEFAULT_TEMPLATE, hasTokens, renderTitle } from '@/lib/title';
import type { DebugInfo, Nickname, TitleParts } from '@/lib/types';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const enabledInput = $<HTMLInputElement>('enabled');
const pageBody = $('page-body');
const copyButton = $<HTMLButtonElement>('copy-debug');
const templateInput = $<HTMLInputElement>('template');
const templatePreview = $('template-preview');
const templateError = $('template-error');
const resetTemplateButton = $<HTMLButtonElement>('reset-template');
const tabIconsInput = $<HTMLInputElement>('tab-icons');
const accountCurrent = $('account-current');
const accountList = $('account-list');
const accountEmpty = $('account-empty');
const statusEl = $('status');

/** Sample parts for the format preview when the current tab isn't HighLevel. */
const SAMPLE_PARTS: TitleParts = { item: ['John Doe'], section: 'Contacts', account: 'Acme Training' };

let debug: DebugInfo | null = null;
let nicknames: Record<string, Nickname> = {};
let iconOverrides: Record<string, TabIconOverride> = {};
let statusTimer: number | undefined;

/** Builds an element. Text always goes through textContent, never innerHTML. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string; title?: string } = {},
  children: (Node | string | null)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.title) node.title = props.title;
  for (const child of children) {
    if (child !== null) node.append(child);
  }
  return node;
}

function showStatus(message: string): void {
  statusEl.textContent = message;
  clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => (statusEl.textContent = ''), 2000);
}

async function loadDebug(): Promise<DebugInfo | null> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return null;
  const message: GetDebugMessage = { type: 'ghl:get-debug' };
  try {
    const response: unknown = await browser.tabs.sendMessage(tab.id, message, { frameId: 0 });
    return response && typeof response === 'object' ? (response as DebugInfo) : null;
  } catch {
    // No content script answered: not a HighLevel page, or the tab predates the install.
    return null;
  }
}

function fact(label: string, value: string | null, source?: string | null): Node[] {
  return [
    el('dt', { text: label }),
    el('dd', {}, [value ?? '—', source ? el('span', { className: 'source', text: source }) : null]),
  ];
}

function renderPage(): void {
  pageBody.replaceChildren();
  if (!debug) {
    copyButton.hidden = true;
    pageBody.append(
      el('p', {
        className: 'muted',
        text: "This tab isn't a HighLevel page. If it is, reload the tab: tabs opened before the extension was installed or updated don't have it yet.",
      }),
    );
    return;
  }
  copyButton.hidden = false;

  if (debug.problem) {
    pageBody.append(
      el('div', { className: 'warning' }, [
        el('strong', { text: `⚠ ${debug.problem}` }),
        el('p', {
          text: 'HighLevel may have changed this page. Use "Copy debug info" and share it so the page rule can be fixed.',
        }),
      ]),
    );
  }

  const facts = el('dl', { className: 'facts' });
  facts.append(
    ...fact('Item', debug.parts.item.join(' › ') || null, debug.sources.item),
    ...fact('Section', debug.parts.section, debug.sources.section),
    ...fact('Account', debug.parts.account, debug.sources.account),
    ...fact('Page rule', debug.routeId),
    ...fact('Breadcrumb', debug.crumbs.map((c) => c.label).join(' › ') || null),
    ...fact('HighLevel title', debug.nativeTitle),
    ...fact(
      'Frames',
      debug.frames.map((f) => `${f.kind}: ${f.name ?? '—'}`).join(', ') || null,
    ),
  );

  pageBody.append(
    el('p', {
      className: 'title-preview',
      text: debug.enabled ? (debug.title ?? debug.currentTitle) : `Off · ${debug.currentTitle}`,
    }),
    facts,
  );
  if (debug.notes.length) pageBody.append(el('p', { className: 'notes', text: debug.notes.join(' ') }));
}

function renderTemplatePreview(): void {
  const template = templateInput.value;
  const valid = hasTokens(template);
  templateError.hidden = valid;
  const parts = debug && (debug.parts.item.length || debug.parts.section) ? debug.parts : SAMPLE_PARTS;
  templatePreview.textContent = valid ? (renderTitle(template, parts) ?? '') : '';
}

const isLocationKey = (key: string) => !key.startsWith('agency@');

/** Icon preview for a sub-account, as an <img>. */
function iconImage(key: string, size: number): HTMLImageElement {
  // Same rule as the page: the nickname if set, otherwise the sub-account's name.
  const displayName =
    nicknames[key]?.nickname?.trim() ||
    (key === debug?.accountKey ? debug.accountName : null) ||
    nicknames[key]?.name ||
    iconOverrides[key]?.name ||
    null;
  const img = el('img', { className: 'icon-preview' });
  img.dataset.key = key;
  img.src = iconDataUrl(resolveIconStyle(key, displayName, iconOverrides[key]));
  img.width = size;
  img.height = size;
  img.alt = '';
  return img;
}

async function saveNickname(key: string, name: string, nickname: string): Promise<void> {
  const next = { ...nicknames };
  if (nickname) next[key] = { name, nickname };
  else delete next[key];
  await nicknamesItem.setValue(next);
}

async function saveIcon(key: string, name: string, change: TabIconOverride): Promise<void> {
  const merged: TabIconOverride = { ...iconOverrides[key], ...change, name };
  const next = { ...iconOverrides };
  if (merged.letter || merged.color) next[key] = merged;
  else delete next[key];
  await iconOverridesItem.setValue(next);
}

/** Nickname and tab icon controls for the sub-account in this tab. */
function renderCurrentAccount(): void {
  accountCurrent.replaceChildren();
  if (!debug?.accountKey || !debug.accountName) return;
  const key = debug.accountKey;
  const name = debug.accountName;
  const location = isLocationKey(key);

  const header = el('div', { className: 'account-header' }, [
    location ? iconImage(key, 28) : null,
    el('span', { className: 'account-name', text: `This tab: ${name}` }),
  ]);

  // Nickname
  const nicknameInput = el('input');
  nicknameInput.type = 'text';
  nicknameInput.placeholder = `Nickname for ${name}`;
  nicknameInput.value = nicknames[key]?.nickname ?? '';
  const saveButton = el('button', { className: 'btn btn-primary btn-small', text: 'Save' });
  saveButton.type = 'button';
  const commitNickname = async () => {
    const nickname = nicknameInput.value.trim();
    await saveNickname(key, name, nickname);
    showStatus(nickname ? 'Nickname saved' : 'Nickname removed');
  };
  saveButton.addEventListener('click', () => void commitNickname());
  nicknameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void commitNickname();
  });

  accountCurrent.append(
    header,
    el('label', { className: 'field-label', text: 'Nickname' }),
    el('div', { className: 'row' }, [nicknameInput, saveButton]),
  );
  if (!location) return;

  // Icon letter
  const override = iconOverrides[key] ?? {};
  const letterInput = el('input');
  letterInput.type = 'text';
  letterInput.maxLength = 2;
  letterInput.className = 'letter-input';
  letterInput.placeholder = defaultIconLetter(nicknames[key]?.nickname?.trim() || name);
  letterInput.value = override.letter ?? '';
  let letterTimer: number | undefined;
  letterInput.addEventListener('input', () => {
    clearTimeout(letterTimer);
    letterTimer = window.setTimeout(async () => {
      await saveIcon(key, name, { letter: cleanIconLetter(letterInput.value) || undefined });
      showStatus('Icon letter saved');
    }, 400);
  });

  // Icon colour: preset swatches plus any colour.
  const current = resolveIconStyle(key, name, override).color;
  const swatches = el('div', { className: 'swatches' });
  for (const color of ICON_PALETTE) {
    const swatch = el('button', { className: 'swatch', title: color });
    swatch.type = 'button';
    swatch.style.background = color;
    if (color === current) swatch.classList.add('selected');
    swatch.addEventListener('click', async () => {
      await saveIcon(key, name, { color });
      showStatus('Icon colour saved');
    });
    swatches.append(swatch);
  }
  const picker = el('input', { title: 'Pick any colour' });
  picker.type = 'color';
  picker.className = 'color-picker';
  picker.value = isHexColor(current) ? current : ICON_PALETTE[0];
  if (!ICON_PALETTE.includes(current as (typeof ICON_PALETTE)[number])) picker.classList.add('selected');
  picker.addEventListener('change', async () => {
    await saveIcon(key, name, { color: picker.value });
    showStatus('Icon colour saved');
  });
  swatches.append(picker);

  const reset = el('button', { className: 'btn btn-small', text: 'Automatic' });
  reset.type = 'button';
  reset.title = 'Go back to the automatic letter and colour';
  reset.addEventListener('click', async () => {
    await saveIcon(key, name, { letter: undefined, color: undefined });
    showStatus('Icon reset');
  });

  accountCurrent.append(
    el('label', { className: 'field-label', text: 'Tab icon' }),
    el('div', { className: 'row icon-row' }, [letterInput, swatches]),
    el('div', { className: 'row icon-actions' }, [reset]),
  );
}

/** Every sub-account with a nickname or icon change, with a button to undo both. */
function renderAccountList(): void {
  accountList.replaceChildren();
  const keys = [...new Set([...Object.keys(nicknames), ...Object.keys(iconOverrides)])];
  const nameOf = (key: string) => nicknames[key]?.name ?? iconOverrides[key]?.name ?? key;
  keys.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  accountEmpty.hidden = keys.length > 0 || Boolean(debug?.accountKey);

  for (const key of keys) {
    const remove = el('button', {
      className: 'btn-remove',
      text: '✕',
      title: 'Remove nickname and icon changes',
    });
    remove.type = 'button';
    remove.addEventListener('click', async () => {
      const nextNicknames = { ...nicknames };
      delete nextNicknames[key];
      const nextIcons = { ...iconOverrides };
      delete nextIcons[key];
      await Promise.all([nicknamesItem.setValue(nextNicknames), iconOverridesItem.setValue(nextIcons)]);
      showStatus('Changes removed');
    });
    accountList.append(
      el('li', {}, [
        isLocationKey(key) ? iconImage(key, 18) : null,
        el('span', { className: 'name', text: nameOf(key) }),
        el('span', { className: 'nick', text: nicknames[key]?.nickname ?? '' }),
        remove,
      ]),
    );
  }
}

function renderAccounts(): void {
  // Don't redraw the inputs while someone is typing in them; just refresh the previews.
  const typing = accountCurrent.contains(document.activeElement) && document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'text';
  if (typing) {
    for (const img of accountCurrent.querySelectorAll<HTMLImageElement>('img.icon-preview')) {
      const key = img.dataset.key;
      if (key) img.src = iconImage(key, img.width).src;
    }
  } else {
    renderCurrentAccount();
  }
  renderAccountList();
}

async function refreshDebugSoon(): Promise<void> {
  // Give the content script a moment to apply the new settings.
  await new Promise((r) => setTimeout(r, 400));
  debug = await loadDebug();
  renderPage();
  renderTemplatePreview();
}

async function init(): Promise<void> {
  const [enabled, template, savedNicknames, tabIcons, savedIcons, pageDebug] = await Promise.all([
    enabledItem.getValue(),
    templateItem.getValue(),
    nicknamesItem.getValue(),
    tabIconsEnabledItem.getValue(),
    iconOverridesItem.getValue(),
    loadDebug(),
  ]);
  debug = pageDebug;
  nicknames = savedNicknames;
  iconOverrides = savedIcons;
  enabledInput.checked = enabled;
  tabIconsInput.checked = tabIcons;
  templateInput.value = template;

  renderPage();
  renderTemplatePreview();
  renderAccounts();

  enabledInput.addEventListener('change', async () => {
    await enabledItem.setValue(enabledInput.checked);
    showStatus(enabledInput.checked ? 'Tab titles on' : 'Tab titles off');
    void refreshDebugSoon();
  });

  tabIconsInput.addEventListener('change', async () => {
    await tabIconsEnabledItem.setValue(tabIconsInput.checked);
    showStatus(tabIconsInput.checked ? 'Letter icons on' : 'Letter icons off');
  });

  let saveTimer: number | undefined;
  templateInput.addEventListener('input', () => {
    renderTemplatePreview();
    clearTimeout(saveTimer);
    if (!hasTokens(templateInput.value)) return;
    saveTimer = window.setTimeout(async () => {
      await templateItem.setValue(templateInput.value);
      showStatus('Format saved');
      void refreshDebugSoon();
    }, 400);
  });

  resetTemplateButton.addEventListener('click', async () => {
    templateInput.value = DEFAULT_TEMPLATE;
    renderTemplatePreview();
    await templateItem.setValue(DEFAULT_TEMPLATE);
    showStatus('Format reset');
    void refreshDebugSoon();
  });

  copyButton.addEventListener('click', async () => {
    if (!debug) return;
    await navigator.clipboard.writeText(JSON.stringify(debug, null, 2));
    showStatus('Debug info copied');
  });

  nicknamesItem.watch((next) => {
    nicknames = next ?? {};
    renderAccounts();
    void refreshDebugSoon();
  });
  iconOverridesItem.watch((next) => {
    iconOverrides = next ?? {};
    renderAccounts();
  });
}

void init();
