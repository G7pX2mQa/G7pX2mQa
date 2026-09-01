// js/util/globalOverlayEsc.js

let isGlobalEscDisabled = false;

export function disableGlobalOverlayEsc() {
  isGlobalEscDisabled = true;
}

const PRIORITY_SELECTORS = [
  { sel: '.offline-overlay', btn: '.offline-close-btn' },
  { sel: '.hm-milestones-overlay', btn: '.hm-milestones-close' },
  { sel: '.merchant-firstchat.is-visible', btn: null, yield: true }, // Don't close parent if chat is open; chat handles itself
  { sel: '.upg-overlay.is-open', btn: '.upg-actions .shop-close' }, // Upgrade details modal
  // Automation Shop has both .shop-overlay and .automation-shop-overlay
  { sel: '.merchant-overlay.is-open', btn: '.merchant-close' },
  { sel: '.shop-overlay.is-open', btn: '.shop-actions .shop-close', closeAll: true }, // Main Shop (and others like DNA/Automation)
  { sel: '.sas-overlay.is-open', btn: '.sas-close', closeAll: true },
];

function handleEsc(e) {
  if (e.key !== 'Escape' && e.key !== 'Backspace') return;

  if (e.key === 'Backspace') {
    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') return;
    if (document.activeElement && document.activeElement.isContentEditable) return;
  }

  if (isGlobalEscDisabled) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    return;
  }

  let yields = false;
  let closedAny = false;

  if (e.key === 'Backspace') {
    let allCandidates = [];
    for (const info of PRIORITY_SELECTORS) {
      const els = document.querySelectorAll(info.sel);
      els.forEach(el => {
        let z = parseInt(window.getComputedStyle(el).zIndex, 10);
        if (isNaN(z)) z = 0;
        allCandidates.push({ el, info, z });
      });
    }

    if (allCandidates.length > 0) {
      allCandidates.sort((a, b) => {
        if (a.z !== b.z) return b.z - a.z;
        const pos = a.el.compareDocumentPosition(b.el);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return 1;
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return -1;
        return 0;
      });

      const highest = allCandidates[0];
      if (highest.info.yield) {
        yields = true;
      } else {
        const closeButton = highest.el.querySelector(highest.info.btn || '.shop-close');
        if (closeButton) {
          closeButton.click();
          closedAny = true;
        }
      }
    }
  } else {
    for (const { sel, btn, yield: shouldYield, closeAll } of PRIORITY_SELECTORS) {
      const candidates = document.querySelectorAll(sel);
      if (candidates.length > 0) {
        if (shouldYield) {
          yields = true;
          // Break to prevent closing parents
          break;
        }

        if (closeAll) {
          // If configured to close all, iterate and close each matching overlay
          candidates.forEach(el => {
            const closeButton = el.querySelector(btn || '.shop-close');
            if (closeButton) {
              closeButton.click();
              closedAny = true;
            }
          });
        } else {
          const topMost = candidates[candidates.length - 1];
          const closeButton = topMost.querySelector(btn || '.shop-close');

          if (closeButton) {
            closeButton.click();
            closedAny = true;
          }
        }
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
