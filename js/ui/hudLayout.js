// js/ui/hudLayout.js

export function syncXpMpHudLayout() {
  if (typeof document === 'undefined') return;
  const hud = document.querySelector('.hud-top');
  if (!hud) return;

  const xpEl = document.querySelector('[data-xp-hud]');
  const mpEl = document.querySelector('[data-mp-hud]');
  const isCoveHud = !!hud.closest('.area-cove');
  const xpVisible = isCoveHud && !!(xpEl && !xpEl.hasAttribute('hidden'));
  const mpVisible = isCoveHud && !!(mpEl && !mpEl.hasAttribute('hidden'));

  hud.classList.toggle('hud-top--xp-only', xpVisible && !mpVisible);
  hud.classList.toggle('hud-top--xp-mp', xpVisible && mpVisible);

  if (!xpVisible && !mpVisible) {
    hud.classList.remove('hud-top--xp-only', 'hud-top--xp-mp');
  }
}

export function syncDpHudLayout() {
  if (typeof document === 'undefined') return;
  const hud = document.querySelector('.hud-top');
  if (!hud) return;

  const dpEl = document.querySelector('[data-dp-hud]');
  const isCavernHud = !!hud.closest('.area-cavern');
  const dpVisible = isCavernHud && !!(dpEl && !dpEl.hasAttribute('hidden'));

  // If you need specific CSS classes for DP like XP/MP
  // hud.classList.toggle('hud-top--dp-only', dpVisible);
}
