import { playAudio } from '../util/audioManager.js';
import { IS_MOBILE } from '../main.js';
import { getActiveSlot } from '../util/storage.js';
import { createCursorTrail } from './cursorTrail.js';
import { settingsManager } from './settingsManager.js';

const COIN_VOLUME = IS_MOBILE ? 0.12 : 0.3;

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

const projectileImages = {
    coin: new Image(),
    bomb: new Image()
};
projectileImages.coin.src = 'img/currencies/coin/coin.webp';
projectileImages.bomb.src = 'img/misc/bomb.webp';

function drawProjectileImage(ctx, x, y, scale, img) {
    if (!img.complete) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    const size = 64; // Base drawing size
    ctx.drawImage(img, -size/2, -size/2, size, size);
    ctx.restore();
}

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
    const applyCursorSetting = (show) => {
        container.style.cursor = show ? 'default' : 'none';
    };
    applyCursorSetting(settingsManager.get('show_cursor'));
    settingsManager.subscribe('show_cursor', applyCursorSetting);

    // Start Boss Music
    const bossMusic = playAudio('sounds/Secret_Boss_Fight.ogg', { loop: true, volume: 1.0, type: 'music' });

    const merchantImg = new Image();
    merchantImg.src = 'img/misc/merchant.webp';

    // --- Canvas Setup ---
    const canvas = document.createElement('canvas');
    canvas.id = 'bossfight-canvas';
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '2147483641'; 
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d', { alpha: false });
    let width, height;
    let props = [];

    const cursorTrail = createCursorTrail(container, { isBossFight: true });

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
    uiContainer.style.zIndex = '2147483642';
    uiContainer.style.pointerEvents = 'none'; // Let clicks pass through if needed, except for buttons
    container.appendChild(uiContainer);

    // Health Bar setup
    const healthBarWrapper = document.createElement('div');
    healthBarWrapper.style.position = 'absolute';
    healthBarWrapper.style.left = '50%';
    healthBarWrapper.style.transform = 'translate(-50%, -100%)';
    healthBarWrapper.style.display = 'flex';
    healthBarWrapper.style.flexDirection = 'column';
    healthBarWrapper.style.alignItems = 'center';
    healthBarWrapper.style.zIndex = '1';

    const hpBar = document.createElement('div');
    hpBar.className = 'xp-bar boss-hp-bar'; // Reuse xp-bar structure classes
    // We remove xp-plus so no need to account for it, but we can set the variables or override properties.
    hpBar.style.width = 'clamp(200px, 44vw, 440px)'; // Matches xp-bar-w
    hpBar.style.height = 'clamp(34px, 5.2svh, 46px)';
    hpBar.style.border = '3px solid #01060f'; // Outline
    hpBar.style.boxShadow = 'inset 0 6px 10px rgba(255,255,255,0.14), inset 0 -6px 14px rgba(0,0,0,0.45)';
    // Red background base behind the fill
    hpBar.style.background = '#2a0000';

    const hpBarFill = document.createElement('div');
    hpBarFill.className = 'xp-bar__fill';
    hpBarFill.style.width = '100%';
    // We override --glass-bg using inline styles or set it as a CSS variable on the element
    // Actually, setting background directly will override `.xp-bar__fill::after` if we aren't careful, 
    // but the class structure expects `xp-bar__fill` to have the base fill color, and `::after` handles the gloss.
    // So we just set the background color on the fill element itself.
    // Wait, the xp bar doesn't use background on `__fill`, it sets background on `__fill::after` OR expects a class.
    // Let's set background directly on hpBarFill.
    hpBarFill.style.background = 'linear-gradient(to right, rgb(255, 0, 0), rgb(239, 0, 0), rgb(219, 0, 0))';

    // Also need to adjust the glass effect variable so it matches the reddish theme or keep the white glass.
    hpBarFill.style.setProperty('--glass-bg', 'linear-gradient(180deg, rgba(255,255,255,0.52), rgba(255,255,255,0))');

    const hpBarFrame = document.createElement('div');
    hpBarFrame.className = 'xp-bar__frame';
    hpBarFrame.style.justifyContent = 'center';
    hpBarFrame.style.alignItems = 'center';

    const hpText = document.createElement('div');
    hpText.className = 'xp-bar__progress';
    hpText.style.fontWeight = 'bold';
    hpText.style.color = '#fff';
    hpText.style.fontSize = 'clamp(18px, 3.0vw, 24px)';
    hpText.style.textShadow = '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000';
    hpText.textContent = 'HP: 1000/1000';
    hpText.style.transform = 'translateY(-1px)';

    let bossHp = 1000;
    const maxBossHp = 1000;
    function updateBossHpUI() {
        hpText.textContent = `HP: ${bossHp}/${maxBossHp}`;
        hpBarFill.style.width = `${Math.max(0, (bossHp / maxBossHp) * 100)}%`;
    }

    function getDifficultyLevel() {
        if (bossHp <= 100) return 9;
        if (bossHp <= 200) return 8;
        if (bossHp <= 300) return 7;
        if (bossHp <= 400) return 6;
        if (bossHp <= 500) return 5;
        if (bossHp <= 600) return 4;
        if (bossHp <= 700) return 3;
        if (bossHp <= 800) return 2;
        if (bossHp <= 900) return 1;
        return 0;
    }

    hpBarFrame.appendChild(hpText);
    hpBar.appendChild(hpBarFill);
    hpBar.appendChild(hpBarFrame);
    healthBarWrapper.appendChild(hpBar);
    uiContainer.appendChild(healthBarWrapper);

    let playerLives = 5;
    const livesContainer = document.createElement('div');
    livesContainer.style.position = 'absolute';
    livesContainer.style.bottom = '0';
    livesContainer.style.left = '0';
    livesContainer.style.display = 'flex';
    livesContainer.style.zIndex = '2';

    function updateLivesUI() {
        livesContainer.innerHTML = '';
        for (let i = 0; i < playerLives; i++) {
            const lifeImg = document.createElement('img');
            lifeImg.src = 'img/misc/life.webp';
            lifeImg.style.width = 'clamp(32px, 20vw, 128px)';
            lifeImg.style.height = 'clamp(32px, 20vw, 128px)';
            lifeImg.style.margin = '0';
            lifeImg.style.display = 'block';
            livesContainer.appendChild(lifeImg);
        }
    }
    updateLivesUI();
    uiContainer.appendChild(livesContainer);

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
            { baseYFactor: 0.65, amplitude: 15, period: 500, seedOffset: 10, scaleModifier: 0.6 },
            { baseYFactor: 0.75, amplitude: 20, period: 600, seedOffset: 42, scaleModifier: 1.0 },
            { baseYFactor: 0.85, amplitude: 25, period: 700, seedOffset: 73, scaleModifier: 1.4 }
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

    function playBombExplosion() {
        const explosionContainer = document.createElement('div');
        explosionContainer.style.position = 'fixed';
        explosionContainer.style.top = '0';
        explosionContainer.style.left = '0';
        explosionContainer.style.width = '100vw';
        explosionContainer.style.height = '100vh';
        explosionContainer.style.pointerEvents = 'none';
        explosionContainer.style.zIndex = '2147483647';
        explosionContainer.style.overflow = 'hidden';
        document.body.appendChild(explosionContainer);

        const expCanvas = document.createElement('canvas');
        expCanvas.width = window.innerWidth;
        expCanvas.height = window.innerHeight;
        expCanvas.style.position = 'absolute';
        expCanvas.style.top = '0';
        expCanvas.style.left = '0';
        expCanvas.style.pointerEvents = 'none';
        explosionContainer.appendChild(expCanvas);

        const expCtx = expCanvas.getContext('2d');
        const particles = [];
        let isAnimating = true;

        const colors = ['#ff4500', '#ff8c00', '#ffd700', '#ffffff', '#ff0000'];

        class Particle {
            constructor(x, y) {
                this.x = x;
                this.y = y;
                const angle = Math.random() * Math.PI * 2;
                const speed = Math.random() * 20 + 5;
                this.vx = Math.cos(angle) * speed;
                this.vy = Math.sin(angle) * speed;
                this.size = Math.random() * 300 + 100;
                this.color = colors[Math.floor(Math.random() * colors.length)];
                this.life = 1.0;
                this.decay = Math.random() * 0.005 + 0.005;
                this.gravity = 0.3;
            }
            update() {
                this.x += this.vx;
                this.y += this.vy;
                this.vy += this.gravity;
                this.life -= this.decay;
                this.size *= 0.98;
            }
            draw(ctx) {
                if (this.life <= 0) return;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.globalAlpha = this.life;
                ctx.fill();
                ctx.globalAlpha = 1.0;
            }
        }

        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        for (let i = 0; i < 1000; i++) {
            particles.push(new Particle(centerX, centerY));
        }

        playAudio('sounds/explosion_long.ogg', { volume: 1.0 });

        const animate = () => {
            if (!isAnimating) return;
            expCtx.clearRect(0, 0, expCanvas.width, expCanvas.height);
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.update();
                p.draw(expCtx);
                if (p.life <= 0) particles.splice(i, 1);
            }
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);

        setTimeout(() => {
            isAnimating = false;
            explosionContainer.remove();
        }, 5000);
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
    
    let activeProjectiles = [];
    let collectedAnimations = [];
    let isRunning = true;
    let animationFrameId;
    let lastSpawnTime = 0;
    
    let leftEyeBombStep = 0;
    let rightEyeBombStep = 0;

    let currentBossWidth = 0;
    let currentBossHeight = 0;
    let currentBossX = 0;
    let currentBossBottomY = 0;

    function loop(timestamp) {
        if (!lastSpawnTime) lastSpawnTime = timestamp;
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

        // Boss (Static in background just behind the highest sand layer)
        let bossTopY = 0;
        if (merchantImg.complete && merchantImg.naturalWidth > 0) {
            // Massive boss
            // Bound by both width and height to prevent overwhelming widescreen displays
            const maxBossWidth = width * 0.7;
            const maxBossHeight = height * 0.65; // nearly covering the sun, but leaving room for HP bar
            
            let bossWidth = maxBossWidth;
            let bossHeight = (bossWidth / merchantImg.naturalWidth) * merchantImg.naturalHeight;
            
            if (bossHeight > maxBossHeight) {
                bossHeight = maxBossHeight;
                bossWidth = (bossHeight / merchantImg.naturalHeight) * merchantImg.naturalWidth;
            }
            
            // Fixed horizontal position
            const hatOffsetRatio = 6 / 512;
            const bossX = width * 0.5 - bossWidth * hatOffsetRatio;
            
            // The highest sand layer has baseY = height * 0.55
            const highestSandBaseY = height * 0.65;
            
            // Place boss bottom slightly below the sand base
            const bossBottomY = highestSandBaseY + bossHeight * 0.1 + 20;
            
            bossTopY = bossBottomY - bossHeight;
            currentBossWidth = bossWidth;
            currentBossHeight = bossHeight;
            currentBossX = bossX;
            currentBossBottomY = bossBottomY;

            ctx.save();
            // Translate to boss center
            ctx.translate(bossX, bossBottomY - bossHeight / 2);
            ctx.drawImage(merchantImg, -bossWidth / 2, -bossHeight / 2, bossWidth, bossHeight);
            ctx.restore();
            
            // Update health bar position dynamically to sit above the boss visually, ensuring it's always on screen
            let hpBarY = bossTopY - 10;
            if (hpBarY < 10) hpBarY = 10;
            healthBarWrapper.style.top = `${hpBarY}px`;
        }

        // 3. Draw Sand
        // Draw layers of dunes for depth
        const layers = [
            { parallax: 1.0, baseY: height * 0.65, color: PALETTE.sandDark, amplitude: 15, period: 500, seed: 10 },
            { parallax: 1.0, baseY: height * 0.75, color: PALETTE.sandMid, amplitude: 20, period: 600, seed: 42 },
            { parallax: 1.0, baseY: height * 0.85, color: PALETTE.sandLight, amplitude: 25, period: 700, seed: 73 }
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

        const currentSpawnInterval = 1000 / (20 + getDifficultyLevel() * 2);

        if (timestamp - lastSpawnTime >= currentSpawnInterval && currentBossWidth > 0) {
            lastSpawnTime = timestamp;
            const bombChance = 0.05 + getDifficultyLevel() * 0.025;
            const isCoin = Math.random() >= bombChance;
            const leftEye = Math.random() < 0.5;
            
            // boss center is currentBossX, bossTop is currentBossBottomY - currentBossHeight
            const eyeXOffset = currentBossWidth * (leftEye ? -0.095 : 0.1135);
            const eyeYOffset = currentBossHeight * -0.657;
            
            let currentEyeXOffset = eyeXOffset;
            let currentEyeYOffset = eyeYOffset;

            if (!isCoin) {
                let step = leftEye ? leftEyeBombStep : rightEyeBombStep;
                let offsetMultiplier = 0;
                
                if (step === 1) {
                    offsetMultiplier = Math.random();
                } else if (step === 2) {
                    offsetMultiplier = 1.0;
                }
                
                let xShift = (leftEye ? 0.05 : -0.05) * currentBossWidth * offsetMultiplier;
                let yShift = -0.05 * currentBossHeight * offsetMultiplier;
                
                currentEyeXOffset += xShift;
                currentEyeYOffset += yShift;
                
                if (leftEye) {
                    leftEyeBombStep = (leftEyeBombStep + 1) % 3;
                } else {
                    rightEyeBombStep = (rightEyeBombStep + 1) % 3;
                }
            }
            
            const startX = currentBossX + currentEyeXOffset + cameraX;
            const startY = currentBossBottomY + currentEyeYOffset;

            // Give velocity
            const speedMagnitude = (Math.random() * 20 + 10)
            const baseVx = leftEye ? -speedMagnitude : speedMagnitude;
            const baseVy = -(Math.random() * 3 + 1);

            const decelRatio = Math.random() < 0.75 ? 0.60 : (Math.random() * 0.50 + 0.10);
            const decelDistance = width * decelRatio;

            playAudio('sounds/projectile_spawn.ogg', { volume: 0.8 });
            activeProjectiles.push({
                type: isCoin ? 'coin' : 'bomb',
                x: startX,
                startX: startX,
                y: startY,
                vx: baseVx,
                vy: baseVy,
                scale: 0.6,
                targetScale: 1.0 + Math.random() * 0.5,
                width: 32,
                height: 32,
                decelDistance: decelDistance,
                slowed: false
            });
        }

        // Render and update active projectiles
        for (let i = activeProjectiles.length - 1; i >= 0; i--) {
            const p = activeProjectiles[i];
            
            // Physics
            p.x += p.vx;
            p.y += p.vy;
            
            if (!p.slowed) {
                if (Math.abs(p.x - p.startX) >= p.decelDistance) {
                    p.slowed = true;
                    p.vx *= 0.1665;
                    p.vy *= 0.1665;
                }
            } else {
                p.vx *= 0.95; // Friction
                p.vy += 0.01 + getDifficultyLevel() * 0.005;
            }
            
            // Scale up to target
            if (p.scale < p.targetScale) {
                p.scale += 0.02;
            }

            // Remove if off screen bottom
            if (p.y > height + 100 * p.scale) {
                activeProjectiles.splice(i, 1);
                continue;
            }

            let renderX = p.x - cameraX;
            if (p.type === 'coin') drawProjectileImage(ctx, renderX, p.y, p.scale, projectileImages.coin);
            else if (p.type === 'bomb') drawProjectileImage(ctx, renderX, p.y, p.scale * 1.5, projectileImages.bomb);
        }

        // Render collected coin animations
        const now = performance.now();
        for (let i = collectedAnimations.length - 1; i >= 0; i--) {
            const anim = collectedAnimations[i];
            const elapsed = now - anim.startTime;
            if (elapsed > 220) {
                collectedAnimations.splice(i, 1);
                continue;
            }

            // Approximation of CSS animation:
            // 0%   { transform: scale(1);   opacity: 1; }
            // 70%  { transform: scale(1.35) translateY(-12px); opacity: .35; }
            // 100% { transform: scale(1.5)  translateY(-14px); opacity: 0; }
            // Progress is 0.0 to 1.0 over 220ms.
            // Using a simple cubic bezier approximation or linear interpolation for simplicity.
            const t = elapsed / 220; // 0 to 1
            
            // ease-out approximation:
            const easeOut = 1 - Math.pow(1 - t, 3);
            
            let scaleMultiplier = 1;
            let yOffset = 0;
            let opacity = 1;
            
            if (t <= 0.7) {
                const subT = t / 0.7; // 0 to 1 over first 70%
                scaleMultiplier = 1 + (0.35 * subT);
                yOffset = -12 * subT;
                opacity = 1 - (0.65 * subT); // 1 to 0.35
            } else {
                const subT = (t - 0.7) / 0.3; // 0 to 1 over last 30%
                scaleMultiplier = 1.35 + (0.15 * subT);
                yOffset = -12 - (2 * subT);
                opacity = 0.35 - (0.35 * subT); // 0.35 to 0
            }

            let renderX = anim.x - cameraX;
            let renderY = anim.y + yOffset;
            let finalScale = anim.startScale * scaleMultiplier;

            ctx.save();
            ctx.globalAlpha = Math.max(0, opacity);
            drawProjectileImage(ctx, renderX, renderY, finalScale, projectileImages.coin);
            ctx.restore();
        }


        // Optional: clear old chunks to free memory if camera moved far away
        for (let key of chunks.keys()) {
            if (key < startChunk - 5 || key > endChunk + 5) {
                chunks.delete(key);
            }
        }

        animationFrameId = requestAnimationFrame(loop);
    }

    function circleLineSegmentIntersect(circleX, circleY, radius, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const l2 = dx * dx + dy * dy;
        
        if (l2 === 0) {
            const distX = circleX - x1;
            const distY = circleY - y1;
            return (distX * distX + distY * distY) <= radius * radius;
        }

        let t = ((circleX - x1) * dx + (circleY - y1) * dy) / l2;
        t = Math.max(0, Math.min(1, t));

        const closestX = x1 + t * dx;
        const closestY = y1 + t * dy;

        const distX = circleX - closestX;
        const distY = circleY - closestY;
        return (distX * distX + distY * distY) <= radius * radius;
    }

    let currentDifficultyLevel = getDifficultyLevel();

    function updateMusicSpeed() {
        if (!bossMusic) return;
        const diffLevel = getDifficultyLevel();
        if (diffLevel > currentDifficultyLevel) {
            currentDifficultyLevel = diffLevel;
            let newPlaybackRate = 1.0 + (currentDifficultyLevel * 0.01);
            if (currentDifficultyLevel === 9) {
                newPlaybackRate += 0.05;
            }
            
            if (bossMusic.source && bossMusic.source.playbackRate) {
                try {
                    const now = bossMusic.source.context ? bossMusic.source.context.currentTime : 0;
                    if (now > 0 && bossMusic.source.playbackRate.setValueAtTime) {
                         bossMusic.source.playbackRate.setValueAtTime(newPlaybackRate, now);
                    } else {
                         bossMusic.source.playbackRate.value = newPlaybackRate;
                    }
                } catch(e) {
                    bossMusic.source.playbackRate.value = newPlaybackRate;
                }
            } else if (bossMusic.element) {
                bossMusic.element.playbackRate = newPlaybackRate;
            }
        }
    }

    function onBossCursorHit(e) {
        if (!isRunning) return;
        const cx = e.detail.x;
        const cy = e.detail.y;
        const lastCx = e.detail.lastX;
        const lastCy = e.detail.lastY;
        
        for (let i = activeProjectiles.length - 1; i >= 0; i--) {
            const prop = activeProjectiles[i];
            const renderX = prop.x - cameraX;
            const renderY = prop.y;
            
            let hit = false;

            if (prop.type === 'coin') {
                const radius = 32 * prop.scale * 1.3;
                hit = circleLineSegmentIntersect(renderX, renderY, radius, lastCx, lastCy, cx, cy);
            } else if (prop.type === 'bomb') {
                const radius = 32 * prop.scale * 1.5 * 0.5;
                const hitboxY = renderY + (32 * prop.scale * 1.5) - radius;
                hit = circleLineSegmentIntersect(renderX, hitboxY, radius, lastCx, lastCy, cx, cy);
            }

            if (hit) {
                if (prop.type === 'coin') {
                    playAudio('sounds/coin_pickup.ogg', { volume: COIN_VOLUME });
                    collectedAnimations.push({ x: prop.x, y: prop.y, startScale: prop.scale, startTime: performance.now() });
                    activeProjectiles.splice(i, 1);
                    bossHp = Math.max(0, bossHp - 1);
                    updateBossHpUI();
                    updateMusicSpeed();
                } else if (prop.type === 'bomb') {
                    activeProjectiles = [];
                    playerLives = Math.max(0, playerLives - 1);
                    updateLivesUI();
                    playBombExplosion();
                    break;
                }
            }
        }
    }
    document.addEventListener('boss_cursor_hit', onBossCursorHit);

    function cleanup() {
        isRunning = false;
        container.style.cursor = '';
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        window.removeEventListener('resize', resize);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        document.removeEventListener('boss_cursor_hit', onBossCursorHit);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        if (uiContainer && uiContainer.parentNode) uiContainer.parentNode.removeChild(uiContainer);
        
        if (bossMusic) bossMusic.stop();
        if (cursorTrail) cursorTrail.destroy();
    }

    loop();
    
    return {
        cleanup,
        showCursor: () => { container.style.cursor = ''; },
        hideCursor: () => { container.style.cursor = 'none'; }
    };
}
