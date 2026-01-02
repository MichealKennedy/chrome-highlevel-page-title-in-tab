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
        defaultBrandName: 'GHL'
    };

    /**
     * Extract location ID from URL path
     */
    function getLocationId() {
        const match = window.location.pathname.match(/\/(?:v2\/)?location\/([^\/]+)/);
        return match ? match[1] : null;
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

    /**
     * Search for element in document and all iframes
     */
    function querySelectorAllFrames(selector) {
        // Try main document first
        let el = document.querySelector(selector);
        if (el) return el;

        // Try iframes
        try {
            const iframes = document.querySelectorAll('iframe');
            for (const iframe of iframes) {
                try {
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
                    if (iframeDoc) {
                        el = iframeDoc.querySelector(selector);
                        if (el) return el;
                    }
                } catch (e) {
                    // Cross-origin iframe, skip
                }
            }
        } catch (e) {
            // Ignore iframe errors
        }

        return null;
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
        if (!window.location.pathname.includes('/contacts/detail/')) {
            return null;
        }

        const selectors = [
            'p.hr-text-semibold span.hr-ellipsis',
            '#hr-ellipsis-id',
            '.hr-ellipsis.hr-ellipsis--line-clamp'
        ];

        for (const selector of selectors) {
            const el = querySelectorAllFrames(selector);
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
     * Extract workflow/automation name from GHL workflow editor page
     * From user's HTML:
     * <h1 class="p-1 editable-header-text font-normal" id="cmp-header__txt--edit-workflow-name">NAME</h1>
     */
    function extractFromGHLWorkflow() {
        if (!window.location.pathname.includes('/workflow')) {
            return null;
        }

        console.log('[GHL Tab Title] On workflow page, searching for name...');

        // Based on actual HTML provided by user
        const selectors = [
            // Exact ID from HTML
            '#cmp-header__txt--edit-workflow-name',
            // Class-based selectors
            'h1.editable-header-text',
            '.editable-header-text',
            // Parent container
            '#cmp-header__txt--edit-workflow-name-parent h1',
            '.workflow-name-input h1',
            // The mirror span that also contains the text
            '.editable-header-text-mirror',
            // Inside the n-ellipsis span
            '.n-ellipsis h1',
            'span.n-ellipsis h1'
        ];

        for (const selector of selectors) {
            const el = querySelectorAllFrames(selector);
            if (el) {
                const text = el.textContent?.trim();
                console.log('[GHL Tab Title] Workflow selector', selector, 'found:', text);
                if (text && text.length > 3 &&
                    text.toLowerCase() !== 'workflow' &&
                    text.toLowerCase() !== 'workflows') {
                    return text;
                }
            }
        }

        // Diagnostic: Check what elements exist
        console.log('[GHL Tab Title] Diagnostic - searching for workflow elements...');

        // Check for the parent ID
        const parent = document.getElementById('cmp-header__txt--edit-workflow-name-parent');
        console.log('[GHL Tab Title] Parent element found:', !!parent, parent?.innerHTML?.substring(0, 100));

        // Check for workflow-name-input class
        const workflowInput = document.querySelector('.workflow-name-input');
        console.log('[GHL Tab Title] workflow-name-input found:', !!workflowInput, workflowInput?.innerHTML?.substring(0, 100));

        // Check all h1s
        const allH1 = document.querySelectorAll('h1');
        console.log('[GHL Tab Title] Total h1 elements found:', allH1.length);
        allH1.forEach((el, i) => {
            console.log(`[GHL Tab Title] h1[${i}]:`, el.id, el.className, '=', el.textContent?.trim()?.substring(0, 50));
        });

        return null;
    }

    /**
     * Extract form name from GHL form builder page
     * From user's HTML:
     * <div class="builder-form-name ..."><div contenteditable="true" class="... truncate">NAME</div></div>
     */
    function extractFromGHLFormBuilder() {
        if (!window.location.pathname.includes('/form-builder') &&
            !window.location.pathname.includes('/forms/')) {
            return null;
        }

        console.log('[GHL Tab Title] On form builder page, searching for name...');

        // Based on actual HTML provided by user
        const selectors = [
            // The contenteditable div inside builder-form-name
            '.builder-form-name > div[contenteditable="true"]',
            '.builder-form-name div[contenteditable="true"]',
            'div.builder-form-name div[contenteditable]',
            // Class patterns from the HTML
            'div[contenteditable="true"].truncate',
            'div.truncate[contenteditable="true"]',
            // Text-lg class
            'div[contenteditable="true"].text-lg',
            '.text-lg[contenteditable="true"]'
        ];

        for (const selector of selectors) {
            const el = querySelectorAllFrames(selector);
            if (el) {
                const text = el.textContent?.trim();
                console.log('[GHL Tab Title] Form selector', selector, 'found:', text);
                if (text && text.length > 1 && text.length < 100 && isHumanReadable(text)) {
                    return text;
                }
            }
        }

        // Diagnostic: Check what elements exist
        console.log('[GHL Tab Title] Diagnostic - searching for form elements...');

        // Check for builder-form-name class
        const formName = document.querySelector('.builder-form-name');
        console.log('[GHL Tab Title] builder-form-name found:', !!formName, formName?.innerHTML?.substring(0, 100));

        // Check for builder-header ID
        const header = document.getElementById('builder-header');
        console.log('[GHL Tab Title] builder-header found:', !!header);

        // Check all contenteditable elements
        const allEditable = document.querySelectorAll('[contenteditable="true"]');
        console.log('[GHL Tab Title] Total contenteditable elements found:', allEditable.length);
        allEditable.forEach((el, i) => {
            console.log(`[GHL Tab Title] editable[${i}]:`, el.className?.substring(0, 50), '=', el.textContent?.trim()?.substring(0, 50));
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
            } catch (e) {
                // Continue
            }
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
            } catch (e) {
                // Continue
            }
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
            } catch (e) {
                // Continue
            }
        }

        return null;
    }

    /**
     * Fallback: extract context from URL path
     */
    function extractFromUrlPath() {
        const path = window.location.pathname;
        const segments = path.split('/').filter(s => s && s.length > 0);

        const skipWords = ['v2', 'location', 'detail', 'edit', 'new', 'form-builder-v2', 'form-builder'];

        for (let i = segments.length - 1; i >= 0; i--) {
            const segment = segments[i];
            if (!/^[0-9a-zA-Z-]{15,}$/i.test(segment) &&
                !skipWords.includes(segment.toLowerCase())) {
                const formatted = formatPathSegment(segment);
                if (formatted.length > 2) {
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
     * Update the document title
     * If in iframe, sends message to parent window
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
        urlObserver.observe(document, { subtree: true, childList: true });

        window.addEventListener('popstate', debouncedUpdate);
        window.addEventListener('hashchange', debouncedUpdate);
    }

    /**
     * Initialize
     */
    function init() {
        console.log('[GHL Tab Title] Initializing on', window.location.hostname);
        console.log('[GHL Tab Title] Location ID:', getLocationId(), '-> Brand:', getBrandName());
        console.log('[GHL Tab Title] Current URL path:', window.location.pathname);

        // Multiple delayed updates with longer waits for Vue hydration
        setTimeout(updateTitle, 500);
        setTimeout(updateTitle, 1500);
        setTimeout(updateTitle, 3000);
        setTimeout(updateTitle, 5000);
        setTimeout(updateTitle, 8000);
        setTimeout(updateTitle, 12000);

        if (document.body) {
            setupObserver();
        } else {
            document.addEventListener('DOMContentLoaded', setupObserver);
        }
    }

    init();
})();
