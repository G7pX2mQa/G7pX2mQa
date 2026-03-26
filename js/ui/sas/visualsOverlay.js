import { renderSettingsMenu } from './settingsRenderer.js';
import { createSASOverlay } from './sasOverlayBuilder.js';

const unsubscribers = [];

const visualsOverlay = createSASOverlay({
  id: 'visuals-overlay',
  title: 'Visuals',
  containerClass: 'sas-settings-container',
  zIndex: '4010',
  focusSelector: '.sas-close',
  onRender: (overlayEl) => {
    renderSettingsMenu(overlayEl, '.sas-settings-container', 'visuals', unsubscribers);
  }
});

export function openVisualsOverlay() {
  visualsOverlay.open();
}

export function closeVisualsOverlay(force = false) {
  visualsOverlay.close(force);
}
