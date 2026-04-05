import { createSASOverlay } from './sasOverlayBuilder.js';

const achievementsOverlay = createSASOverlay({
  id: 'achievements-overlay',
  title: 'Achievements',
  containerClass: 'achievements-container',
  zIndex: '4010',
  onRender: (overlayEl) => {
    const container = overlayEl.querySelector('.achievements-container');
    if (!container) return;
    container.innerHTML = '';
    
    const placeholder = document.createElement('div');
    placeholder.className = 'achievements-placeholder';
    placeholder.textContent = 'Achievements coming soon...';
    
    container.appendChild(placeholder);
  }
});

export function openAchievementsOverlay() {
  achievementsOverlay.open();
}

export function closeAchievementsOverlay(force = false) {
  achievementsOverlay.close(force);
}