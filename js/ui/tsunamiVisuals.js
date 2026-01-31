
/**
 * Tsunami Visual Sequence
 * 
 * A 15-second narrative animation:
 * 1. Calm Sunny Cove (Sand + Cliffs visible)
 * 2. Darkening Sky & Rising Tide
 * 3. The Roaring Approach (Flooding the Cove)
 * 4. Impact & Chaos
 */

export function playTsunamiSequence(container, durationMs = 15000, onComplete, options = {}) {
    const canvas = document.createElement('canvas');
    canvas.id = 'tsunami-canvas';
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '2147483645'; // Ensure top z-index
    container.appendChild(canvas);

    // --- Overlay UI (XP/MP) ---
    const uiContainer = document.createElement('div');
    uiContainer.id = 'tsunami-ui-container';
    uiContainer.style.position = 'absolute';
    uiContainer.style.inset = '0';
    uiContainer.style.zIndex = '2147483646'; // Above canvas
    uiContainer.style.pointerEvents = 'none';
    uiContainer.style.color = '#fff';
    uiContainer.style.textShadow = '0 1px 2px rgba(0,0,0,0.8)';

    // Helper to style wrappers
    function styleWrapper(wrapper, type) {
        wrapper.style.position = 'absolute';
        wrapper.style.left = '5%'; 
        
        // Perspective transform to make them look like they are lying on the sand
        // Vary rotation slightly for MP to avoid perfect parallelism (chaos)
        let rotationZ = -3;
        if (type === 'mp') rotationZ = -6;

        wrapper.style.transform = `perspective(600px) rotateX(25deg) rotateZ(${rotationZ}deg)`;
        wrapper.style.transformOrigin = 'left center';
        
        // Sand is approx 65% to 85%
        if (type === 'coin') {
            wrapper.style.top = '66%';
        } else if (type === 'xp') {
            wrapper.style.top = '72%';
        } else if (type === 'mp') {
            wrapper.style.top = '78%';
        }
        
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

    // --- Assets ---
    const merchantImg = new Image();
    merchantImg.src = 'img/misc/merchant.webp';
    let merchantLoaded = false;
    merchantImg.onload = () => { 
        console.log('Tsunami: Merchant loaded');
        merchantLoaded = true; 
    };
    merchantImg.onerror = (e) => {
        console.error('Tsunami: Merchant load failed', e);
    };

    // Handle resizing
    let width, height;
    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
    }
    window.addEventListener('resize', resize);
    resize();

    const ctx = canvas.getContext('2d', { alpha: false });
    const startTime = Date.now();
    let isRunning = true;
    let animationFrameId;

    // --- Configuration & State ---
    
    // Palettes for interpolation
    const SUNNY_PALETTE = {
        skyTop: '#4fa8ff',
        skyBottom: '#b8e1ff',
        sun: '#ffeb3b',
        waterDeep: '#005b96',
        waterMid: '#0077be',
        waterPeak: '#2a9df4',
        foam: '#e0f7fa',
        sandLight: '#f1dcb1',
        sandDark: '#debe7c',
        rock: '#5d4037'
    };

    const STORM_PALETTE = {
        skyTop: '#020205',
        skyBottom: '#0a0f1a',
        sun: '#2a2a2a', // Dim/hidden
        waterDeep: '#04060a',
        waterMid: '#0b1624',
        waterPeak: '#182b42',
        foam: '#4a6fa5',
        sandLight: '#2c2a20', // Dark wet sand
        sandDark: '#1a1810',
        rock: '#1a1a1a'
    };

    const lightningState = {
        active: false,
        flashOpacity: 0,
        bolts: [],
        nextFlashTime: 0
    };

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

    // --- Render Loop ---
    function loop() {
        if (!isRunning) return;

        const now = Date.now();
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / durationMs, 1.0);

        if (progress >= 1.0) {
            cleanup();
            if (onComplete) onComplete();
            return;
        }

        // Timeline Phases
        // 0.0 - 0.2: Sunny, Calm
        // 0.2 - 0.5: Transition (Darkening, Tides Rise slightly)
        // 0.5 - 0.8: Storm, Tsunami Wall Visible, Rain, Shake
        // 0.8 - 1.0: Impact, Chaos, Blackout

        // Determine "Storm Factor" (0 = sunny, 1 = full apocalypse)
        let stormFactor = 0;
        if (progress < 0.2) stormFactor = 0;
        else if (progress < 0.5) stormFactor = (progress - 0.2) / 0.3; // 0 to 1
        else stormFactor = 1;

        // Determine "Impact Factor" (0 = normal view, 1 = underwater/blackout)
        let impactFactor = 0;
        if (progress > 0.75) impactFactor = (progress - 0.75) / 0.25;

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
        };

        // Screen Shake
        let shakeX = 0;
        let shakeY = 0;
        if (stormFactor > 0.5) {
            const shakeMag = (stormFactor - 0.5) * 2 * 5 + (impactFactor * 25);
            shakeX = (Math.random() - 0.5) * shakeMag;
            shakeY = (Math.random() - 0.5) * shakeMag;
        }

        ctx.save();
        ctx.translate(shakeX, shakeY);

        // 1. Draw Sky
        if (lightningState.flashOpacity > 0) {
            ctx.fillStyle = `rgba(255, 255, 255, ${lightningState.flashOpacity * 0.9})`;
            ctx.fillRect(-20, -20, width + 40, height + 40);
            lightningState.flashOpacity -= 0.1;
        } else {
            const grad = ctx.createLinearGradient(0, 0, 0, height);
            grad.addColorStop(0, currentPalette.skyTop);
            grad.addColorStop(1, currentPalette.skyBottom);
            ctx.fillStyle = grad;
            ctx.fillRect(-20, -20, width + 40, height + 40);
        }

        // 2. Draw Sun (fades out as stormFactor increases)
        if (stormFactor < 1.0) {
            const sunY = height * 0.15 + (stormFactor * 50); // Sun sets slightly
            ctx.beginPath();
            ctx.arc(width * 0.7, sunY, 40, 0, Math.PI * 2);
            ctx.fillStyle = currentPalette.sun;
            ctx.globalAlpha = 1 - stormFactor; // Fade out
            ctx.shadowColor = currentPalette.sun;
            ctx.shadowBlur = 20;
            ctx.fill();
            ctx.globalAlpha = 1.0;
            ctx.shadowBlur = 0;
        }

        // 3. Draw Merchant (Behind Sand)
        if (merchantLoaded && stormFactor < 1) { 
            ctx.save();
            // Position: Right side, lower down
            const merchScale = Math.min(width, height) * 0.0005; 
            const merchW = 300 * merchScale;
            const merchH = 300 * merchScale; 
            // Position him to peek from behind the sand
            const merchX = width * 0.80; 
            const merchY = height * 0.60; 

            ctx.translate(merchX, merchY);
            ctx.rotate(0.1); // Slight slant
            ctx.drawImage(merchantImg, -merchW/2, -merchH/2, merchW, merchH);
            ctx.restore();
        }

        // 4. Draw Sand (The Cove)
        // Fixed at bottom, gets covered by water later
        const sandY = height * 0.65; // Starts at 65% down
        const sandGrad = ctx.createLinearGradient(0, sandY, 0, height);
        sandGrad.addColorStop(0, currentPalette.sandLight);
        sandGrad.addColorStop(1, currentPalette.sandDark);
        ctx.fillStyle = sandGrad;
        ctx.fillRect(0, sandY, width, height - sandY);

        // 5. Draw Cliffs (Foreground - Framing)
        ctx.fillStyle = currentPalette.rock;
        ctx.beginPath();
        // Left Cliff
        ctx.moveTo(0, height);
        ctx.lineTo(0, height * 0.4);
        ctx.bezierCurveTo(width * 0.1, height * 0.45, width * 0.15, height * 0.6, width * 0.2, height);
        ctx.fill();

        // Right Cliff (Covers Merchant Feet)
        ctx.beginPath();
        ctx.moveTo(width, height);
        ctx.lineTo(width, height * 0.45);
        ctx.bezierCurveTo(width * 0.9, height * 0.5, width * 0.85, height * 0.65, width * 0.8, height);
        ctx.fill();

        // 6. Lightning Logic (Only when stormFactor > 0.8 or Impact)
        if (stormFactor > 0.8 && now > lightningState.nextFlashTime) {
            lightningState.active = true;
            lightningState.flashOpacity = 0.3 + Math.random() * 0.5;
            lightningState.bolts = [];
            if (Math.random() > 0.2) {
                lightningState.bolts.push(createBolt(Math.random() * width, 0, height * 0.5));
            }
            // Rapid fire near end
            const delayBase = lerp(2000, 100, impactFactor);
            lightningState.nextFlashTime = now + delayBase + Math.random() * delayBase;
        }

        if (lightningState.flashOpacity > 0.05 && lightningState.bolts.length > 0) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2 + Math.random() * 2;
            ctx.beginPath();
            lightningState.bolts.forEach(bolt => {
                bolt.forEach(seg => {
                    ctx.moveTo(seg.x1, seg.y1);
                    ctx.lineTo(seg.x2, seg.y2);
                });
            });
            ctx.stroke();
        }

        // 7. Distant Tsunami Wall
        // Becomes visible in Phase 3 (progress > 0.5)
        if (progress > 0.4) {
            const wallProgress = (progress - 0.4) / 0.6; // 0 to 1
            const wallHeight = lerp(0, height * 1.5, wallProgress * wallProgress); // Accelerate
            
            ctx.fillStyle = currentPalette.waterDeep;
            ctx.beginPath();
            // A menacing curve
            
            ctx.moveTo(0, height);
            ctx.lineTo(0, height - wallHeight * 0.3); // Left side lower
            
            // Bezier for the wave crest
            ctx.bezierCurveTo(
                width * 0.3, height - wallHeight * 0.4, 
                width * 0.6, height - wallHeight * 1.2, // The crest peak
                width, height - wallHeight * 0.8
            );
            
            ctx.lineTo(width, height);
            ctx.fill();
        }

        // 8. Normal Ocean Waves (Foreground)
        // They rise slowly in Phase 2, then chaotically in Phase 3/4
        const tideRise = lerp(0, height * 0.5, stormFactor); // Base tide rise
        const impactRise = lerp(0, height * 1.5, impactFactor * impactFactor); // Explosion rise
        
        // Start water lower to show sand (0.85)
        const baseWaterY = height * 0.85 - tideRise - impactRise;

        waves.forEach((wave, index) => {
            // Mix colors based on layer
            let baseColor;
            if (index === layerCount - 1) baseColor = currentPalette.waterPeak;
            else if (index % 2 === 0) baseColor = currentPalette.waterDeep;
            else baseColor = currentPalette.waterMid;

            ctx.fillStyle = baseColor;
            ctx.beginPath();

            // Turbulence
            const waveAmp = wave.amplitudeBase * (1 + stormFactor * 2 + impactFactor * 5);
            const waveFreq = 0.003 + (stormFactor * 0.005);
            const speed = wave.speedBase * (1 + stormFactor * 5 + impactFactor * 10);
            
            const timeOffset = elapsed * speed + wave.offset;
            const yOffset = index * 15 * (1 - impactFactor); // Compress layers on impact

            const layerY = baseWaterY + yOffset;

            ctx.moveTo(0, height);
            ctx.lineTo(0, layerY);

            for (let x = 0; x <= width; x += 15) {
                const y = layerY + 
                          Math.sin(x * waveFreq + timeOffset) * waveAmp + 
                          Math.cos(x * waveFreq * 2.3 + timeOffset) * (waveAmp * 0.5);
                ctx.lineTo(x, y);
            }

            ctx.lineTo(width, height);
            ctx.fill();

            // Foam on top layer or high storm factor
            if (index === layerCount - 1 || (stormFactor > 0.6 && index > layerCount - 3)) {
                ctx.fillStyle = `rgba(255, 255, 255, ${0.1 + stormFactor * 0.3})`;
                // Simple foam pass
                ctx.beginPath();
                for (let x = 0; x <= width; x += 10) {
                    let y = layerY + 
                          Math.sin(x * waveFreq + timeOffset) * waveAmp + 
                          Math.cos(x * waveFreq * 2.3 + timeOffset) * (waveAmp * 0.5);
                    if (Math.random() > 0.5) y -= 5; // Spray
                    if(x===0) ctx.moveTo(x,y); else ctx.lineTo(x, y);
                }
                ctx.lineTo(width, height);
                ctx.lineTo(0, height);
                ctx.fill();
            }
        });

        // 9. Rain
        if (stormFactor > 0.3) {
            const rainIntensity = (stormFactor - 0.3) / 0.7;
            const rainCount = Math.floor(maxRain * rainIntensity);
            
            ctx.strokeStyle = `rgba(200, 220, 255, ${0.1 + rainIntensity * 0.3})`;
            ctx.lineWidth = 1 + rainIntensity;
            ctx.beginPath();

            // Add particles
            if (rainParticles.length < rainCount) {
                for(let i=0; i<10; i++) {
                    rainParticles.push({
                        x: Math.random() * width * 1.5, // Wide spawn for angle
                        y: -100,
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

                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - wind * 0.5, p.y + p.len);

                if (p.y > height || p.x < -100) {
                    if (i < rainCount) {
                        p.x = Math.random() * width * 1.5;
                        p.y = -50;
                    } else {
                        rainParticles.splice(i, 1);
                        i--;
                    }
                }
            }
            ctx.stroke();
        }

        ctx.restore();

        // 10. Final Blackout Fade
        if (progress > 0.9) {
            const fade = (progress - 0.9) / 0.1;
            ctx.fillStyle = `rgba(0, 0, 0, ${fade})`;
            ctx.fillRect(0, 0, width, height);
        }

        animationFrameId = requestAnimationFrame(loop);
    }

    function cleanup() {
        isRunning = false;
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        window.removeEventListener('resize', resize);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        if (uiContainer.parentNode) uiContainer.parentNode.removeChild(uiContainer);
    }

    loop();
    return cleanup;
}