
import { getActiveSlot } from '../util/storage.js';

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

export function openMapOverlay(isFirstTime = false) {
    let overlay = document.getElementById('map-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'map-overlay';
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.zIndex = '2147483640'; 
        
        overlay.style.background = `
            linear-gradient(
                to bottom,
                #87ceeb 0%,
                #87ceeb 20%,
                #0077be 20%,
                #000000 100%
            )
        `;
        overlay.style.overflowY = 'auto'; 
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        
        // Bubbles/skylight effects
        const bubbles = document.createElement('div');
        bubbles.style.position = 'absolute';
        bubbles.style.top = '20%';
        bubbles.style.left = '0';
        bubbles.style.width = '100%';
        bubbles.style.height = '100px';
        bubbles.style.background = 'radial-gradient(circle at center, rgba(255,255,255,0.4) 0%, transparent 70%)';
        bubbles.style.pointerEvents = 'none';
        bubbles.style.zIndex = '1';
        overlay.appendChild(bubbles);

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
        overlay.appendChild(title);

        const nodesContainer = document.createElement('div');
        nodesContainer.style.position = 'relative';
        nodesContainer.style.width = '100%';
        nodesContainer.style.minHeight = '100vh'; // Allows scrolling if needed
        nodesContainer.style.flex = '1';
        nodesContainer.style.zIndex = '2';

        const nodes = [
            { id: 'cove', name: 'The Cove', icon: 'img/currencies/coin/coin_plus_base.webp', top: '25vh', left: '50vw', defaultLocked: false },
            { id: 'coral', name: 'Coral Reef', icon: 'img/misc/locked_plus_base.webp', top: '45vh', left: '25vw', defaultLocked: true },
            { id: 'cavern', name: 'Underwater Cavern', icon: 'img/misc/mysterious_plus_base.webp', top: '65vh', left: '75vw', defaultLocked: false },
            { id: 'depths', name: 'Deep Depths', icon: 'img/misc/locked_plus_base.webp', top: '85vh', left: '50vw', defaultLocked: true }
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
                
                const blackScreen = document.createElement('div');
                blackScreen.style.position = 'fixed';
                blackScreen.style.inset = '0';
                blackScreen.style.backgroundColor = 'black';
                blackScreen.style.zIndex = '2147483645'; 
                blackScreen.style.display = 'flex';
                blackScreen.style.justifyContent = 'center';
                blackScreen.style.alignItems = 'center';

                const backBtn = document.createElement('button');
                backBtn.textContent = 'Back to Map';
                backBtn.style.padding = '10px 20px';
                backBtn.style.fontSize = '24px';
                backBtn.style.cursor = 'pointer';
                backBtn.onclick = () => {
                    document.body.removeChild(blackScreen);
                };

                blackScreen.appendChild(backBtn);
                document.body.appendChild(blackScreen);
            };

            nodesContainer.appendChild(btn);
        });

        overlay.appendChild(nodesContainer);
        
        // Bottom row close button
        const bottomRow = document.createElement('div');
        bottomRow.style.width = '100%';
        bottomRow.style.padding = '20px';
        bottomRow.style.display = 'flex';
        bottomRow.style.justifyContent = 'center';
        bottomRow.style.zIndex = '10';

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.style.padding = '10px 30px';
        closeBtn.style.fontSize = '18px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.background = 'transparent';
        closeBtn.style.color = 'white';
        closeBtn.style.border = '2px solid white';
        closeBtn.style.borderRadius = '8px';
        closeBtn.onclick = () => {
            overlay.style.display = 'none';
        };
        
        bottomRow.appendChild(closeBtn);
        overlay.appendChild(bottomRow);

        document.body.appendChild(overlay);
    }

    overlay.style.display = 'flex';

    if (isFirstTime) {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 5s linear';
        overlay.offsetHeight;
        overlay.style.opacity = '1';
    } else {
        overlay.style.transition = 'none';
        overlay.style.opacity = '1';
    }
}