import { playAudio } from '../util/audioManager.js';
import { getActiveSlot } from '../util/storage.js';
import { setupDragToClose, blockInteraction } from './shopOverlay.js';
import { IS_MOBILE, currentArea, AREAS, enterArea } from '../main.js';
import { getCurrentSurgeLevel } from './merchantTabs/resetTab.js';

const MAP_NODE_LOCKED_KEY = (id, slot) => `ccc:map:locked:${id}:${slot}`;

export function isNodeLocked(id, defaultLocked) {
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

export function getMapNodes() {
    return [
        { id: 'cove', areaId: AREAS.STARTER_COVE, name: 'The Cove', icon: 'img/currencies/coin/coin_plus_base.webp', top: '23%', left: '50%', defaultLocked: false },
        { id: 'cavern', areaId: AREAS.UNDERWATER_CAVERN, name: 'Underwater Cavern', icon: 'img/misc/mysterious_plus_base.webp', top: '38%', left: '75%', defaultLocked: true, previousNodeId: 'cove' },
        { id: 'coral', areaId: null, name: 'Coral Reef', icon: 'img/misc/mysterious_plus_base.webp', top: '53%', left: '25%', defaultLocked: true },
        { id: 'depths', areaId: null, name: 'Deep Depths', icon: 'img/misc/mysterious_plus_base.webp', top: '85%', left: '50%', defaultLocked: true }
    ];
}

let isMapOverlayOpen = false;
let wasJustMapSequence = false;

function closeMapOverlay(overlay, sheet) {
    if (window.__mapSequenceActive) return;
    if (!isMapOverlayOpen) return;
    isMapOverlayOpen = false;
    
    if (sheet) {
        sheet.style.transform = 'translateY(100%)';
    }
    
    setTimeout(() => {
        if (overlay) {
            overlay.classList.remove('is-open');
        }
        if (currentArea === AREAS.STARTER_COVE && wasJustMapSequence) {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('audio:restartMusic'));
                if (window.spawner && typeof window.spawner.start === 'function') {
                    window.spawner.start();
                    
                    // Invisible framerate warming pulse
                    const pulseDiv = document.createElement('div');
                    Object.assign(pulseDiv.style, {
                        position: 'fixed',
                        top: '0',
                        left: '0',
                        width: '1px',
                        height: '1px',
                        opacity: '0.01',
                        pointerEvents: 'none',
                        zIndex: '-9999'
                    });
                    document.body.appendChild(pulseDiv);
                    
                    let start = performance.now();
                    function pulseFrame(now) {
                        if (now - start < 450) {
                            pulseDiv.style.opacity = Math.random() > 0.5 ? '0.01' : '0.02';
                            requestAnimationFrame(pulseFrame);
                        } else {
                            if (pulseDiv.parentNode) {
                                pulseDiv.parentNode.removeChild(pulseDiv);
                            }
                        }
                    }
                    requestAnimationFrame(pulseFrame);
                }
            }
        }
        wasJustMapSequence = false;
    }, 220); // Match transition time
}


export function ensureMapOverlay(unlockedNodeId = null) {
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

    const nodes = getMapNodes();

    const svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgOverlay.style.position = 'absolute';
    svgOverlay.style.top = '0';
    svgOverlay.style.left = '0';
    svgOverlay.style.width = '100%';
    svgOverlay.style.height = '100%';
    svgOverlay.style.zIndex = '1';
    svgOverlay.style.pointerEvents = 'none';
    nodesContainer.appendChild(svgOverlay);

    // Make nodes globally accessible to refreshNodesState or similar if needed, 
    // or we can draw lines here. Let's draw lines right here.
    
    // We store buttons in a map so we can access them in refreshNodesState to handle animation
    overlay._nodeButtons = {};
    overlay._nodeLines = {};
    overlay._nodesContainer = nodesContainer;


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
        
        btn.style.width = '6vw';
        btn.style.height = 'auto';
        btn.style.aspectRatio = '1';
        btn.style.padding = '0';
        btn.style.borderRadius = '50%';

        const iconWrapper = document.createElement('div');
        iconWrapper.style.position = 'relative';
        iconWrapper.style.display = 'flex';
        iconWrapper.style.justifyContent = 'center';
        iconWrapper.style.width = '100%';
        iconWrapper.style.height = '100%';

        const img = document.createElement('img');
        img.className = 'map-node-img';
        img.src = isLocked ? 'img/misc/locked_plus_base.webp' : node.icon;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';

        const label = document.createElement('span');
        label.className = 'map-node-label area-label';
        label.textContent = node.name;
        if (isLocked) {
            label.style.display = 'none';
        }

        iconWrapper.appendChild(img);
        iconWrapper.appendChild(label);

        btn.appendChild(iconWrapper);

        const pinBtn = document.createElement('button');
        pinBtn.className = 'map-node-pin-btn';
        pinBtn.style.position = 'absolute';
        pinBtn.style.top = '100%';
        pinBtn.style.marginTop = '8px';
        pinBtn.style.color = 'white';
        pinBtn.style.fontSize = 'clamp(8px, 1.2vw, 16px)';
        pinBtn.style.padding = '2px 6px';
        pinBtn.style.cursor = 'pointer';
        pinBtn.style.borderRadius = '0';
        pinBtn.style.transition = 'none';
        pinBtn.style.whiteSpace = 'nowrap';
        if (isLocked || window.__mapSequenceActive) {
            pinBtn.style.display = 'none';
        }

        import('../game/settingsManager.js').then(({ settingsManager }) => {
            const isPinned = settingsManager.get(`area_pinned_${node.id}`);
            
            const updatePinBtn = (pinned) => {
                if (pinned) {
                    pinBtn.textContent = 'Pinned';
                    pinBtn.style.border = '1px solid hsla(150, 60%, 80%, 0.80)';
                    pinBtn.style.background = 'hsla(150, 60%, 35%, 0.50)';
                } else {
                    pinBtn.textContent = 'Not pinned';
                    pinBtn.style.border = '1px solid hsla(0, 80%, 40%, 0.90)';
                    pinBtn.style.background = 'hsla(0, 80%, 40%, 0.50)';
                }
            };
            
            updatePinBtn(isPinned);
            
            window.addEventListener('pinnedAreas:changed', () => {
                updatePinBtn(settingsManager.get(`area_pinned_${node.id}`));
            });
            
            pinBtn.onclick = (e) => {
                e.stopPropagation();
                const currentlyPinned = settingsManager.get(`area_pinned_${node.id}`);
                settingsManager.set(`area_pinned_${node.id}`, !currentlyPinned);
                updatePinBtn(!currentlyPinned);
                window.dispatchEvent(new Event('pinnedAreas:changed'));
            };
        });

        btn.appendChild(pinBtn);
        overlay._nodeButtons[node.id] = { btn, node };

        btn.onclick = () => {
            if (window.__mapSequenceActive) return;
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

        btn.style.zIndex = '2';
        nodesContainer.appendChild(btn);
    });

    
    // Draw connection lines
    nodes.forEach(node => {
        if (node.previousNodeId) {
            const prevNode = nodes.find(n => n.id === node.previousNodeId);
            if (prevNode) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                
                // Coordinates in %
                line.setAttribute('x1', prevNode.left);
                line.setAttribute('y1', prevNode.top);
                line.setAttribute('x2', node.left);
                line.setAttribute('y2', node.top);
                
                line.setAttribute('stroke', '#ffcc00');
                line.setAttribute('stroke-width', '4');
                line.setAttribute('stroke-linecap', 'round');
                line.style.filter = 'drop-shadow(0px 0px 5px #ffcc00)';
                line.style.transition = 'none';
                line.style.opacity = '0'; // hide by default
                
                // For drawing animation
                line.setAttribute('pathLength', '100');
                line.style.strokeDasharray = '100';
                
                const isSequenceTarget = (node.id === unlockedNodeId);
                const isLocked = isSequenceTarget ? true : isNodeLocked(node.id, node.defaultLocked);
                const prevLocked = isSequenceTarget ? false : isNodeLocked(prevNode.id, prevNode.defaultLocked);
                
                if (!isLocked && !prevLocked) {
                    // Already unlocked, so show instantly
                    line.style.opacity = '1';
                    line.style.strokeDashoffset = '0';
                } else if (isSequenceTarget && !prevLocked) {
                    // Ready to be animated, keep hidden
                    line.style.strokeDashoffset = '100';
                    line.style.opacity = '0';
                } else {
                    // Fully locked
                    line.style.opacity = '0';
                    line.style.strokeDashoffset = '100';
                }

                svgOverlay.appendChild(line);
                overlay._nodeLines[node.id] = line;
            }
        }
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

export function refreshNodesState(unlockedNodeId = null) {
    const overlay = document.getElementById('map-overlay');
    if (!overlay) return;
    const btns = overlay.querySelectorAll('.map-node-btn');
    btns.forEach(btn => {
        const id = btn.dataset.nodeId;
        const defaultLocked = btn.dataset.defaultLocked === 'true';
        const icon = btn.dataset.icon;
        
        const isSequenceTarget = (id === unlockedNodeId);
        const isLocked = isSequenceTarget ? true : isNodeLocked(id, defaultLocked);
        btn.style.cursor = isLocked ? 'not-allowed' : 'pointer';
        
        const img = btn.querySelector('.map-node-img');
        if (img) img.src = isLocked ? 'img/misc/locked_plus_base.webp' : icon;
        
        const label = btn.querySelector('.map-node-label');
        if (label) label.style.display = isLocked ? 'none' : '';
        
        const pinBtn = btn.querySelector('.map-node-pin-btn');
        if (pinBtn) {
            if (window.__mapSequenceActive || isLocked) {
                pinBtn.style.display = 'none';
            } else {
                pinBtn.style.display = '';
            }
        }
    });
}

export function openMapOverlay(unlockedNodeId = null) {
    if (unlockedNodeId) {
        wasJustMapSequence = true;
        window.__mapSequenceActive = true;
    }

    ensureMapOverlay(unlockedNodeId);
    refreshNodesState(unlockedNodeId);
    
    let overlay = document.getElementById('map-overlay');
    let sheet = overlay.querySelector('.map-sheet');
    
    if (unlockedNodeId) {
        const firstTimeFade = document.createElement('div');
        firstTimeFade.className = 'map-first-time-fade';
        firstTimeFade.style.transition = 'none';
        firstTimeFade.style.opacity = '1';
        document.body.appendChild(firstTimeFade);
        
        firstTimeFade.offsetHeight;
        
        setTimeout(() => {
            firstTimeFade.style.transition = 'opacity 5s linear';
            firstTimeFade.style.opacity = '0';
            
            setTimeout(() => {
                firstTimeFade.remove();
                
                setTimeout(() => {
                    const line = overlay._nodeLines ? overlay._nodeLines[unlockedNodeId] : null;
                    const nodeBtn = overlay._nodeButtons ? overlay._nodeButtons[unlockedNodeId] : null;
                    
                    if (line) {
                        playAudio('sounds/area_connector.ogg', { type: 'sfx', volume: 1.0 });
                        line.style.opacity = '1';
                        line.style.transition = 'stroke-dashoffset 4.75s linear';
                        line.style.strokeDashoffset = '0';
                        
                        setTimeout(() => {
                            playAudio('sounds/explosion_long.ogg', { type: 'sfx', volume: 1.0 });
                            
                            if (nodeBtn) {
                                nodeBtn.btn.style.animation = 'mapNodePop 0.3s ease-out';
                                
                                const img = nodeBtn.btn.querySelector('.map-node-img');
                                if (img) img.src = nodeBtn.node.icon;
                                
                                const label = nodeBtn.btn.querySelector('.map-node-label');
                                if (label) label.style.display = '';
                                
                                nodeBtn.btn.style.cursor = 'pointer';
                                
                                // User requested: "I don't want the pinned button to be visible during or directly after the Map sequence plays anyway."
                                const pinBtn = nodeBtn.btn.querySelector('.map-node-pin-btn');
                                if (pinBtn) pinBtn.style.display = 'none';
                            }
                            
                            window.__mapSequenceActive = false;
                        }, 4750);
                    } else {
                        window.__mapSequenceActive = false;
                    }
                }, 1000);
            }, 5000);
        }, 1000);
    }

    isMapOverlayOpen = true;
    overlay.classList.add('is-open');
    if (sheet) {
        sheet.style.transform = 'translateY(0)';
    }
}
