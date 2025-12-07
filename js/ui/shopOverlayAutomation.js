
import { IS_MOBILE } from '../main.js';
import { shouldSkipGhostTap, suppressNextGhostTap } from '../util/ghostTapGuard.js';
import { blockInteraction } from './shopOverlay.js';

let automationOverlayEl = null;
let automationSheetEl = null;
let automationOpen = false;
let drag = null;
let eventsBound = false;
let automationCloseTimer = null;
let __automationPostOpenPointer = false;

function ensureCustomScrollbar() {
  const scroller = automationOverlayEl?.querySelector('.automation-shop-scroller');
  if (!scroller || scroller.__customScroll) return;

  const bar = document.createElement('div');
  bar.className = 'shop-scrollbar'; // Reuse shop scrollbar styles
  const thumb = document.createElement('div');
  thumb.className = 'shop-scrollbar__thumb';
  bar.appendChild(thumb);
  automationSheetEl.appendChild(bar);

  scroller.__customScroll = { bar, thumb };

  const isTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const FADE_SCROLL_MS = 150;
  const supportsScrollEnd = 'onscrollend' in window;

  const updateBounds = () => {
    const grab = automationOverlayEl.querySelector('.shop-grabber');
    const header = automationOverlayEl.querySelector('.shop-header');
    const actions = automationOverlayEl.querySelector('.shop-actions');

    const top = ((grab?.offsetHeight || 0) + (header?.offsetHeight || 0)) | 0;
    const bottom = (actions?.offsetHeight || 0) | 0;

    bar.style.top = top + 'px';
    bar.style.bottom = bottom + 'px';
  };

  const updateThumb = () => {
    const { scrollHeight, clientHeight, scrollTop } = scroller;
    const barH = bar.clientHeight;
    const visibleRatio = clientHeight / Math.max(1, scrollHeight);
    const thumbH = Math.max(28, Math.round(barH * visibleRatio));

    const maxScroll = Math.max(1, scrollHeight - clientHeight);
    const range = Math.max(0, barH - thumbH);
    const y = Math.round((scrollTop / maxScroll) * range);

    thumb.style.height = thumbH + 'px';
    thumb.style.transform = `translateY(${y}px)`;
    bar.style.display = (scrollHeight <= clientHeight + 1) ? 'none' : '';
  };

  const updateAll = () => {
    updateBounds();
    updateThumb();
  };

  const showBar = () => {
    if (!isTouch) return;
    automationSheetEl.classList.add('is-scrolling');
    clearTimeout(scroller.__fadeTimer);
  };
  const scheduleHide = (delay) => {
    if (!isTouch) return;
    clearTimeout(scroller.__fadeTimer);
    scroller.__fadeTimer = setTimeout(() => {
      automationSheetEl.classList.remove('is-scrolling');
    }, delay);
  };

  const onScroll = () => {
    updateThumb();
    if (isTouch) showBar();
    if (!supportsScrollEnd) scheduleHide(FADE_SCROLL_MS);
  };

  const onScrollEnd = () => scheduleHide(FADE_SCROLL_MS);

  scroller.addEventListener('scroll', onScroll, { passive: true });
  if (supportsScrollEnd) {
    scroller.addEventListener('scrollend', onScrollEnd, { passive: true });
  }

  const ro = new ResizeObserver(updateAll);
  ro.observe(scroller);
  window.addEventListener('resize', updateAll);
  requestAnimationFrame(updateAll);
}

function ensureAutomationOverlay() {
  if (automationOverlayEl) return;

  automationOverlayEl = document.createElement('div');
  automationOverlayEl.className = 'shop-overlay automation-shop-overlay'; // Reuse shop styles + specific class
  automationOverlayEl.id = 'automation-shop-overlay';

  automationSheetEl = document.createElement('div');
  automationSheetEl.className = 'shop-sheet';
  automationSheetEl.setAttribute('role', 'dialog');
  automationSheetEl.setAttribute('aria-modal', 'false');
  automationSheetEl.setAttribute('aria-label', 'Automation Shop');

  const grabber = document.createElement('div');
  grabber.className = 'shop-grabber';
  grabber.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;

  const content = document.createElement('div');
  content.className = 'shop-content';

  const header = document.createElement('header');
  header.className = 'shop-header';
  header.innerHTML = `
    <div class="shop-title">Automation Shop</div>
    <div class="shop-line" aria-hidden="true"></div>
  `;

  const grid = document.createElement('div');
  grid.className = 'shop-grid';
  grid.id = 'automation-shop-grid';
  grid.setAttribute('role', 'grid');
  grid.setAttribute('aria-label', 'Automation Upgrades');
  // Empty for now as requested

  const scroller = document.createElement('div');
  scroller.className = 'shop-scroller automation-shop-scroller'; // Distinct class for ghost tap exclusion
  scroller.appendChild(grid);

  content.append(header, scroller);

  const actions = document.createElement('div');
  actions.className = 'shop-actions';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'shop-close';
  closeBtn.textContent = 'Close';

  actions.appendChild(closeBtn);

  automationSheetEl.append(grabber, content, actions);
  automationOverlayEl.appendChild(automationSheetEl);
  document.body.appendChild(automationOverlayEl);

  automationOverlayEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    __automationPostOpenPointer = true;
  }, { capture: true, passive: true });

  automationOverlayEl.addEventListener('click', (e) => {
    if (!IS_MOBILE) return;
    if (!__automationPostOpenPointer) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
  }, { capture: true });

  ensureCustomScrollbar();

  if (!eventsBound) {
    eventsBound = true;

    function onCloseClick(e) {
      if (IS_MOBILE) {
        blockInteraction(80);
      }
      closeAutomationShop();
    }

    closeBtn.addEventListener('click', onCloseClick, { passive: true });
    
    // Drag to dismiss logic (similar to regular shop)
    grabber.addEventListener('pointerdown', onDragStart);
    grabber.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  }
}

export function openAutomationShop() {
  ensureAutomationOverlay();

  if (automationCloseTimer) {
    clearTimeout(automationCloseTimer);
    automationCloseTimer = null;
  }

  if (automationOpen) return;

  automationOpen = true;
  automationSheetEl.style.transition = 'none';
  automationSheetEl.style.transform = '';
  automationOverlayEl.style.pointerEvents = 'auto';

  void automationSheetEl.offsetHeight;
  requestAnimationFrame(() => {
    automationSheetEl.style.transition = '';
    automationOverlayEl.classList.add('is-open');
    __automationPostOpenPointer = false;

    if (IS_MOBILE) {
      try {
        setTimeout(() => suppressNextGhostTap(240), 120);
      } catch {}
    }

    blockInteraction(10);
    ensureCustomScrollbar();
  });
}

export function closeAutomationShop(force = false) {
  const forceClose = force === true;
  const overlayOpen = automationOverlayEl?.classList?.contains('is-open');

  if (!forceClose && !automationOpen && !overlayOpen) {
    if (automationCloseTimer) {
      clearTimeout(automationCloseTimer);
      automationCloseTimer = null;
    }
    return;
  }

  if (automationCloseTimer) {
    clearTimeout(automationCloseTimer);
    automationCloseTimer = null;
  }

  automationOpen = false;
  if (automationSheetEl) {
    automationSheetEl.style.transition = '';
    automationSheetEl.style.transform = '';
  }
  automationOverlayEl.classList.remove('is-open');
  automationOverlayEl.style.pointerEvents = 'none';
  __automationPostOpenPointer = false;
}

// Drag logic
function onDragStart(e) {
  if (!automationOpen) return;

  const clientY = typeof e.clientY === 'number'
    ? e.clientY
    : (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

  drag = { startY: clientY, lastY: clientY, startT: performance.now(), moved: 0, canceled: false };
  automationSheetEl.style.transition = 'none';

  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd);
  window.addEventListener('pointercancel', onDragCancel);
}

function onDragMove(e) {
  if (!drag || drag.canceled) return;
  const y = e.clientY;
  if (typeof y !== 'number') return;

  const dy = Math.max(0, y - drag.startY);
  drag.lastY = y;
  drag.moved = dy;
  automationSheetEl.style.transform = `translateY(${dy}px)`;
}

function onDragEnd() {
  if (!drag || drag.canceled) return cleanupDrag();

  const dt = Math.max(1, performance.now() - drag.startT);
  const dy = drag.moved;
  const velocity = dy / dt;
  const shouldClose = (velocity > 0.55 && dy > 40) || dy > 140;

  if (shouldClose) {
    suppressNextGhostTap(100);
    blockInteraction(80);
    automationSheetEl.style.transition = 'transform 140ms ease-out';
    automationSheetEl.style.transform = 'translateY(100%)';
    automationOpen = false;

    automationCloseTimer = setTimeout(() => {
      automationCloseTimer = null;
      closeAutomationShop(true);
    }, 150);
  } else {
    automationSheetEl.style.transition = 'transform 180ms ease';
    automationSheetEl.style.transform = 'translateY(0)';
  }

  cleanupDrag();
}

function onDragCancel() {
  if (!drag) return;
  drag.canceled = true;
  automationSheetEl.style.transition = 'transform 180ms ease';
  automationSheetEl.style.transform = 'translateY(0)';
  cleanupDrag();
}

function cleanupDrag() {
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
  window.removeEventListener('pointercancel', onDragEnd);
  drag = null;
}