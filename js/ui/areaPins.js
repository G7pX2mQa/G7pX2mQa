import { getMapNodes, isNodeLocked } from './mapOverlay.js';
import { settingsManager } from '../game/settingsManager.js';
import { currentArea, enterArea, AREAS } from '../main.js';
import { blockInteraction } from './shopOverlay.js';
import { IS_MOBILE } from '../main.js';

export function initPinnedAreas() {
    let container = document.getElementById('pinned-areas-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'pinned-areas-container';
        container.style.position = 'absolute';
        container.style.bottom = '100%';
        container.style.left = '0';
        container.style.width = '100%';
        container.style.display = 'flex';
        container.style.flexWrap = 'wrap-reverse';
        container.style.justifyContent = 'center';
        container.style.pointerEvents = 'none';
        
        const hudBottom = document.querySelector('.hud-bottom');
        if (hudBottom) {
            hudBottom.style.position = 'relative';
            hudBottom.appendChild(container);
        } else {
            console.warn('Could not find .hud-bottom to append pinned areas');
            return;
        }
    }

    renderPinnedAreas();
    window.addEventListener('pinnedAreas:changed', renderPinnedAreas);
    window.addEventListener('saveSlot:change', renderPinnedAreas);
}

function renderPinnedAreas() {
    const container = document.getElementById('pinned-areas-container');
    if (!container) return;

    container.innerHTML = '';
    const nodes = getMapNodes();

    nodes.forEach(node => {
        if (settingsManager.get(`area_pinned_${node.id}`)) {
            const isLocked = isNodeLocked(node.id, node.defaultLocked);
            const btn = document.createElement('button');
            btn.className = 'game-btn area-pin-btn';
            btn.style.position = 'relative';
            btn.style.width = 'max(6vw, 50px)';
            btn.style.height = 'auto';
            btn.style.aspectRatio = '1';
            btn.style.margin = '0 0.5vw';
            btn.style.padding = '0';
            btn.style.background = 'none';
            btn.style.border = 'none';
            btn.style.borderRadius = '50%';
            btn.style.cursor = isLocked ? 'not-allowed' : 'pointer';
            btn.style.pointerEvents = 'auto';
            if (isLocked) {
                btn.style.opacity = '0.5';
            }

            const iconWrapper = document.createElement('div');
            iconWrapper.style.position = 'relative';
            iconWrapper.style.display = 'flex';
            iconWrapper.style.justifyContent = 'center';
            iconWrapper.style.width = '100%';
            iconWrapper.style.height = '100%';

            const img = document.createElement('img');
            img.src = node.icon;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'contain';

            const label = document.createElement('span');
            label.className = 'map-node-label area-label';
            label.textContent = node.name;

            iconWrapper.appendChild(img);
            iconWrapper.appendChild(label);

            btn.appendChild(iconWrapper);

            btn.oncontextmenu = (e) => {
                e.preventDefault();
                settingsManager.set(`area_pinned_${node.id}`, false);
                window.dispatchEvent(new CustomEvent('pinnedAreas:changed'));
            };

            btn.onclick = () => {
                if (isLocked) return;
                
                if (currentArea === node.areaId || node.areaId == null) {
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
                        
                        // Delay music and spawner start until we are actually in the new area
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

            container.appendChild(btn);
        }
    });
}
