// js/ui/hudLayout.js

export function syncXpMpHudLayout() {
  if (typeof document === 'undefined') return;
  const hud = document.querySelector('.hud-top');
  if (!hud) return;

  const xpEl = document.querySelector('[data-xp-hud]');
  const mpEl = document.querySelector('[data-mp-hud]');
  const xpVisible = !!(xpEl && !xpEl.hasAttribute('hidden'));
  const mpVisible = !!(mpEl && !mpEl.hasAttribute('hidden'));

  hud.classList.toggle('hud-top--xp-only', xpVisible && !mpVisible);
  hud.classList.toggle('hud-top--xp-mp', xpVisible && mpVisible);

  if (!xpVisible && !mpVisible) {
    hud.classList.remove('hud-top--xp-only', 'hud-top--xp-mp');
  }
}