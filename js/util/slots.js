import { BigNum } from './bigNum.js';
import { isDeleteMode } from './slotsManager.js';
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
  if (!hasSlotData(slot)) return 'No save data';
  try {
    const bn = peekCurrency(slot, 'coins'); // BigNum
    return `Coins: ${bn.toString()}`;
  } catch {
    return 'Coins: 0';
  }
}

function renderSlotCards() {
  const cards = document.querySelectorAll('.slot-card');
  cards.forEach((btn, idx) => {
    const slot = idx + 1;
    const titleEl = btn.querySelector('.slot-title');

    if (titleEl) titleEl.textContent = coinsTextFor(slot);

    btn.dataset.slot = String(slot);
  });
}

export function initSlots(onSelect) {
  const cards = document.querySelectorAll('.slot-card');

  // Initial paint
  renderSlotCards();

  cards.forEach((btn, idx) => {
    const slotNum = idx + 1;

    const activate = (ev) => {
      // Switch to this slot and seed its defaults the first time it’s opened
      setActiveSlot(slotNum);
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
