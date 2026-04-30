import { getActiveSlot } from '../util/storage.js';
import { setupDragToClose, blockInteraction } from './shopOverlay.js';
import { IS_MOBILE } from '../main.js';

const MAP_NODE_LOCKED_KEY = (id, slot) => `ccc:map:locked:${id}:${slot}`;

function isNodeLocked(id, defaultLocked) {
    const slot = getActiveSlot();
    if (slot == null) return defaultLocked;
    const val = localStorage.getItem(MAP_NODE_LOCKED_KEY(id, slot));
    if (val != null) return val === '1';
    return defaultLocked;
}

function setNodeLocked(id, locked) {
    const slot = getActiveSlot();
    if (slot == null) return;
    localStorage.setItem(MAP_NODE_LOCKED_KEY(id, slot), locked ? '1' : '0');
}

let isMapOverlayOpen = false;

function closeMapOverlay(overlay, sheet) {
    if (!isMapOverlayOpen) return;
    isMapOverlayOpen = false;
    
    if (sheet) {
        sheet.style.transform = 'translateY(100%)';
    }
    
    setTimeout(() => {
        if (overlay) {
            overlay.classList.remove('is-open');
        }
        
        // Restart music and spawning when exiting
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('audio:restartMusic'));
            if (window.spawner && typeof window.spawner.start === 'function') {
                window.spawner.start();
            }
        }
    }, 220); // Match transition time
}

export function openMapOverlay(isFirstTime = false) {
    let overlay = document.getElementById('map-overlay');
    let sheet;
    
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'map-overlay';
        overlay.className = 'shop-overlay map-overlay'; // Inherit shop-overlay positioning/z-index properties, use map-overlay for specific styles
        
        sheet = document.createElement('div');
        sheet.className = 'shop-sheet map-sheet';
        sheet.setAttribute('role', 'dialog');
        
        const grabber = document.createElement('div');
        grabber.className = 'shop-grabber';
        grabber.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;
        
        setupDragToClose(grabber, sheet, () => isMapOverlayOpen, () => {
            closeMapOverlay(overlay, sheet);
        });

        const content = document.createElement('div');
        content.className = 'shop-content map-content';

        // Animated Waves
        const wavesContainer = document.createElement('div');
        wavesContainer.className = 'map-waves-container';
        wavesContainer.innerHTML = `
            <div class="map-wave map-wave-3"></div>
            <div class="map-wave map-wave-2"></div>
            <div class="map-wave map-wave-1"></div>
        `;
        content.appendChild(wavesContainer);
        
        // Bubbles/skylight effects
        const bubblesContainer = document.createElement('div');
        bubblesContainer.className = 'map-bubbles-container';
        for (let i = 0; i < 15; i++) {
            const bubble = document.createElement('div');
            bubble.className = 'map-bubble';
            const size = Math.random() * 10 + 5;
            bubble.style.width = `${size}px`;
            bubble.style.height = `${size}px`;
            bubble.style.left = `${Math.random() * 100}%`;
            bubble.style.animationDuration = `${Math.random() * 3 + 2}s`;
            bubble.style.animationDelay = `${Math.random() * 2}s`;
            bubblesContainer.appendChild(bubble);
        }
        content.appendChild(bubblesContainer);

        const title = document.createElement('h1');
        title.textContent = 'The Ocean';
        title.style.position = 'absolute';
        title.style.top = '5vh';
        title.style.width = '100%';
        title.style.textAlign = 'center';
        title.style.color = 'white';
        title.style.textShadow = '2px 2px 4px black';
        title.style.margin = '0';
        title.style.zIndex = '2';
        content.appendChild(title);

        const nodesContainer = document.createElement('div');
        nodesContainer.style.position = 'relative';
        nodesContainer.style.width = '100%';
        nodesContainer.style.height = '100%';
        nodesContainer.style.flex = '1';
        nodesContainer.style.zIndex = '2';

        const nodes = [
            { id: 'cove', name: 'The Cove', icon: 'img/currencies/coin/coin_plus_base.webp', top: '25%', left: '50%', defaultLocked: false },
            { id: 'cavern', name: 'Underwater Cavern', icon: 'img/misc/mysterious_plus_base.webp', top: '45%', left: '75%', defaultLocked: false },
            { id: 'coral', name: 'Coral Reef', icon: 'img/misc/locked_plus_base.webp', top: '65%', left: '25%', defaultLocked: true },
            { id: 'depths', name: 'Deep Depths', icon: 'img/misc/locked_plus_base.webp', top: '85%', left: '50%', defaultLocked: true }
        ];

        nodes.forEach(node => {
            const isLocked = isNodeLocked(node.id, node.defaultLocked);
            const btn = document.createElement('button');
            btn.style.position = 'absolute';
            btn.style.top = node.top;
            btn.style.left = node.left;
            btn.style.transform = 'translate(-50%, -50%)';
            btn.style.background = 'none';
            btn.style.border = 'none';
            btn.style.cursor = isLocked ? 'not-allowed' : 'pointer';
            btn.style.display = 'flex';
            btn.style.flexDirection = 'column';
            btn.style.alignItems = 'center';
            btn.style.color = 'white';
            btn.style.textShadow = '1px 1px 2px black';

            const img = document.createElement('img');
            img.src = node.icon;
            img.style.width = '64px';
            img.style.height = '64px';
            img.style.marginBottom = '8px';
            if (isLocked) {
                img.style.filter = 'grayscale(100%)';
                img.style.opacity = '0.7';
            }

            const label = document.createElement('span');
            label.textContent = node.name;
            label.style.fontWeight = 'bold';

            btn.appendChild(img);
            btn.appendChild(label);

            btn.onclick = () => {
                if (isLocked) return;
                if (IS_MOBILE) blockInteraction(500);

                const teleportMsg = document.createElement('div');
                teleportMsg.className = 'map-teleporting-message';
                teleportMsg.textContent = `Teleporting to ${node.name}...`;
                overlay.appendChild(teleportMsg);

                // Force reflow
                teleportMsg.offsetHeight;
                teleportMsg.classList.add('show');

                setTimeout(() => {
                    teleportMsg.remove();
                    closeMapOverlay(overlay, sheet);
                }, 450);
            };

            nodesContainer.appendChild(btn);
        });

        content.appendChild(nodesContainer);
        
        const actions = document.createElement('div');
        actions.className = 'shop-actions';
        
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'shop-close';
        closeBtn.textContent = 'Close';
        closeBtn.onclick = () => {
            closeMapOverlay(overlay, sheet);
        };
        
        actions.appendChild(closeBtn);
        
        sheet.appendChild(grabber);
        sheet.appendChild(content);
        sheet.appendChild(actions);
        overlay.appendChild(sheet);

        document.body.appendChild(overlay);
        
        // Add first time fade element right away if needed
        if (isFirstTime) {
            const firstTimeFade = document.createElement('div');
            firstTimeFade.className = 'map-first-time-fade';
            document.body.appendChild(firstTimeFade);
            
            // Force reflow
            firstTimeFade.offsetHeight;
            
            // Start fade out
            firstTimeFade.style.opacity = '0';
            
            setTimeout(() => {
                firstTimeFade.remove();
            }, 5000);
        }

    } else {
        sheet = overlay.querySelector('.map-sheet');
    }

    isMapOverlayOpen = true;
    overlay.classList.add('is-open');
    if (sheet) {
        sheet.style.transform = 'translateY(0)';
    }
}
