/**
 * GHL Tab Title - Background Service Worker
 * Handles dynamic content script injection based on user-configured domains
 */

// Default storage structure
const DEFAULT_SETTINGS = {
    domains: [],
    enabled: true
};

/**
 * Get settings from storage
 */
async function getSettings() {
    const result = await chrome.storage.sync.get('settings');
    return result.settings || DEFAULT_SETTINGS;
}

/**
 * Check if a URL matches any configured domain
 */
function matchesDomain(url, domains) {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();

        return domains.some(domain => {
            const normalizedDomain = domain.toLowerCase().trim();
            return hostname === normalizedDomain || hostname.endsWith('.' + normalizedDomain);
        });
    } catch (e) {
        return false;
    }
}

/**
 * Inject content script into a tab and all its iframes
 */
async function injectContentScript(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId, allFrames: true },
            files: ['content.js']
        });
        console.log('[GHL Tab Title] Injected into tab and all frames:', tabId);
    } catch (e) {
        // Tab might not be injectable (chrome://, etc.)
        console.log('[GHL Tab Title] Could not inject into tab:', tabId, e.message);
    }
}

/**
 * Handle tab updates
 */
async function handleTabUpdate(tabId, changeInfo, tab) {
    // Only act on complete page loads or URL changes
    if (changeInfo.status !== 'complete' && !changeInfo.url) return;

    const settings = await getSettings();

    if (!settings.enabled) return;
    if (!tab.url) return;
    if (!matchesDomain(tab.url, settings.domains)) return;

    await injectContentScript(tabId);
}

// Listen for tab updates
chrome.tabs.onUpdated.addListener(handleTabUpdate);

// Listen for settings changes and re-inject if needed
chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== 'sync' || !changes.settings) return;

    const newSettings = changes.settings.newValue || DEFAULT_SETTINGS;

    if (!newSettings.enabled) return;

    // Re-inject into all matching tabs when domains change
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
        if (tab.url && matchesDomain(tab.url, newSettings.domains)) {
            await injectContentScript(tab.id);
        }
    }
});

// Handle extension install/update
chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('[GHL Tab Title] Installed/Updated:', details.reason);

    // Initialize settings if first install
    if (details.reason === 'install') {
        await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
    }
});

console.log('[GHL Tab Title] Service worker initialized');
