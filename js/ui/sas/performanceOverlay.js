import { renderSettingsMenu } from './settingsRenderer.js';
import { createSASOverlay } from './sasOverlayBuilder.js';

const unsubscribers = [];

const performanceOverlay = createSASOverlay({
  id: 'performance-overlay',
  title: 'Performance',
  containerClass: 'sas-settings-container',
  zIndex: '4010',
  focusSelector: '.sas-close',
  onRender: (overlayEl) => {
    renderSettingsMenu(overlayEl, '.sas-settings-container', 'performance', unsubscribers);
  }
});

export function openPerformanceOverlay() {
  performanceOverlay.open();
}

export function closePerformanceOverlay(force = false) {
  performanceOverlay.close(force);
}
