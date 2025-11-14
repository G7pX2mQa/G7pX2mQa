// js/util/ghostTapGuard.js
// Fixes issue with buttons on mobile that prevents them from being spam clicked; it is important this is applied to every clickable button in the game

const DEFAULT_TIMEOUT_MS = 0;
const ELEMENT_SKIP_PROP = Symbol('ccc:ghostTap:skipUntil');
const GLOBAL_SKIP_PROP = '__cccGhostTapSkipUntil';
const TARGET_SELECTOR = '[data-ghost-tap-target], button, [role="button"], [data-btn], .game-btn, .btn, .slot-card, a[href], input, select, textarea, summary';

let guardInstalled = false;
let selector = TARGET_SELECTOR;
let hasPointerEvents = false;
let hasTouchEvents = false;
let lastMarkedTarget = null;
let lastTouchMs = 0;

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
  el[ELEMENT_SKIP_PROP] = 0;
}

function markGhostTapTarget(el, timeout = DEFAULT_TIMEOUT_MS) {
  if (!el) return;
  const now = nowMs();
  const delay = Number.isFinite(timeout) ? Math.max(0, Number(timeout)) : DEFAULT_TIMEOUT_MS;
  if (delay > 0) {
    el[ELEMENT_SKIP_PROP] = now + delay;
  } else {
    el[ELEMENT_SKIP_PROP] = 0;
  }
  lastMarkedTarget = el;
  if (delay > 0) suppressNextGhostTap(delay);
}

function consumeGhostTapGuard(target) {
  if (typeof window === 'undefined') return false;
  const until = window[GLOBAL_SKIP_PROP];
  if (typeof until !== 'number') return false;

  const now = nowMs();
  if (now <= until) {
    window[GLOBAL_SKIP_PROP] = null;
	
    if (target && lastMarkedTarget && target === lastMarkedTarget) {
      return true;
    }
    return false;
  }

  window[GLOBAL_SKIP_PROP] = null;
  return false;
}

function shouldSkipGhostTap(el) {
  if (!el) return false;
  const until = Number(el[ELEMENT_SKIP_PROP] || 0);
  if (!Number.isFinite(until) || until <= 0) return false;

  const now = nowMs();
  if (now <= until) {
    clearGhostTapTarget(el);

    if (lastMarkedTarget && el === lastMarkedTarget) {
      return true;
    }
    return false;
  }

  clearGhostTapTarget(el);
  return false;
}


function suppressNextGhostTap(timeout = DEFAULT_TIMEOUT_MS) {
  if (typeof window === 'undefined') return;
  const now = nowMs();
  const targetDelay = Math.max(0, Number.isFinite(timeout) ? timeout : DEFAULT_TIMEOUT_MS);
  if (targetDelay <= 0) {
    window[GLOBAL_SKIP_PROP] = null;
    return;
  }
  const target = now + targetDelay;
  const current = typeof window[GLOBAL_SKIP_PROP] === 'number'
    ? window[GLOBAL_SKIP_PROP]
    : 0;
  window[GLOBAL_SKIP_PROP] = Math.max(current, target);
}

function onPointerStart(event) {
  if (event.pointerType === 'mouse') return;
  if (typeof event.button === 'number' && event.button !== 0) return;
  lastTouchMs = nowMs();
  const target = findTapTarget(event.target);
  if (!target) return;
  if (consumeGhostTapGuard(target)) {
    clearGhostTapTarget(target);
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

function onTouchStart(event) {
  lastTouchMs = nowMs();
  const target = findTapTarget(event.target);
  if (!target) return;
  if (consumeGhostTapGuard(target)) {
    clearGhostTapTarget(target);
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

function onClickCapture(event) {
  if (nowMs() - lastTouchMs > 450) return;

  const target = findTapTarget(event.target);
  if (!target) return;
  if (consumeGhostTapGuard(target)) {
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
