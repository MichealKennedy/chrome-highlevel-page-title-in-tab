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
     * Handles both URL patterns:
     * - /v2/location/{locationId}/...
     * - /location/{locationId}/...
     */
    function getLocationId() {
        // Match both /v2/location/ and /location/ patterns
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
            const el = document.querySelector(selector);
            if (el) {
                const text = el.textContent?.trim();
                // Validate it looks like a name (not gibberish)
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
     * URL patterns: 
     * - /location/{id}/workflow/{workflowId}
     * - /v2/location/{id}/workflows/...
     */
    function extractFromGHLWorkflow() {
        // Check if we're on a workflow page
        if (!window.location.pathname.includes('/workflow')) {
            return null;
        }

        console.log('[GHL Tab Title] On workflow page, searching for name...');

        // Try multiple selector strategies for the workflow name
        const selectors = [
            // The h1 inside the workflow name input
            'h1#cmp-header__txt--edit-workflow-name',
            '#cmp-header__txt--edit-workflow-name',
            // The span containing the h1
            '.n-ellipsis h1',
            'span.n-ellipsis h1',
            // The editable header text
            'h1.editable-header-text',
            // Inside the workflow-name-input paragraph
            'p.workflow-name-input h1',
            '.workflow-name-input h1',
            // The mirror span that contains the same text
            'span.editable-header-text-mirror'
        ];

        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) {
                const text = el.textContent?.trim();
                console.log('[GHL Tab Title] Workflow selector', selector, 'found:', text);
                // Skip if it's just "Workflow" or too short or looks like a number
                if (text && text.length > 3 &&
                    text.toLowerCase() !== 'workflow' &&
                    text.toLowerCase() !== 'workflows' &&
                    !text.match(/^[\d\s]+$/)) {
                    console.log('[GHL Tab Title] Using workflow name:', text);
                    return text;
                }
            }
        }

        console.log('[GHL Tab Title] No workflow name found with selectors');
        return null;
    }

    /**
     * Extract form name from GHL form builder page
     * URL pattern: /v2/location/{id}/form-builder-v2/{formId}
     */
    function extractFromGHLFormBuilder() {
        // Check if we're on a form builder page
        if (!window.location.pathname.includes('/form-builder') &&
            !window.location.pathname.includes('/forms/')) {
            return null;
        }

        console.log('[GHL Tab Title] On form builder page, searching for name...');

        // More specific selectors for the form name
        const selectors = [
            // The contenteditable div inside builder-form-name
            '.builder-form-name div[contenteditable="true"]',
            '.builder-form-name div[contenteditable]',
            'div.builder-form-name > div[contenteditable]',
            // Alternative form name locations
            '.form-name-input',
            '.form-header-name',
            // The outer container might have the text
            '.builder-form-name .truncate',
            '.builder-form-name div.text-lg'
        ];

        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) {
                const text = el.textContent?.trim();
                console.log('[GHL Tab Title] Form selector', selector, 'found:', text);
                // Validate the text is readable and not an ID
                if (text && text.length > 1 && text.length < 100 && isHumanReadable(text)) {
                    console.log('[GHL Tab Title] Using form name:', text);
                    return text;
                }
            }
        }

        console.log('[GHL Tab Title] No form name found with selectors');
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
            const el = document.querySelector(selector);
            if (el) {
                const text = (el.value || el.textContent)?.trim();
                if (text && text.length > 1 && text.length < 100 && isHumanReadable(text)) {
                    return text;
                }
            }
        }

        return null;
    }

    /**
     * Check if text is human readable (not an encoded ID or gibberish)
     */
    function isHumanReadable(text) {
        if (!text || text.length < 2) return false;

        // Reject if it looks like a camelCase ID (like UuuvQyzrBD7geMdO6eQb)
        if (/^[A-Za-z0-9]{15,}$/.test(text.replace(/\s/g, ''))) {
            console.log('[GHL Tab Title] Rejected as ID-like:', text);
            return false;
        }

        // Reject if mostly random-looking characters without proper word structure
        const words = text.split(/\s+/);
        let validWords = 0;
        for (const word of words) {
            // A valid word should have vowels and consonants mixed reasonably
            if (word.length <= 3 || /[aeiouAEIOU]/.test(word)) {
                validWords++;
            }
        }

        // At least 50% should look like real words
        const isReadable = (validWords / words.length) >= 0.5;
        if (!isReadable) {
            console.log('[GHL Tab Title] Rejected as unreadable:', text);
        }
        return isReadable;
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
            '[data-active="true"]',
            '.hl-nav-item.active',
            '.sidebar-item.active',
            'nav .active',
            '.menu .active',
            '[role="menuitem"][aria-selected="true"]'
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
        const hash = window.location.hash;

        // Try hash first (common in SPAs)
        if (hash && hash.length > 1) {
            const hashPath = hash.replace(/^#\/?/, '').split('/')[0];
            if (hashPath && !/^[0-9a-f-]{15,}$/i.test(hashPath)) {
                return formatPathSegment(hashPath);
            }
        }

        // Use pathname - find meaningful segment
        const segments = path.split('/').filter(s => s && s.length > 0);
        if (segments.length > 0) {
            // Skip these route words and IDs
            const skipWords = ['v2', 'location', 'detail', 'edit', 'new', 'form-builder-v2', 'form-builder'];
            for (let i = segments.length - 1; i >= 0; i--) {
                const segment = segments[i];
                // Skip segments that look like IDs (long alphanumeric) or common route words
                if (!/^[0-9a-zA-Z-]{15,}$/i.test(segment) &&
                    !skipWords.includes(segment.toLowerCase())) {
                    const formatted = formatPathSegment(segment);
                    if (formatted.length > 2) {
                        return formatted;
                    }
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
     * Update the document title
     * Uses document.title for browser history compatibility
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
        } else {
            console.log('[GHL Tab Title] No context found, keeping original title');
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

        // Observe the body for changes
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
                console.log('[GHL Tab Title] URL changed, updating...');
                debouncedUpdate();
            }
        });
        urlObserver.observe(document, { subtree: true, childList: true });

        // Listen for popstate (browser back/forward)
        window.addEventListener('popstate', () => {
            console.log('[GHL Tab Title] Popstate event');
            debouncedUpdate();
        });

        // Listen for hashchange
        window.addEventListener('hashchange', () => {
            console.log('[GHL Tab Title] Hashchange event');
            debouncedUpdate();
        });
    }

    /**
     * Initialize the extension
     */
    function init() {
        console.log('[GHL Tab Title] Initializing on', window.location.hostname);
        console.log('[GHL Tab Title] Location ID:', getLocationId(), '-> Brand:', getBrandName());

        // Initial title update (with delays for SPA hydration)
        setTimeout(updateTitle, 500);
        setTimeout(updateTitle, 1500);
        setTimeout(updateTitle, 3000);

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
