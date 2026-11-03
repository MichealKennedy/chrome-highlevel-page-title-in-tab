import { browser } from '#imports';
import type { GetDebugMessage } from '@/lib/messages';
import { enabledItem, nicknamesItem, templateItem } from '@/lib/storage';
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
const nicknameCurrent = $('nickname-current');
const nicknameList = $('nickname-list');
const nicknameEmpty = $('nickname-empty');
const statusEl = $('status');

/** Sample parts for the format preview when the current tab isn't HighLevel. */
const SAMPLE_PARTS: TitleParts = { item: ['John Doe'], section: 'Contacts', account: 'Acme Training' };

let debug: DebugInfo | null = null;
let nicknames: Record<string, Nickname> = {};
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

function renderNicknames(): void {
  nicknameCurrent.replaceChildren();
  if (debug?.accountKey && debug.accountName) {
    const key = debug.accountKey;
    const input = el('input');
    input.type = 'text';
    input.placeholder = `Nickname for ${debug.accountName}`;
    input.value = nicknames[key]?.nickname ?? '';
    const save = el('button', { className: 'btn btn-primary btn-small', text: 'Save' });
    save.type = 'button';
    const commit = async () => {
      const nickname = input.value.trim();
      const next = { ...nicknames };
      if (nickname) next[key] = { name: debug?.accountName ?? key, nickname };
      else delete next[key];
      await nicknamesItem.setValue(next);
      showStatus(nickname ? 'Nickname saved' : 'Nickname removed');
    };
    save.addEventListener('click', () => void commit());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void commit();
    });
    nicknameCurrent.append(
      el('p', { className: 'nickname-current-label muted', text: `This tab: ${debug.accountName}` }),
      el('div', { className: 'row' }, [input, save]),
    );
  }

  nicknameList.replaceChildren();
  const entries = Object.entries(nicknames).sort(([, a], [, b]) => a.name.localeCompare(b.name));
  nicknameEmpty.hidden = entries.length > 0 || Boolean(debug?.accountKey);
  for (const [key, entry] of entries) {
    const remove = el('button', { className: 'btn-remove', text: '✕', title: 'Remove nickname' });
    remove.type = 'button';
    remove.addEventListener('click', async () => {
      const next = { ...nicknames };
      delete next[key];
      await nicknamesItem.setValue(next);
      showStatus('Nickname removed');
    });
    nicknameList.append(
      el('li', {}, [
        el('span', { className: 'name', text: entry.name }),
        el('span', { className: 'nick', text: entry.nickname }),
        remove,
      ]),
    );
  }
}

async function refreshDebugSoon(): Promise<void> {
  // Give the content script a moment to apply the new settings.
  await new Promise((r) => setTimeout(r, 400));
  debug = await loadDebug();
  renderPage();
  renderTemplatePreview();
}

async function init(): Promise<void> {
  const [enabled, template, savedNicknames, pageDebug] = await Promise.all([
    enabledItem.getValue(),
    templateItem.getValue(),
    nicknamesItem.getValue(),
    loadDebug(),
  ]);
  debug = pageDebug;
  nicknames = savedNicknames;
  enabledInput.checked = enabled;
  templateInput.value = template;

  renderPage();
  renderTemplatePreview();
  renderNicknames();

  enabledInput.addEventListener('change', async () => {
    await enabledItem.setValue(enabledInput.checked);
    showStatus(enabledInput.checked ? 'Tab titles on' : 'Tab titles off');
    void refreshDebugSoon();
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
    nicknames = next;
    renderNicknames();
    void refreshDebugSoon();
  });
}

void init();
