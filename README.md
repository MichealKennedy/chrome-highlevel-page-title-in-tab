# GHL Tab Title

A Chrome extension (Firefox-ready) that puts what you're looking at in HighLevel into the browser tab title:

| Page | Tab title |
| --- | --- |
| A contact | `John Doe \| Contacts \| Acme Training` |
| A smart list | `Hot Leads \| Smart Lists \| Acme Training` |
| A form in the builder | `Seminar Signup \| Forms \| Acme Training` |
| A workflow | `New Lead Follow-up \| Workflows \| Acme Training` |
| A funnel step | `Step 2 \| Webinar Funnel \| Funnels \| Acme Training` |
| A list page | `Inbox \| Acme Training` |
| An agency page | `Sub-Accounts \| Acme Agency` |

It works on any HighLevel domain (white-label or not) without setup. It recognises HighLevel from the page itself and does nothing on other sites.

Built with [WXT](https://wxt.dev) and TypeScript.

## Install (load unpacked)

1. Install [Node.js](https://nodejs.org) 22+ and [pnpm](https://pnpm.io).
2. Build:
   ```sh
   pnpm install
   pnpm build
   ```
3. In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose the `.output/chrome-mv3` folder.
4. Reload any HighLevel tabs that were already open.

After pulling changes, run `pnpm build` again and click the reload icon on the extension's card in `chrome://extensions`. Then reload your HighLevel tabs.

> **Upgrading from version 1:** remove the old "GHL Tab Title" from `chrome://extensions` first. Version 1 was loaded from the repository folder itself, which no longer contains a `manifest.json`.

## The popup

- **On/off switch:** turns tab titles off and restores HighLevel's own titles.
- **This tab:** what the extension detected on the current page: item, section, account, the page rule that matched and where each value came from. **Copy debug info** copies all of it as JSON. Paste that into an issue when something looks wrong.
- **Title format:** edit the pattern using `{item}`, `{section}` and `{account}`. Empty parts are left out along with their separator, and multi-part items (a step inside a funnel) are joined with your separator.
- **Nicknames:** give a sub-account (or the agency) a shorter name for the tab title, e.g. `AT` for Acme Training.

## How it works

- **Section:** comes from HighLevel's breadcrumb. When an item is open, it's the module (`Conversations`); on list pages, it's the last breadcrumb (`Inbox`).
- **Sub-account:** read from the sidebar header. Agency pages use the agency name.
- **Item:** each page type has a rule in [`lib/routes.ts`](lib/routes.ts) that says where its name is shown.
  - Forms, surveys, quizzes, workflows and calendars live inside embedded frames from `*.leadconnectorhq.com`. A copy of the content script runs in those frames ([`lib/frames.ts`](lib/frames.ts)) and reports the name through the background script to the page.
- **Holding the title:** HighLevel sets its own titles as you navigate. The extension watches for that and puts its title back.

| File | What it does |
| --- | --- |
| [`entrypoints/content.ts`](entrypoints/content.ts) | Content script entry (top page and frames) |
| [`lib/top-frame.ts`](lib/top-frame.ts) | Detects HighLevel, watches for changes, sets the title |
| [`lib/page.ts`](lib/page.ts) | Reads breadcrumb, sub-account and agency from the page |
| [`lib/routes.ts`](lib/routes.ts) | Page rules: where each item name lives |
| [`lib/resolve.ts`](lib/resolve.ts) | Combines everything into item, section and account |
| [`lib/title.ts`](lib/title.ts) | Fills the title format |
| [`lib/child-frame.ts`](lib/child-frame.ts) | Runs inside HighLevel's embedded app frames |
| [`entrypoints/background.ts`](entrypoints/background.ts) | Relays names from frames to the page |
| [`entrypoints/popup/`](entrypoints/popup/) | Popup UI |

## When HighLevel changes its UI

1. Open the popup on the broken page and look at **This tab**. It shows which rule matched and which value is missing.
2. Find the new element in Chrome DevTools and update its selector in [`lib/routes.ts`](lib/routes.ts) (top page) or [`lib/frames.ts`](lib/frames.ts) (embedded frames).
3. Update the matching markup in [`tests/fixtures.ts`](tests/fixtures.ts), run `pnpm test`, then `pnpm build`.

## Development

```sh
pnpm dev        # builds .output/chrome-mv3-dev and rebuilds on save
pnpm test       # unit tests (Vitest + happy-dom)
pnpm compile    # type check
pnpm build      # production build in .output/chrome-mv3
pnpm zip        # zip for sharing
```

`pnpm dev` doesn't open a browser. Load `.output/chrome-mv3-dev` unpacked in your own Chrome, where you're signed in to HighLevel, and it reloads itself as you edit.

### Firefox

`pnpm build:firefox` produces `.output/firefox-mv3`. It hasn't been tested in Firefox yet.

One known gap: Firefox lacks `location.ancestorOrigins`, so a frame identifies its page from the referrer, which is its immediate parent. A HighLevel frame nested inside another frame may not be recognised there.

## Known limits

- **Smart lists in narrow windows:** HighLevel can tuck the open smart list into its "N More" menu. The extension then uses the name it saw last time for that list. If it has never seen it, the title is `Smart Lists | Acme Training`.
- **Tabs opened before installing or updating** need a reload before the extension can see them.
