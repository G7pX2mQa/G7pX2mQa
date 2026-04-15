import { createSASOverlay } from './sas/sasOverlayBuilder.js';

const HELP_ENTRIES = [
  {
    id: 'basics',
    title: 'Basics',
    heading: 'How to Play',
    content: 'Click the coins to collect them. Once you have enough coins, you can buy upgrades in the shop to collect coins automatically or increase your clicking power.'
  },
  {
    id: 'upgrades',
    title: 'Upgrades',
    heading: 'Understanding Upgrades',
    content: 'Upgrades increase your coin production. Some upgrades affect your active clicks, while others increase your passive income over time.'
  },
  {
    id: 'prestige',
    title: 'Prestige',
    heading: 'Resetting for Power',
    content: 'Once you reach a certain point, you can reset your progress to earn special currencies. These currencies can be used to purchase powerful permanent upgrades.'
  }
];

let currentEntryId = HELP_ENTRIES[0].id;

function renderHelpContent(overlayEl) {
  const container = overlayEl.querySelector('.help-container');
  if (!container) return;

  const currentEntry = HELP_ENTRIES.find(e => e.id === currentEntryId);

  // Build Sidebar
  let sidebarHtml = '<aside class="help-sidebar">';
  HELP_ENTRIES.forEach(entry => {
    const isActive = entry.id === currentEntryId ? 'is-active' : '';
    sidebarHtml += `<button type="button" class="help-layer ${isActive}" data-help-id="${entry.id}">
      <span>${entry.title}</span>
    </button>`;
  });
  sidebarHtml += '</aside>';

  // Build Content
  const contentHtml = `
    <div class="help-content-area">
      <div class="help-card">
        <h3>${currentEntry.heading}</h3>
        <p>${currentEntry.content}</p>
      </div>
    </div>
  `;

  // Build Spacer (Right side empty column)
  const spacerHtml = '<div class="help-spacer"></div>';

  container.innerHTML = sidebarHtml + contentHtml + spacerHtml;

  // Add event listeners to sidebar buttons
  const buttons = container.querySelectorAll('.help-layer');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-help-id');
      if (id && id !== currentEntryId) {
        currentEntryId = id;
        renderHelpContent(overlayEl); // Re-render content
      }
    });
  });
}

const helpOverlay = createSASOverlay({
  id: 'help-overlay',
  title: 'Help',
  containerClass: 'help-container',
  zIndex: '4015',
  onRender: (overlayEl) => {
    renderHelpContent(overlayEl);
  }
});

export function openHelpOverlay() {
  helpOverlay.open();
}

export function closeHelpOverlay(force = false) {
  helpOverlay.close(force);
}