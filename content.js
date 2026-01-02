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
        updateDebounceMs: 150,
        observerDebounceMs: 100,
        titleSeparator: ' | ',
        locationNames: {
            'IgHEOk98NvraO0gtWVaL': 'FedImpact',
            '8K55T8slMH0JRhCDHBEW': 'ProFeds'
        },
        defaultBrandName: 'GHL',
        // Skip these hosts - they're system iframes, not content
        skipHosts: [
            'firebaseapp.com',
            'googleapis.com',
            'gstatic.com',
            'google.com'
        ]
    };

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
     * Check if we're in a leadconnectorhq.com iframe (the actual content iframes)
     */
    function isContentIframe() {
        const host = window.location.hostname.toLowerCase();
        return host.includes('leadconnectorhq.com');
    }

    /**
     * Extract location ID from URL path (works in both main page and iframes)
     */
    function getLocationId() {
        // Try current window's URL first
        let match = window.location.pathname.match(/\/(?:v2\/)?location\/([^\/]+)/);
        if (match) return match[1];

        // Try getting from referrer
        try {
            if (document.referrer) {
                match = document.referrer.match(/\/(?:v2\/)?location\/([^\/]+)/);
                if (match) return match[1];
            }
        } catch (e) { }

        // Try getting from parent URL (if accessible)
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
        const locationId = getLocationId();
        if (locationId && CONFIG.locationNames[locationId]) {
            return CONFIG.locationNames[locationId];
        }
        return CONFIG.defaultBrandName;
    }

    // Skip execution on system iframes
    if (shouldSkipHost()) {
        console.log('[GHL Tab Title] Skipping system host:', window.location.hostname);
        return;
    }

    /**
     * Extract page context from various UI elements
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
            } catch (e) {
                console.log('[GHL Tab Title] Strategy error:', e);
            }
        }

        return null;
    }

    /**
     * Extract contact name from GHL contact detail page
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
                    console.log('[GHL Tab Title] Contact name found:', text);
                    return text;
                }
            }
        }

        return null;
    }

    /**
     * Extract workflow/automation name
     * Works in both the main page context and the leadconnectorhq.com iframe
     */
    function extractFromGHLWorkflow() {
        const pathname = window.location.pathname;
        const href = window.location.href;

        // Check if we're on a workflow page (either main or iframe)
        const isWorkflowPage = pathname.includes('/workflow') || href.includes('/workflow');
        if (!isWorkflowPage) {
            return null;
        }

        console.log('[GHL Tab Title] On workflow page, searching for name...');
        console.log('[GHL Tab Title] Current host:', window.location.hostname);

        // Selectors for workflow name based on user's HTML
        const selectors = [
            '#cmp-header__txt--edit-workflow-name',
            'h1.editable-header-text',
            '.editable-header-text',
            '#cmp-header__txt--edit-workflow-name-parent h1',
            '.workflow-name-input h1',
            '.editable-header-text-mirror',
            '.n-ellipsis h1',
            'span.n-ellipsis h1',
            // Try any h1 that's not empty
            'h1'
        ];

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                const text = el.textContent?.trim();
                console.log('[GHL Tab Title] Workflow selector', selector, 'found:', text);
                if (text && text.length > 3 &&
                    text.toLowerCase() !== 'workflow' &&
                    text.toLowerCase() !== 'workflows' &&
                    !text.match(/^\d+$/)) {
                    return text;
                }
            }
        }

        // Log what we can find
        console.log('[GHL Tab Title] All h1 elements on page:');
        document.querySelectorAll('h1').forEach((el, i) => {
            console.log(`  h1[${i}]:`, el.id || '(no id)', el.className || '(no class)', '=', el.textContent?.trim()?.substring(0, 50));
        });

        return null;
    }

    /**
     * Extract form name from GHL form builder
     * Works in both the main page context and the leadconnectorhq.com iframe
     */
    function extractFromGHLFormBuilder() {
        const pathname = window.location.pathname;
        const href = window.location.href;

        // Check if we're on a form builder page
        const isFormPage = pathname.includes('/form-builder') || pathname.includes('/forms/') ||
            href.includes('/form-builder') || href.includes('/forms/');
        if (!isFormPage) {
            return null;
        }

        console.log('[GHL Tab Title] On form builder page, searching for name...');
        console.log('[GHL Tab Title] Current host:', window.location.hostname);

        // Selectors based on user's HTML
        const selectors = [
            '.builder-form-name > div[contenteditable="true"]',
            '.builder-form-name div[contenteditable="true"]',
            'div.builder-form-name div[contenteditable]',
            '#builder-header .builder-form-name div[contenteditable]',
            'div[contenteditable="true"].truncate',
            'div.truncate[contenteditable="true"]',
            'div[contenteditable="true"].text-lg',
            // Try any contenteditable div
            'div[contenteditable="true"]'
        ];

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                const text = el.textContent?.trim();
                console.log('[GHL Tab Title] Form selector', selector, 'found:', text);
                if (text && text.length > 1 && text.length < 100 && isHumanReadable(text)) {
                    return text;
                }
            }
        }

        // Log what we can find
        console.log('[GHL Tab Title] All contenteditable elements on page:');
        document.querySelectorAll('[contenteditable="true"]').forEach((el, i) => {
            console.log(`  editable[${i}]:`, el.className?.substring(0, 30) || '(no class)', '=', el.textContent?.trim()?.substring(0, 50));
        });

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
            '[aria-current="page"]',
            '.hl-nav-item.active',
            '.sidebar-item.active'
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
            '[class*="breadcrumb"] span:last-child',
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
        const selectors = [
            'main h1',
            '[role="main"] h1',
            '.page-title',
            '.page-header h1'
        ];

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

        // Skip these common route words and IDs
        const skipWords = ['v2', 'location', 'detail', 'edit', 'new', 'form-builder-v2',
            'form-builder', '__', 'auth', 'iframe', 'callback'];

        for (let i = segments.length - 1; i >= 0; i--) {
            const segment = segments[i];
            // Skip IDs (long alphanumeric) and common route words
            if (!/^[0-9a-zA-Z-]{15,}$/i.test(segment) &&
                !skipWords.includes(segment.toLowerCase())) {
                const formatted = formatPathSegment(segment);
                // Skip very short results
                if (formatted.length > 3) {
                    return formatted;
                }
            }
        }

        return null;
    }

    /**
     * Format a URL path segment into readable text
     */
    function formatPathSegment(segment) {
        return segment
            .replace(/[-_]/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    /**
     * Get clean text content from an element
     */
    function getCleanText(el) {
        if (!el) return null;
        const clone = el.cloneNode(true);
        clone.querySelectorAll('[hidden], .hidden, svg, i').forEach(e => e.remove());
        return clone.textContent?.trim() || null;
    }

    /**
     * Clean context text
     */
    function cleanContext(text) {
        return text
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 60);
    }

    /**
     * Update the document title
     */
    function updateTitle() {
        const context = extractPageContext();
        const brandName = getBrandName();

        if (context) {
            const newTitle = `${context}${CONFIG.titleSeparator}${brandName}`;

            if (isInIframe()) {
                // We're in an iframe - send message to parent
                console.log('[GHL Tab Title] In iframe, sending to parent:', newTitle);
                try {
                    window.parent.postMessage({
                        type: 'GHL_TAB_TITLE_UPDATE',
                        title: newTitle,
                        context: context,
                        brandName: brandName
                    }, '*');
                } catch (e) {
                    console.log('[GHL Tab Title] Could not post to parent:', e);
                }
            } else {
                // We're in the top window - update title directly
                if (document.title !== newTitle) {
                    document.title = newTitle;
                    console.log('[GHL Tab Title] Updated:', newTitle);
                }
            }
        } else {
            console.log('[GHL Tab Title] No context found in this frame');
        }
    }

    /**
     * Listen for messages from iframes (only in top window)
     */
    if (!isInIframe()) {
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'GHL_TAB_TITLE_UPDATE') {
                const newTitle = event.data.title;
                if (newTitle && document.title !== newTitle) {
                    document.title = newTitle;
                    console.log('[GHL Tab Title] Updated from iframe:', newTitle);
                }
            }
        });
    }

    /**
     * Debounce helper
     */
    function debounce(fn, ms) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn.apply(this, args), ms);
        };
    }

    const debouncedUpdate = debounce(updateTitle, CONFIG.updateDebounceMs);

    /**
     * Set up MutationObserver
     */
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
        const urlObserver = new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                debouncedUpdate();
            }
        });
        urlObserver.observe(document.documentElement, { subtree: true, childList: true });

        window.addEventListener('popstate', debouncedUpdate);
        window.addEventListener('hashchange', debouncedUpdate);
    }

    /**
     * Initialize
     */
    function init() {
        console.log('[GHL Tab Title] Initializing on', window.location.hostname);
        console.log('[GHL Tab Title] Is iframe:', isInIframe());
        console.log('[GHL Tab Title] Is content iframe:', isContentIframe());
        console.log('[GHL Tab Title] Location ID:', getLocationId(), '-> Brand:', getBrandName());
        console.log('[GHL Tab Title] Current URL path:', window.location.pathname);

        // Multiple delayed updates with longer waits for Vue hydration
        setTimeout(updateTitle, 500);
        setTimeout(updateTitle, 1500);
        setTimeout(updateTitle, 3000);
        setTimeout(updateTitle, 5000);
        setTimeout(updateTitle, 8000);

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
