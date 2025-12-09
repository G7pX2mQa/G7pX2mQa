// js/util/globalOverlayEsc.js

const PRIORITY_SELECTORS = [
  { sel: '.offline-overlay', btn: '.offline-close-btn' },
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

  let yields = false;
  let closedAny = false;

  for (const { sel, btn, yield: shouldYield } of PRIORITY_SELECTORS) {
    const candidates = document.querySelectorAll(sel);
    if (candidates.length > 0) {
      if (shouldYield) {
        yields = true;
        // Continue to find others to close
        continue;
      }

      const topMost = candidates[candidates.length - 1];
      const closeButton = topMost.querySelector(btn || '.shop-close');

      if (closeButton) {
        closeButton.click();
        closedAny = true;
      }
    }
  }

  if (closedAny || yields) {
    e.preventDefault();
    // Only stop propagation if we didn't yield to another handler
    if (!yields) {
       e.stopPropagation();
       e.stopImmediatePropagation();
    }
  }
}

export function initGlobalOverlayEsc() {
  // Use capture=true to intercept the event before other handlers (if registered later on window/document)
  window.addEventListener('keydown', handleEsc, true);
}
