// js/util/slotsManager.js
import { KEYS, getActiveSlot } from './storage.js';
import { refreshSlotsView } from './slots.js';

let deleteMode = false;
let initialized = false;

export function isDeleteMode() { return deleteMode; }

function setDeleteMode(on) {
  deleteMode = !!on;
  document.body.classList.toggle('slots-delete-mode', deleteMode);

  const btn = document.getElementById('manage-saves');
  if (btn) btn.textContent = deleteMode ? 'Done' : 'Manage save slots';

  document.querySelectorAll('.slot-card').forEach((card) => {
    card.classList.toggle('is-deleting', deleteMode);
    card.setAttribute('aria-pressed', deleteMode ? 'true' : 'false');
  });
}

function removeAllKeysForSlot(slot) {
  const re = new RegExp(`^ccc:.*:${slot}$`);
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (re.test(k)) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}

export function initSlotsManager() {
  if (initialized) return;
  initialized = true;

  const manageBtn = document.getElementById('manage-saves');
  const grid = document.querySelector('.slots-grid');
  if (!manageBtn || !grid) return;

  manageBtn.addEventListener('click', (e) => {
    e.preventDefault();
    setDeleteMode(!deleteMode);
  });

  window.addEventListener('keydown', (e) => {
    if (deleteMode && e.key === 'Escape') setDeleteMode(false);
  });

  // Capture early to block the regular slot click handler
  const onPointerDownCapture = (e) => {
    if (!deleteMode) return;
    const card = e.target.closest('.slot-card');
    if (!card) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const onClickCapture = (e) => {
    if (!deleteMode) return;
    const card = e.target.closest('.slot-card');
    if (!card) return;

    e.preventDefault();
    e.stopPropagation();

    // Figure out slot number
    let slot = parseInt(card.dataset.slot, 10);
    if (!Number.isFinite(slot) || slot <= 0) {
      const cards = Array.from(document.querySelectorAll('.slot-card'));
      slot = cards.indexOf(card) + 1;
    }

    // Only delete if slot has data
    const hasData = localStorage.getItem(`ccc:coins:${slot}`) !== null;
    if (!hasData) {
      alert(`Slot ${slot} has no save data.`);
      return;
    }

    if (!confirm(`Delete save data in Slot ${slot}? This cannot be undone.`)) return;

    removeAllKeysForSlot(slot);

    if (getActiveSlot() === slot) {
      try { localStorage.removeItem(KEYS.SAVE_SLOT); } catch {}
    }

    refreshSlotsView();
    setDeleteMode(false);
  };

  grid.addEventListener('pointerdown', onPointerDownCapture, true); // capture
  grid.addEventListener('click', onClickCapture, true);             // capture

  setDeleteMode(false);
}

// Auto-init in case nothing imports us explicitly
document.addEventListener('DOMContentLoaded', () => {
  try { initSlotsManager(); } catch {}
});
