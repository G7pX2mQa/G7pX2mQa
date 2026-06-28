import { BigNum } from './bigNum.js';
import { formatNumber } from './numFormat.js';
import { isDeleteMode } from './slotsManager.js';
import { FONT_MAP, ALL_FONT_CLASSES } from '../main.js';
import {
  setHasOpenedSaveSlot,
  ensureCurrencyDefaults,
  ensureMultiplierDefaults,
  setActiveSlot,
  peekCurrency,
} from './storage.js';

// A slot is considered "used" once it has a coins key at all (even if 0)
function hasSlotData(slot) {
  return localStorage.getItem(`ccc:coins:${slot}`) !== null;
}

function coinsTextFor(slot) {
  if (!hasSlotData(slot)) return 'No Save Data';
  try {
    const bn = peekCurrency(slot, 'coins'); // BigNum
    const notation = localStorage.getItem(`ccc:setting:number_notation:${slot}`);
    return formatNumber(bn, notation ? JSON.parse(notation) : 'Standard');
  } catch {
    return '0';
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatCreationDate(timestamp) {
  const d = new Date(parseInt(timestamp, 10));
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function renderSlotCards() {
  const cards = document.querySelectorAll('.slot-card');

  cards.forEach((btn, idx) => {
    const slot = idx + 1;
    const titleEl = btn.querySelector('.slot-title');

    if (titleEl) {
      const text = coinsTextFor(slot);
      titleEl.innerHTML = `<img src="img/currencies/coin/coin.webp" class="coin-slot-icon-img" alt=""> ${text}`;
    }

    const existingMeta = btn.querySelector('.slot-meta');
    if (existingMeta) {
      existingMeta.remove();
    }

    if (hasSlotData(slot)) {
      let creationTime = localStorage.getItem(`ccc:creationTime:${slot}`);
      if (!creationTime) {
        creationTime = Date.now().toString();
        localStorage.setItem(`ccc:creationTime:${slot}`, creationTime);
      }
      const metaEl = document.createElement('div');
      metaEl.className = 'slot-meta';
      metaEl.textContent = `Created on: ${formatCreationDate(creationTime)}`;
      btn.appendChild(metaEl);
    }

    btn.dataset.slot = String(slot);
    btn.classList.remove(...ALL_FONT_CLASSES);
    const fontModStr = localStorage.getItem(`ccc:setting:active_font_mod:${slot}`);
    if (fontModStr) {
      try {
        const fontMod = parseInt(JSON.parse(fontModStr), 10);
        if (FONT_MAP[fontMod]) {
            btn.classList.add(FONT_MAP[fontMod]);
        }
      } catch (e) {}
    }

  });
}

export function initSlots(onSelect) {
  const cards = document.querySelectorAll('.slot-card');

  // Initial paint
  renderSlotCards();

  cards.forEach((btn, idx) => {
    const slotNum = idx + 1;

    const activate = (ev) => {
      if (window.__duplicateInstanceDetected) return;

      // Switch to this slot and seed its defaults the first time it’s opened
      setActiveSlot(slotNum);
      if (window.__duplicateInstanceDetected) return;

      let creationTime = localStorage.getItem(`ccc:creationTime:${slotNum}`);
      if (!creationTime) {
        localStorage.setItem(`ccc:creationTime:${slotNum}`, Date.now().toString());
      }

      ensureCurrencyDefaults();
      ensureMultiplierDefaults();

      setHasOpenedSaveSlot(true);
      if (typeof onSelect === 'function') onSelect(slotNum, ev);

      // Repaint card titles after seeding
      renderSlotCards();
    };

    btn.addEventListener('click', (ev) => {
      if (isDeleteMode()) return;
      ev.preventDefault();
      activate(ev);
    });
  });
}

export function refreshSlotsView() { renderSlotCards(); }
