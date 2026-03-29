import { createSASOverlay } from './sasOverlayBuilder.js';
import { openMainSettingsOverlay } from './mainSettingsOverlay.js';
import { openVisualsOverlay } from './visualsOverlay.js';
import { openPerformanceOverlay } from './performanceOverlay.js';
import { openConfirmationsOverlay } from './confirmationsOverlay.js';
import { openCurrenciesOverlay } from './currenciesOverlay.js';
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

  const visBtn = document.createElement("button");
  visBtn.className = "sas-btn";
  visBtn.textContent = "Visuals";
  visBtn.addEventListener("click", () => { openVisualsOverlay(); });
  
  if (!hasDoneForgeReset()) {
    visBtn.style.display = 'none';
  }
  grid.appendChild(visBtn);
  
  const updateVisBtnVisibility = () => {
    if (hasDoneForgeReset()) {
      visBtn.style.display = '';
    }
  };

  window.addEventListener('forge:completed', updateVisBtnVisibility);

  const perfBtn = document.createElement("button");
  perfBtn.className = "sas-btn";
  perfBtn.textContent = "Performance";
  perfBtn.addEventListener("click", () => { openPerformanceOverlay(); });
  grid.appendChild(perfBtn);

  const confBtn = document.createElement("button");
  confBtn.className = "sas-btn";
  confBtn.textContent = "Confirmations";
  confBtn.addEventListener("click", () => { openConfirmationsOverlay(); });
  if (!hasDoneForgeReset()) {
    confBtn.style.display = 'none';
  }
  grid.appendChild(confBtn);
  
  const curBtn = document.createElement("button");
  curBtn.className = "sas-btn";
  curBtn.textContent = "Currencies";
  curBtn.addEventListener("click", () => { openCurrenciesOverlay(); });
  grid.appendChild(curBtn);

  // We add an event listener to unhide it.
  const updateConfBtnVisibility = () => {
    if (hasDoneForgeReset()) {
      confBtn.style.display = '';
    }
  };

  // Just subscribe to something or rely on global re-render, but better to add an event listener
  window.addEventListener('forge:completed', updateConfBtnVisibility);
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
