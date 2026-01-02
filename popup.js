/**
 * GHL Tab Title - Popup Script
 * Manages domain configuration UI
 */

const DEFAULT_SETTINGS = {
    domains: [],
    enabled: true
};

// DOM Elements
const enableToggle = document.getElementById('enableToggle');
const domainInput = document.getElementById('domainInput');
const addBtn = document.getElementById('addBtn');
const domainList = document.getElementById('domainList');
const statusEl = document.getElementById('status');

/**
 * Load settings from storage
 */
async function loadSettings() {
    const result = await chrome.storage.sync.get('settings');
    return result.settings || DEFAULT_SETTINGS;
}

/**
 * Save settings to storage
 */
async function saveSettings(settings) {
    await chrome.storage.sync.set({ settings });
}

/**
 * Show temporary status message
 */
function showStatus(message, type = 'success') {
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    setTimeout(() => {
        statusEl.className = 'status';
    }, 2500);
}

/**
 * Validate domain format
 */
function isValidDomain(domain) {
    const pattern = /^([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    return pattern.test(domain.trim());
}

/**
 * Render the domain list
 */
function renderDomainList(domains) {
    if (domains.length === 0) {
        domainList.innerHTML = '<div class="empty-state">No domains configured yet</div>';
        return;
    }

    domainList.innerHTML = domains.map(domain => `
    <div class="domain-item" data-domain="${domain}">
      <span class="domain-name">${domain}</span>
      <button class="btn-remove" title="Remove domain">✕</button>
    </div>
  `).join('');

    // Add remove handlers
    domainList.querySelectorAll('.btn-remove').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const item = e.target.closest('.domain-item');
            const domain = item.dataset.domain;
            await removeDomain(domain);
        });
    });
}

/**
 * Add a new domain
 */
async function addDomain() {
    const domain = domainInput.value.trim().toLowerCase();

    if (!domain) {
        showStatus('Please enter a domain', 'error');
        return;
    }

    if (!isValidDomain(domain)) {
        showStatus('Invalid domain format', 'error');
        return;
    }

    const settings = await loadSettings();

    if (settings.domains.includes(domain)) {
        showStatus('Domain already added', 'error');
        return;
    }

    settings.domains.push(domain);
    await saveSettings(settings);

    domainInput.value = '';
    renderDomainList(settings.domains);
    showStatus('Domain added!', 'success');
}

/**
 * Remove a domain
 */
async function removeDomain(domain) {
    const settings = await loadSettings();
    settings.domains = settings.domains.filter(d => d !== domain);
    await saveSettings(settings);
    renderDomainList(settings.domains);
    showStatus('Domain removed', 'success');
}

/**
 * Toggle extension enabled state
 */
async function toggleEnabled() {
    const settings = await loadSettings();
    settings.enabled = enableToggle.checked;
    await saveSettings(settings);
    showStatus(settings.enabled ? 'Enabled' : 'Disabled', 'success');
}

/**
 * Initialize popup
 */
async function init() {
    const settings = await loadSettings();

    enableToggle.checked = settings.enabled;
    renderDomainList(settings.domains);

    // Event listeners
    enableToggle.addEventListener('change', toggleEnabled);
    addBtn.addEventListener('click', addDomain);
    domainInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addDomain();
    });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
