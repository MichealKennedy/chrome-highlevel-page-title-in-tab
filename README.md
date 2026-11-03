# GHL Tab Title

A Chrome extension (Firefox-ready) that puts what you're looking at in HighLevel into the browser tab title:

| Page | Tab title |
| --- | --- |
| A contact | `John Doe \| Contacts \| Acme Training` |
| A smart list | `Hot Leads \| Smart Lists \| Acme Training` |
| A form in the builder | `Seminar Signup \| Forms \| Acme Training` |
| A workflow | `New Lead Follow-up \| Workflows \| Acme Training` |
| A funnel step | `Step 2 \| Webinar Funnel \| Funnels \| Acme Training` |
| An invoice | `INV-000042 Consultation Fee \| Invoices & Estimates \| Acme Training` |
| A list page | `Inbox \| Acme Training` |
| An agency page | `Sub-Accounts \| Acme Agency` |

It also gives each sub-account its own letter tab icon, so tabs can be told apart even when their titles are cut off. If a page stops looking the way the extension expects, a **!** appears on its toolbar icon.

It works on any HighLevel domain (white-label or not) without setup. It recognises HighLevel from the page itself and does nothing on other sites.

Built with [WXT](https://wxt.dev) and TypeScript.

## Install

### From a release (no tools needed)

1. Download `ghl-tab-title-<version>-chrome.zip` from the [latest release](../../releases/latest) and unzip it into a folder you'll keep, e.g. `Documents\GHL Tab Title`.
2. In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and choose that folder.
3. Reload any HighLevel tabs that were already open.

To update, unzip the new release into the same folder (replacing the files), click the reload icon on the extension's card in `chrome://extensions`, then reload your HighLevel tabs.

### From source

1. Install [Node.js](https://nodejs.org) 22+ and [pnpm](https://pnpm.io).
2. Build:
   ```sh
   pnpm install
   pnpm build
   ```
3. Load the `.output/chrome-mv3` folder unpacked as above.

After pulling changes, run `pnpm build` again and reload the extension and your HighLevel tabs.

> **Upgrading from version 1:** remove the old "GHL Tab Title" from `chrome://extensions` first. Version 1 was loaded from the repository folder itself, which no longer contains a `manifest.json`.

## The popup

- **On/off switch:** turns tab titles off and restores HighLevel's own titles.
- **This tab:** what the extension detected on the current page: item, section, account, the page rule that matched and where each value came from. If something is missing, a warning explains what. **Copy debug info** copies all of it as JSON. Paste that into an issue when something looks wrong.
- **Title format:** edit the pattern using `{item}`, `{section}` and `{account}`. Empty parts are left out along with their separator, and multi-part items (a step inside a funnel) are joined with your separator.
- **Sub-accounts:** for the sub-account in the current tab:
  - **Nickname:** a shorter name for the tab title, e.g. `AT` for Acme Training. Works for the agency too.
  - **Tab icon:** the letter (1–2 characters) and background colour of its tab icon. Pick a preset or any colour; **Automatic** goes back to the default.
  - **Letter icons** turns the tab icons off everywhere and brings back HighLevel's own icon.

## How it works

- **Section:** comes from HighLevel's breadcrumb. When an item is open, it's the module (`Conversations`); on list pages, it's the last breadcrumb (`Inbox`).
- **Sub-account:** read from the sidebar header. Agency pages use the agency name.
- **Item:** each page type has a rule in [`lib/routes.ts`](lib/routes.ts) that says where its name is shown.
  - Forms, surveys, quizzes, workflows and calendars live inside embedded frames from `*.leadconnectorhq.com`. A copy of the content script runs in those frames ([`lib/frames.ts`](lib/frames.ts)) and reports the name through the background script to the page.
- **Holding the title:** HighLevel sets its own titles as you navigate. The extension watches for that and puts its title back.
- **Tab icons:** each sub-account gets a colour picked from its location ID and the first letter of its nickname or name ([`lib/icon.ts`](lib/icon.ts)). Agency pages keep HighLevel's icon.
- **Warning badge:** each page rule can say what the page should always show. If it's still missing 15 seconds after the page opens (a contact page with no contact name, say), the toolbar icon shows **!** for that tab and the popup says what's missing.

| File | What it does |
| --- | --- |
| [`entrypoints/content.ts`](entrypoints/content.ts) | Content script entry (top page and frames) |
| [`lib/top-frame.ts`](lib/top-frame.ts) | Detects HighLevel, watches for changes, sets the title |
| [`lib/page.ts`](lib/page.ts) | Reads breadcrumb, sub-account and agency from the page |
| [`lib/routes.ts`](lib/routes.ts) | Page rules: where each item name lives |
| [`lib/resolve.ts`](lib/resolve.ts) | Combines everything into item, section and account |
| [`lib/title.ts`](lib/title.ts) | Fills the title format |
| [`lib/child-frame.ts`](lib/child-frame.ts) | Runs inside HighLevel's embedded app frames |
| [`lib/icon.ts`](lib/icon.ts) | Letter tab icons |
| [`entrypoints/background.ts`](entrypoints/background.ts) | Relays names from frames to the page; shows the warning badge |
| [`entrypoints/popup/`](entrypoints/popup/) | Popup UI |

## When HighLevel changes its UI

1. A **!** on the toolbar icon usually means it's happened. Open the popup on that page and look at **This tab**. It shows which rule matched and which value is missing.
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

### Checks and releases

- Every pull request and push to `main` runs the type check, tests and build on GitHub ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).
- To release, bump `version` in `package.json`. When that reaches `main`, GitHub builds the Chrome zip and publishes a release `v<version>` with it attached ([`.github/workflows/release.yml`](.github/workflows/release.yml)). Merges that don't change the version don't publish anything.

### Firefox

`pnpm build:firefox` produces `.output/firefox-mv3`. It hasn't been tested in Firefox yet.

One known gap: Firefox lacks `location.ancestorOrigins`, so a frame identifies its page from the referrer, which is its immediate parent. A HighLevel frame nested inside another frame may not be recognised there.

## Known limits

- **Smart lists in narrow windows:** HighLevel can tuck the open smart list into its "N More" menu. The extension then uses the name it saw last time for that list. If it has never seen it, the title is `Smart Lists | Acme Training`.
- **Social planner:** only the section is shown (`Social Planner | Acme Training`). No sub-account had it set up, so there was nothing to name yet.
- **Slow pages:** if a page takes longer than 15 seconds to show its item name, the **!** can appear briefly and then clear itself.
- **Tabs opened before installing or updating** need a reload before the extension can see them.
