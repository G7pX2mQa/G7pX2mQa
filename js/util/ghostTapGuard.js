// js/util/ghostTapGuard.js
// Fixes issue with buttons on mobile that prevents them from being spam clicked

const DEFAULT_TIMEOUT_MS = 400;
const ELEMENT_SKIP_PROP = Symbol('ccc:ghostTap:skip');
const ELEMENT_TIMER_PROP = Symbol('ccc:ghostTap:timer');
const GLOBAL_SKIP_PROP = '__cccGhostTapSkipUntil';
const TARGET_SELECTOR = '[data-ghost-tap-target], button, [role="button"], [data-btn], .game-btn, .btn, .slot-card, a[href], input, select, textarea, summary';

let guardInstalled = false;
let selector = TARGET_SELECTOR;
let hasPointerEvents = false;
let hasTouchEvents = false;

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function getDocument() {
  if (typeof document === 'undefined') return null;
  return document;
}

function findTapTarget(node) {
  const doc = getDocument();
  if (!doc) return null;
  const ElementCtor = typeof Element !== 'undefined' ? Element : null;
  if (!node || !ElementCtor) return null;
  if (!(node instanceof ElementCtor)) {
    node = node.parentElement;
  }
  if (!node || !node.closest) return null;
  return node.closest(selector);
}

function clearGhostTapTarget(el) {
  if (!el) return;
  el[ELEMENT_SKIP_PROP] = false;
  if (el[ELEMENT_TIMER_PROP]) {
    clearTimeout(el[ELEMENT_TIMER_PROP]);
    el[ELEMENT_TIMER_PROP] = null;
  }
}

function markGhostTapTarget(el, timeout = DEFAULT_TIMEOUT_MS) {
  if (!el) return;
  el[ELEMENT_SKIP_PROP] = true;
  if (el[ELEMENT_TIMER_PROP]) {
    clearTimeout(el[ELEMENT_TIMER_PROP]);
  }
  el[ELEMENT_TIMER_PROP] = setTimeout(() => {
    el[ELEMENT_SKIP_PROP] = false;
    el[ELEMENT_TIMER_PROP] = null;
  }, timeout);
}

function consumeGhostTapGuard() {
  if (typeof window === 'undefined') return false;
  const until = window[GLOBAL_SKIP_PROP];
  if (typeof until !== 'number') return false;

  const now = nowMs();
  if (now <= until) {
    window[GLOBAL_SKIP_PROP] = null;
    return true;
  }

  window[GLOBAL_SKIP_PROP] = null;
  return false;
}

function shouldSkipGhostTap(el) {
  if (consumeGhostTapGuard()) {
    if (el) clearGhostTapTarget(el);
    return true;
  }
  if (!el) return false;
  if (!el[ELEMENT_SKIP_PROP]) return false;
  clearGhostTapTarget(el);
  return true;
}

function suppressNextGhostTap(timeout = DEFAULT_TIMEOUT_MS) {
  if (typeof window === 'undefined') return;
  const now = nowMs();
  const target = now + Math.max(0, timeout);
  const current = typeof window[GLOBAL_SKIP_PROP] === 'number'
    ? window[GLOBAL_SKIP_PROP]
    : 0;
  window[GLOBAL_SKIP_PROP] = Math.max(current, target);
}

function onPointerStart(event) {
  if (event.pointerType === 'mouse') return;
  if (typeof event.button === 'number' && event.button !== 0) return;
  const target = findTapTarget(event.target);
  if (!target) return;
  if (consumeGhostTapGuard()) {
    clearGhostTapTarget(target);
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

function onTouchStart(event) {
  const target = findTapTarget(event.target);
  if (!target) return;
  if (consumeGhostTapGuard()) {
    clearGhostTapTarget(target);
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

function onClickCapture(event) {
  // Only handle click fallback on browsers that lack pointer/touch events.
  if (hasPointerEvents || hasTouchEvents) return;
  const target = findTapTarget(event.target);
  if (!target) return;
  if (consumeGhostTapGuard()) {
    clearGhostTapTarget(target);
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

export function installGhostTapGuard(options = {}) {
  if (guardInstalled) return;
  const doc = getDocument();
  if (!doc || typeof window === 'undefined') return;

  guardInstalled = true;
  hasPointerEvents = 'PointerEvent' in window;
  hasTouchEvents = !hasPointerEvents && 'ontouchstart' in window;
  if (options.selector) {
    selector = `${options.selector}, ${TARGET_SELECTOR}`;
  }

  doc.addEventListener('click', onClickCapture, true);

  if (hasPointerEvents) {
    doc.addEventListener('pointerdown', onPointerStart, { capture: true, passive: false });
  } else if (hasTouchEvents) {
    doc.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
  }
}

export {
  clearGhostTapTarget,
  markGhostTapTarget,
  shouldSkipGhostTap,
  suppressNextGhostTap,
  consumeGhostTapGuard,
  DEFAULT_TIMEOUT_MS as GHOST_TAP_TIMEOUT_MS,
};

export function setGhostTapSelector(extraSelector) {
  if (!extraSelector) return;
  selector = `${extraSelector}, ${TARGET_SELECTOR}`;
}
