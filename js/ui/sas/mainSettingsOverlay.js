import { renderSettingsMenu } from './settingsRenderer.js';
import { createSASOverlay } from './sasOverlayBuilder.js';
import { IS_MOBILE } from '../../main.js';
import { settingsManager } from '../../game/settingsManager.js';

let uiHiddenPopupEl = null;
let uiHiddenBtnEl = null;

// Expose setup for initialization later to avoid immediate subscribe errors during bundle loading
export function initUIHiding() {
  settingsManager.subscribe('user_interface', applyUserInterfaceSetting);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'x' || e.key === 'X') {
      if (!settingsManager.get('user_interface')) {
        settingsManager.set('user_interface', true);
      }
    }
  });

  // Run initial state once DOM is ready or defer
  setTimeout(() => {
    applyUserInterfaceSetting(settingsManager.get('user_interface'));
  }, 100);
}

function applyUserInterfaceSetting(isUIEnabled) {
  const elementsToHide = [
    document.querySelector('.hud-top'),
    document.querySelector('.hud-bottom'),
    document.querySelector('.currency-popups'),
    ...document.querySelectorAll('.merchant-btn')
  ].filter(Boolean);

  elementsToHide.forEach(el => {
    if (isUIEnabled) {
      el.classList.remove('hide-ui');
    } else {
      el.classList.add('hide-ui');
    }
  });

  if (!isUIEnabled) {
    if (!uiHiddenPopupEl) {
      uiHiddenPopupEl = document.createElement('div');
      uiHiddenPopupEl.className = 'hide-ui-popup is-visible'; // Re-use styling for popup overlay that covers full screen
      uiHiddenPopupEl.style.zIndex = '999999';
      uiHiddenPopupEl.style.pointerEvents = 'auto'; // Block background

      const card = document.createElement('div');
      card.className = 'hide-ui-popup__card';
      card.setAttribute('role', 'dialog');
      const row = document.createElement('div');
      row.className = 'hide-ui-popup__row';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'center';
      row.style.padding = '24px 0';
      row.style.minHeight = '200px';

      const text = document.createElement('div');
      text.className = 'hide-ui-popup__text';
      text.style.textAlign = 'center';
      text.style.width = '100%';
      text.style.fontSize = '1.2em';

      if (IS_MOBILE) {
        text.innerHTML = 'Press the button in the bottom right corner or refresh the page to re-enable UI';
      } else {
        text.innerHTML = 'Press "X" on your keyboard or refresh the page to re-enable UI';
      }
      row.appendChild(text);

      const actions = document.createElement('div');
      actions.className = 'hide-ui-popup__choices sas-actions'; // added sas-actions to inherit button styles properly
      actions.style.display = 'flex';
      actions.style.justifyContent = 'center';
      actions.style.marginTop = '24px';
      actions.style.padding = '0'; // reset any padding from sas-actions default
      actions.style.border = 'none'; // reset any border
      actions.style.background = 'transparent'; // reset background
      
      const closeBtn = document.createElement('button');
      closeBtn.className = 'sas-close'; // use existing button style
      closeBtn.textContent = 'Close';
      closeBtn.type = 'button';
      closeBtn.style.minWidth = '180px';
      closeBtn.addEventListener('click', () => {
        if (uiHiddenPopupEl) uiHiddenPopupEl.style.display = 'none';
      });
      
      actions.appendChild(closeBtn);
      
      card.appendChild(row);
      card.appendChild(actions);
      uiHiddenPopupEl.appendChild(card);
      document.body.appendChild(uiHiddenPopupEl);
    }
    uiHiddenPopupEl.style.display = '';

    if (IS_MOBILE) {
      if (!uiHiddenBtnEl) {
        uiHiddenBtnEl = document.createElement('button');
        uiHiddenBtnEl.textContent = 'X';
        uiHiddenBtnEl.style.position = 'fixed';
        uiHiddenBtnEl.style.bottom = '20px';
        uiHiddenBtnEl.style.right = '20px';
        uiHiddenBtnEl.style.width = '50px';
        uiHiddenBtnEl.style.height = '50px';
        uiHiddenBtnEl.style.borderRadius = '50%';
        uiHiddenBtnEl.style.backgroundColor = '#d9534f';
        uiHiddenBtnEl.style.color = 'white';
        uiHiddenBtnEl.style.fontSize = '24px';
        uiHiddenBtnEl.style.fontWeight = 'bold';
        uiHiddenBtnEl.style.border = '2px solid white';
        uiHiddenBtnEl.style.zIndex = '999998';
        uiHiddenBtnEl.addEventListener('click', () => {
          settingsManager.set('user_interface', true);
        });
        document.body.appendChild(uiHiddenBtnEl);
      }
      uiHiddenBtnEl.style.display = '';
    }
  } else {
    if (uiHiddenPopupEl) uiHiddenPopupEl.style.display = 'none';
    if (uiHiddenBtnEl) uiHiddenBtnEl.style.display = 'none';
  }
}

const unsubscribers = [];

const mainSettingsOverlay = createSASOverlay({
  id: 'main-settings-overlay',
  title: 'Main Settings',
  containerClass: 'main-settings-container',
  zIndex: '4010',
  onRender: (overlayEl) => {
    renderSettingsMenu(overlayEl, '.main-settings-container', 'main', unsubscribers);
  }
});

if (typeof window !== 'undefined') {
  window.addEventListener('unlock:change', () => {
    if (mainSettingsOverlay.isOpen && mainSettingsOverlay.overlayEl) {
      renderSettingsMenu(mainSettingsOverlay.overlayEl, '.main-settings-container', 'main', unsubscribers);
    }
  });
}

export function openMainSettingsOverlay() {
  mainSettingsOverlay.open();
}

export function closeMainSettingsOverlay(force = false) {
  mainSettingsOverlay.close(force);
}
