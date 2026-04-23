import { playAudio } from '../util/audioManager.js';
import { IS_MOBILE } from '../main.js';
import { getActiveSlot } from '../util/storage.js';

// Reusing palette from tsunamiVisuals for consistency
const PALETTE = {
    skyTop: '#4fa8ff',
    skyBottom: '#b8e1ff',
    sun: '#ffeb3b',
    sandLight: '#f1dcb1',
    sandMid: '#e7cd96',
    sandDark: '#debe7c',
    rock: '#5d4037',
    leaf: '#4caf50',
    shell: '#fff0f5'
};

function drawPalmTree(ctx, x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // Trunk - Thick base, thin top, curved
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(10, -50, -5, -100); 
    ctx.lineTo(5, -100);
    ctx.quadraticCurveTo(20, -50, 10, 0);
    ctx.fillStyle = '#8b5a2b';
    ctx.fill();

    // Leaves
    ctx.translate(0, -95);
    ctx.fillStyle = PALETTE.leaf;
    for (let i = 0; i < 7; i++) {
        ctx.save();
        ctx.rotate((i / 7) * Math.PI * 2 - Math.PI / 2); // Spread around top
        
        // Leaf body
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(40, -20, 60, 0);
        ctx.quadraticCurveTo(40, 20, 0, 0);
        ctx.fill();

        ctx.restore();
    }

    ctx.restore();
}

function drawPearl(ctx, x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    
    // Bottom shell
    ctx.fillStyle = PALETTE.shell;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI, false);
    ctx.fill();
    
    // Pearl
    const grad = ctx.createRadialGradient(-3, -8, 1, 0, -5, 8);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#e0e0e0');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, -5, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // Top shell (open)
    ctx.fillStyle = PALETTE.shell;
    ctx.beginPath();
    ctx.ellipse(-12, -10, 15, 8, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Shell lines
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    for(let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(0, -10);
        ctx.lineTo(i * 5, 0);
        ctx.stroke();
    }

    ctx.restore();
}

function drawCoconut(ctx, x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    
    // Dome shape
    ctx.fillStyle = PALETTE.rock;
    ctx.beginPath();
    ctx.moveTo(-20, 0);
    ctx.bezierCurveTo(-20, -15, -10, -25, 0, -25);
    ctx.bezierCurveTo(10, -25, 20, -15, 20, 0);
    ctx.fill();

    // Three large holes
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.arc(-4, -18, 2, 0, Math.PI * 2); // Top left
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(4, -18, 2, 0, Math.PI * 2); // Top right
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(0, -12, 2.5, 0, Math.PI * 2); // Bottom center (slightly larger)
    ctx.fill();

    // Shadow on the sand
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

export function playSecretDlgBossFightSequence(container, onComplete, options = {}) {
    // Hide cursor initially
    container.style.cursor = 'none';

    // Start Boss Music
    const bossMusic = playAudio('sounds/Secret_Boss_Fight.ogg', { loop: true, volume: 1.0, type: 'music' });

    // --- Canvas Setup ---
    const canvas = document.createElement('canvas');
    canvas.id = 'bossfight-canvas';
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '2147483644'; 
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d', { alpha: false });
    let width, height;
    let props = [];

    // Camera state
    let cameraX = 0;
    const cameraSpeed = 5;
    let keys = {
        left: false,
        right: false
    };
    // --- UI Setup ---
    const uiContainer = document.createElement('div');
    uiContainer.style.position = 'absolute';
    uiContainer.style.inset = '0';
    uiContainer.style.zIndex = '2147483645';
    uiContainer.style.pointerEvents = 'none'; // Let clicks pass through if needed, except for buttons
    container.appendChild(uiContainer);

    let desktopArrows = null;
    const knowHowToMoveKey = `ccc:secretDlgBoss:knowsHowToMove:${getActiveSlot()}`;

    if (!IS_MOBILE) {
        // Desktop arrows logic
        const knowsHowToMove = localStorage.getItem(knowHowToMoveKey) === '1';
        if (!knowsHowToMove) {
            desktopArrows = [];
            
            // Define custom style for blinking and tooltip
            const style = document.createElement('style');
            style.textContent = `
                @keyframes bossArrowBlink {
                    0% { filter: brightness(1); }
                    10% { filter: brightness(0); }
                    50% { filter: brightness(1); }
                    100% { filter: brightness(1); }
                }
                .boss-arrow-blinking {
                    animation: bossArrowBlink 1s infinite ease-in;
                }
                .boss-arrow-tooltip {
                    display: none;
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    width: max-content;
                    max-width: 300px;
                    background: linear-gradient(to bottom, rgba(60,60,60,1), rgba(40,40,40,1));
                    color: #fff;
                    font-size: 14px;
                    line-height: 1.4;
                    padding: 10px 14px;
                    border-radius: 8px;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1);
                    text-align: center;
                    pointer-events: none;
                    z-index: 3000;
                    font-weight: normal;
                    white-space: normal;
                }
                .boss-arrow-tooltip.is-left {
                    left: calc(100% + 15px - (100px * 100 / 512));
                }
                .boss-arrow-tooltip.is-right {
                    right: calc(100% + 15px - (100px * 100 / 512));
                }
                .boss-arrow-tooltip::after {
                    content: '';
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    border-width: 6px;
                    border-style: solid;
                }
                .boss-arrow-tooltip.is-left::after {
                    right: 100%;
                    border-color: transparent rgba(40,40,40,1) transparent transparent;
                }
                .boss-arrow-tooltip.is-right::after {
                    left: 100%;
                    border-color: transparent transparent transparent rgba(40,40,40,1);
                }
            `;
            uiContainer.appendChild(style);

            const createDesktopArrow = (src, side, text) => {
                const wrapper = document.createElement('div');
                wrapper.style.position = 'absolute';
                wrapper.style.top = '50%';
                wrapper.style.transform = 'translateY(-50%)';
                wrapper.style[side] = '0px';
                wrapper.style.pointerEvents = 'auto'; // allow hover
                
                const img = document.createElement('img');
                img.src = src;
                img.className = 'boss-arrow-blinking';
                img.style.maxHeight = '100px';
                img.style.display = 'block';
                wrapper.appendChild(img);

                const tooltip = document.createElement('div');
                tooltip.className = `boss-arrow-tooltip is-${side}`;
                tooltip.textContent = text;
                wrapper.appendChild(tooltip);

                wrapper.addEventListener('mouseenter', () => {
                    tooltip.style.display = 'block';
                });
                wrapper.addEventListener('mouseleave', () => {
                    tooltip.style.display = 'none';
                });

                uiContainer.appendChild(wrapper);
                return wrapper;
            };

            desktopArrows.push(createDesktopArrow('img/misc/arrow_left.webp', 'left', 'Hold A to move left'));
            desktopArrows.push(createDesktopArrow('img/misc/arrow_right.webp', 'right', 'Hold D to move right'));
        }
    } else {
        // Mobile buttons logic
        const createMobileBtn = (src, side) => {
            const btn = document.createElement('div');
            btn.style.position = 'absolute';
            btn.style.top = '50%';
            btn.style.transform = 'translateY(-50%)';
            btn.style[side] = '20px';
            btn.style.width = '80px';
            btn.style.height = '80px';
            btn.style.borderRadius = '16px';
            btn.style.border = '1px solid hsla(45, 80%, 40%, 0.45)';
            btn.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
            btn.style.display = 'flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
            btn.style.pointerEvents = 'auto';
            btn.style.userSelect = 'none';
            btn.style.webkitUserSelect = 'none';
            
            const img = document.createElement('img');
            img.src = src;
            img.style.maxWidth = '60%';
            img.style.maxHeight = '60%';
            img.style.pointerEvents = 'none';
            btn.appendChild(img);

            const activeStyle = () => {
                btn.style.border = '1px solid hsla(45, 80%, 60%, 0.8)';
                btn.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                btn.style.filter = 'brightness(1.2)';
            };

            const inactiveStyle = () => {
                btn.style.border = '1px solid hsla(45, 80%, 40%, 0.45)';
                btn.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
                btn.style.filter = 'none';
            };

            const keyToSet = side === 'left' ? 'left' : 'right';

            const startMove = (e) => {
                e.preventDefault();
                keys[keyToSet] = true;
                activeStyle();
            };

            const endMove = (e) => {
                e.preventDefault();
                keys[keyToSet] = false;
                inactiveStyle();
            };

            btn.addEventListener('touchstart', startMove, { passive: false });
            btn.addEventListener('mousedown', startMove);

            btn.addEventListener('touchend', endMove, { passive: false });
            btn.addEventListener('touchcancel', endMove, { passive: false });
            btn.addEventListener('mouseup', endMove);
            btn.addEventListener('mouseleave', endMove);

            uiContainer.appendChild(btn);
            return btn;
        };

        createMobileBtn('img/misc/arrow_left_thin.webp', 'left');
        createMobileBtn('img/misc/arrow_right_thin.webp', 'right');
    }


    function onKeyDown(e) {
        let moved = false;
        if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') { keys.left = true; moved = true; }
        if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') { keys.right = true; moved = true; }
        
        if (moved && !IS_MOBILE) {
            localStorage.setItem(knowHowToMoveKey, '1');
            if (desktopArrows) {
                desktopArrows.forEach(arr => arr.remove());
                desktopArrows = null;
            }
        }
    }

    function onKeyUp(e) {
        if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') keys.left = false;
        if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') keys.right = false;
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const CHUNK_WIDTH = 2000;
    const chunks = new Map(); // chunkIndex -> props[]
    
    // A simple PRNG to ensure props are generated deterministically per chunk
    function seededRandom(seed) {
        let x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    }

    
    function getSandHeight(globalX, layerBaseY, layerAmplitude, layerPeriod, layerSeed) {
        let yOffset = Math.sin(globalX / layerPeriod + layerSeed) * layerAmplitude
                    + Math.sin(globalX / (layerPeriod * 0.731) + layerSeed * 2) * (layerAmplitude * 0.4)
                    + Math.sin(globalX / (layerPeriod * 0.317) + layerSeed * 3) * (layerAmplitude * 0.2);
        return layerBaseY + yOffset;
    }

        function generateChunkProps(chunkIndex) {
        const chunkProps = [];
        let seed = chunkIndex * 1337; // Arbitrary multiplier for seed

        // layersConfig maps to farthest -> closest
        // scaleModifier helps enforce depth
        const layersConfig = [
            { baseYFactor: 0.55, amplitude: 30, period: 500, seedOffset: 10, scaleModifier: 0.6 },
            { baseYFactor: 0.65, amplitude: 40, period: 600, seedOffset: 42, scaleModifier: 1.0 },
            { baseYFactor: 0.75, amplitude: 50, period: 700, seedOffset: 73, scaleModifier: 1.4 }
        ];

        // Weight distribution: Farthest (60%), Mid (30%), Closest (10%)
        function pickLayer() {
            let r = seededRandom(seed++);
            if (r < 0.6) return layersConfig[0];
            if (r < 0.9) return layersConfig[1];
            return layersConfig[2];
        }

        // Palm trees receding into distance
        const treeCount = Math.floor(seededRandom(seed++) * 4) + 4; // 4 to 7 trees
        for (let i = 0; i < treeCount; i++) {
            let globalX = chunkIndex * CHUNK_WIDTH + seededRandom(seed++) * CHUNK_WIDTH;
            let layer = pickLayer();
            let baseY = height * layer.baseYFactor;
            
            chunkProps.push({
                type: 'tree',
                x: globalX,
                y: getSandHeight(globalX, baseY, layer.amplitude, layer.period, layer.seedOffset) + 5,
                scale: (0.8 + seededRandom(seed++) * 0.3) * layer.scaleModifier
            });
        }
        
        // Coconuts scattered
        const coconutCount = Math.floor(seededRandom(seed++) * 8) + 7; // 7 to 14 coconuts
        for (let i = 0; i < coconutCount; i++) {
            let globalX = chunkIndex * CHUNK_WIDTH + seededRandom(seed++) * CHUNK_WIDTH;
            let layer = pickLayer();
            let baseY = height * layer.baseYFactor;

            chunkProps.push({
                type: 'coconut',
                x: globalX,
                y: getSandHeight(globalX, baseY, layer.amplitude, layer.period, layer.seedOffset) + 5,
                scale: (0.6 + seededRandom(seed++) * 0.2) * layer.scaleModifier
            });
        }
        
        // Pearls scattered
        const pearlCount = Math.floor(seededRandom(seed++) * 10) + 6; // 6 to 15 pearls
        for (let i = 0; i < pearlCount; i++) {
            let globalX = chunkIndex * CHUNK_WIDTH + seededRandom(seed++) * CHUNK_WIDTH;
            let layer = pickLayer();
            let baseY = height * layer.baseYFactor;

            chunkProps.push({
                type: 'pearl',
                x: globalX,
                y: getSandHeight(globalX, baseY, layer.amplitude, layer.period, layer.seedOffset) + 5,
                scale: (0.3 + seededRandom(seed++) * 0.1) * layer.scaleModifier
            });
        }
        
        // Sort by Y so things lower on the screen (closer) are drawn last
        chunkProps.sort((a, b) => a.y - b.y);
        return chunkProps;
    }

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        width = window.innerWidth;
        height = window.innerHeight;

        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';

        ctx.scale(dpr, dpr);
        // Clear cached chunks on resize so they generate with new height bounds
        chunks.clear();
    }
    window.addEventListener('resize', resize);
    resize();
    
    let isRunning = true;
    let animationFrameId;

    function loop() {
        if (!isRunning) return;

        // Update camera position continuously
        if (keys.left) cameraX -= cameraSpeed;
        if (keys.right) cameraX += cameraSpeed;

        // Determine which chunks are visible
        const startChunk = Math.floor(cameraX / CHUNK_WIDTH) - 1;
        const endChunk = Math.floor((cameraX + width) / CHUNK_WIDTH) + 1;

        // Gather props for visible chunks
        let visibleProps = [];
        for (let i = startChunk; i <= endChunk; i++) {
            if (!chunks.has(i)) {
                chunks.set(i, generateChunkProps(i));
            }
            // To ensure proper depth sorting across chunks, we can't just draw chunk by chunk
            // if we want perfect overlap, but drawing per chunk is usually fine if they don't overlap too much.
            // For perfection, we merge and sort.
            visibleProps.push(...chunks.get(i));
        }
        
        visibleProps.sort((a, b) => a.y - b.y);

        // 1. Draw Sky
        const grad = ctx.createLinearGradient(0, 0, 0, height * 0.6);
        grad.addColorStop(0, PALETTE.skyTop);
        grad.addColorStop(1, PALETTE.skyBottom);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        // 2. Draw Sun (Static in background)
        const sunY = height * 0.2; 
        ctx.beginPath();
        ctx.arc(width * 0.5, sunY, 60, 0, Math.PI * 2);
        ctx.fillStyle = PALETTE.sun;
        ctx.shadowColor = PALETTE.sun;
        ctx.shadowBlur = 30;
        ctx.fill();
        ctx.shadowBlur = 0;

        // 3. Draw Sand
        // Draw layers of dunes for depth
        const layers = [
            { parallax: 1.0, baseY: height * 0.55, color: PALETTE.sandDark, amplitude: 30, period: 500, seed: 10 },
            { parallax: 1.0, baseY: height * 0.65, color: PALETTE.sandMid, amplitude: 40, period: 600, seed: 42 },
            { parallax: 1.0, baseY: height * 0.75, color: PALETTE.sandLight, amplitude: 50, period: 700, seed: 73 }
        ];

        layers.forEach(layer => {
            ctx.fillStyle = layer.color;
            ctx.beginPath();
            ctx.moveTo(0, height);
            
            // Draw points across the screen width
            // Step size of 20 pixels is usually fine for smooth curves
            const step = 20;
            for (let x = 0; x <= width + step; x += step) {
                // Calculate global X
                const globalX = x + cameraX * layer.parallax;
                
                // Deterministic height using combined incommensurate sine waves (pseudo-noise)
                ctx.lineTo(x, getSandHeight(globalX, layer.baseY, layer.amplitude, layer.period, layer.seed));
            }
            ctx.lineTo(width, height);
            ctx.fill();
        });

        // 4. Draw Props
        visibleProps.forEach(prop => {
            let renderX = prop.x - cameraX;
            // Draw if on screen (with some margin based on scale)
            const margin = 150 * prop.scale;
            if (renderX > -margin && renderX < width + margin) {
                if (prop.type === 'tree') drawPalmTree(ctx, renderX, prop.y, prop.scale);
                else if (prop.type === 'coconut') drawCoconut(ctx, renderX, prop.y, prop.scale);
                else if (prop.type === 'pearl') drawPearl(ctx, renderX, prop.y, prop.scale);
            }
        });

        // Optional: clear old chunks to free memory if camera moved far away
        for (let key of chunks.keys()) {
            if (key < startChunk - 5 || key > endChunk + 5) {
                chunks.delete(key);
            }
        }

        animationFrameId = requestAnimationFrame(loop);
    }

    function cleanup() {
        isRunning = false;
        container.style.cursor = '';
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        window.removeEventListener('resize', resize);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        if (uiContainer && uiContainer.parentNode) uiContainer.parentNode.removeChild(uiContainer);
        
        if (bossMusic) bossMusic.stop();
    }

    loop();
    
    return {
        cleanup,
        showCursor: () => { container.style.cursor = ''; },
        hideCursor: () => { container.style.cursor = 'none'; }
    };
}
