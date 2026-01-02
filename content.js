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
        brandName: null, // Will be extracted from page or stored
        titleSeparator: ' | '
    };

    // Store the original title as brand name
    const originalTitle = document.title || 'GHL';

    /**
     * Extract page context from various UI elements
     */
    function extractPageContext() {
        const strategies = [
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
     * Look for active navigation menu items
     */
    function extractFromActiveNavItem() {
        // Common selectors for active nav items in GHL
        const selectors = [
            // Sidebar active items
            '[class*="active"] [class*="menu-item-text"]',
            '[class*="active"] [class*="nav-text"]',
            '[class*="active"] span:not([class*="icon"])',
            '.nav-link.active',
            '[aria-current="page"]',
            '[data-active="true"]',
            // GHL specific patterns
            '.hl-nav-item.active',
            '.sidebar-item.active',
            '[class*="sidebar"] [class*="active"]',
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
                    if (text && text.length > 1 && text.length < 50) {
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
                    if (text && text.length > 1 && text.length < 50) {
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
            '[class*="header-title"]',
            'h1:first-of-type'
        ];

        for (const selector of selectors) {
            try {
                const el = document.querySelector(selector);
                if (el) {
                    const text = getCleanText(el);
                    if (text && text.length > 1 && text.length < 60) {
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
            if (hashPath) {
                return formatPathSegment(hashPath);
            }
        }

        // Use pathname
        const segments = path.split('/').filter(s => s && s.length > 0);
        if (segments.length > 0) {
            // Get the most meaningful segment (usually not just an ID)
            for (let i = segments.length - 1; i >= 0; i--) {
                const segment = segments[i];
                // Skip segments that look like IDs
                if (!/^[0-9a-f-]{20,}$/i.test(segment)) {
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
            .substring(0, 50);
    }

    /**
     * Update the document title
     */
    function updateTitle() {
        const context = extractPageContext();

        if (context) {
            const newTitle = `${originalTitle}${CONFIG.titleSeparator}${context}`;
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

        // Observe the entire document for changes
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

        // Initial title update (with slight delay for SPA hydration)
        setTimeout(updateTitle, 500);

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
