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

export function openConfirmationsOverlay() {
  confirmationsOverlay.open();
}

export function closeConfirmationsOverlay(force = false) {
  confirmationsOverlay.close(force);
}