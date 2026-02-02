import { playAudio } from '../util/audioManager.js';

export function playTsunamiSequence(container, durationMs, onComplete, options = {}) {
    // Hide cursor initially
    container.style.cursor = 'none';

    // --- Audio Handles ---
    let ambienceAudio = null;
    let rumbleAudio = null;
    let humAudio = null;
    let explosionAudioTriggered = false;

    // Start Ambience Immediately (Wind/Storm Buildup)
    ambienceAudio = playAudio('sounds/tsu_storm_ambience.ogg', { volume: 0.8 });

    // --- BG Canvas (Sky, Sand) ---
    const bgCanvas = document.createElement('canvas');
    bgCanvas.id = 'tsunami-bg-canvas';
    bgCanvas.style.position = 'absolute';
    bgCanvas.style.inset = '0';
    bgCanvas.style.width = '100%';
    bgCanvas.style.height = '100%';
    bgCanvas.style.zIndex = '2147483644'; // Bottom
    container.appendChild(bgCanvas);

    // --- Overlay UI (XP/MP) ---
    const uiContainer = document.createElement('div');
    uiContainer.id = 'tsunami-ui-container';
    uiContainer.style.position = 'absolute';
    uiContainer.style.inset = '0';
    uiContainer.style.zIndex = '2147483645'; // Middle
    uiContainer.style.pointerEvents = 'none';
    uiContainer.style.color = '#fff';
    uiContainer.style.textShadow = '0 1px 2px rgba(0,0,0,0.8)';

    // Helper to style wrappers
    function styleWrapper(wrapper, type) {
        wrapper.style.position = 'absolute';
        wrapper.style.left = '50%';
        
        // Flipped upside down (rotateZ 180deg) and tilted back (rotateX 50deg)
        const transformBase = `perspective(600px) rotateX(50deg) rotateZ(180deg)`;
        
        const hasXp = !!options.xpHTML;
        const hasMp = !!options.mpHTML;

        if (type === 'coin') {
            wrapper.style.top = '77%';
            wrapper.style.transform = `translateX(-50%) ${transformBase}`;
        } else if (hasXp && hasMp) {
            // Both XP and MP: Side-by-side centered
            // Compromise vertical position
            wrapper.style.top = '72.5%';
            if (type === 'mp') {
                // Left side (gap of ~88px total)
                wrapper.style.transform = `translateX(calc(-100% - 44px)) ${transformBase}`;
            } else {
                // Right side (XP)
                wrapper.style.transform = `translateX(44px) ${transformBase}`;
            }
        } else {
            // Single XP or MP
            if (type === 'mp') wrapper.style.top = '66%';
            else if (type === 'xp') wrapper.style.top = '72%';
            wrapper.style.transform = `translateX(-50%) ${transformBase}`;
        }
        
        wrapper.style.transformOrigin = 'center center';
        
        const counter = wrapper.firstElementChild;
        if (counter) {
            counter.removeAttribute('hidden');
            counter.style.display = 'flex';
        }
    }
    
    if (options.coinHTML) {
        const coinWrapper = document.createElement('div');
        coinWrapper.innerHTML = options.coinHTML;
        styleWrapper(coinWrapper, 'coin');
        uiContainer.appendChild(coinWrapper);
    }
    if (options.xpHTML) {
        const xpWrapper = document.createElement('div');
        xpWrapper.innerHTML = options.xpHTML;
        styleWrapper(xpWrapper, 'xp');
        uiContainer.appendChild(xpWrapper);
    }
    if (options.mpHTML) {
        const mpWrapper = document.createElement('div');
        mpWrapper.innerHTML = options.mpHTML;
        styleWrapper(mpWrapper, 'mp');
        uiContainer.appendChild(mpWrapper);
    }
    container.appendChild(uiContainer);

    // --- FG Canvas (Water, Effects) ---
    const fgCanvas = document.createElement('canvas');
    fgCanvas.id = 'tsunami-fg-canvas';
    fgCanvas.style.position = 'absolute';
    fgCanvas.style.inset = '0';
    fgCanvas.style.width = '100%';
    fgCanvas.style.height = '100%';
    fgCanvas.style.zIndex = '2147483646'; // Top
    fgCanvas.style.pointerEvents = 'none';
    container.appendChild(fgCanvas);

    // --- Assets ---
    const merchantImg = new Image();
    merchantImg.src = 'img/misc/merchant.webp';
    let merchantLoaded = false;
    merchantImg.onload = () => { 
        merchantLoaded = true; 
    };
    merchantImg.onerror = (e) => {
        console.error('Tsunami: Merchant load failed', e);
    };

    // Handle resizing
    let width, height;
    let props = [];
    let sandSpeckles = [];
    let cloudBaseY = 0;

    function generateProps() {
        props = [];
        sandSpeckles = [];
        const sandY = height * 0.65;
        const d3y = sandY + height * 0.15;
        
        // Merchant Safe Zone
        const merchScale = Math.min(width, height) * 0.0005; 
        const merchW = 300 * merchScale;
        const merchX = width * 0.80;
        const merchSafeMin = merchX - (merchW * 0.6);
        const merchSafeMax = merchX + (merchW * 0.6);

        // Generate static speckles
        for(let i=0; i<100; i++) {
            const sx = Math.random() * width;
            const sy = d3y + Math.random() * (height - d3y);
            sandSpeckles.push({x: sx, y: sy});
        }
        
        const isSafe = (x, y, type) => {
            // HUD Avoidance
            // Center X band (10% to 90%)
            if (x > width * 0.10 && x < width * 0.90) {
                // Main HUD occupies roughly 70% to 85% Y, but lies on a higher z-index.
                // We allow spawning behind the HUD.
                // User requirement: In the middle band, only spawn in the top 15% of the sand.
                // Sand is from sandY to height.
                const sandH = height - sandY;
                const limitY = sandY + (sandH * 0.15);

                if (y > limitY) return false;
            } else {
                // Outer bands: Only spawn in the top 50% of the sand region
                // Restrict this logic ONLY to trees
                if (type === 'tree') {
                    const sandH = height - sandY;
                    const limitY = sandY + (sandH * 0.50);
                    if (y > limitY) return false;
                }
            }

            // Merchant Avoidance
            if (type === 'tree' && x > merchSafeMin && x < merchSafeMax) {
                return false;
            }

            return true;
        };

        const addProp = (type, count, scaleBase, scaleVar, xFn) => {
            for(let i=0; i<count; i++) {
                let x, y, safe = false;
                let attempts = 0;
                while(!safe && attempts < 50) {
                    if (xFn) {
                        x = xFn();
                    } else {
                        // Standard Uniform Distribution
                        x = Math.random() * width;
                    }

                    // Spawn anywhere on the sand (sandY to height)
                    // The isSafe function handles the specific restrictions for the middle.
                    const maxY = height; 
                    // Bias towards sandY (top) using quadratic curve
                    const r = Math.random();
                    y = sandY + 20 + (r * r) * (maxY - sandY - 20);
                    
                    if (isSafe(x, y, type)) {
                        safe = true;
                        // Distance check for trees to prevent clumping
                        if (type === 'tree') {
                            for (const p of props) {
                                if (p.type === 'tree') {
                                    const dx = p.x - x;
                                    const dy = p.y - y;
                                    const dist = Math.sqrt(dx*dx + dy*dy);
                                    // Ensure decent spacing: larger of 8% width or 100px
                                    if (dist < Math.max(width * 0.08, 100)) { 
                                        safe = false;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    attempts++;
                }
                if(safe) {
                    // Perspective scaling: items further down (larger y) are closer -> larger
                    const depth = (y - sandY) / (height - sandY); // 0 to 1
                    const perspScale = 0.6 + depth * 0.6; 
                    
                    const scale = (scaleBase + Math.random() * scaleVar) * perspScale;
                    props.push({ type, x, y, scale });
                }
            }
        };

        const outerTreeCount = 3 + Math.floor(Math.random() * 3);
        // Left
        addProp('tree', outerTreeCount, 0.8, 0.4, () => Math.random() * (width * 0.1));
        // Right
        addProp('tree', outerTreeCount, 0.8, 0.4, () => (width * 0.9) + Math.random() * (width * 0.1));
        // Center: Ensure at least 5 trees
        const centerTreeCount = 5 + Math.floor(Math.random() * 3);
        addProp('tree', centerTreeCount, 0.8, 0.4, () => (width * 0.1) + Math.random() * (width * 0.8));
        
        addProp('rock', 20, 0.6, 0.4);
        addProp('shell', 30, 0.3, 0.3);

        props.sort((a, b) => a.y - b.y);
    }

    const bgCtx = bgCanvas.getContext('2d', { alpha: false });
    const fgCtx = fgCanvas.getContext('2d', { alpha: true });

    function resize() {
        const dpr = window.devicePixelRatio || 1;
        width = window.innerWidth;
        height = window.innerHeight;

        bgCanvas.width = width * dpr;
        bgCanvas.height = height * dpr;
        bgCanvas.style.width = width + 'px';
        bgCanvas.style.height = height + 'px';

        fgCanvas.width = width * dpr;
        fgCanvas.height = height * dpr;
        fgCanvas.style.width = width + 'px';
        fgCanvas.style.height = height + 'px';

        bgCtx.scale(dpr, dpr);
        fgCtx.scale(dpr, dpr);

        generateProps();
        cloudBaseY = -50;
    }
    window.addEventListener('resize', resize);
    resize();
    
    const startTime = Date.now();
    let isRunning = true;
    let animationFrameId;
    let visualsFinished = false;

    // --- Configuration & State ---
    
    // Palettes for interpolation
    const SUNNY_PALETTE = {
        skyTop: '#4fa8ff',
        skyBottom: '#b8e1ff',
        sun: '#ffeb3b',
        waterDeep: '#005b96',
        waterMid: '#0077be',
        waterPeak: '#005b96',
        foam: '#005b96',
        sandLight: '#f1dcb1',
        sandDark: '#debe7c',
        rock: '#5d4037',
        leaf: '#4caf50',
        shell: '#fff0f5'
    };

    const STORM_PALETTE = {
        skyTop: '#000510',
        skyBottom: '#000815',
        sun: '#2a2a2a', // Dim/hidden
        waterDeep: '#050e2e', // Menacing deep dark blue
        waterMid: '#08183d',  // Dark navy
        waterPeak: '#102a5c', // Menacing storm blue
        foam: '#102a5c',      // Matches waterPeak (no visible foam)
        sandLight: '#2c2a20', // Dark wet sand
        sandDark: '#1a1810',
        rock: '#1a1a1a',
        leaf: '#1b2e1b',
        shell: '#3b3035'
    };

    // New State for "Crazy Stuff"
    let beaconsActive = false;
    let beacons = [];
    let beaconStartTime = 0;
    let finalFadeActive = false;
    let finalFadeStart = 0;
    let finalFadeDuration = 5000;
    let finalExplosionTriggered = false;
    let flashWhite = 0;

    const waves = [];
    const layerCount = 6;
    for (let i = 0; i < layerCount; i++) {
        waves.push({
            offset: Math.random() * 1000,
            speedBase: 0.001 + (i * 0.0005),
            amplitudeBase: 10 + (i * 5),
        });
    }

    const rainParticles = [];
    const maxRain = 400;

    // --- Helpers ---
    function lerp(start, end, t) {
        return start * (1 - t) + end * t;
    }

    // Hex to RGB helper for color interpolation
    function hexToRgb(hex) {
        const bigint = parseInt(hex.slice(1), 16);
        return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
    }

    function lerpColor(c1, c2, t) {
        const rgb1 = hexToRgb(c1);
        const rgb2 = hexToRgb(c2);
        const r = Math.round(lerp(rgb1.r, rgb2.r, t));
        const g = Math.round(lerp(rgb1.g, rgb2.g, t));
        const b = Math.round(lerp(rgb1.b, rgb2.b, t));
        return `rgb(${r},${g},${b})`;
    }

    function createBolt(x, y, height) {
        const segments = [];
        let currX = x;
        let currY = y;
        const segmentHeight = 20;
        while (currY < height) {
            const nextX = currX + (Math.random() - 0.5) * 60;
            const nextY = currY + segmentHeight + Math.random() * 30;
            segments.push({ x1: currX, y1: currY, x2: nextX, y2: nextY });
            currX = nextX;
            currY = nextY;
        }
        return segments;
    }

    function drawRoundedRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    }

    // --- Procedural Drawing Helpers ---
    function drawPalmTree(ctx, x, y, scale, palette) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);

        // Trunk
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(10, -40, -5, -80); 
        ctx.lineTo(5, -80);
        ctx.quadraticCurveTo(20, -40, 10, 0);
        ctx.fillStyle = palette.rock; // Use rock color (brown) for trunk
        ctx.fill();

        // Leaves
        ctx.translate(0, -80);
        ctx.fillStyle = palette.leaf;
        for(let i=0; i<7; i++) {
            ctx.save();
            ctx.rotate((i / 7) * Math.PI * 2 - Math.PI/2); // Spread around top
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(30, -10, 60, 0);
            ctx.quadraticCurveTo(30, 10, 0, 0);
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }

    function drawRock(ctx, x, y, scale, palette) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        
        ctx.fillStyle = palette.rock;
        ctx.beginPath();
        ctx.moveTo(-20, 0);
        ctx.bezierCurveTo(-20, -15, -10, -25, 0, -25);
        ctx.bezierCurveTo(10, -25, 20, -15, 20, 0);
        ctx.fill();

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(0, 0, 20, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    function drawShell(ctx, x, y, scale, palette) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);

        ctx.fillStyle = palette.shell;
        ctx.beginPath();
        ctx.arc(0, 0, 10, Math.PI, 0);
        ctx.lineTo(0,0);
        ctx.fill();
        
        ctx.strokeStyle = palette.sandDark;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for(let i=1; i<5; i++) {
            const angle = Math.PI + (i/5)*Math.PI;
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(angle)*10, Math.sin(angle)*10);
        }
        ctx.stroke();

        ctx.restore();
    }

    function drawDunes(ctx, width, height, sandY, palette) {
        // Base Background
        ctx.fillStyle = palette.sandDark;
        ctx.fillRect(-50, sandY, width + 100, height - sandY);

        // Dune 1 (Back)
        ctx.fillStyle = palette.sandDark;
        // Slightly lighter than base for contrast? 
        // Actually palette.sandDark is the darkest. palette.sandLight is lightest.
        // Let's interpolate manually or just use alpha.
        
        // Let's use semi-transparent light sand to create layers.
        
        ctx.save();
        
        // Layer 1
        ctx.fillStyle = palette.sandLight; 
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(-50, height + 100);
        ctx.lineTo(-50, sandY);
        ctx.bezierCurveTo(width*0.3, sandY - 20, width*0.7, sandY + 20, width + 50, sandY);
        ctx.lineTo(width + 50, height + 100);
        ctx.fill();

        // Layer 2 (Closer)
        ctx.globalAlpha = 0.6;
        const d2y = sandY + height * 0.05;
        ctx.beginPath();
        ctx.moveTo(-50, height + 100);
        ctx.lineTo(-50, d2y);
        ctx.bezierCurveTo(width*0.4, d2y + 40, width*0.6, d2y - 10, width + 50, d2y + 20);
        ctx.lineTo(width + 50, height + 100);
        ctx.fill();
        
        // Layer 3 (Closest)
        ctx.globalAlpha = 1.0;
        const d3y = sandY + height * 0.15;
        ctx.beginPath();
        ctx.moveTo(-50, height + 100);
        ctx.lineTo(-50, d3y);
        ctx.bezierCurveTo(width*0.2, d3y - 10, width*0.8, d3y + 30, width + 50, d3y + 10);
        ctx.lineTo(width + 50, height + 100);
        ctx.fill();

        // Speckles/Texture
        ctx.fillStyle = palette.sandDark;
        ctx.globalAlpha = 0.1;
        sandSpeckles.forEach(s => {
            ctx.fillRect(s.x, s.y, 2, 2);
        });

        ctx.restore();
    }

    function spawnBeacon(ctx, width, height, forceSize = null) {
        // Darker blue range: 225-245 (Pure Blue to Indigo, avoiding Cyan & Purple)
        const sizeMult = forceSize ? forceSize : 1;
        const isFinal = !!forceSize && forceSize > 5;
        
        // Sound for spawn
        // Safety: Explicitly block sound if explosion has triggered
        if (beaconsActive && !isFinal && !finalExplosionTriggered) {
             playAudio('sounds/tsu_beacon_spawn.ogg', { volume: 0.3 + Math.random() * 0.2 });
        }

        beacons.push({
            x: isFinal ? width / 2 : Math.random() * width,
            y: isFinal ? height / 2 : Math.random() * height,
            radius: 0,
            maxRadius: isFinal ? Math.max(width, height) * 1.5 : (100 + Math.random() * 400) * sizeMult,
            speed: isFinal ? 40 : (5 + Math.random() * 15) * sizeMult,
            opacity: 1,
            hue: 225 + Math.random() * 15, 
            life: 1.0
        });
    }

    function drawBeacons(ctx, width, height, intensity = 0.5, allowSpawn = true) {
        // Dynamic spawn chance based on intensity
        const chance = 0.1 + (intensity * 0.7);
        const spawnCount = Math.floor(1 + intensity * 4); 

        if (allowSpawn && !finalExplosionTriggered) {
            for(let k=0; k<spawnCount; k++) {
                if (beacons.length < 50 && Math.random() < chance) {
                    const sizeMult = 1 + intensity * 2;
                    spawnBeacon(ctx, width, height, sizeMult);
                }
            }
        }

        ctx.save();
        ctx.globalCompositeOperation = 'lighter'; // Additive blending

        for (let i = beacons.length - 1; i >= 0; i--) {
            const b = beacons[i];
            b.radius += b.speed;
            b.opacity -= 0.015; // Slightly faster fade
            b.life -= 0.015;

            if (b.opacity <= 0 || b.radius > b.maxRadius) {
                beacons.splice(i, 1);
                continue;
            }

            const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.radius);
            // Deep Blue gradients
            const alpha = b.opacity;
            // 80% lightness in center (was 90%)
            grad.addColorStop(0, `hsla(${b.hue}, 100%, 80%, ${alpha})`); 
            // 40% lightness mid (Deep Blue)
            grad.addColorStop(0.3, `hsla(${b.hue}, 100%, 40%, ${alpha * 0.9})`); 
            // 15% lightness outer (Very Dark Blue)
            grad.addColorStop(0.7, `hsla(${b.hue}, 100%, 15%, ${alpha * 0.6})`); 
            grad.addColorStop(1, `hsla(${b.hue}, 100%, 5%, 0)`);

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    // --- Render Loop ---
    function loop() {
        if (!isRunning) return;

        const now = Date.now();
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / durationMs, 1.0);

        if (progress >= 1.0 && !visualsFinished) {
            visualsFinished = true;
            
            // Fix: Stop storm audio when visuals finish, to handle desync from tab switching
            if (ambienceAudio) ambienceAudio.stop();
            if (rumbleAudio) rumbleAudio.stop();

            if (onComplete) onComplete();
            // Do not return; keep looping to allow beacons etc.
        }

        // Timeline Constants (ms)
        const FADE_IN_END = 5000;
        const STORM_START = 6000;
        const STRIKE_TIME = 50000;
        const FADE_OUT_START = 50000;
        const FADE_OUT_DURATION = 5000;
        const IMPACT_START = 40000;

        // 1. Storm Factor (0 to 1)
        // 0s - 7.5s: 0
        // 7.5s - 55s: Ramp 0 -> 1
        let stormFactor = 0;
        if (elapsed < STORM_START) {
            stormFactor = 0;
        } else if (elapsed < STRIKE_TIME) {
            stormFactor = (elapsed - STORM_START) / (STRIKE_TIME - STORM_START);
        } else {
            stormFactor = 1;
        }

        // Audio: Rumble (Impact)
        let impactFactor = 0;
        if (elapsed > IMPACT_START) {
            impactFactor = Math.max(0, (elapsed - IMPACT_START) / (STRIKE_TIME - IMPACT_START));
        }
        // Clamp impact factor to 1 until fade out completes, though elapsed > STRIKE_TIME covers it.
        if (elapsed > STRIKE_TIME) impactFactor = 1;

        if (impactFactor > 0.1 && !rumbleAudio) {
            rumbleAudio = playAudio('sounds/tsu_rumble.ogg', { volume: 0.8 });
        }

        // Interpolate Palette
        const currentPalette = {
            skyTop: lerpColor(SUNNY_PALETTE.skyTop, STORM_PALETTE.skyTop, stormFactor),
            skyBottom: lerpColor(SUNNY_PALETTE.skyBottom, STORM_PALETTE.skyBottom, stormFactor),
            sun: lerpColor(SUNNY_PALETTE.sun, STORM_PALETTE.sun, stormFactor),
            waterDeep: lerpColor(SUNNY_PALETTE.waterDeep, STORM_PALETTE.waterDeep, stormFactor),
            waterMid: lerpColor(SUNNY_PALETTE.waterMid, STORM_PALETTE.waterMid, stormFactor),
            waterPeak: lerpColor(SUNNY_PALETTE.waterPeak, STORM_PALETTE.waterPeak, stormFactor),
            foam: lerpColor(SUNNY_PALETTE.foam, STORM_PALETTE.foam, stormFactor),
            sandLight: lerpColor(SUNNY_PALETTE.sandLight, STORM_PALETTE.sandLight, stormFactor),
            sandDark: lerpColor(SUNNY_PALETTE.sandDark, STORM_PALETTE.sandDark, stormFactor),
            rock: lerpColor(SUNNY_PALETTE.rock, STORM_PALETTE.rock, stormFactor),
            leaf: lerpColor(SUNNY_PALETTE.leaf, STORM_PALETTE.leaf, stormFactor),
            shell: lerpColor(SUNNY_PALETTE.shell, STORM_PALETTE.shell, stormFactor)
        };

        // Screen Shake
        let shakeX = 0;
        let shakeY = 0;
        if (stormFactor > 0.5 || finalExplosionTriggered) {
            let shakeMag = (stormFactor - 0.5) * 2 * 5 + (impactFactor * 25);
            
            // Extra chaos during explosion (flashWhite is counting down from 60)
            if (flashWhite > 0) {
                 shakeMag += 50; 
            }
            
            shakeX = (Math.random() - 0.5) * shakeMag;
            shakeY = (Math.random() - 0.5) * shakeMag;
        }

        // Clear FG
        fgCtx.clearRect(0, 0, width, height);

        bgCtx.save();
        bgCtx.translate(shakeX, shakeY);
        
        fgCtx.save();
        fgCtx.translate(shakeX, shakeY);

        // 1. Draw Sky (BG)
        const grad = bgCtx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, currentPalette.skyTop);
        grad.addColorStop(1, currentPalette.skyBottom);
        bgCtx.fillStyle = grad;
        bgCtx.fillRect(-50, -50, width + 100, height + 100);

        // 2. Draw Sun (BG)
        if (stormFactor < 1.0) {
            const sunY = height * 0.15 + (stormFactor * 50); // Sun sets slightly
            bgCtx.beginPath();
            bgCtx.arc(width * 0.7, sunY, 40, 0, Math.PI * 2);
            bgCtx.fillStyle = currentPalette.sun;
            bgCtx.globalAlpha = 1 - stormFactor; // Fade out
            bgCtx.shadowColor = currentPalette.sun;
            bgCtx.shadowBlur = 20;
            bgCtx.fill();
            bgCtx.globalAlpha = 1.0;
            bgCtx.shadowBlur = 0;
        }



        // 3. Draw Merchant (BG)
        const sandY = height * 0.65; // Starts at 65% down

        if (merchantLoaded && stormFactor < 1) { 
            bgCtx.save();
            // Position: Right side, lower down
            const merchScale = Math.min(width, height) * 0.0005; 
            const merchW = 300 * merchScale;
            const merchH = 300 * merchScale; 
            // Position him to peek from behind the sand
            const merchX = width * 0.80; 
            
            // Anchor to sand line so he doesn't float on mobile
            // Bottom of sprite is at (merchY + merchH/2).
            // We want bottom to be slightly below sandY (overlap).
            const overlap = merchH * 0.15; 
            const merchY = sandY - (merchH / 2) + overlap;

            bgCtx.translate(merchX, merchY);
            bgCtx.rotate(0.1); // Slight slant
            bgCtx.drawImage(merchantImg, -merchW/2, -merchH/2, merchW, merchH);
            bgCtx.restore();
        }

        // 4. Draw Sand & Props (BG)
        // Draw Dunes
        drawDunes(bgCtx, width, height, sandY, currentPalette);

        // Draw Props
        // Only draw props if they are not underwater?
        // Actually, the tsunami covers everything eventually.
        // The water drawing logic (step 7 and 8) is on fgCanvas (foreground).
        // Props are on bgCanvas.
        // So they will be naturally covered by the water drawn on fgCanvas.
        
        props.forEach(prop => {
            if (prop.type === 'tree') drawPalmTree(bgCtx, prop.x, prop.y, prop.scale, currentPalette);
            else if (prop.type === 'rock') drawRock(bgCtx, prop.x, prop.y, prop.scale, currentPalette);
            else if (prop.type === 'shell') drawShell(bgCtx, prop.x, prop.y, prop.scale, currentPalette);
        });

        // 5. Draw Cliffs - REMOVED

        // 6. Lightning Logic (FG) - REMOVED

        // 6.5. Rain (FG) - Moved here to be behind water
        if (stormFactor > 0.3) {
            const rainIntensity = (stormFactor - 0.3) / 0.7;
            const rainCount = Math.floor(maxRain * rainIntensity);
            
            fgCtx.strokeStyle = `rgba(120, 180, 255, ${0.1 + rainIntensity * 0.3})`;
            fgCtx.lineWidth = 1 + rainIntensity;
            fgCtx.beginPath();

            // Add particles
            if (rainParticles.length < rainCount) {
                for(let i=0; i<10; i++) {
                    rainParticles.push({
                        x: Math.random() * width * 1.5, // Wide spawn for angle
                        y: cloudBaseY,
                        speed: 20 + Math.random() * 20,
                        len: 10 + Math.random() * 20
                    });
                }
            }

            const wind = 10 + rainIntensity * 20;

            for (let i = 0; i < rainParticles.length; i++) {
                const p = rainParticles[i];
                p.y += p.speed;
                p.x -= wind;

                fgCtx.moveTo(p.x, p.y);
                fgCtx.lineTo(p.x - wind * 0.5, p.y + p.len);

                if (p.y > height || p.x < -100) {
                    if (i < rainCount) {
                        p.x = Math.random() * width * 1.5;
                        p.y = cloudBaseY;
                    } else {
                        rainParticles.splice(i, 1);
                        i--;
                    }
                }
            }
            fgCtx.stroke();
        }

        // 7. Distant Tsunami Wall (FG)
        // Start showing wall when storm is roughly 30% active (around 22s mark)
        const WALL_START_FACTOR = 0.3; 
        if (stormFactor > WALL_START_FACTOR) {
            const wallProgress = (stormFactor - WALL_START_FACTOR) / (1 - WALL_START_FACTOR); // 0 to 1
            const wallHeight = lerp(0, height * 1.5, wallProgress * wallProgress); // Accelerate
            
            fgCtx.fillStyle = currentPalette.waterDeep;
            fgCtx.beginPath();
            
            fgCtx.moveTo(-50, height + 100);
            fgCtx.lineTo(-50, height - wallHeight * 0.3); // Left side lower
            
            // Bezier for the wave crest
            fgCtx.bezierCurveTo(
                width * 0.3, height - wallHeight * 0.4, 
                width * 0.6, height - wallHeight * 1.2, // The crest peak
                width + 50, height - wallHeight * 0.8
            );
            
            fgCtx.lineTo(width + 50, height + 100);
            fgCtx.fill();
        }

        // 8. Normal Ocean Waves (FG)
        const tideRise = lerp(0, height * 0.5, stormFactor); 
        const impactRise = lerp(0, height * 1.5, impactFactor * impactFactor);
        
        // Start water lower to show sand (0.85)
        const baseWaterY = height * 0.85 - tideRise - impactRise;

        waves.forEach((wave, index) => {
            // Mix colors based on layer
            let baseColor;
            if (index === layerCount - 1) baseColor = currentPalette.waterPeak;
            else if (index % 2 === 0) baseColor = currentPalette.waterDeep;
            else baseColor = currentPalette.waterMid;

            fgCtx.fillStyle = baseColor;
            fgCtx.beginPath();

            // Turbulence
            const waveAmp = wave.amplitudeBase * (1 + stormFactor * 2 + impactFactor * 5);
            const waveFreq = 0.003 + (stormFactor * 0.005);
            const speed = wave.speedBase * (1 + stormFactor * 5 + impactFactor * 10);
            
            const timeOffset = elapsed * speed + wave.offset;
            const yOffset = index * 15 * (1 - impactFactor); // Compress layers on impact

            const layerY = baseWaterY + yOffset;

            fgCtx.moveTo(-50, height + 100);
            fgCtx.lineTo(-50, layerY);

            for (let x = -50; x <= width + 50; x += 15) {
                const y = layerY + 
                          Math.sin(x * waveFreq + timeOffset) * waveAmp + 
                          Math.cos(x * waveFreq * 2.3 + timeOffset) * (waveAmp * 0.5);
                fgCtx.lineTo(x, y);
            }

            fgCtx.lineTo(width + 50, height + 100);
            fgCtx.fill();

            // Foam on top layer or high storm factor
            if (index === layerCount - 1 || (stormFactor > 0.6 && index > layerCount - 3)) {
                // fgCtx.fillStyle = `rgba(255, 255, 255, ${0.1 + stormFactor * 0.3})`;
                // Use palette foam color instead of hardcoded white
                fgCtx.save();
                fgCtx.globalAlpha = 0.1 + stormFactor * 0.3;
                fgCtx.fillStyle = currentPalette.foam;

                // Simple foam pass
                fgCtx.beginPath();
                for (let x = -50; x <= width + 50; x += 10) {
                    let y = layerY + 
                          Math.sin(x * waveFreq + timeOffset) * waveAmp + 
                          Math.cos(x * waveFreq * 2.3 + timeOffset) * (waveAmp * 0.5);
                    if (Math.random() > 0.5) y -= 5; // Spray
                    if(x===-50) fgCtx.moveTo(x,y); else fgCtx.lineTo(x, y);
                }
                fgCtx.lineTo(width + 50, height + 100);
                fgCtx.lineTo(-50, height + 100);
                fgCtx.fill();
                fgCtx.restore();
            }
        });

        // 10. Intro Fade In (FG)
        if (elapsed < FADE_IN_END) {
            let opacity = 1;
            if (elapsed > 1000) {
                opacity = 1 - ((elapsed - 1000) / (FADE_IN_END - 1000));
            }
            fgCtx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
            fgCtx.fillRect(-50, -50, width + 100, height + 100);
        }

        // 11. Initial Storm Fade Out (FG) - Time Based
        if (elapsed > FADE_OUT_START) {
            const fade = Math.min(1, (elapsed - FADE_OUT_START) / FADE_OUT_DURATION);
            fgCtx.fillStyle = `rgba(0, 0, 0, ${fade})`;
            fgCtx.fillRect(-50, -50, width + 100, height + 100);
        }

        // 12. Solar Beacons (Crazy Stuff) - Triggered Manually, On Top of Black
        if (beaconsActive) {
            const beaconElapsed = now - beaconStartTime;
            
            // 15 seconds total duration.
            // Requirement: Explosion much later (closer to fade out).
            // Let's aim for 12.0s (total sequence is ~15s).
            
            const EXPLOSION_TIME = 12000;
            
            let intensity = 0;
            let allowSpawn = true;
            
            // Ramp up 0 -> 1 over 12.0s
            if (beaconElapsed < EXPLOSION_TIME) {
                intensity = beaconElapsed / EXPLOSION_TIME;
            } else {
                intensity = 1.0;
                // Final explosion check
                if (!finalExplosionTriggered) {
                    finalExplosionTriggered = true;
                    // Spawn huge explosion center screen
                    spawnBeacon(fgCtx, width, height, 25.0); // Larger visual impact
                    flashWhite = 60; // Extended flash frames (approx 1 sec at 60fps)
                    
                    if (!explosionAudioTriggered) {
                        explosionAudioTriggered = true;
                        playAudio('sounds/tsu_explosion.ogg', { volume: 1.0 });
                        
                        // Stop hum/charge
                        if (humAudio) humAudio.stop();
                    }
                }
            }
            
            // Stop regular spawning when final fade starts
            if (finalFadeActive) {
                allowSpawn = false;
            }
            
            drawBeacons(fgCtx, width, height, intensity, allowSpawn);
        }

        // 13. Final Blackout Fade Out (FG) - Manual Trigger
        if (finalFadeActive) {
            const fadeElapsed = now - finalFadeStart;
            const fade = Math.min(1, fadeElapsed / finalFadeDuration);
            fgCtx.fillStyle = `rgba(0, 0, 0, ${fade})`;
            fgCtx.fillRect(-50, -50, width + 100, height + 100);
        }

        // 14. Flash White (Boom)
        if (flashWhite > 0) {
            // Smooth fade out: 60 frames max. 
            // Normalized 0 to 1.
            const t = flashWhite / 60; 
            // Ease out cubic (starts fast, slows down) or simple linear?
            // User requested "fades out smoothly". 
            // Linear opacity: t. 
            // Let's use a curve to keep it bright longer then fade.
            const alpha = t * t; 
            
            fgCtx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            fgCtx.fillRect(-50, -50, width + 100, height + 100);
            flashWhite--;
        }

        bgCtx.restore();
        fgCtx.restore();

        animationFrameId = requestAnimationFrame(loop);
    }

    function cleanup() {
        isRunning = false;
        container.style.cursor = '';
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        window.removeEventListener('resize', resize);
        if (bgCanvas.parentNode) bgCanvas.parentNode.removeChild(bgCanvas);
        if (fgCanvas.parentNode) fgCanvas.parentNode.removeChild(fgCanvas);
        if (uiContainer.parentNode) uiContainer.parentNode.removeChild(uiContainer);
        
        // Stop Audio
        if (ambienceAudio) ambienceAudio.stop();
        if (rumbleAudio) rumbleAudio.stop();
        if (humAudio) humAudio.stop();
    }

    function triggerBeacons() {
        beaconsActive = true;
        beaconStartTime = Date.now();
        finalExplosionTriggered = false;
        flashWhite = 0;
        
        // Audio: Hum Loop
        if (!humAudio) {
            humAudio = playAudio('sounds/tsu_beacon_hum.ogg', { loop: true, volume: 0.6 });
        }
    }

    function triggerFinalFade() {
        finalFadeActive = true;
        finalFadeStart = Date.now();
        // Ensure hum stops if it hasn't already
        if (humAudio) humAudio.stop();
    }

    function showCursor() {
        container.style.cursor = '';
    }

    function hideCursor() {
        container.style.cursor = 'none';
    }

    function stopHumLoop() {
        if (humAudio) {
            humAudio.stop();
            humAudio = null;
        }
    }

    loop();
    
    // Return controls
    return {
        cleanup,
        triggerBeacons,
        triggerFinalFade,
        showCursor,
        hideCursor,
        stopHumLoop
    };
}
