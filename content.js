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
     * Extract workflow/automation name from GHL workflow editor page
     * Based on user-provided HTML:
     * <h1 class="p-1 editable-header-text font-normal">WORKFLOW NAME</h1>
     */
    function extractFromGHLWorkflow() {
        if (!window.location.pathname.includes('/workflow')) {
            return null;
        }

        console.log('[GHL Tab Title] On workflow page, searching for name...');

        // Search for h1 elements with editable-header-text class
        // This is the stable class from the user's HTML
        const selectors = [
            'h1.editable-header-text',
            'h1[class*="editable-header"]',
            '.editable-header-text',
            // Fallback: any h1 inside workflow-name-input
            '.workflow-name-input h1',
            'p.workflow-name-input h1'
        ];

        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) {
                const text = el.textContent?.trim();
                console.log('[GHL Tab Title] Found with selector', selector, ':', text);
                if (text && text.length > 3 &&
                    text.toLowerCase() !== 'workflow' &&
                    text.toLowerCase() !== 'workflows') {
                    return text;
                }
            }
        }

        // Diagnostic: Log ALL h1 elements on the page
        console.log('[GHL Tab Title] Diagnostic - All h1 elements:');
        document.querySelectorAll('h1').forEach((el, i) => {
            console.log(`  h1[${i}]:`, el.className, '=', el.textContent?.trim()?.substring(0, 50));
        });

        return null;
    }

    /**
     * Extract form name from GHL form builder page
     * Based on user-provided HTML:
     * <div contenteditable="true" class="min-w-[1rem] max-w-2xl text-lg outline-none truncate">FORM NAME</div>
     */
    function extractFromGHLFormBuilder() {
        if (!window.location.pathname.includes('/form-builder') &&
            !window.location.pathname.includes('/forms/')) {
            return null;
        }

        console.log('[GHL Tab Title] On form builder page, searching for name...');

        // More targeted selectors based on user's HTML
        // The form name is in a contenteditable div with truncate class
        const selectors = [
            'div[contenteditable="true"].truncate',
            'div.truncate[contenteditable="true"]',
            'div[contenteditable="true"][class*="truncate"]',
            'div[contenteditable="true"][class*="text-lg"]',
            '.builder-form-name div[contenteditable="true"]',
            '.builder-form-name div[contenteditable]'
        ];

        for (const selector of selectors) {
            const el = document.querySelector(selector);
            if (el) {
                const text = el.textContent?.trim();
                console.log('[GHL Tab Title] Found with selector', selector, ':', text);
                if (text && text.length > 1 && text.length < 100 && isHumanReadable(text)) {
                    return text;
                }
            }
        }

        // Diagnostic: Log ALL contenteditable elements on the page
        console.log('[GHL Tab Title] Diagnostic - All contenteditable elements:');
        document.querySelectorAll('[contenteditable="true"]').forEach((el, i) => {
            console.log(`  contenteditable[${i}]:`, el.className, '=', el.textContent?.trim()?.substring(0, 50));
        });

        return null;
    }

    /**
     * Check if text is human readable (not an encoded ID)
     */
    function isHumanReadable(text) {
        if (!text || text.length < 2) return false;

        // Reject if it looks like a camelCase/random ID (mixed case, no spaces, 15+ chars)
        const noSpaces = text.replace(/\s/g, '');
        if (/^[A-Za-z0-9]{15,}$/.test(noSpaces) && !/\s/.test(text)) {
            console.log('[GHL Tab Title] Rejected as ID-like:', text);
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
            // Skip IDs and common route words
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
     * Update the document title
     */
    function updateTitle() {
        const context = extractPageContext();
        const brandName = getBrandName();

        if (context) {
            const newTitle = `${context}${CONFIG.titleSeparator}${brandName}`;
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

        // Multiple delayed updates to catch Vue hydration
        setTimeout(updateTitle, 500);
        setTimeout(updateTitle, 1500);
        setTimeout(updateTitle, 3000);
        setTimeout(updateTitle, 5000);

        if (document.body) {
            setupObserver();
        } else {
            document.addEventListener('DOMContentLoaded', setupObserver);
        }
    }

    init();
})();
