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

function markGhostTapTarget(el, timeout = DEFAULT_TIMEOUT_MS, globalTimeout = null) {
  if (!el) return;
  const now = nowMs();
  const delay = Number.isFinite(timeout) ? Math.max(0, Number(timeout)) : DEFAULT_TIMEOUT_MS;
  if (delay > 0) {
    el[ELEMENT_SKIP_PROP] = now + delay;
  } else {
    el[ELEMENT_SKIP_PROP] = 0;
  }
  lastMarkedTarget = el;

  const gDelay = globalTimeout !== null
    ? (Number.isFinite(globalTimeout) ? Math.max(0, Number(globalTimeout)) : DEFAULT_TIMEOUT_MS)
    : delay;

  if (gDelay > 0) suppressNextGhostTap(gDelay);
}

function consumeGhostTapGuard(target) {
  if (typeof window === 'undefined') return false;
  const until = window[GLOBAL_SKIP_PROP];
  if (typeof until !== 'number') return false;

  const now = nowMs();
  if (now <= until) {
    // We intentionally removed the "return false if target matches" logic
    // because we now rely on !event.isTrusted to let the synthetic click pass.
    // So if the guard is active, we BLOCK (return true).
    return true;
  }

  // If expired, clear it
  window[GLOBAL_SKIP_PROP] = null;
  return false;
}

function shouldSkipGhostTap(el) {
  if (!el) return false;
  const until = Number(el[ELEMENT_SKIP_PROP] || 0);
  if (!Number.isFinite(until) || until <= 0) return false;
  const now = nowMs();
  if (now <= until) {
    // Always block if the element is marked and time hasn't passed.
    // We removed the "allow first match" logic here too.
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
  // Note: We removed consumeGhostTapGuard here to allow rapid "spam" taps.
  // We only block the resulting *clicks* in onClickCapture.
}

function onTouchStart(event) {
  lastTouchMs = lastTouchStartMs = nowMs();
  lastTouchDurationMs = 0;
  // Note: We removed consumeGhostTapGuard here to allow rapid "spam" taps.
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
  // Always allow synthetic/programmatic clicks (e.g. from handleInstantClick)
  if (!event.isTrusted) return;

  const now = nowMs();
  const sinceTouchStart = lastTouchStartMs > 0 ? now - lastTouchStartMs : -1;
  
  // If we have a running guard (Element or Global), check it.
  const target = findTapTarget(event.target);

  // Check element-specific guard first (fixes hold-release double tap)
  if (shouldSkipGhostTap(target)) {
    lastTouchDurationMs = 0;
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }

  // Check global guard (fixes ghost taps on other elements)
  if (consumeGhostTapGuard(target)) {
    if (target) clearGhostTapTarget(target);
    lastTouchDurationMs = 0;
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }

  if (sinceTouchStart < 0) return;
  if (!target) return;

  const effectiveDuration = lastTouchDurationMs || sinceTouchStart;

  if (effectiveDuration >= longPressMs) {
    clearGhostTapTarget(target);
    lastTouchDurationMs = 0;
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
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

function handleInstantClick(event) {
  if (event.pointerType === 'mouse') return;
  if (typeof event.button === 'number' && event.button !== 0) return;
  if (!event.isTrusted) return;

  const target = event.target;
  if (!target) return;

  // We only want to auto-trigger elements that look like buttons
  const buttonLike = target.closest(TARGET_SELECTOR);
  if (!buttonLike) return;

  // EXCLUSIONS:
  // Scrollable areas where we don't want accidental taps during scroll starts
  // (Shop lists, Merchant dialogue lists)
  // NOTE: .debug-panel and .debug-panel-action-log are intentionally NOT excluded
  // to allow ghost tapping on debug buttons as per user request.
  
  // Exclude Shop list
  if (buttonLike.closest('.shop-scroller')) return;
  
  // Exclude Dialogue list
  if (buttonLike.closest('.merchant-dialogue-list') && !buttonLike.closest('.merchant-firstchat')) return;

  // If a specific element asked to avoid this logic, bail
  if (buttonLike.dataset.noGhost === 'true') return;

  // Manually "click" it immediately to bypass the 300ms delay or touch-drag threshold
  // Mark it so we don't double-fire if the browser also sends a click later.
  // We use a long timeout (2000ms) for the element to prevent "hold" double-taps,
  // but a short global timeout (300ms) to avoid blocking other elements if the user taps rapidly.
  markGhostTapTarget(buttonLike, 2000, 300);

  // We don't preventDefault() here because that might kill scrolling or other behaviors,
  // but since we excluded scrollable areas, we assume these are static HUD buttons.
  // Actually, for instant response we usually DO prevent default to stop the emulation...
  // but let's try just triggering the click.

  // Actually, standard ghost tap pattern: prevent default to stop the emulation,
  // then dispatch our own click.
  if (event.cancelable) event.preventDefault();
  buttonLike.click();
}

export function initGlobalGhostTap() {
  const doc = getDocument();
  if (!doc || typeof window === 'undefined') return;

  const hasPointer = 'PointerEvent' in window;
  if (hasPointer) {
    // capturing phase to intercept before internal UI logic
    doc.addEventListener('pointerdown', handleInstantClick, { capture: false, passive: false });
  } else if ('ontouchstart' in window) {
    doc.addEventListener('touchstart', handleInstantClick, { capture: false, passive: false });
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
