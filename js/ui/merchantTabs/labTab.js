import { getActiveSlot } from '../../util/storage.js';

const LAB_VISITED_KEY = (slot) => `ccc:lab:visited:${slot}`;

export function hasVisitedLab() {
  const slot = getActiveSlot();
  if (slot == null) return false;
  try {
    return localStorage.getItem(LAB_VISITED_KEY(slot)) === '1';
  } catch {
    return false;
  }
}

export function setLabVisited(value) {
  const slot = getActiveSlot();
  if (slot == null) return;
  const normalized = !!value;
  try {
    localStorage.setItem(LAB_VISITED_KEY(slot), normalized ? '1' : '0');
  } catch {}
}

export function initLabTab(panel) {
  if (!panel) return;
  panel.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">The Lab is empty... for now.</div>';
}

export function updateLabTab() {
  setLabVisited(true);
}
