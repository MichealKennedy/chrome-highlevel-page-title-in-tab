import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: ({ browser }) => ({
    name: 'GHL Tab Title',
    description:
      'Shows the HighLevel item, section and sub-account you are on in the browser tab title.',
    permissions: ['storage'],
    action: {
      default_title: 'GHL Tab Title',
      // Toolbar button. (The extension icons in public/icon are picked up automatically.)
      default_icon: {
        16: 'toolbar/16.png',
        24: 'toolbar/24.png',
        32: 'toolbar/32.png',
      },
    },
    // Firefox needs an add-on ID for storage.sync. Chrome would warn about the key.
    ...(browser === 'firefox'
      ? { browser_specific_settings: { gecko: { id: 'ghl-tab-title@example.com' } } }
      : {}),
  }),
  // Don't launch a separate browser profile in dev mode. Load .output/chrome-mv3-dev
  // into your own Chrome instead, where you're already signed in to HighLevel.
  webExt: {
    disabled: true,
  },
});
