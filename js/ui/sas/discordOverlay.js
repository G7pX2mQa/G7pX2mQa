import { createSASOverlay } from './sasOverlayBuilder.js';

function populateDiscordOverlay(overlayEl) {
  const container = overlayEl.querySelector('.sas-discord-container');
  if (!container) return;
  container.innerHTML = "";
  
  // Apply a nice centered, padding layout for the content
  container.style.display = 'flex';
  container.style.justifyContent = 'center';
  container.style.alignItems = 'center';
  container.style.padding = '20px';
  container.style.minHeight = '100%';
  const scroller = overlayEl.querySelector('.sas-scroller');
  if (scroller) {
    scroller.style.display = 'flex';
    scroller.style.flexDirection = 'column';
    scroller.style.justifyContent = 'center';
  }

  const link = document.createElement('a');
  link.href = 'https://discord.gg/vk8eZRcrPs';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = "Click here to join this game's community Discord server";
  
  // Standard link styling, ensuring it aligns center. We can inherit from the document,
  // or add some explicit sizing
  link.style.color = '#5865F2'; // Discord blurple for a nice default
  link.style.fontSize = '1.25rem';
  link.style.fontWeight = 'bold';
  link.style.textAlign = 'center';
  link.style.textDecoration = 'underline';

  container.appendChild(link);
}

const discordOverlay = createSASOverlay({
  id: 'discord-overlay',
  title: 'Discord',
  containerClass: 'sas-discord-container',
  zIndex: '4010', // Or appropriate zIndex
  onRender: (overlayEl) => {
    populateDiscordOverlay(overlayEl);
  }
});

export function openDiscordOverlay() {
  discordOverlay.open();
}

export function closeDiscordOverlay(force = false) {
  discordOverlay.close(force);
}