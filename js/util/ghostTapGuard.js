// js/util/ghostTapGuard.js
// Fixes issue with buttons on mobile that prevents them from being spam clicked
// It's important that this is applied to every clickable button in the game

const DEFAULT_TIMEOUT_MS = 0;
const ELEMENT_SKIP_PROP = Symbol('ccc:ghostTap:skipUntil');
const GLOBAL_SKIP_PROP = '__cccGhostTapSkipUntil';
const TARGET_SELECTOR = '[data-ghost-tap-target], button, [role="button"], [data-btn], .game-btn, .btn, .slot-card, a[href], input, select, textarea, summary';
const DEFAULT_LONG_PRESS_MS = 80;

let guardInstalled = false;
let selector = TARGET_SELECTOR;
let hasPointerEvents = false;
let hasTouchEvents = false;
let lastMarkedTarget = null;
let lastTouchMs = 0;
let lastTouchStartMs = 0;
let lastTouchDurationMs = 0;
let longPressMs = DEFAULT_LONG_PRESS_MS;

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
      return false;
    }
    return true;
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
    if (lastMarkedTarget && el === lastMarkedTarget) {
      clearGhostTapTarget(el);
      return false;
    }
    clearGhostTapTarget(el);
    return true;
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
  lastTouchMs = lastTouchStartMs = nowMs();
  lastTouchDurationMs = 0;
  const target = findTapTarget(event.target);
  if (!target) return;
  if (consumeGhostTapGuard(target)) {
    clearGhostTapTarget(target);
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

function onTouchStart(event) {
  lastTouchMs = lastTouchStartMs = nowMs();
  lastTouchDurationMs = 0;
  const target = findTapTarget(event.target);
  if (!target) return;
  if (consumeGhostTapGuard(target)) {
    clearGhostTapTarget(target);
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

function onPointerEnd(event) {
  if (event.pointerType === 'mouse') return;
  if (typeof event.button === 'number' && event.button !== 0) return;
  const now = nowMs();
  if (lastTouchStartMs > 0) {
    lastTouchDurationMs = now - lastTouchStartMs;
  }
  lastTouchMs = now;
}

function onTouchEnd() {
  const now = nowMs();
  if (lastTouchStartMs > 0) {
    lastTouchDurationMs = now - lastTouchStartMs;
  }
  lastTouchMs = now;
}

function onClickCapture(event) {
  const now = nowMs();
  const sinceTouchStart = lastTouchStartMs > 0 ? now - lastTouchStartMs : -1;
  if (sinceTouchStart < 0) return;

  const target = findTapTarget(event.target);
  if (!target) return;

  const effectiveDuration = lastTouchDurationMs || sinceTouchStart;

  if (effectiveDuration >= longPressMs) {
    clearGhostTapTarget(target);
    lastTouchDurationMs = 0;
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  if (consumeGhostTapGuard(target)) {
    clearGhostTapTarget(target);
    lastTouchDurationMs = 0;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  lastTouchDurationMs = 0;
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

  if (Number.isFinite(options.longPressMs) && options.longPressMs >= 0) {
    longPressMs = options.longPressMs;
  }

  doc.addEventListener('click', onClickCapture, true);

  if (hasPointerEvents) {
    doc.addEventListener('pointerdown', onPointerStart, { capture: true, passive: false });
    doc.addEventListener('pointerup', onPointerEnd, { capture: true, passive: true });
  } else if (hasTouchEvents) {
    doc.addEventListener('touchstart', onTouchStart, { capture: true, passive: false });
    doc.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
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
