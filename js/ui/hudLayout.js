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

export function syncDpPpHudLayout() {
  if (typeof document === 'undefined') return;
  const hud = document.querySelector('.hud-top');
  if (!hud) return;

  const dpEl = document.querySelector('[data-dp-hud]');
  const ppEl = document.querySelector('[data-pp-hud]');
  const gameRoot = document.getElementById('game-root');
  const isCavernHud = (gameRoot && gameRoot.classList.contains('area-cavern')) || !!hud.closest('.area-cavern');
  const dpVisible = isCavernHud && !!(dpEl && !dpEl.hasAttribute('hidden'));
  const ppVisible = isCavernHud && !!(ppEl && !ppEl.hasAttribute('hidden'));

  hud.classList.toggle('hud-top--dp-only', dpVisible && !ppVisible);
  hud.classList.toggle('hud-top--dp-pp', dpVisible && ppVisible);

  if (!dpVisible && !ppVisible) {
    hud.classList.remove('hud-top--dp-only', 'hud-top--dp-pp');
  }
}

export function syncRclpGclpHudLayout() {
  if (typeof document === 'undefined') return;
  const hud = document.querySelector('.hud-top');
  if (!hud) return;

  const rclpEl = document.querySelector('[data-rclp-hud]');
  const gclpEl = document.querySelector('[data-gclp-hud]');
  const gameRoot = document.getElementById('game-root');
  const isCoralHud = (gameRoot && gameRoot.classList.contains('area-coral')) || !!hud.closest('.area-coral');
  const rclpVisible = isCoralHud && !!(rclpEl && !rclpEl.hasAttribute('hidden'));
  const gclpVisible = isCoralHud && !!(gclpEl && !gclpEl.hasAttribute('hidden'));

  hud.classList.toggle('hud-top--rclp-only', rclpVisible && !gclpVisible);
  hud.classList.toggle('hud-top--rclp-gclp', rclpVisible && gclpVisible);

  if (!rclpVisible && !gclpVisible) {
    hud.classList.remove('hud-top--rclp-only', 'hud-top--rclp-gclp');
  }
}
