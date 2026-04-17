import { createSASOverlay } from './sasOverlayBuilder.js';

function populateShortcutsOverlay(overlayEl) {
  const container = overlayEl.querySelector('.sas-shortcuts-container');
  if (!container) return;
  container.innerHTML = "";

  const shortcuts = [
    { key: "X", desc: "Toggle User Interface" }, // Placeholder
    { key: "M", desc: "Mute All Audio" }, // Placeholder
    { key: "Space", desc: "Jump / Action" } // Placeholder
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