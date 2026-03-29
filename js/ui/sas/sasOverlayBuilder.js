import { IS_MOBILE } from '../../main.js';
import { blockInteraction, ensureCustomScrollbar, setupDragToClose } from '../shopOverlay.js';
import { suppressNextGhostTap } from '../../util/ghostTapGuard.js';

/**
 * Creates a reusable SAS overlay UI.
 * @param {Object} options
 * @param {string} options.id - The DOM ID for the overlay.
 * @param {string} options.title - The header title of the overlay.
 * @param {string} options.containerClass - The CSS class for the content container.
 * @param {string} [options.zIndex] - The z-index string.
 * @param {string} [options.focusSelector] - The selector for the element to focus when opened.
 * @param {Function} [options.onRender] - Callback to populate the content container before opening.
 * @param {Function} [options.onClose] - Callback to execute when the overlay is closed.
 * @returns {Object} An object containing the overlay element, sheet element, open and close methods, and state.
 */
export function createSASOverlay({ id, title, containerClass, zIndex = '4010', focusSelector, onRender, onClose }) {
  let overlayEl = null;
  let sheetEl = null;
  let isOpen = false;
  let closeTimer = null;
  let postOpenPointer = false;

  function buildOverlay() {
    if (overlayEl) return;

    overlayEl = document.createElement('div');
    overlayEl.className = 'sas-overlay';
    overlayEl.id = id;
    if (zIndex) overlayEl.style.zIndex = zIndex;

    sheetEl = document.createElement('div');
    sheetEl.className = 'sas-sheet';
    sheetEl.setAttribute('role', 'dialog');

    const grabber = document.createElement('div');
    grabber.className = 'sas-grabber';
    grabber.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;

    const content = document.createElement('div');
    content.className = 'sas-content';

    const header = document.createElement('header');
    header.className = 'sas-header';
    header.innerHTML = `<div class="sas-title">${title}</div><div class="sas-line" aria-hidden="true"></div>`;

    const container = document.createElement('div');
    container.className = containerClass;

    const scroller = document.createElement('div');
    scroller.className = 'sas-scroller';
    scroller.appendChild(container);

    content.append(header, scroller);

    const actions = document.createElement('div');
    actions.className = 'sas-actions';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'sas-close';
    closeBtn.textContent = 'Close';
    actions.appendChild(closeBtn);

    sheetEl.append(grabber, content, actions);
    overlayEl.appendChild(sheetEl);
    document.body.appendChild(overlayEl);

    ensureCustomScrollbar(overlayEl, sheetEl, '.sas-scroller');

    // Listeners
    overlayEl.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      postOpenPointer = true;
    }, { capture: true, passive: true });

    overlayEl.addEventListener('touchstart', (e) => {
      postOpenPointer = true;
    }, { capture: true, passive: true });

    overlayEl.addEventListener('click', (e) => {
      if (!IS_MOBILE) return;
      if (!postOpenPointer) {
        e.preventDefault(); e.stopImmediatePropagation();
        return;
      }
    }, { capture: true });

    closeBtn.addEventListener('click', () => {
      if (IS_MOBILE) blockInteraction(80);
      closeOverlay();
    }, { passive: true });

    setupDragToClose(grabber, sheetEl, () => isOpen, () => {
      isOpen = false;
      closeTimer = setTimeout(() => {
        closeTimer = null;
        closeOverlay(true);
      }, 150);
    });
  }

  function openOverlay() {
    buildOverlay();

    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }

    if (onRender) {
      onRender(overlayEl);
    }

    if (isOpen) return;
    isOpen = true;

    sheetEl.style.transition = 'none';
    sheetEl.style.transform = 'translateY(100%)';
    overlayEl.style.pointerEvents = 'auto';

    void sheetEl.offsetHeight;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        sheetEl.style.transition = '';
        sheetEl.style.transform = '';
        overlayEl.classList.add('is-open');
        postOpenPointer = false;

        if (IS_MOBILE) {
          try { setTimeout(() => suppressNextGhostTap(240), 120); } catch {}
        }

        blockInteraction(10);
        ensureCustomScrollbar(overlayEl, sheetEl, '.sas-scroller');

        if (focusSelector) {
          const focusable = overlayEl.querySelector(focusSelector);
          if (focusable) focusable.focus();
        }
      });
    });
  }

  function closeOverlay(force = false) {
    const forceClose = force === true;
    const overlayOpen = overlayEl?.classList?.contains('is-open');

    if (!forceClose && !isOpen && !overlayOpen) {
      if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
      return;
    }

    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }

    isOpen = false;
    if (sheetEl) {
      sheetEl.style.transition = '';
      sheetEl.style.transform = '';
    }
    if (overlayEl) {
      overlayEl.classList.remove('is-open');
      overlayEl.style.pointerEvents = 'none';
    }
    postOpenPointer = false;

    if (onClose) {
      onClose();
    }
  }

  return {
    get overlayEl() { return overlayEl; },
    get isOpen() { return isOpen; },
    open: openOverlay,
    close: closeOverlay,
    build: buildOverlay
  };
}
