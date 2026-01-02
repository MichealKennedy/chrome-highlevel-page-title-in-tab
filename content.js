/**
 * GHL Tab Title - Content Script
 * Detects GoHighLevel page context and updates tab title accordingly
 */

(function () {
    'use strict';

    // Prevent multiple injections
    if (window.__ghlTabTitleInjected) return;
    window.__ghlTabTitleInjected = true;

    // Configuration
    const CONFIG = {
        updateDebounceMs: 200,
        observerDebounceMs: 150,
        titleSeparator: ' | ',
        locationNames: {
            'IgHEOk98NvraO0gtWVaL': 'FedImpact',
            '8K55T8slMH0JRhCDHBEW': 'ProFeds'
        },
        defaultBrandName: 'GHL',
        skipHosts: [
            'firebaseapp.com',
            'googleapis.com',
            'gstatic.com',
            'google.com'
        ]
    };

    // Cache for brand name (can be set by parent window)
    let cachedBrandName = null;

    /**
     * Check if current host should be skipped
     */
    function shouldSkipHost() {
        const host = window.location.hostname.toLowerCase();
        return CONFIG.skipHosts.some(skip => host.includes(skip));
    }

    /**
     * Check if we're running in an iframe
     */
    function isInIframe() {
        try {
            return window.self !== window.top;
        } catch (e) {
            return true;
        }
    }

    /**
     * Check if we're in a leadconnectorhq.com iframe
     */
    function isContentIframe() {
        const host = window.location.hostname.toLowerCase();
        return host.includes('leadconnectorhq.com');
    }

    /**
     * Extract location ID from URL path
     */
    function getLocationId() {
        // Try current window's URL
        let match = window.location.pathname.match(/\/(?:v2\/)?location\/([^\/]+)/);
        if (match) return match[1];

        // Try referrer (often contains the parent URL)
        try {
            if (document.referrer) {
                match = document.referrer.match(/\/(?:v2\/)?location\/([^\/]+)/);
                if (match) return match[1];
            }
        } catch (e) { }

        // Try parent URL (only works for same-origin)
        try {
            if (window.parent !== window) {
                match = window.parent.location.pathname.match(/\/(?:v2\/)?location\/([^\/]+)/);
                if (match) return match[1];
            }
        } catch (e) { }

        return null;
    }

    /**
     * Get brand name based on location ID
     */
    function getBrandName() {
        // Use cached value if available (set by parent)
        if (cachedBrandName) return cachedBrandName;

        const locationId = getLocationId();
        if (locationId && CONFIG.locationNames[locationId]) {
            cachedBrandName = CONFIG.locationNames[locationId];
            return cachedBrandName;
        }
        return CONFIG.defaultBrandName;
    }

    // Skip execution on system iframes
    if (shouldSkipHost()) {
        return;
    }

    /**
     * Extract page context
     */
    function extractPageContext() {
        const strategies = [
            extractFromGHLContactDetail,
            extractFromGHLWorkflow,
            extractFromGHLFormBuilder,
            extractFromActiveNavItem,
            extractFromBreadcrumb,
            extractFromPageHeader,
            extractFromUrlPath
        ];

        for (const strategy of strategies) {
            try {
                const context = strategy();
                if (context && context.trim()) {
                    return cleanContext(context);
                }
            } catch (e) { }
        }

        return null;
    }

    /**
     * Extract contact name
     */
    function extractFromGHLContactDetail() {
        if (!window.location.pathname.includes('/contacts/detail/') &&
            !window.location.href.includes('/contacts/detail/')) {
            return null;
        }

        const selectors = [
            'p.hr-text-semibold span.hr-ellipsis',
            '#hr-ellipsis-id',
            '.hr-ellipsis.hr-ellipsis--line-clamp'
        ];

        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) {
                const text = el.textContent?.trim();
                if (text && text.length > 1 && text.length < 100) {
                    return text;
                }
            }
        }
        return null;
    }

    /**
     * Extract workflow/automation name
     */
    function extractFromGHLWorkflow() {
        const pathname = window.location.pathname;
        if (!pathname.includes('/workflow')) {
            return null;
        }

        const selectors = [
            '#cmp-header__txt--edit-workflow-name',
            'h1.editable-header-text',
            '.editable-header-text',
            '.workflow-name-input h1',
            '.editable-header-text-mirror',
            '.n-ellipsis h1'
        ];

        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) {
                const text = el.textContent?.trim();
                if (text && text.length > 3 &&
                    text.toLowerCase() !== 'workflow' &&
                    text.toLowerCase() !== 'workflows') {
                    return text;
                }
            }
        }
        return null;
    }

    /**
     * Extract form name
     */
    function extractFromGHLFormBuilder() {
        const pathname = window.location.pathname;
        if (!pathname.includes('/form-builder') && !pathname.includes('/forms/')) {
            return null;
        }

        const selectors = [
            '.builder-form-name > div[contenteditable="true"]',
            '.builder-form-name div[contenteditable="true"]',
            'div[contenteditable="true"].truncate',
            'div[contenteditable="true"].text-lg'
        ];

        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) {
                const text = el.textContent?.trim();
                if (text && text.length > 1 && text.length < 100 && isHumanReadable(text)) {
                    return text;
                }
            }
        }
        return null;
    }

    /**
     * Check if text is human readable
     */
    function isHumanReadable(text) {
        if (!text || text.length < 2) return false;
        const noSpaces = text.replace(/\s/g, '');
        if (/^[A-Za-z0-9]{15,}$/.test(noSpaces) && !/\s/.test(text)) {
            return false;
        }
        return true;
    }

    /**
     * Look for active navigation menu items
     */
    function extractFromActiveNavItem() {
        const selectors = [
            '[class*="active"] [class*="menu-item-text"]',
            '[class*="active"] [class*="nav-text"]',
            '.nav-link.active',
            '[aria-current="page"]'
        ];

        for (const selector of selectors) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) {
                    const text = getCleanText(el);
                    if (text && text.length > 1 && text.length < 50 && isHumanReadable(text)) {
                        return text;
                    }
                }
            } catch (e) { }
        }
        return null;
    }

    /**
     * Look for breadcrumb navigation
     */
    function extractFromBreadcrumb() {
        const selectors = [
            '[class*="breadcrumb"] li:last-child',
            '.breadcrumb-item:last-child'
        ];

        for (const selector of selectors) {
            try {
                const el = document.querySelector(selector);
                if (el) {
                    const text = getCleanText(el);
                    if (text && text.length > 1 && text.length < 50 && isHumanReadable(text)) {
                        return text;
                    }
                }
            } catch (e) { }
        }
        return null;
    }

    /**
     * Look for page headers
     */
    function extractFromPageHeader() {
        const selectors = ['main h1', '[role="main"] h1', '.page-title'];

        for (const selector of selectors) {
            try {
                const el = document.querySelector(selector);
                if (el) {
                    const text = getCleanText(el);
                    if (text && text.length > 1 && text.length < 60 && isHumanReadable(text)) {
                        return text;
                    }
                }
            } catch (e) { }
        }
        return null;
    }

    /**
     * Fallback: extract context from URL path
     */
    function extractFromUrlPath() {
        const path = window.location.pathname;
        const segments = path.split('/').filter(s => s && s.length > 0);
        const skipWords = ['v2', 'location', 'detail', 'edit', 'new', 'form-builder-v2',
            'form-builder', '__', 'auth', 'iframe', 'callback'];

        for (let i = segments.length - 1; i >= 0; i--) {
            const segment = segments[i];
            if (!/^[0-9a-zA-Z-]{15,}$/i.test(segment) &&
                !skipWords.includes(segment.toLowerCase())) {
                const formatted = formatPathSegment(segment);
                if (formatted.length > 3) {
                    return formatted;
                }
            }
        }
        return null;
    }

    function formatPathSegment(segment) {
        return segment
            .replace(/[-_]/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    function getCleanText(el) {
        if (!el) return null;
        const clone = el.cloneNode(true);
        clone.querySelectorAll('[hidden], .hidden, svg, i').forEach(e => e.remove());
        return clone.textContent?.trim() || null;
    }

    function cleanContext(text) {
        return text.replace(/\s+/g, ' ').trim().substring(0, 60);
    }

    /**
     * Update the document title
     */
    function updateTitle() {
        const context = extractPageContext();
        if (!context) return;

        const brandName = getBrandName();
        const newTitle = `${context}${CONFIG.titleSeparator}${brandName}`;

        if (isInIframe()) {
            // Send to parent window
            try {
                window.parent.postMessage({
                    type: 'GHL_TAB_TITLE_UPDATE',
                    title: newTitle,
                    context: context,
                    brandName: brandName
                }, '*');
            } catch (e) { }
        } else {
            // Update directly
            if (document.title !== newTitle) {
                document.title = newTitle;
            }
        }
    }

    /**
     * Listen for messages (in top window)
     */
    if (!isInIframe()) {
        window.addEventListener('message', (event) => {
            if (event.data?.type === 'GHL_TAB_TITLE_UPDATE') {
                // Prioritize iframe updates - they have the real content
                const newTitle = event.data.title;
                if (newTitle) {
                    document.title = newTitle;
                }
            } else if (event.data?.type === 'GHL_REQUEST_BRAND') {
                // Child iframe requesting brand info
                const brandName = getBrandName();
                const locationId = getLocationId();
                event.source.postMessage({
                    type: 'GHL_BRAND_INFO',
                    brandName: brandName,
                    locationId: locationId
                }, '*');
            }
        });
    }

    /**
     * Listen for brand info from parent (in iframes)
     */
    if (isInIframe()) {
        window.addEventListener('message', (event) => {
            if (event.data?.type === 'GHL_BRAND_INFO') {
                cachedBrandName = event.data.brandName;
                // Re-run update with new brand
                updateTitle();
            }
        });

        // Request brand info from parent
        try {
            window.parent.postMessage({ type: 'GHL_REQUEST_BRAND' }, '*');
        } catch (e) { }
    }

    function debounce(fn, ms) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn.apply(this, args), ms);
        };
    }

    const debouncedUpdate = debounce(updateTitle, CONFIG.updateDebounceMs);

    function setupObserver() {
        if (!document.body) return;

        const observer = new MutationObserver(debounce(() => {
            debouncedUpdate();
        }, CONFIG.observerDebounceMs));

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'aria-current', 'aria-selected', 'data-active']
        });

        let lastUrl = location.href;
        new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                debouncedUpdate();
            }
        }).observe(document.documentElement, { subtree: true, childList: true });

        window.addEventListener('popstate', debouncedUpdate);
        window.addEventListener('hashchange', debouncedUpdate);
    }

    function init() {
        // Delayed updates to catch Vue hydration
        setTimeout(updateTitle, 300);
        setTimeout(updateTitle, 1000);
        setTimeout(updateTitle, 2500);
        setTimeout(updateTitle, 5000);

        if (document.body) {
            setupObserver();
        } else {
            document.addEventListener('DOMContentLoaded', () => {
                setupObserver();
                updateTitle();
            });
        }
    }

    init();
})();
