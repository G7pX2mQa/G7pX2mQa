import { playAudio } from '../util/audioManager.js';
import { IS_MOBILE } from '../main.js';
import { getActiveSlot } from '../util/storage.js';
import { createCursorTrail } from './cursorTrail.js';
import { settingsManager } from './settingsManager.js';
import { formatNumber } from '../util/numFormat.js';
import { BigNum } from '../util/bigNum.js';

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
    bomb: new Image(),
    life: new Image()
};
projectileImages.coin.src = 'img/currencies/coin/coin.webp';
projectileImages.bomb.src = 'img/misc/bomb.webp';
projectileImages.life.src = 'img/misc/life.webp';

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

    let bossHp = 1000;
    const maxBossHp = 1000;
	hpText.textContent = `HP: ${formatNumber(BigNum.fromAny(bossHp))} / ${formatNumber(BigNum.fromAny(maxBossHp))}`;
    hpText.style.transform = 'translateY(-1px)';
	
    function updateBossHpUI() {
        hpText.textContent = `HP: ${formatNumber(BigNum.fromAny(bossHp))} / ${formatNumber(BigNum.fromAny(maxBossHp))}`;
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

    const INITIAL_PLAYER_LIVES = 5;
    let playerLives = INITIAL_PLAYER_LIVES;
    const livesContainer = document.createElement('div');
    livesContainer.style.position = 'absolute';
    livesContainer.style.bottom = '0';
    livesContainer.style.left = '0';
    livesContainer.style.display = 'flex';
    livesContainer.style.zIndex = '2';

    let styleElem = document.getElementById('life-fire-glow-style');
    if (!styleElem) {
        styleElem = document.createElement('style');
        styleElem.id = 'life-fire-glow-style';
        styleElem.textContent = `
            @keyframes fireGlow {
                0% { filter: drop-shadow(0 0 5px rgba(255, 0, 0, 0.8)) drop-shadow(0 -5px 15px rgba(255, 69, 0, 0.6)); transform: scale(1); }
                50% { filter: drop-shadow(0 0 15px rgba(255, 0, 0, 1)) drop-shadow(0 -10px 25px rgba(255, 69, 0, 0.8)); transform: scale(1.05); }
                100% { filter: drop-shadow(0 0 5px rgba(255, 0, 0, 0.8)) drop-shadow(0 -5px 15px rgba(255, 69, 0, 0.6)); transform: scale(1); }
            }
            .life-fire-glow {
                animation: fireGlow 1.05s infinite alternate ease-in-out;
                transform-origin: bottom center;
            }
        `;
        uiContainer.appendChild(styleElem);
    }

    function updateLivesUI() {
        livesContainer.innerHTML = '';
        const maxLivesDisplay = Math.max(INITIAL_PLAYER_LIVES, playerLives);
        const vwPerLife = 100 / maxLivesDisplay;
        for (let i = 0; i < playerLives; i++) {
            const lifeImg = document.createElement('img');
            lifeImg.src = 'img/misc/life.webp';
            lifeImg.style.width = `clamp(32px, ${vwPerLife}vw, 128px)`;
            lifeImg.style.height = `clamp(32px, ${vwPerLife}vw, 128px)`;
            lifeImg.style.margin = '0';
            lifeImg.style.display = 'block';
            
            if (playerLives === 1 && i === 0) {
                lifeImg.classList.add('life-fire-glow');
            }
            
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
            update(timeScale = 1) {
                this.x += this.vx * timeScale;
                this.y += this.vy * timeScale;
                this.vy += this.gravity * timeScale;
                this.life -= this.decay * timeScale;
                this.size *= Math.pow(0.98, timeScale);
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

        let lastExpTime = performance.now();
        const animate = (timestamp) => {
            if (!isAnimating) return;
            const dt = timestamp - lastExpTime;
            lastExpTime = timestamp;
            const timeScale = dt / (1000 / 120);

            expCtx.clearRect(0, 0, expCanvas.width, expCanvas.height);
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];
                p.update(timeScale);
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
    let lastFrameTime = 0;
    
    let bombInvincibilityUntil = 0;
    
    let leftEyeBombStep = 0;
    let rightEyeBombStep = 0;

    let activeBombColumns = [];
    let triggeredHpThresholds = new Set();
    let relentlessColumnLastSpawn = 0;
    let splashAnimations = [];
    let leftEyeGlowUntil = 0;
    let rightEyeGlowUntil = 0;
    let currentBossLightningLeft = null;
    let currentBossLightningRight = null;

    let currentBossWidth = 0;
    let currentBossHeight = 0;
    let currentBossX = 0;
    let currentBossBottomY = 0;

    let cursorScreenX = null;
    function generateBossLightning(startX, startY) {
        const bolts = [];
        const numMainBolts = 3;
        const BOSS_LIGHTNING_BRANCHES = 3;
        
        for (let b = 0; b < numMainBolts; b++) {
            const mainLength = 50 + Math.random() * 30; // Shorter main bolt
            const angle = Math.random() * Math.PI * 2; // Random angle

            // Main bolt
            const mainEndX = startX + Math.cos(angle) * mainLength;
            const mainEndY = startY + Math.sin(angle) * mainLength;

            // Create jagged points for the main bolt
            const mainPoints = [{ x: startX, y: startY }];
            const segments = 5;
            for (let i = 1; i < segments; i++) {
                const t = i / segments;
                const midX = startX + (mainEndX - startX) * t;
                const midY = startY + (mainEndY - startY) * t;
                
                // Add some jitter
                const perpX = -Math.sin(angle);
                const perpY = Math.cos(angle);
                const jitter = (Math.random() - 0.5) * 15;
                
                mainPoints.push({
                    x: midX + perpX * jitter,
                    y: midY + perpY * jitter
                });
            }
            mainPoints.push({ x: mainEndX, y: mainEndY });

            bolts.push({ points: mainPoints, width: 3 });

            // Generate small branches
            for (let i = 0; i < BOSS_LIGHTNING_BRANCHES; i++) {
                // Pick a random point along the main bolt to branch from (excluding start/end)
                const branchIdx = 1 + Math.floor(Math.random() * (segments - 1));
                const branchStart = mainPoints[branchIdx];
                
                // Calculate direction of the main bolt segment here
                const segStart = mainPoints[branchIdx - 1];
                const segAngle = Math.atan2(branchStart.y - segStart.y, branchStart.x - segStart.x);
                
                const branchAngle = segAngle + (Math.random() * 1.2 - 0.6); // slight devation
                const branchLen = mainLength * (0.3 + Math.random() * 0.3); // shorter than main
                
                const branchEndX = branchStart.x + Math.cos(branchAngle) * branchLen;
                const branchEndY = branchStart.y + Math.sin(branchAngle) * branchLen;
                
                // Make branches just a single line segment for simplicity
                const branchPoints = [
                    { x: branchStart.x, y: branchStart.y },
                    { x: branchEndX, y: branchEndY }
                ];
                
                bolts.push({ points: branchPoints, width: 1.5 });
            }
        }
        
        return bolts;
    }
    let cursorScreenY = null;

    function spawnBombColumn(direction, timestamp, excludeGapIndex = null) {
        // Determine bomb size
        const numBombs = Math.ceil(height / 64);
        const bombSize = height / numBombs;
        
        let hudHeight = 0;
        if (typeof livesContainer !== 'undefined' && livesContainer && livesContainer.parentNode) {
            hudHeight = livesContainer.getBoundingClientRect().height;
        }
        
        // Always exclude at least 2 spots from the bottom (like the original numBombs - 2),
        // or more if the HUD is taller.
        const bombsToExcludeAtBottom = Math.max(2, Math.ceil(hudHeight / bombSize) + 1);
        
        let maxGapIndex = Math.max(1, numBombs - bombsToExcludeAtBottom);
        let minGapIndex = Math.floor(numBombs / 2);
        
        // If excluding the HUD pushes the gap into the top half,
        // reluctantly allow the gap to spawn lower, prioritizing keeping it out of the top half.
        if (maxGapIndex < minGapIndex) {
            maxGapIndex = minGapIndex;
        }
        const possibleGaps = maxGapIndex - minGapIndex + 1;
        
        let gapIndex = minGapIndex + Math.floor(Math.random() * possibleGaps);
        if (excludeGapIndex !== null && possibleGaps > 1) {
            while (gapIndex === excludeGapIndex) {
                gapIndex = minGapIndex + Math.floor(Math.random() * possibleGaps);
            }
        }
        
        activeBombColumns.push({
            direction: direction,
            state: 'constructing', // constructing, pausing, moving
            bombs: [],
            numBombs: numBombs,
            bombSize: bombSize,
            gapIndex: gapIndex,
            creationStartTime: timestamp,
            lastBombSpawnTime: timestamp,
            bombsConstructed: 0,
            screenX: direction === 'left' ? 0 : width,
            wentThroughGap: false
        });
        return gapIndex;
    }

    function checkBombColumnThresholds(timestamp) {
        const thresholds = [
            { hp: 900, type: 'left' },
            { hp: 800, type: 'right' },
            { hp: 700, type: 'left' },
            { hp: 600, type: 'right' },
            { hp: 500, type: 'both' },
            { hp: 400, type: 'both' },
            { hp: 300, type: 'both' },
            { hp: 200, type: 'both' }
        ];

        for (const t of thresholds) {
            if (bossHp <= t.hp && !triggeredHpThresholds.has(t.hp)) {
                triggeredHpThresholds.add(t.hp);
                if (t.type === 'both') {
                    const firstGap = spawnBombColumn('left', timestamp);
                    spawnBombColumn('right', timestamp, firstGap);
                } else {
                    if (t.type === 'left') spawnBombColumn('left', timestamp);
                    if (t.type === 'right') spawnBombColumn('right', timestamp);
                }
            }
        }

        if (bossHp <= 100) {
            if (!triggeredHpThresholds.has(100)) {
                triggeredHpThresholds.add(100);
                const firstGap = spawnBombColumn('left', timestamp);
                spawnBombColumn('right', timestamp, firstGap);
                relentlessColumnLastSpawn = timestamp;
            } else if (timestamp - relentlessColumnLastSpawn >= 5000) {
                relentlessColumnLastSpawn = timestamp;
                const firstGap = spawnBombColumn('left', timestamp);
                spawnBombColumn('right', timestamp, firstGap);
            }
        }
    }

    let heartbeatAudio = null;
    function loop(timestamp) {
        if (!lastFrameTime) lastFrameTime = timestamp;

        if (playerLives === 1) {
            if (!heartbeatAudio) {
                heartbeatAudio = playAudio('sounds/heartbeat.ogg', { loop: true });
            }
        } else {
            if (heartbeatAudio) {
                heartbeatAudio.stop();
                heartbeatAudio = null;
            }
        }
        const dt = timestamp - lastFrameTime;
        lastFrameTime = timestamp;

        if (!lastSpawnTime) lastSpawnTime = timestamp;
        if (!isRunning) return;

        checkBombColumnThresholds(timestamp);

        // Update camera position continuously
        const timeScale = dt / (1000 / 120);
        if (keys.left) cameraX -= cameraSpeed * timeScale;
        if (keys.right) cameraX += cameraSpeed * timeScale;

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
            
            // Eye black glow
            const drawBolts = (bolts) => {
                if (!bolts) return;
                for (const b of bolts) {
                    if (!b.points || b.points.length < 2) continue;
                    
                    const drawPath = (width, color) => {
                        ctx.lineWidth = width;
                        ctx.strokeStyle = color;
                        ctx.beginPath();
                        ctx.moveTo(b.points[0].x, b.points[0].y);
                        for (let j = 1; j < b.points.length; j++) {
                            ctx.lineTo(b.points[j].x, b.points[j].y);
                        }
                        ctx.stroke();
                    };
                    
                    // 1. Glow Pass (Thick, lower opacity)
                    drawPath((b.width || 3) * 3.5, 'rgba(0, 0, 0, 0.4)');
                    
                    // 2. Core Pass (Thin, high opacity)
                    drawPath(b.width || 3, 'rgba(0, 0, 0, 1)');
                }
            };

            const leftEyeX = -bossWidth * 0.124;
            const rightEyeX = bossWidth * 0.143;
            const eyeY = -bossHeight * 0.166; // Adjusting relative to center. Center is bottom - height/2. Eye Y is bottom - height*0.666. So it's -height*0.166 from center

            if (timestamp < leftEyeGlowUntil) {
                ctx.beginPath();
                ctx.arc(leftEyeX, eyeY, bossWidth * 0.05, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowColor = 'black';
                ctx.shadowBlur = 10;
                ctx.fill();

                if (currentBossLightningLeft) {
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.shadowBlur = 0; // Turn off shadow for crisp lightning lines
                    drawBolts(currentBossLightningLeft);
                }
            } else {
                currentBossLightningLeft = null;
            }

            if (timestamp < rightEyeGlowUntil) {
                ctx.beginPath();
                ctx.arc(rightEyeX, eyeY, bossWidth * 0.05, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowColor = 'black';
                ctx.shadowBlur = 10;
                ctx.fill();

                if (currentBossLightningRight) {
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.shadowBlur = 0; // Turn off shadow for crisp lightning lines
                    drawBolts(currentBossLightningRight);
                }
            } else {
                currentBossLightningRight = null;
            }
            
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
            
            // Boss coordinates
            const bossCenterScreenX = currentBossX;
            const bossEyeYScreenOffset = currentBossBottomY - currentBossHeight * 0.657;
            const leftEyeScreenX = bossCenterScreenX - currentBossWidth * 0.095;
            const rightEyeScreenX = bossCenterScreenX + currentBossWidth * 0.1135;

            // Check if cursor is near eyes
            let isCursorNearEyes = false;
            if (cursorScreenX !== null && cursorScreenY !== null) {
                const rxLeft = currentBossWidth * (cursorScreenX < leftEyeScreenX ? 0.10 : 0.05);
                const ryLeft = currentBossWidth * 0.05;
                const dLeftX = cursorScreenX - leftEyeScreenX;
                const dLeftY = cursorScreenY - bossEyeYScreenOffset;
                if (((dLeftX * dLeftX) / (rxLeft * rxLeft) + (dLeftY * dLeftY) / (ryLeft * ryLeft)) <= 1) {
                    isCursorNearEyes = true;
                }

                const rxRight = currentBossWidth * (cursorScreenX > rightEyeScreenX ? 0.10 : 0.05);
                const ryRight = currentBossWidth * 0.05;
                const dRightX = cursorScreenX - rightEyeScreenX;
                const dRightY = cursorScreenY - bossEyeYScreenOffset;
                if (((dRightX * dRightX) / (rxRight * rxRight) + (dRightY * dRightY) / (ryRight * ryRight)) <= 1) {
                    isCursorNearEyes = true;
                }
            }

            let bombChance = 0.05 + getDifficultyLevel() * 0.025;
            if (isCursorNearEyes) {
                bombChance = 1.0;
            }

            let projType = "bomb";
            if (playerLives < INITIAL_PLAYER_LIVES && Math.random() < 0.0025) {
                projType = "life";
            } else if (Math.random() >= bombChance) {
                projType = "coin";
            }
            const leftEye = Math.random() < 0.5;
            
            // boss center is currentBossX, bossTop is currentBossBottomY - currentBossHeight
            const eyeXOffset = currentBossWidth * (leftEye ? -0.124 : 0.143);
            const eyeYOffset = currentBossHeight * -0.666;
            
            let currentEyeXOffset = eyeXOffset;
            let currentEyeYOffset = eyeYOffset;

            if (projType === "bomb") {
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
                type: projType,
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
            p.x += p.vx * timeScale;
            p.y += p.vy * timeScale;
            
            if (!p.slowed) {
                if (Math.abs(p.x - p.startX) >= p.decelDistance) {
                    p.slowed = true;
                    p.vx *= Math.pow(0.1665, timeScale);
                    p.vy *= Math.pow(0.1665, timeScale);
                }
            } else {
                p.vx *= Math.pow(0.95, timeScale); // Friction
                if (p.type === "life") {
                    p.vy += 0.01 * timeScale;
                } else {
                    p.vy += (0.01 + getDifficultyLevel() * 0.005) * timeScale;
                }
            }
            
            // Scale up to target
            if (p.scale < p.targetScale) {
                p.scale += 0.02 * timeScale;
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

        // Second pass: render life projectiles to ensure they are on top
        for (let i = activeProjectiles.length - 1; i >= 0; i--) {
            const p = activeProjectiles[i];
            if (p.type === 'life') {
                let renderX = p.x - cameraX;
                drawProjectileImage(ctx, renderX, p.y, p.scale * 2.0, projectileImages.life);
            }
        }

        // Process Bomb Columns
        for (let i = activeBombColumns.length - 1; i >= 0; i--) {
            const col = activeBombColumns[i];
            
            if (col.state === 'constructing') {
                const timePerBomb = 2000 / col.numBombs;
                
                // Keep the column locked to the screen while constructing
                if (col.direction === 'left') {
                    col.screenX = 0;
                } else {
                    col.screenX = width;
                }

                while (col.bombsConstructed < col.numBombs && timestamp - col.lastBombSpawnTime >= timePerBomb) {
                    col.lastBombSpawnTime += timePerBomb;
                    
                    if (col.bombsConstructed !== col.gapIndex) {
                        const targetY = col.bombsConstructed * col.bombSize + col.bombSize / 2;
                        
                        // Boss eye coordinates for bomb start
                        const leftEyeXOffset = currentBossWidth * -0.124;
                        const rightEyeXOffset = currentBossWidth * 0.143;
                        const eyeYOffset = currentBossHeight * -0.666;
                        
                        const useLeftEye = col.direction === 'left';
                        const eyeXOffset = useLeftEye ? leftEyeXOffset : rightEyeXOffset;
                        const startX = currentBossX + eyeXOffset + cameraX;
                        const startY = currentBossBottomY + eyeYOffset;
                        
                        col.bombs.push({
                            y: targetY,
                            startX: startX,
                            startY: startY,
                            startTime: timestamp,
                            transitionDuration: 750, // 0.75 second transition
                            settled: false
                        });
                        playAudio('sounds/bomb_column_construction.ogg', { volume: 0.6 });
                        
                        const relEyeY = -currentBossHeight * 0.166;
                        
                        if (useLeftEye) {
                            leftEyeGlowUntil = timestamp + 100;
                            currentBossLightningLeft = generateBossLightning(leftEyeXOffset, relEyeY);
                        } else {
                            rightEyeGlowUntil = timestamp + 100;
                            currentBossLightningRight = generateBossLightning(rightEyeXOffset, relEyeY);
                        }
                    }
                    col.bombsConstructed++;
                }
                
                if (col.bombsConstructed >= col.numBombs) {
                    col.state = 'pausing';
                    col.pauseStartTime = timestamp;
                }
            } else if (col.state === 'pausing') {
                // Keep the column locked to the screen while pausing
                if (col.direction === 'left') {
                    col.screenX = 0;
                } else {
                    col.screenX = width;
                }
                
                if (timestamp - col.pauseStartTime >= 1000) {
                    col.state = 'moving';
                }
            } else if (col.state === 'moving') {
                // 20% of viewport width per second, FPS independent
                const vx = (width * 0.2) * (dt / 1000);
                if (col.direction === 'left') {
                    col.screenX += vx;
                } else {
                    col.screenX -= vx;
                }
                
                // Remove if off screen
                let isOffScreen = false;
                if (col.direction === 'left' && col.screenX > width + 100) {
                    isOffScreen = true;
                } else if (col.direction === 'right' && col.screenX < -100) {
                    isOffScreen = true;
                }
                
                if (isOffScreen) {
                    if (!col.wentThroughGap) {
                        const now = performance.now();
                        if (now >= bombInvincibilityUntil) {
                            bombInvincibilityUntil = now + 2500;
                            activeProjectiles = []; activeBombColumns = [];
                            playerLives = Math.max(0, playerLives - 1);
                            updateLivesUI();
                            playBombExplosion();
							break;
                        }
                    }
                    activeBombColumns.splice(i, 1);
                    continue;
                }
            }
            
            // Draw bomb column
            const renderX = col.screenX;
            for (let j = 0; j < col.bombs.length; j++) {
                const b = col.bombs[j];
                let bx = renderX;
                let by = b.y;
                let isSettled = b.settled;
                
                if (!b.settled) {
                    const elapsed = timestamp - b.startTime;
                    if (elapsed < b.transitionDuration) {
                        const t = elapsed / b.transitionDuration;
                        bx = (b.startX - cameraX) + (renderX - (b.startX - cameraX)) * t;
                        by = b.startY + (b.y - b.startY) * t;
                    } else {
                        b.settled = true;
                        isSettled = true;
                        // Trigger splash
                        splashAnimations.push({
                            x: renderX,
                            y: b.y,
                            startTime: timestamp,
                            size: col.bombSize * 1.5
                        });
                    }
                }
                
                ctx.save();
                // scale to fit bombSize
                // normal bomb size is 64*1.5 = 96
                const scale = col.bombSize / 96;
                drawProjectileImage(ctx, bx, by, scale * 1.5, projectileImages.bomb);
                ctx.restore();
            }
        }

        // Render splash animations
        for (let i = splashAnimations.length - 1; i >= 0; i--) {
            const splash = splashAnimations[i];
            const elapsed = timestamp - splash.startTime;
            if (elapsed > 300) {
                splashAnimations.splice(i, 1);
                continue;
            }
            const t = elapsed / 300;
            const currentSize = splash.size * t;
            const alpha = 1 - t;
            
            ctx.save();
            ctx.beginPath();
            ctx.arc(splash.x, splash.y, currentSize / 2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
            ctx.fill();
            ctx.restore();
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

            if (anim.type !== 'life') {
                ctx.save();
                ctx.globalAlpha = Math.max(0, opacity);
                drawProjectileImage(ctx, renderX, renderY, finalScale, projectileImages.coin);
                ctx.restore();
            }
        }

        // Render collected life animations (highest z-index)
        for (let i = collectedAnimations.length - 1; i >= 0; i--) {
            const anim = collectedAnimations[i];
            if (anim.type === 'life') {
                const elapsed = now - anim.startTime;
                if (elapsed > 220) continue; // Already handled in previous loop
                
                const t = elapsed / 220;
                let scaleMultiplier = 1;
                let yOffset = 0;
                let opacity = 1;
                
                if (t <= 0.7) {
                    const subT = t / 0.7;
                    scaleMultiplier = 1 + (0.35 * subT);
                    yOffset = -12 * subT;
                    opacity = 1 - (0.65 * subT);
                } else {
                    const subT = (t - 0.7) / 0.3;
                    scaleMultiplier = 1.35 + (0.15 * subT);
                    yOffset = -12 - (2 * subT);
                    opacity = 0.35 - (0.35 * subT);
                }

                let renderX = anim.x - cameraX;
                let renderY = anim.y + yOffset;
                let finalScale = anim.startScale * scaleMultiplier;

                ctx.save();
                ctx.globalAlpha = Math.max(0, opacity);
                drawProjectileImage(ctx, renderX, renderY, finalScale * 2.0, projectileImages.life);
                ctx.restore();
            }
        }


        // Draw distress effects
        if (playerLives === 2 || playerLives === 1) {
            ctx.save();
            const currentDpr = window.devicePixelRatio || 1;
            ctx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0); // Reset transform to screen coordinates considering DPR
            
            // 1 HP specific effects (vignette)
            if (playerLives === 1) {
                const grad = ctx.createRadialGradient(width / 2, height / 2, Math.max(width, height) * 0.2, width / 2, height / 2, Math.max(width, height) * 0.8);
                grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
                grad.addColorStop(1, 'rgba(0, 0, 0, 0.4)'); // subtle black vignette
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, width, height);
            }

            // Jagged lines of distress
            const is1Hp = playerLives === 1;
            const spikeColor = is1Hp ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.015)';
            ctx.globalCompositeOperation = 'multiply';
            
            const spikeBaseLength = is1Hp ? 220 : 180;
            const spikeVarLength = is1Hp ? 100 : 80;
            const baseW = is1Hp ? 25 : 20;

            const getSpikeLen = (seed) => {
                const hash = Math.cos(seed * 11.3);
                return spikeBaseLength + hash * spikeVarLength;
            };

            const getPosOffset = (seed, time, index) => {
                const slowTime = time * 0.0003; // 5 times slower than 0.0015
                // Calm back and forth animation along the edge
                return Math.sin(slowTime + seed) * 40 + Math.sin(slowTime * 0.7 + index) * 20;
            };

            const numSpikesX = Math.max(12, Math.floor(width / 70));
            const numSpikesY = Math.max(12, Math.floor(height / 70));

            ctx.fillStyle = spikeColor;

            // Pre-calculate spike lengths to avoid repeated math
            const spikeLengthsXTop = new Float32Array(numSpikesX + 1);
            const spikeLengthsXBottom = new Float32Array(numSpikesX + 1);
            for (let i = 0; i <= numSpikesX; i++) {
                spikeLengthsXTop[i] = getSpikeLen(i * 13.37 + 0);
                spikeLengthsXBottom[i] = getSpikeLen(i * 13.37 + 100);
            }
            
            const spikeLengthsYLeft = new Float32Array(numSpikesY + 1);
            const spikeLengthsYRight = new Float32Array(numSpikesY + 1);
            for (let i = 0; i <= numSpikesY; i++) {
                spikeLengthsYLeft[i] = getSpikeLen(i * 13.37 + 200);
                spikeLengthsYRight[i] = getSpikeLen(i * 13.37 + 300);
            }

            const centerX = width / 2;
            const centerY = height / 2;
            const margin = baseW * 1.5; 
            
            ctx.globalCompositeOperation = 'multiply';

            const drawSpike = (edgeX, edgeY, length) => {
                const dx = centerX - edgeX;
                const dy = centerY - edgeY;
                const angle = Math.atan2(dy, dx);
                
                const cosA = Math.cos(angle);
                const sinA = Math.sin(angle);
                
                // Point 1: (-margin, -baseW/2)
                const p1x = edgeX + (-margin) * cosA - (-baseW / 2) * sinA;
                const p1y = edgeY + (-margin) * sinA + (-baseW / 2) * cosA;
                
                // Point 2: (-margin + length + margin, 0)
                const tipDist = length; 
                const p2x = edgeX + tipDist * cosA;
                const p2y = edgeY + tipDist * sinA;
                
                // Point 3: (-margin, baseW/2)
                const p3x = edgeX + (-margin) * cosA - (baseW / 2) * sinA;
                const p3y = edgeY + (-margin) * sinA + (baseW / 2) * cosA;
                
                ctx.beginPath();
                ctx.moveTo(p1x, p1y);
                ctx.lineTo(p2x, p2y);
                ctx.lineTo(p3x, p3y);
                ctx.fill();
            };

            // 1. Top edge
            for (let i = 0; i <= numSpikesX; i++) {
                const seed = i * 13.37 + 0;
                const nominalX = (i / numSpikesX) * width;
                const x = nominalX + getPosOffset(seed, timestamp, i);
                drawSpike(x, 0, spikeLengthsXTop[i]);
            }

            // 2. Bottom edge
            for (let i = 0; i <= numSpikesX; i++) {
                const seed = i * 13.37 + 100;
                const nominalX = (i / numSpikesX) * width;
                const x = nominalX + getPosOffset(seed, timestamp, i);
                drawSpike(x, height, spikeLengthsXBottom[i]);
            }

            // 3. Left edge
            for (let i = 0; i <= numSpikesY; i++) {
                const seed = i * 13.37 + 200;
                const nominalY = (i / numSpikesY) * height;
                const y = nominalY + getPosOffset(seed, timestamp, i);
                drawSpike(0, y, spikeLengthsYLeft[i]);
            }

            // 4. Right edge
            for (let i = 0; i <= numSpikesY; i++) {
                const seed = i * 13.37 + 300;
                const nominalY = (i / numSpikesY) * height;
                const y = nominalY + getPosOffset(seed, timestamp, i);
                drawSpike(width, y, spikeLengthsYRight[i]);
            }

            ctx.globalCompositeOperation = 'source-over';
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

    function heartLineSegmentIntersect(cx, cy, scale, x1, y1, x2, y2) {
        // Base size is 64x64, but actual heart image fills most of it.
        // We approximate a heart with 6 overlapping circles for better coverage.
        const circles = [
            { x: -14, y: -14, r: 18 }, // Left lobe
            { x: 14, y: -14, r: 18 },  // Right lobe
            { x: -10, y: -2, r: 18 },  // Left mid
            { x: 10, y: -2, r: 18 },   // Right mid
            { x: 0, y: 8, r: 20 },     // Center/lower mass
            { x: 0, y: 18, r: 14 }     // Bottom tip
        ];
        
        for (const c of circles) {
            const scaledX = cx + c.x * scale;
            const scaledY = cy + c.y * scale;
            const scaledR = c.r * scale;
            if (circleLineSegmentIntersect(scaledX, scaledY, scaledR, x1, y1, x2, y2)) {
                return true;
            }
        }
        return false;
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
            const rates = [1.0, 1.01, 1.02, 1.03, 1.04, 1.065, 1.09, 1.115, 1.14, 1.20];
            let newPlaybackRate = rates[currentDifficultyLevel] || 1.0;
            
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
        
        cursorScreenX = cx;
        cursorScreenY = cy;

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
            } else if (prop.type === 'life') {
                hit = heartLineSegmentIntersect(renderX, renderY, prop.scale * 2.0, lastCx, lastCy, cx, cy);
            } else if (prop.type === 'bomb') {
                const radius = 32 * prop.scale * 1.5 * 0.5;
                const hitboxY = renderY + (32 * prop.scale * 1.5) - radius;
                hit = circleLineSegmentIntersect(renderX, hitboxY, radius, lastCx, lastCy, cx, cy);
            }

            if (hit) {
                if (prop.type === 'coin') {
                    playAudio('sounds/coin_pickup.ogg', { volume: COIN_VOLUME });
                    collectedAnimations.push({ x: prop.x, y: prop.y, startScale: prop.scale, startTime: performance.now(), type: 'coin' });
                    activeProjectiles.splice(i, 1);
                    bossHp = Math.max(0, bossHp - 1);
                    updateBossHpUI();
                    updateMusicSpeed();
                } else if (prop.type === 'life') {
                    playAudio('sounds/life_restored.ogg', { volume: COIN_VOLUME });
                    collectedAnimations.push({ x: prop.x, y: prop.y, startScale: prop.scale, startTime: performance.now(), type: 'life' });
                    activeProjectiles.splice(i, 1);
                    playerLives++;
                    updateLivesUI();
                } else if (prop.type === 'bomb') {
                    const now = performance.now();
                    if (now < bombInvincibilityUntil) {
                        // Invincible: just remove the specific bomb without exploding or losing a life
                        activeProjectiles.splice(i, 1);
                    } else {
                        // Vulnerable: normal behavior and trigger invincibility
                        bombInvincibilityUntil = now + 2500;
                        activeProjectiles = [];
                        activeBombColumns = [];
                        playerLives = Math.max(0, playerLives - 1);
                        updateLivesUI();
                        playBombExplosion();
                        break;
                    }
                }
            }
        }

        // Bomb columns hit detection
        for (let i = 0; i < activeBombColumns.length; i++) {
            const col = activeBombColumns[i];
            if (col.state === 'moving' || col.state === 'pausing') {
                const renderX = col.screenX;
                const hitWidth = col.bombSize * 0.8;
                
                // Determine if cursor passed through gap
                const minX = renderX - hitWidth / 2;
                const maxX = renderX + hitWidth / 2;
                const passedThroughX = (lastCx <= maxX && cx >= minX) || (lastCx >= minX && cx <= maxX) || (cx >= minX && cx <= maxX);
                
                if (passedThroughX) {
                    const gapYCenter = col.gapIndex * col.bombSize + col.bombSize / 2;
                    const gapYMin = gapYCenter - col.bombSize / 2;
                    const gapYMax = gapYCenter + col.bombSize / 2;
                    
                    // Check if strictly in gap
                    if (cy >= gapYMin && cy <= gapYMax && lastCy >= gapYMin && lastCy <= gapYMax) {
                        col.wentThroughGap = true;
                    } else {
                        // Hit a bomb immediately when intersecting the wall X-bounds and not in the gap
                        const now = performance.now();
                        if (now >= bombInvincibilityUntil) {
                            bombInvincibilityUntil = now + 2500;
                            activeProjectiles = [];
                            activeBombColumns = [];
                            playerLives = Math.max(0, playerLives - 1);
                            updateLivesUI();
                            playBombExplosion();
                            break;
                        }
                    }
                }
            }
        }
    }
    document.addEventListener('boss_cursor_hit', onBossCursorHit);

    function cleanup() {
        isRunning = false;
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        window.removeEventListener('resize', resize);
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        document.removeEventListener('boss_cursor_hit', onBossCursorHit);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        if (uiContainer && uiContainer.parentNode) uiContainer.parentNode.removeChild(uiContainer);
        const styleEl = document.getElementById('life-fire-glow-style');
        if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
        
        if (bossMusic) bossMusic.stop();
        if (heartbeatAudio) heartbeatAudio.stop();
        if (cursorTrail) cursorTrail.destroy();
    }

    loop();
    
    return {
        cleanup
    };
}
