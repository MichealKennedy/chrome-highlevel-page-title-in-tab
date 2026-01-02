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
        // Location ID to brand name mapping
        locationNames: {
            'IgHEOk98NvraO0gtWVaL': 'FedImpact',
            '8K55T8slMH0JRhCDHBEW': 'ProFeds'
        },
        defaultBrandName: 'GHL'
    };

    /**
     * Extract location ID from URL path
     * URL pattern: /v2/location/{locationId}/...
     */
    function getLocationId() {
        const match = window.location.pathname.match(/\/v2\/location\/([^\/]+)/);
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
     * Extract page context from various UI elements
     * Priority: GHL-specific selectors first, then generic fallbacks
     */
    function extractPageContext() {
        const strategies = [
            // GHL-specific high-priority extractors
            extractFromGHLContactDetail,
            extractFromGHLWorkflow,
            extractFromGHLFormBuilder,
            extractFromGHLSurveyBuilder,
            // Generic fallbacks
            extractFromActiveNavItem,
            extractFromBreadcrumb,
            extractFromPageHeader,
            extractFromUrlPath
        ];

        for (const strategy of strategies) {
            const context = strategy();
            if (context && context.trim()) {
                return cleanContext(context);
            }
        }

        return null;
    }

    /**
     * Extract contact name from GHL contact detail page
     * URL pattern: /contacts/detail/{id}
     */
    function extractFromGHLContactDetail() {
        // Check if we're on a contact detail page
        if (!window.location.pathname.includes('/contacts/detail/')) {
            return null;
        }

        // Selector for contact name - the span with hr-ellipsis inside the p.hr-text-semibold
        const selectors = [
            'p.hr-text-semibold span.hr-ellipsis',
            'p.hr-text-semibold #hr-ellipsis-id',
            '#hr-ellipsis-id',
            '.hr-ellipsis.hr-ellipsis--line-clamp'
        ];

        for (const selector of selectors) {
            try {
                const el = document.querySelector(selector);
                if (el) {
                    const text = el.textContent?.trim();
                    // Validate it looks like a name (not gibberish)
                    if (text && text.length > 1 && text.length < 100 && /^[A-Za-z\s\-'\.]+$/.test(text)) {
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
     * Extract workflow/automation name from GHL workflow editor page
     * URL pattern: /workflows/ or contains workflow in path
     */
    function extractFromGHLWorkflow() {
        // Check if we're on a workflow page
        if (!window.location.pathname.includes('/workflow')) {
            return null;
        }

        // More specific selector for the actual workflow name h1
        const selectors = [
            'h1#cmp-header__txt--edit-workflow-name',
            'h1.editable-header-text',
            '.workflow-name-input h1.editable-header-text',
            'p.workflow-name-input h1'
        ];

        for (const selector of selectors) {
            try {
                const el = document.querySelector(selector);
                if (el) {
                    const text = el.textContent?.trim();
                    // Skip if it's just "Workflow" or too short
                    if (text && text.length > 1 && text.length < 100 && text.toLowerCase() !== 'workflow') {
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
     * Extract form name from GHL form builder page
     * URL pattern: /forms/ or form builder
     */
    function extractFromGHLFormBuilder() {
        // Check if we're on a form builder page
        if (!window.location.pathname.includes('/form')) {
            return null;
        }

        // More specific selector - the contenteditable div inside builder-form-name
        const selectors = [
            'div.builder-form-name div[contenteditable="true"]',
            'div.builder-form-name div.truncate[contenteditable]'
        ];

        for (const selector of selectors) {
            try {
                const el = document.querySelector(selector);
                if (el) {
                    const text = el.textContent?.trim();
                    // Validate text is readable (not encoded/gibberish)
                    if (text && text.length > 1 && text.length < 100 && isReadableText(text)) {
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
     * Extract survey name from GHL survey builder page
     */
    function extractFromGHLSurveyBuilder() {
        // Check if we're on a survey builder page
        if (!window.location.pathname.includes('/survey')) {
            return null;
        }

        const selectors = [
            'div.builder-form-name div[contenteditable="true"]',
            '.survey-name-input',
            '.survey-header input'
        ];

        for (const selector of selectors) {
            try {
                const el = document.querySelector(selector);
                if (el) {
                    const text = (el.value || el.textContent)?.trim();
                    if (text && text.length > 1 && text.length < 100 && isReadableText(text)) {
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
     * Check if text is readable (not encoded/gibberish)
     */
    function isReadableText(text) {
        if (!text) return false;
        // Check for common readable patterns - should mostly be alphanumeric, spaces, and common punctuation
        const readableChars = text.match(/[a-zA-Z0-9\s\.\,\!\?\-\'\"\:\;\/\(\)\[\]]/g);
        if (!readableChars) return false;
        // At least 70% should be readable characters
        return (readableChars.length / text.length) >= 0.7;
    }

    /**
     * Look for active navigation menu items
     */
    function extractFromActiveNavItem() {
        // Common selectors for active nav items in GHL
        const selectors = [
            // Sidebar active items
            '[class*="active"] [class*="menu-item-text"]',
            '[class*="active"] [class*="nav-text"]',
            '.nav-link.active',
            '[aria-current="page"]',
            '[data-active="true"]',
            // GHL specific patterns
            '.hl-nav-item.active',
            '.sidebar-item.active',
            // Generic active menu patterns
            'nav .active',
            '.menu .active',
            '[role="menuitem"][aria-selected="true"]'
        ];

        for (const selector of selectors) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) {
                    const text = getCleanText(el);
                    if (text && text.length > 1 && text.length < 50 && isReadableText(text)) {
                        return text;
                    }
                }
            } catch (e) {
                // Selector might be invalid, continue
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
            '.breadcrumb-item:last-child',
            '[aria-label*="breadcrumb"] li:last-child'
        ];

        for (const selector of selectors) {
            try {
                const el = document.querySelector(selector);
                if (el) {
                    const text = getCleanText(el);
                    if (text && text.length > 1 && text.length < 50 && isReadableText(text)) {
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
     * Look for page headers (h1, main headings)
     */
    function extractFromPageHeader() {
        const selectors = [
            'main h1',
            '[role="main"] h1',
            '.page-title',
            '.page-header h1',
            '[class*="page-title"]',
            '[class*="header-title"]'
        ];

        for (const selector of selectors) {
            try {
                const el = document.querySelector(selector);
                if (el) {
                    const text = getCleanText(el);
                    if (text && text.length > 1 && text.length < 60 && isReadableText(text)) {
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
        const hash = window.location.hash;

        // Try hash first (common in SPAs)
        if (hash && hash.length > 1) {
            const hashPath = hash.replace(/^#\/?/, '').split('/')[0];
            if (hashPath && !/^[0-9a-f-]{20,}$/i.test(hashPath)) {
                return formatPathSegment(hashPath);
            }
        }

        // Use pathname - find meaningful segment
        const segments = path.split('/').filter(s => s && s.length > 0);
        if (segments.length > 0) {
            // Get the most meaningful segment (skip IDs and "v2", "location")
            const skipWords = ['v2', 'location', 'detail', 'edit', 'new'];
            for (let i = segments.length - 1; i >= 0; i--) {
                const segment = segments[i];
                // Skip segments that look like IDs or common route words
                if (!/^[0-9a-f-]{20,}$/i.test(segment) && !skipWords.includes(segment.toLowerCase())) {
                    return formatPathSegment(segment);
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

        // Clone to avoid modifying the DOM
        const clone = el.cloneNode(true);

        // Remove hidden elements and icons
        clone.querySelectorAll('[hidden], .hidden, [class*="icon"], svg, i').forEach(e => e.remove());

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
     * Update the document title - modifies existing title element only
     */
    function updateTitle() {
        const context = extractPageContext();
        const brandName = getBrandName();

        if (context) {
            // Page name first, location/brand name last (e.g., "Crystal Johnson | FedImpact")
            const newTitle = `${context}${CONFIG.titleSeparator}${brandName}`;

            // Only update if different to avoid loops
            if (document.title !== newTitle) {
                document.title = newTitle;
                console.log('[GHL Tab Title] Updated:', newTitle);
            }
        }
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

    // Debounced update function
    const debouncedUpdate = debounce(updateTitle, CONFIG.updateDebounceMs);

    /**
     * Set up MutationObserver to watch for navigation changes
     */
    function setupObserver() {
        const observer = new MutationObserver(debounce(() => {
            debouncedUpdate();
        }, CONFIG.observerDebounceMs));

        // Observe the entire document for changes, but exclude title element
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'aria-current', 'aria-selected', 'data-active']
        });

        // Also listen for URL changes (SPA navigation)
        let lastUrl = location.href;
        const urlObserver = new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                debouncedUpdate();
            }
        });
        urlObserver.observe(document, { subtree: true, childList: true });

        // Listen for popstate (browser back/forward)
        window.addEventListener('popstate', debouncedUpdate);

        // Listen for hashchange
        window.addEventListener('hashchange', debouncedUpdate);
    }

    /**
     * Initialize the extension
     */
    function init() {
        console.log('[GHL Tab Title] Initializing on', window.location.hostname);
        console.log('[GHL Tab Title] Location ID:', getLocationId(), '-> Brand:', getBrandName());

        // Initial title update (with slight delay for SPA hydration)
        setTimeout(updateTitle, 500);

        // Second update after more content loads
        setTimeout(updateTitle, 1500);

        // Set up observers
        if (document.body) {
            setupObserver();
        } else {
            document.addEventListener('DOMContentLoaded', setupObserver);
        }
    }

    // Start
    init();
})();
