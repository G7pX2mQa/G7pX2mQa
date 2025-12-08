// js/util/globalOverlayEsc.js

/**
 * Defines which selectors to check for open overlays, in priority order (top to bottom).
 * The first one found will be closed.
 */
const PRIORITY_SELECTORS = [
  { sel: '.hm-milestones-overlay', btn: '.hm-milestones-close' },
  { sel: '.merchant-firstchat.is-visible', btn: null, yield: true }, // Don't close parent if chat is open; chat handles itself
  { sel: '.upg-overlay.is-open', btn: '.shop-close' }, // Upgrade details modal
  // Automation Shop has both .shop-overlay and .automation-shop-overlay
  { sel: '.automation-shop-overlay.is-open', btn: '.shop-close' },
  { sel: '.merchant-overlay.is-open', btn: '.merchant-close' },
  { sel: '.shop-overlay.is-open', btn: '.shop-close' }, // Main Shop
];

function handleEsc(e) {
  if (e.key !== 'Escape') return;

  for (const { sel, btn, yield: shouldYield } of PRIORITY_SELECTORS) {
    const candidates = document.querySelectorAll(sel);
    if (candidates.length > 0) {
      // Found an open overlay of this type.
      // If we should yield (e.g. for modal dialogs that handle their own Esc), stop here.
      if (shouldYield) {
        return; // Let the specific handler (if any) deal with it, but don't close deeper overlays.
      }

      // Otherwise, close it.
      // If multiple (e.g. multiple dialogs?), take the last one in DOM order (top-most).
      const topMost = candidates[candidates.length - 1];
      const closeButton = topMost.querySelector(btn || '.shop-close'); // fallback

      if (closeButton) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        closeButton.click();
        return;
      }
    }
  }
}

export function initGlobalOverlayEsc() {
  // Use capture=true to intercept the event before other handlers (if registered later on window/document)
  window.addEventListener('keydown', handleEsc, true);
}