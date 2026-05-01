import { getActiveSlot } from '../util/storage.js';
import { setupDragToClose, blockInteraction } from './shopOverlay.js';
import { IS_MOBILE, currentArea, AREAS, enterArea } from '../main.js';
import { getCurrentSurgeLevel } from './merchantTabs/resetTab.js';

const MAP_NODE_LOCKED_KEY = (id, slot) => `ccc:map:locked:${id}:${slot}`;

function isNodeLocked(id, defaultLocked) {
    const slot = getActiveSlot();
    if (slot == null) return defaultLocked;
    const val = localStorage.getItem(MAP_NODE_LOCKED_KEY(id, slot));
    if (val != null) return val === '1';
    return defaultLocked;
}

export function setNodeLocked(id, locked) {
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
    }, 220); // Match transition time
}


export function ensureMapOverlay() {
    const surgeLevel = getCurrentSurgeLevel();
    if (surgeLevel === Infinity || (typeof surgeLevel === 'bigint' && surgeLevel >= 125n) || (typeof surgeLevel === 'number' && surgeLevel >= 125)) {
        setNodeLocked('cavern', false);
    }
    let overlay = document.getElementById('map-overlay');
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.id = 'map-overlay';
    overlay.className = 'shop-overlay map-overlay'; // Inherit shop-overlay positioning/z-index properties, use map-overlay for specific styles
    
    const sheet = document.createElement('div');
    sheet.className = 'shop-sheet map-sheet';
    sheet.setAttribute('role', 'dialog');
    
    const grabber = document.createElement('div');
    grabber.className = 'shop-grabber';
    grabber.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;
    
    setupDragToClose(grabber, sheet, () => isMapOverlayOpen, () => {
        closeMapOverlay(overlay, sheet);
    });

    const content = document.createElement('div');

    // New Sky and Water Background
    const mapBackground = document.createElement('div');
    mapBackground.className = 'map-background';

    const mapSky = document.createElement('div');
    mapSky.className = 'map-sky';

    const mapWaterContainer = document.createElement('div');
    mapWaterContainer.className = 'map-water-container';

    const mapWaterSurface = document.createElement('div');
    mapWaterSurface.className = 'map-water-surface';
    
    const mapWaterSurfaceLeft = document.createElement('div');
    mapWaterSurfaceLeft.className = 'map-water-surface-left';
    
    const mapWaterSurfaceRight = document.createElement('div');
    mapWaterSurfaceRight.className = 'map-water-surface-right';

    mapWaterSurface.appendChild(mapWaterSurfaceLeft);
    mapWaterSurface.appendChild(mapWaterSurfaceRight);

    const mapWaterBody = document.createElement('div');
    mapWaterBody.className = 'map-water-body';

    mapWaterContainer.appendChild(mapWaterSurface);
    mapWaterContainer.appendChild(mapWaterBody);

    mapBackground.appendChild(mapSky);
    mapBackground.appendChild(mapWaterContainer);
    content.appendChild(mapBackground);
    content.className = 'shop-content map-content';

    
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
        bubble.style.animationDuration = `${Math.random() * 30 + 20}s`;
        bubble.style.animationDelay = `-${Math.random() * 20}s`;
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
        { id: 'cove', areaId: AREAS.STARTER_COVE, name: 'The Cove', icon: 'img/currencies/coin/coin_plus_base.webp', top: '20%', left: '50%', defaultLocked: false },
        { id: 'cavern', areaId: AREAS.UNDERWATER_CAVERN, name: 'Underwater Cavern', icon: 'img/misc/mysterious_plus_base.webp', top: '35%', left: '75%', defaultLocked: true },
        { id: 'coral', areaId: null, name: 'Coral Reef', icon: 'img/misc/locked_plus_base.webp', top: '50%', left: '25%', defaultLocked: true },
        { id: 'depths', areaId: null, name: 'Deep Depths', icon: 'img/misc/locked_plus_base.webp', top: '85%', left: '50%', defaultLocked: true }
    ];

    nodes.forEach(node => {
        const isLocked = isNodeLocked(node.id, node.defaultLocked);
        const btn = document.createElement('button');
        btn.className = 'map-node-btn';
        btn.dataset.nodeId = node.id;
        btn.dataset.defaultLocked = node.defaultLocked;
        btn.dataset.icon = node.icon;
        
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
        img.className = 'map-node-img';
        img.src = isLocked ? 'img/misc/locked_plus_base.webp' : node.icon;
        img.style.width = '64px';
        img.style.height = '64px';
        img.style.marginBottom = '8px';

        const label = document.createElement('span');
        label.className = 'map-node-label';
        label.textContent = node.name;
        label.style.fontWeight = 'bold';
        if (isLocked) {
            label.style.display = 'none';
        }

        btn.appendChild(img);
        btn.appendChild(label);

        btn.onclick = () => {
            if (isNodeLocked(node.id, node.defaultLocked)) return;
            
            if (currentArea === node.areaId || node.areaId == null) {
                closeMapOverlay(overlay, sheet);
                return;
            }
            
            if (IS_MOBILE) blockInteraction(500);

            const teleportOverlay = document.createElement('div');
            Object.assign(teleportOverlay.style, {
                position: 'fixed',
                inset: '0',
                backgroundColor: 'black',
                zIndex: '2147483647',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                color: 'white',
                fontSize: 'clamp(24px, 4vw, 48px)',
                textAlign: 'center',
                pointerEvents: 'all'
            });
            teleportOverlay.textContent = `Teleporting to ${node.name}...`;
            document.body.appendChild(teleportOverlay);

            let start = performance.now();
            let overlayClosed = false;
            
            function pulseFrame(now) {
                if (!overlayClosed) {
                    closeMapOverlay(overlay, sheet);
                    overlayClosed = true;
                }
                
                if (now - start < 450) {
                    teleportOverlay.style.opacity = Math.random() > 0.5 ? '0.99' : '1';
                    requestAnimationFrame(pulseFrame);
                } else {
                    if (teleportOverlay.parentNode) {
                        teleportOverlay.parentNode.removeChild(teleportOverlay);
                    }
                    if (window.spawner && typeof window.spawner.stopAllWaveSounds === 'function') {
                        window.spawner.stopAllWaveSounds();
                    }
                    enterArea(node.areaId);
                    
                    // Delay music and spawner start until we are actually in the new area and the teleport overlay is gone
                    if (typeof window !== 'undefined') {
                        if (currentArea === AREAS.STARTER_COVE) {
                            setTimeout(() => {
                               if (window.spawner && typeof window.spawner.start === 'function') {
                                   window.spawner.start();
                               }
                            }, 50);
                        } else if (currentArea === AREAS.UNDERWATER_CAVERN) {
                            if (window.spawner) {
                                if (typeof window.spawner.stop === 'function') window.spawner.stop();
                                if (typeof window.spawner.clearPlayfield === 'function') window.spawner.clearPlayfield();
                            }
                        }
                    }
                }
            }
            requestAnimationFrame(pulseFrame);
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
}

function refreshNodesState() {
    const surgeLevel = getCurrentSurgeLevel();
    if (surgeLevel === Infinity || (typeof surgeLevel === 'bigint' && surgeLevel >= 125n) || (typeof surgeLevel === 'number' && surgeLevel >= 125)) {
        setNodeLocked('cavern', false);
    }
    const overlay = document.getElementById('map-overlay');
    if (!overlay) return;
    const btns = overlay.querySelectorAll('.map-node-btn');
    btns.forEach(btn => {
        const id = btn.dataset.nodeId;
        const defaultLocked = btn.dataset.defaultLocked === 'true';
        const icon = btn.dataset.icon;
        
        const isLocked = isNodeLocked(id, defaultLocked);
        btn.style.cursor = isLocked ? 'not-allowed' : 'pointer';
        
        const img = btn.querySelector('.map-node-img');
        if (img) img.src = isLocked ? 'img/misc/locked_plus_base.webp' : icon;
        
        const label = btn.querySelector('.map-node-label');
        if (label) label.style.display = isLocked ? 'none' : '';
    });
}

export function openMapOverlay(isFirstTime = false) {
    ensureMapOverlay();
    refreshNodesState();
    
    let overlay = document.getElementById('map-overlay');
    let sheet = overlay.querySelector('.map-sheet');
    
    // Add first time fade element right away if needed
    if (isFirstTime) {
        const firstTimeFade = document.createElement('div');
        firstTimeFade.className = 'map-first-time-fade';
        // Set transition to none initially
        firstTimeFade.style.transition = 'none';
        firstTimeFade.style.opacity = '1';
        document.body.appendChild(firstTimeFade);
        
        // Force reflow
        firstTimeFade.offsetHeight;
        
        setTimeout(() => {
            // Restore transition for fade out
            firstTimeFade.style.transition = 'opacity 5s linear';
            firstTimeFade.style.opacity = '0';
            
            setTimeout(() => {
                firstTimeFade.remove();
            }, 5000);
        }, 1000);
    }

    isMapOverlayOpen = true;
    overlay.classList.add('is-open');
    if (sheet) {
        sheet.style.transform = 'translateY(0)';
    }
}
