import { renderSettingsMenu } from './settingsRenderer.js';
import { createSASOverlay } from './sasOverlayBuilder.js';

const unsubscribers = [];

const confirmationsOverlay = createSASOverlay({
  id: 'confirmations-overlay',
  title: 'Confirmations',
  containerClass: 'sas-settings-container',
  zIndex: '4010',
  focusSelector: '.sas-close',
  onRender: (overlayEl) => {
    renderSettingsMenu(overlayEl, '.sas-settings-container', 'confirmations', unsubscribers);
  }
});

if (typeof window !== 'undefined') {
  window.addEventListener('unlock:change', (e) => {
    const detail = e?.detail;
    if (!detail) return;
    if (['forge', 'infuse', 'surge', 'experiment_completed'].includes(detail.key)) {
      if (confirmationsOverlay.overlayEl && confirmationsOverlay.overlayEl.classList.contains('is-open')) {
        renderSettingsMenu(confirmationsOverlay.overlayEl, '.sas-settings-container', 'confirmations', unsubscribers);
      }
    }
  });
}

export function openConfirmationsOverlay() {
  confirmationsOverlay.open();
}

export function closeConfirmationsOverlay(force = false) {
  confirmationsOverlay.close(force);
}
