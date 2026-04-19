import { createSASOverlay } from './sasOverlayBuilder.js';
import { getTsunamiSequenceSeen } from '../../game/surgeEffects.js';


function populateShortcutsOverlay(overlayEl) {
  const container = overlayEl.querySelector('.sas-shortcuts-container');
  if (!container) return;
  container.innerHTML = "";

  let rcDesc = "On any sort of Shop upgrade, right-click its icon to perform a Buy Max onto it.";
  if (typeof getTsunamiSequenceSeen === 'function' && getTsunamiSequenceSeen()) {
    rcDesc += " Right-click also can be used to instantly toggle Lab Nodes.";
  }

  const shortcuts = [
    { key: "RC", desc: rcDesc },
    { key: "Shift+LC", desc: "On any sort of Shop upgrade, hold shift and left-click its icon to perform a Buy Cheap onto it. Upgrades that do not support this will default to Buy Max." },
    { key: "Ctrl+LC", desc: "On any sort of Shop upgrade, hold ctrl and left-click its icon to perform a Buy Next onto it. Upgrades that do not support this will default to Buy Max." },
    { key: "0-9", desc: "Inside Delve overlays, press number keys 0 through 9 to instantly swap between tabs. First tab is 1, and pressing 0 sends to last tab." },
    { key: "Esc", desc: "Inside any overlay, pressing Esc will instantly close all currently open overlays with a few exceptions." }
  ];

  shortcuts.forEach(shortcut => {
    const row = document.createElement("div");
    row.className = "setting-row";
    row.style.marginTop = "16px";
    row.style.marginBottom = "16px";

    const keyContainer = document.createElement("div");
    keyContainer.className = "setting-toggle";
    
    const keyLabel = document.createElement("div");
    // Style similar to setting-toggle-label but for static text
    keyLabel.style.boxSizing = "border-box";
    keyLabel.style.display = "flex";
    keyLabel.style.alignItems = "center";
    keyLabel.style.justifyContent = "center";
    keyLabel.style.width = "100px";
    keyLabel.style.height = "44px";
    keyLabel.style.borderRadius = "8px";
    keyLabel.style.position = "relative";
    keyLabel.style.backgroundColor = "#333";
    keyLabel.style.border = "2px solid #555";
    keyLabel.style.color = "#fff";
    keyLabel.style.fontWeight = "800";
    keyLabel.style.fontSize = "16px";
    keyLabel.style.textShadow = "0 1px 0 #000";
    keyLabel.textContent = shortcut.key;

    keyContainer.appendChild(keyLabel);

    const clickGap = document.createElement("div");
    clickGap.className = "setting-click-gap";

    const desc = document.createElement("div");
    desc.className = "setting-description";
    
    const labelSpan = document.createElement("span");
    labelSpan.textContent = shortcut.desc;
    desc.appendChild(labelSpan);

    row.append(keyContainer, clickGap, desc);
    container.appendChild(row);
  });
}

const shortcutsOverlay = createSASOverlay({
  id: 'shortcuts-overlay',
  title: 'Shortcuts',
  containerClass: 'sas-shortcuts-container',
  zIndex: '4010',
  onRender: (overlayEl) => {
    populateShortcutsOverlay(overlayEl);
  }
});

export function openShortcutsOverlay() {
  shortcutsOverlay.open();
}

export function closeShortcutsOverlay(force = false) {
  shortcutsOverlay.close(force);
}
