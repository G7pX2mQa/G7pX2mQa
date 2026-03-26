import { createSASOverlay } from './sasOverlayBuilder.js';
import { openMainSettingsOverlay } from './mainSettingsOverlay.js';
import { openVisualsOverlay } from './visualsOverlay.js';
import { openPerformanceOverlay } from './performanceOverlay.js';
import { hasDoneForgeReset } from '../merchantTabs/resetTab.js';

function populateSasButtons(overlayEl) {
  const grid = overlayEl.querySelector('.sas-grid');
  if (!grid) return;
  grid.innerHTML = "";
  grid.setAttribute('role', 'grid');
  
  const mainBtn = document.createElement("button");
  mainBtn.className = "sas-btn";
  mainBtn.textContent = "Main";
  mainBtn.addEventListener("click", () => { openMainSettingsOverlay(); });
  grid.appendChild(mainBtn);

  if (hasDoneForgeReset()) {
    const visBtn = document.createElement("button");
    visBtn.className = "sas-btn";
    visBtn.textContent = "Visuals";
    visBtn.addEventListener("click", () => { openVisualsOverlay(); });
    grid.appendChild(visBtn);
  }

  const perfBtn = document.createElement("button");
  perfBtn.className = "sas-btn";
  perfBtn.textContent = "Performance";
  perfBtn.addEventListener("click", () => { openPerformanceOverlay(); });
  grid.appendChild(perfBtn);
}

const sasOverlay = createSASOverlay({
  id: 'sas-overlay',
  title: 'Stats & Settings',
  containerClass: 'sas-grid',
  // Use default zIndex of 4010 from builder or unset
  zIndex: '',
  focusSelector: '.sas-btn, .sas-grid',
  onRender: (overlayEl) => {
    populateSasButtons(overlayEl);
  }
});

export function openSasOverlay() {
  sasOverlay.open();
}

export function closeSasOverlay(force = false) {
  sasOverlay.close(force);
}
