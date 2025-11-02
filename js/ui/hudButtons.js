// js/ui/hudButtons.js

import { openShop } from './shopOverlay.js';
import { getActiveSlot } from '../util/storage.js';
import {
  markGhostTapTarget,
  shouldSkipGhostTap,
} from '../util/ghostTapGuard.js';

const BASE_KEYS = {
  SHOP: 'ccc:unlock:shop',
  MAP:  'ccc:unlock:map',
};

function slotKey(base) {
  const slot = getActiveSlot();
  return slot == null ? base : `${base}:${slot}`;
}

// Read: consider both base and slot-scoped (either true → unlocked)
function isUnlocked(base) {
  const baseVal = localStorage.getItem(base) === '1';
  const slotVal = localStorage.getItem(slotKey(base)) === '1';
  return baseVal || slotVal;
}

// Write: set both base and slot-scoped for consistency
function setUnlocked(base, v) {
  const val = v ? '1' : '0';
  localStorage.setItem(base, val);
  localStorage.setItem(slotKey(base), val);
}

function ensureUnlockDefaults() {
  // Only set defaults if neither base nor slot key exists
  for (const key of Object.values(BASE_KEYS)) {
    const hasBase = localStorage.getItem(key) != null;
    const hasSlot = localStorage.getItem(slotKey(key)) != null;
    if (!hasBase && !hasSlot) setUnlocked(key, false);
  }
}

function setButtonVisible(key, visible) {
  const el = document.querySelector(`.hud-bottom [data-btn="${key}"]`);
  if (el) el.hidden = !visible;
}

function phonePortrait() {
  const isCoarse = window.matchMedia('(pointer: coarse)').matches;
  const isPortrait = window.innerHeight >= window.innerWidth;
  return isCoarse && isPortrait;
}

let listenersBound = false;
let actionsBound = false;

// ===============================
// HUD layout
// ===============================
export function applyHudLayout() {
  const hud = document.querySelector('.hud-bottom');
  if (!hud) return;

  const mapBtn = hud.querySelector('[data-btn="map"]');
  const isMapVisible = !!(mapBtn && !mapBtn.hidden);
  const isPhonePortrait = phonePortrait();
  const baseOrder = ['help', 'shop', 'stats', 'map'];
  const mobileMapOrder = ['help', 'stats', 'shop', 'map'];

  const desiredOrder = isPhonePortrait && isMapVisible ? mobileMapOrder : baseOrder;

  const desiredNodes = desiredOrder
    .map(key => hud.querySelector(`.game-btn[data-btn="${key}"]`))
    .filter(Boolean);
  const remainingNodes = [...hud.children].filter(el => !desiredNodes.includes(el));
  const finalOrder = [...desiredNodes, ...remainingNodes];

  const needsReorder = finalOrder.length && finalOrder.some((el, idx) => hud.children[idx] !== el);
  if (needsReorder) {
    const frag = document.createDocumentFragment();
    finalOrder.forEach(node => frag.appendChild(node));
    hud.appendChild(frag);
  }

  const all = [...hud.querySelectorAll('.game-btn')];
  const visible = all.filter(el => !el.hidden);

  // Reset previous hints
  hud.classList.remove('is-2','is-3','is-4');
  visible.forEach(el => {
    el.style.gridColumn = '';
    el.style.gridRow = '';
    el.classList.remove('span-2');
    el.style.order = '';
  });
  hud.style.gridTemplateColumns = '';
  hud.classList.add(`is-${visible.length}`);

  // Desktop centering
  if (!isPhonePortrait) {
    const cs  = getComputedStyle(hud);
    const gap = parseFloat(cs.columnGap || cs.gap || '0') || 0;
    const cw  = hud.clientWidth;
    const per = Math.max(180, Math.floor((cw - 3 * gap) / 4));

    if (visible.length === 2) {
      hud.style.gridTemplateColumns = `1fr ${per}px ${per}px 1fr`;
      visible[0].style.gridColumn = '2';
      visible[1].style.gridColumn = '3';
      return;
    }
    if (visible.length === 3) {
      hud.style.gridTemplateColumns = `1fr ${per}px ${per}px ${per}px 1fr`;
      visible[0].style.gridColumn = '2';
      visible[1].style.gridColumn = '3';
      visible[2].style.gridColumn = '4';
      return;
    }
  }

  // Mobile portrait (2×2): Help & Stats top; Shop full width bottom
  if (isPhonePortrait && visible.length === 3) {
    const help  = hud.querySelector('[data-btn="help"]:not([hidden])');
    const stats = hud.querySelector('[data-btn="stats"]:not([hidden])');
    const shop  = hud.querySelector('[data-btn="shop"]:not([hidden])');

    if (help && stats && shop) {
      help.style.gridColumn  = '1'; help.style.gridRow  = '1';
      stats.style.gridColumn = '2'; stats.style.gridRow = '1';
      shop.style.gridColumn  = '1 / -1'; shop.style.gridRow = '2';
    }
  }
}

export function initHudButtons() {
  ensureUnlockDefaults();

  // Always-on buttons
  setButtonVisible('help',  true);
  setButtonVisible('stats', true);

  // Default-locked buttons (now slot-aware reads)
  setButtonVisible('shop', isUnlocked(BASE_KEYS.SHOP));
  setButtonVisible('map',  isUnlocked(BASE_KEYS.MAP));

  applyHudLayout();

  if (!listenersBound) {
    listenersBound = true;
    window.addEventListener('resize', applyHudLayout);
    window.addEventListener('orientationchange', applyHudLayout);
  }

  // Bind actions once (click → open shop)
  if (!actionsBound) {
    actionsBound = true;
    const hud = document.querySelector('.hud-bottom');
    if (hud) {
      const activate = (btn) => {
        if (!btn) return;
        const key = btn.getAttribute('data-btn');
        if (key === 'shop') {
          openShop();
        }
        // future: help/settings/map can import their own modules, too
      };

      const onClick = (e) => {
        const btn = e.target.closest('.game-btn');
        if (!btn) return;
        const key = btn.getAttribute('data-btn');
        if (key !== 'shop') return;
        if (shouldSkipGhostTap(btn)) return;
        activate(btn);
      };

      const hasPointerEvents = typeof window !== 'undefined' && 'PointerEvent' in window;

      const onPointerDown = (e) => {
        if (e.pointerType === 'mouse') return;
        if (typeof e.button === 'number' && e.button !== 0) return;
        const btn = e.target.closest('.game-btn');
        if (!btn) return;
        const key = btn.getAttribute('data-btn');
        if (key !== 'shop') return;
        markGhostTapTarget(btn);
        activate(btn);
        e.preventDefault();
      };

      const onTouchStart = (e) => {
        const btn = e.target.closest('.game-btn');
        if (!btn) return;
        const key = btn.getAttribute('data-btn');
        if (key !== 'shop') return;
        markGhostTapTarget(btn);
        activate(btn);
        e.preventDefault();
      };

      hud.addEventListener('click', onClick, { passive: true });
      if (hasPointerEvents) {
        hud.addEventListener('pointerdown', onPointerDown, { passive: false });
      } else {
        hud.addEventListener('touchstart', onTouchStart, { passive: false });
      }
    }
  }
}

// Convenience helpers (write both keys)
export function unlockShop() { setUnlocked(BASE_KEYS.SHOP, true);  setButtonVisible('shop', true); applyHudLayout(); }
export function unlockMap()  { setUnlocked(BASE_KEYS.MAP,  true);  setButtonVisible('map',  true); applyHudLayout(); }
export function lockShop()   { setUnlocked(BASE_KEYS.SHOP, false); setButtonVisible('shop', false); applyHudLayout(); }
export function lockMap()    { setUnlocked(BASE_KEYS.MAP,  false); setButtonVisible('map',  false); applyHudLayout(); }
