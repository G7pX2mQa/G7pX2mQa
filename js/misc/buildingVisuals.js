import { RESOURCE_REGISTRY } from '../game/offlinePanel.js';
import { levelBigNumToNumber } from '../game/upgrades.js';
import { playAudio } from '../util/audioManager.js';

let activeCanvas = null;
let activeCtx = null;
let animationFrameId = null;
let currentBuildingId = null;
let lastTime = 0;
let time = 0;

let currentLevelNum = 0;
let levelUpAnimTime = 0;
let tierUpAnimTime = 0;
let previousTier = 0;

const TIERS = [10, 25, 50, 100, 200, 400, 800, 1000];

const imageCache = {};
let stonePattern = null;
function getMaterialImage(matKey) {
  if (imageCache[matKey]) return imageCache[matKey];
  const config = RESOURCE_REGISTRY.find(r => r.key === matKey);
  if (config && config.icon) {
    const img = new Image();
    img.src = config.icon;
    imageCache[matKey] = img;
    return img;
  }
  return null;
}

function initStonePattern(ctx) {
    if (stonePattern) return;
    
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = 64;
    patternCanvas.height = 64;
    const pCtx = patternCanvas.getContext('2d');
    
    // Base color darker to match user feedback and image analysis (#83817c)
    pCtx.fillStyle = '#83817c';
    pCtx.fillRect(0, 0, 64, 64);
    
    const imgData = pCtx.getImageData(0, 0, 64, 64);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
        // Range based on std_dev of ~18
        const noise = (Math.random() - 0.5) * 36;
        data[i] = Math.max(0, Math.min(255, data[i] + noise));
        data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise));
        data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise));
    }
    pCtx.putImageData(imgData, 0, 0);
    
    const targetCtx = activeCtx || ctx;
    if (targetCtx) {
        try {
            stonePattern = targetCtx.createPattern(patternCanvas, 'repeat');
        } catch (e) {
            console.error("Failed to create stone pattern", e);
        }
    }
}

export function startCanvasLoop(id, canvasEl) {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    window.currentCavernLayout = null;
    activeCanvas = canvasEl;
    activeCtx = canvasEl.getContext('2d');
    currentBuildingId = id;
    lastTime = performance.now();
    
    initStonePattern(activeCtx);

    const resizeObserver = new ResizeObserver(() => {
        if (!activeCanvas) return;
        const rect = activeCanvas.parentElement.getBoundingClientRect();
        activeCanvas.width = rect.width;
        activeCanvas.height = rect.height;
    });
    resizeObserver.observe(activeCanvas.parentElement);
    
    const rect = activeCanvas.parentElement.getBoundingClientRect();
    activeCanvas.width = rect.width;
    activeCanvas.height = rect.height;
    
    // Using import for ES modules instead of require for local scope
    import('../ui/minerTabs/buildingsTab.js').then(module => {
        try {
            currentLevelNum = levelBigNumToNumber(module.getBuildingLevel(id));
            let currentTier = getTier();
            previousTier = currentTier;
            tierUpAnimTime = 0;
        } catch {
            currentLevelNum = 1;
        }
    }).catch(() => { currentLevelNum = 1; });
    
    loop(performance.now());
}

export function stopCanvasLoop() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    activeCanvas = null;
    activeCtx = null;
    currentBuildingId = null;
    tierUpAnimTime = 0;
}

export function triggerLevelUpAnimation() {
    levelUpAnimTime = 1.0;
}

export function checkTierUp(id, oldLevelBn, newLevelBn) {
    if (id !== currentBuildingId) return;

    const oldNum = levelBigNumToNumber(oldLevelBn);
    const newNum = levelBigNumToNumber(newLevelBn);
    currentLevelNum = newNum;
    
    let oldTier = 0;
    let newTier = 0;
    
    for (let i = 0; i < TIERS.length; i++) {
        if (oldNum >= TIERS[i]) oldTier = i + 1;
        if (newNum >= TIERS[i]) newTier = i + 1;
    }
    
    if (newTier < oldTier) {
        previousTier = newTier;
        tierUpAnimTime = 0;
    } else if (newTier > oldTier) {
        previousTier = oldTier;
        if (newTier >= 1) {
            tierUpAnimTime = 6.0; 
            playAudio('sounds/building_tier_up.ogg');
        }
    }
}

function loop(currentTime) {
    if (!activeCanvas) return;
    const dt = (currentTime - lastTime) / 1000;
    lastTime = currentTime;
    time += dt;
    
    if (levelUpAnimTime > 0) levelUpAnimTime -= dt;
    if (tierUpAnimTime > 0) tierUpAnimTime -= dt;
    
    if (activeCanvas && activeCtx) {
        draw(activeCtx, activeCanvas.width, activeCanvas.height, time);
    }
    
    animationFrameId = requestAnimationFrame(loop);
}

function getTier() {
    let t = 0;
    for (let i = 0; i < TIERS.length; i++) {
        if (currentLevelNum >= TIERS[i]) t = i + 1;
    }
    return t; // 0 to 9
}

function draw(ctx, width, height, t) {
    ctx.clearRect(0, 0, width, height);
    
    ctx.save();
    let shakeAlpha = 0;
    if (tierUpAnimTime > 0) {
        shakeAlpha = tierUpAnimTime > 2.5 ? (6.0 - tierUpAnimTime) / 3.5 : tierUpAnimTime / 2.5;
        const shake = Math.sin(t * 50) * (shakeAlpha * 10);
        const shakeY = Math.cos(t * 40) * (shakeAlpha * 5);
        ctx.translate(shake, shakeY);
    }
    
    drawCavern(ctx, width, height, t);
    
    if (currentBuildingId) {
        let currentTier = getTier();
        let drawTier = currentTier;
        let animProgress = 1.0;
        if (tierUpAnimTime > 0) {
            // Reaches 1.0 at 3.5 seconds into the 6.0 second animation (when tierUpAnimTime is 2.5)
            animProgress = tierUpAnimTime > 2.5 ? 1.0 - ((tierUpAnimTime - 2.5) / 3.5) : 1.0;
            drawTier = currentTier;
        }
        drawBuilding(ctx, width, height, t, currentBuildingId, drawTier, previousTier, animProgress);
    }
    ctx.restore();
    
    if (levelUpAnimTime > 0) {
        const alpha = Math.max(0, levelUpAnimTime);
        const grad = ctx.createLinearGradient(0, 0, 0, height);
        grad.addColorStop(0, `rgba(255, 255, 255, 0)`);
        grad.addColorStop(0.5, `rgba(255, 255, 255, ${alpha * 0.5})`);
        grad.addColorStop(1, `rgba(255, 255, 255, 0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
    }
    
    if (tierUpAnimTime > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${shakeAlpha})`;
        ctx.fillRect(0, 0, width, height);
    }
}

function drawCavern(ctx, w, h, t) {
    if (!window.currentCavernLayout) {
        const numGems = 20 + Math.floor(Math.random() * 11);
        const gems = [];
        for (let i = 0; i < numGems; i++) {
            gems.push({
                xFrac: Math.random(),
                yFrac: Math.random(),
                gemType: Math.floor(Math.random() * 20) // 20 cached gemstone combinations
            });
        }
        
        const numStalactites = 8 + Math.floor(Math.random() * 8);
        const stalactites = [];
        for (let i = 0; i < numStalactites; i++) {
            const length = 50 + Math.random() * 100;
            const width = 20 + Math.random() * 40;
            
            // Generate bumpy paths for organic spikes, but keep them subtle so they look pointier
            const leftPath = [];
            const rightPath = [];
            const segments = 5;
            for (let s = 1; s < segments; s++) {
                leftPath.push((Math.random() - 0.5) * 2); // smaller offsets
                rightPath.push((Math.random() - 0.5) * 2);
            }

            let xFrac = Math.random();
            let attempts = 0;
            let valid = false;
            while (attempts < 50) {
                let tooClose = false;
                for (const st of stalactites) {
                    if (Math.abs(st.xFrac - xFrac) < 0.06) {
                        tooClose = true;
                        break;
                    }
                }
                if (!tooClose) { valid = true; break; }
                xFrac = Math.random();
                attempts++;
            }
            if (!valid) continue;

            stalactites.push({
                xFrac: xFrac,
                length: length,
                width: width,
                dropPhase: Math.random() * Math.PI * 2,
                dropSpeed: 0.5 + Math.random() * 1.5,
                leftPath: leftPath,
                rightPath: rightPath
            });
        }
        
        const cracks = [];
        const cols = 15;
        const rows = 12;
        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
                if (Math.random() > 0.1) { // 90% chance to have a crack in this cell, smaller cells -> more cracks
                    const points = [];
                    const numPoints = 3 + Math.floor(Math.random() * 5);
                    let cx = (c + Math.random()) / cols;
                    let cy = (r + Math.random()) / rows;
                    for (let p = 0; p < numPoints; p++) {
                        points.push({ x: cx, y: cy });
                        cx += (Math.random() - 0.5) * 0.05;
                        cy += (Math.random() - 0.5) * 0.05;
                    }
                    cracks.push(points);
                }
            }
        }
        
        window.currentCavernLayout = { gems, stalactites, cracks };
    }

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#2e1c11');
    grad.addColorStop(1, '#1a0d05');
    
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    
    // Draw cracky crumbly background details
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.lineWidth = 3;
    if (window.currentCavernLayout.cracks) {
        for (const crack of window.currentCavernLayout.cracks) {
            ctx.beginPath();
            ctx.moveTo(crack[0].x * w, crack[0].y * h);
            for (let i = 1; i < crack.length; i++) {
                ctx.lineTo(crack[i].x * w, crack[i].y * h);
            }
            ctx.stroke();
        }
    }
    
    for (const st of window.currentCavernLayout.stalactites) {
        const sx = st.xFrac * w;
        const tipX = sx + (Math.sin(st.dropPhase) * 10);
        
        const stalactiteGrad = ctx.createLinearGradient(sx, 0, sx, st.length);
        stalactiteGrad.addColorStop(0, '#1c100a');
        stalactiteGrad.addColorStop(1, '#402618');
        ctx.fillStyle = stalactiteGrad;
        
        ctx.beginPath();
        // perfect triangle
        ctx.moveTo(sx - st.width / 2, 0);
        ctx.lineTo(tipX, st.length); // The tip
        ctx.lineTo(sx + st.width / 2, 0);
        ctx.closePath();
        ctx.fill();
        
        // draw water droplet
        const dropT = (t * st.dropSpeed + st.dropPhase) % 6; // 6 seconds cycle
        if (dropT < 1) { // Falling phase
            const dropY = st.length + dropT * (h - st.length);
            ctx.fillStyle = 'rgba(100, 200, 255, 0.4)';
            ctx.beginPath();
            ctx.arc(tipX, dropY, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    const floorH = 260;

    // Draw flat floor layers
    ctx.fillStyle = "rgb(42, 30, 24)";
    ctx.fillRect(0, h - floorH, w, floorH);

    ctx.fillStyle = "rgb(28, 20, 16)";
    ctx.fillRect(0, h - floorH * 0.8, w, floorH * 0.8);

    ctx.fillStyle = "rgb(18, 12, 10)";
    ctx.fillRect(0, h - floorH * 0.6, w, floorH * 0.6);
    
    // generate and draw clusters identically to sellTab.js
    const colors = [
        {r: 0, g: 255, b: 255}, // Bright Cyan
        {r: 148, g: 0, b: 211}, // Deep Purple
        {r: 235, g: 30, b: 50}, // Red (Ruby)
        {r: 40, g: 220, b: 100} // Green (Emerald)
    ];

    if (!window.cachedGemstones) {
        window.cachedGemstones = [];
        for (let i = 0; i < 20; i++) {
            const sharedColor = colors[i % colors.length];
            const clusters = [];
            const numPieces = 3 + Math.floor(Math.abs(Math.sin(i * 123.45)) * 3);
            for(let p=0; p<numPieces; p++) {
                const pSize = 4 + Math.abs(Math.sin(p * 456.78)) * 6;
                const numVertices = 4 + Math.floor(Math.abs(Math.cos(p * 789.01)) * 4);
                const facets = [];
                for (let v = 0; v < numVertices; v++) {
                     const angle = (v / numVertices) * Math.PI * 2;
                     const rad = pSize * (0.6 + Math.abs(Math.sin(v * 12.34)) * 0.6);
                     const shade = 0.6 + Math.abs(Math.cos(v * 56.78)) * 0.6;
                     facets.push({ dx: Math.cos(angle) * rad, dy: Math.sin(angle) * rad, shade });
                }
                clusters.push({
                    ox: (Math.abs(Math.sin(p * 90.12)) - 0.5) * 10,
                    oy: (Math.abs(Math.cos(p * 34.56)) - 0.5) * 10,
                    facets,
                    size: pSize
                });
            }

            let cachedImage;
            if (typeof OffscreenCanvas !== 'undefined') {
                cachedImage = new OffscreenCanvas(40, 40);
            } else {
                cachedImage = document.createElement('canvas');
                cachedImage.width = 40;
                cachedImage.height = 40;
            }
            const octx = cachedImage.getContext('2d');
            octx.translate(20, 20); // Center drawing

            for (const cl of clusters) {
                const px = cl.ox;
                const py = cl.oy;
                if (cl.facets && cl.facets.length > 0) {
                    for (let v = 0; v < cl.facets.length; v++) {
                        const p1 = cl.facets[v];
                        const p2 = cl.facets[(v + 1) % cl.facets.length];
                        
                        octx.beginPath();
                        octx.moveTo(px, py); // center point
                        octx.lineTo(px + p1.dx, py + p1.dy);
                        octx.lineTo(px + p2.dx, py + p2.dy);
                        octx.closePath();
                        
                        // Calculate shaded color for this facet
                        const r = Math.min(255, sharedColor.r * p1.shade);
                        const g = Math.min(255, sharedColor.g * p1.shade);
                        const b = Math.min(255, sharedColor.b * p1.shade);
                        octx.fillStyle = `rgb(${r}, ${g}, ${b})`;
                        octx.fill();
                    }
                }
            }
            window.cachedGemstones.push(cachedImage);
        }
    }
    
    for (const gem of window.currentCavernLayout.gems) {
        let cx = gem.xFrac * w;
        let cy = h - floorH * 0.7 + (floorH * 0.6) * gem.yFrac;
        
        const cachedImage = window.cachedGemstones[gem.gemType];
        if (cachedImage) {
            ctx.drawImage(cachedImage, cx - 20, cy - 20);
        }
    }
}

function drawBuilding(ctx, w, h, t, id, tier, prevTier, animProgress) {
    const floorY = h - 260; // Match new floor height
    const cx = w / 2;
    
    let currentY = floorY;
    
    ctx.save();
    ctx.translate(cx, floorY);
    
    const targetScale = 1.0 + (tier * 0.1);
    const startScale = 1.0 + (prevTier * 0.1);
    const scale = startScale + (targetScale - startScale) * animProgress;
    ctx.scale(scale, scale);
    
    let bounce = 0;

    let topY = 0;
    if (id === 'core') topY = -200;
    else if (id === 'crystal') topY = -(100 + (tier * 10)) - 30; // approx height of obelisk
    else if (id === 'stone') topY = -140;
    else if (id === 'copper') topY = -90;
    else if (id === 'iron') topY = -100;
    else if (id === 'pure_gold') topY = -60;
    else if (id === 'diamond') topY = -120;
    else if (id === 'emerald') topY = -130;
    else if (id === 'ruby') topY = -100;
    else if (id === 'sapphire') topY = -80;
    else if (id === 'unobtainium') topY = -160;
    else if (id === 'prismatium') topY = -150;
    else topY = -100;
    
    // Scale the topY
    let finalHighestY = floorY + topY * scale;

    ctx.save();
    const glowRadius = Math.abs(topY) * 0.8 + 40;
    const glowGrad = ctx.createRadialGradient(0, topY / 2, 0, 0, topY / 2, glowRadius);
    glowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    glowGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(0, topY / 2, glowRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (id === 'core') drawBlackHole(ctx, t, tier, prevTier, animProgress);
    else if (id === 'crystal') drawObelisk(ctx, t, tier);
    else if (id === 'stone') drawFoundry(ctx, t, tier, prevTier, animProgress);
    else if (id === 'copper') drawCharger(ctx, t, tier);
    else if (id === 'iron') drawRefinery(ctx, t, tier);
    else if (id === 'pure_gold') drawVault(ctx, t, tier);
    else if (id === 'diamond') drawOilRig(ctx, t, tier);
    else if (id === 'emerald') drawGreenhouse(ctx, t, tier);
    else if (id === 'ruby') drawRadiator(ctx, t, tier);
    else if (id === 'sapphire') drawCentrifuge(ctx, t, tier);
    else if (id === 'unobtainium') drawBeacon(ctx, t, tier);
    else if (id === 'prismatium') drawSingularity(ctx, t, tier);
    
    ctx.restore();
    
    // Update HTML element position
    const levelText = document.getElementById('building-detail-level-text');
    if (levelText) {
        levelText.style.position = 'absolute';
        // Calculate top offset based on parent container offset (which might be causing the drift)
        // Adjust for padding or margins of the container
        levelText.style.top = (finalHighestY - 180) + 'px'; // Magic number offset to fix clipping
        levelText.style.left = '0';
        levelText.style.width = '100%';
        
        let shakeAlphaText = 0;
        if (tierUpAnimTime > 0) {
            shakeAlphaText = tierUpAnimTime > 2.5 ? (6.0 - tierUpAnimTime) / 3.5 : tierUpAnimTime / 2.5;
        }
        levelText.style.opacity = Math.max(0, 1 - shakeAlphaText);
    }
}

// ----------------- Building Drawing Routines ----------------- //

function drawBlackHole(ctx, t, tier, prevTier, animProgress) {
    const cx = 0;
    const cy = -80; // Main vertical center of the black hole
    
    const showTier0 = 1;
    const tier0Prog = (tier >= 0 && prevTier < 0) ? animProgress : showTier0;
    const showTier1 = (tier >= 1) ? 1 : 0;
    const tier1Prog = (tier >= 1 && prevTier < 1) ? animProgress : showTier1;
    const showTier2 = (tier >= 2) ? 1 : 0;
    const tier2Prog = (tier >= 2 && prevTier < 2) ? animProgress : showTier2;
    const showTier3 = (tier >= 3) ? 1 : 0;
    const tier3Prog = (tier >= 3 && prevTier < 3) ? animProgress : showTier3;
    const showTier4 = (tier >= 4) ? 1 : 0;
    const tier4Prog = (tier >= 4 && prevTier < 4) ? animProgress : showTier4;
    const showTier5 = (tier >= 5) ? 1 : 0;
    const tier5Prog = (tier >= 5 && prevTier < 5) ? animProgress : showTier5;
    const showTier6 = (tier >= 6) ? 1 : 0;
    const tier6Prog = (tier >= 6 && prevTier < 6) ? animProgress : showTier6;
    const showTier7 = (tier >= 7) ? 1 : 0;
    const tier7Prog = (tier >= 7 && prevTier < 7) ? animProgress : showTier7;
    const showTier8 = (tier >= 8) ? 1 : 0;
    const tier8Prog = (tier >= 8 && prevTier < 8) ? animProgress : showTier8;

    // No base floor or containment ring anymore! The black hole stands on its own.
    
    // Tier 7 & 8: Intense multi-layered glows (Back layers)
    if (tier7Prog > 0) {
        ctx.save();
        ctx.globalAlpha = tier7Prog;
        
        // Huge deep chaotic glow
        const glowRadius = 150 + 50 * tier8Prog + 20 * Math.sin(t * 5);
        const intenseGlow = ctx.createRadialGradient(cx, cy, 20, cx, cy, glowRadius);
        intenseGlow.addColorStop(0, 'rgba(255, 0, 255, 0.4)');
        intenseGlow.addColorStop(0.5, 'rgba(100, 0, 255, 0.2)');
        intenseGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = intenseGlow;
        ctx.beginPath();
        ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Chaotic energy arcs
        ctx.strokeStyle = `rgba(200, 100, 255, ${0.4 + 0.4 * Math.sin(t * 8)})`;
        ctx.lineWidth = 2 + 2 * tier8Prog;
        for (let i = 0; i < 5 + 3 * tier8Prog; i++) {
            ctx.beginPath();
            const angleStart = t * (i + 1) + i * Math.PI / 2;
            const angleEnd = angleStart + Math.PI / (2 + i % 3);
            const r1 = 80 + 30 * Math.sin(t * 3 + i);
            const r2 = 90 + 40 * Math.cos(t * 2.5 + i);
            ctx.arc(cx, cy, r1, angleStart, angleEnd);
            ctx.stroke();
        }
        ctx.restore();
    }

    // Tier 4+: Dark matter mist / Energy corona (Swirling behind)
    if (tier4Prog > 0) {
        ctx.save();
        ctx.globalAlpha = tier4Prog;
        
        const coronaRadius = 100 + 20 * tier5Prog + 30 * tier7Prog;
        const coronaT = t * 0.5;
        
        ctx.translate(cx, cy);
        for(let i=0; i<4; i++) {
            ctx.save();
            ctx.rotate(coronaT + i * Math.PI / 2);
            ctx.scale(1, 0.8 + 0.2 * Math.sin(t * 2 + i));
            
            const mistGrad = ctx.createRadialGradient(0, 0, 20, 0, 0, coronaRadius);
            mistGrad.addColorStop(0, 'rgba(30, 10, 50, 0.8)');
            mistGrad.addColorStop(0.5, 'rgba(50, 20, 80, 0.4)');
            mistGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            
            ctx.fillStyle = mistGrad;
            ctx.beginPath();
            ctx.arc(0, 0, coronaRadius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }

    // Tier 5+: Realistic Accretion Disk (Back Half)
    if (tier5Prog > 0) {
        ctx.save();
        ctx.globalAlpha = tier5Prog;
        
        const diskOuterRadius = 120 + 30 * tier7Prog + 40 * tier8Prog;
        const diskInnerRadius = 35 + 15 * tier7Prog;
        const rotationT = t * (2 + tier7Prog + tier8Prog * 2);

        ctx.translate(cx, cy);
        // Tilt downwards and rotate to the right
        ctx.rotate(Math.PI / 8); 
        ctx.scale(1, 0.25); // Flatten heavily
        ctx.rotate(rotationT);

        const diskGrad = ctx.createRadialGradient(0, 0, diskInnerRadius, 0, 0, diskOuterRadius);
        diskGrad.addColorStop(0, 'rgba(255, 200, 100, 0.0)'); // Inner gap
        diskGrad.addColorStop(0.1, 'rgba(255, 255, 255, 1.0)'); // Inner hot edge
        diskGrad.addColorStop(0.4, 'rgba(255, 150, 50, 0.8)'); // Mid disk
        diskGrad.addColorStop(0.8, 'rgba(200, 50, 0, 0.4)'); // Outer edge
        diskGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = diskGrad;
        ctx.beginPath();
        // Only draw the top/back half (Math.PI to Math.PI * 2) so it goes behind the black hole
        ctx.arc(0, 0, diskOuterRadius, Math.PI, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
    }

    // The Singularity Base setup
    ctx.save();
    
    // Size logic: Tiers 1 and 2 give decent increases, Tier 3+ does not increase size.
    const baseRadius = 8;
    // Decent increases for T1 and T2
    let finalRadius = baseRadius;
    if (tier >= 1) finalRadius += 10 * tier1Prog; // T1 size increase
    if (tier >= 2) finalRadius += 10 * tier2Prog; // T2 size increase
    
    // Tier 6: Time dilation ripple field (expanding rings behind the event horizon)
    if (tier6Prog > 0) {
        ctx.save();
        ctx.globalAlpha = tier6Prog;
        for (let i = 0; i < 3; i++) {
            const rippleT = (t * 2 + i * (Math.PI * 2 / 3)) % (Math.PI * 2);
            const rippleScale = rippleT / (Math.PI * 2);
            const rRadius = finalRadius + rippleScale * 60;
            
            ctx.beginPath();
            ctx.arc(cx, cy, rRadius, 0, Math.PI * 2);
            ctx.lineWidth = 2 * (1 - rippleScale);
            ctx.strokeStyle = `rgba(100, 200, 255, ${0.6 * (1 - rippleScale)})`;
            ctx.stroke();
        }
        ctx.restore();
    }

    // Tier 1: Awakening (Pulsing waves)
    if (tier1Prog > 0) {
        const pulse = Math.sin(t * 3) * 0.5 + 0.5;
        const waveRadius = finalRadius + 7 + pulse * 15 * tier1Prog;
        
        ctx.beginPath();
        ctx.arc(cx, cy, waveRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(75, 0, 130, ${0.5 * (1 - pulse)})`; // Indigo
        ctx.fill();
    }

    // Tier 2: Particle absorption effect
    if (tier2Prog > 0) {
        ctx.fillStyle = '#fff';
        for(let i=0; i<12; i++) {
            const pAngle = t * 0.5 + i * Math.PI / 6;
            // Particles move inward over time
            const pDist = finalRadius + 10 + ((100 - (t * 20 + i * 15) % 100) * tier2Prog);
            const px = cx + Math.cos(pAngle) * pDist;
            const py = cy + Math.sin(pAngle) * pDist;
            
            const alpha = Math.min(1, (pDist - finalRadius) / 40);
            ctx.globalAlpha = alpha * tier2Prog;
            ctx.beginPath();
            ctx.arc(px, py, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;
    }

    // Tier 3: Photon ring (bright ring tightly hugging the event horizon)
    if (tier3Prog > 0) {
        ctx.save();
        ctx.globalAlpha = tier3Prog;
        ctx.beginPath();
        ctx.arc(cx, cy, finalRadius + 2, 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 + 0.2 * Math.sin(t * 10)})`;
        ctx.stroke();
        
        // Inner glowing blur
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'white';
        ctx.stroke();
        ctx.restore();
    }

    // The pure black hole
    ctx.beginPath();
    ctx.arc(cx, cy, finalRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();
    
    ctx.restore();

    // Tier 5+: Realistic Accretion Disk (Front Half)
    if (tier5Prog > 0) {
        ctx.save();
        ctx.globalAlpha = tier5Prog;
        
        const diskOuterRadius = 120 + 30 * tier7Prog + 40 * tier8Prog;
        const diskInnerRadius = 35 + 15 * tier7Prog; // Slightly larger to overlap properly
        const rotationT = t * (2 + tier7Prog + tier8Prog * 2);

        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 8); 
        ctx.scale(1, 0.25); 
        ctx.rotate(rotationT);

        const diskGrad = ctx.createRadialGradient(0, 0, diskInnerRadius, 0, 0, diskOuterRadius);
        diskGrad.addColorStop(0, 'rgba(255, 200, 100, 0.0)');
        diskGrad.addColorStop(0.1, 'rgba(255, 255, 255, 1.0)'); 
        diskGrad.addColorStop(0.4, 'rgba(255, 150, 50, 0.9)'); 
        diskGrad.addColorStop(0.8, 'rgba(200, 50, 0, 0.5)'); 
        diskGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = diskGrad;
        ctx.beginPath();
        // Front half (0 to Math.PI) covering the bottom part in 2D
        ctx.arc(0, 0, diskOuterRadius, 0, Math.PI);
        // Draw inner cutout so we don't paint over the black hole too heavily in the middle
        ctx.arc(0, 0, diskInnerRadius, Math.PI, 0, true);
        ctx.fill();
        
        ctx.restore();
    }

    // Tier 8: Angled, pulsating beam going straight through the black hole
    if (tier8Prog > 0) {
        ctx.save();
        ctx.globalAlpha = tier8Prog;
        
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 4); // Angled to the right
        
        const beamW = 20 + 10 * Math.abs(Math.sin(t * 12));
        const beamHeight = 600; // Extends way past viewport
        
        // Intense purple/white beam gradient
        const beamGrad = ctx.createLinearGradient(-beamW/2, 0, beamW/2, 0);
        beamGrad.addColorStop(0, `rgba(138, 43, 226, 0)`);
        beamGrad.addColorStop(0.2, `rgba(180, 80, 255, ${0.8 * tier8Prog})`);
        beamGrad.addColorStop(0.5, `rgba(255, 255, 255, ${1.0 * tier8Prog})`);
        beamGrad.addColorStop(0.8, `rgba(180, 80, 255, ${0.8 * tier8Prog})`);
        beamGrad.addColorStop(1, `rgba(138, 43, 226, 0)`);
        
        ctx.fillStyle = beamGrad;
        // The beam goes straight through (top to bottom)
        ctx.fillRect(-beamW/2, -beamHeight, beamW, beamHeight * 2);
        
        // Extra intense core line
        ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + 0.5 * Math.sin(t * 20)})`;
        const coreWidth = 4 + 2 * Math.abs(Math.sin(t * 12));
        ctx.fillRect(-coreWidth/2, -beamHeight, coreWidth, beamHeight * 2);

        ctx.restore();
    }
}

function drawObelisk(ctx, t, tier) {
    ctx.fillStyle = '#111';
    ctx.fillRect(-30, -20, 60, 20);
    
    const h = 100 + (tier * 10);
    const w = 40 + (tier * 2);
    
    ctx.fillStyle = '#c0f';
    ctx.beginPath();
    ctx.moveTo(0, -20 - h);
    ctx.lineTo(-w/2, -20);
    ctx.lineTo(w/2, -20);
    ctx.fill();
    
    if (tier >= 3) {
        ctx.fillStyle = '#f0f';
        ctx.beginPath();
        ctx.moveTo(0, -30 - h - 20);
        ctx.lineTo(-10, -30 - h);
        ctx.lineTo(10, -30 - h);
        ctx.fill();
    }
}

function drawFoundry(ctx, t, tier, prevTier, animProgress) {
    // Base structure (Tier 0+)
    if (!stonePattern && activeCtx) {
        initStonePattern(activeCtx);
    }
    if (stonePattern) {
        ctx.fillStyle = stonePattern;
    } else {
        ctx.fillStyle = '#544';
    }
    
    // Draw base building (rock oven)
    ctx.fillRect(-70, -100, 140, 100);
    
    // Tier 1: Multiple, staggered smokestacks emitting thick, animated smoke with glowing embers
    const showTier1 = (tier >= 1) ? 1 : 0;
    const tier1Prog = (tier >= 1 && prevTier < 1) ? animProgress : showTier1;
    if (tier1Prog > 0) {
        ctx.save();
        ctx.globalAlpha = tier1Prog;
        
        
        
        const drawSmokestack = (x, y, w, h, timeOffset) => {
            ctx.fillStyle = '#222';
            ctx.fillRect(x - w/2, y - h, w, h);
            
            // Rim of smokestack
            ctx.fillStyle = '#111';
            ctx.fillRect(x - w/2 - 2, y - h, w + 4, 5);

            if (tier1Prog > 0) {
                for (let i = 0; i < 5; i++) {
                    const smokeT = (t + i * 0.8 + timeOffset) % 4;
                    const smokeY = y - h - smokeT * 40;
                    const smokeX = x + Math.sin(smokeT * 3 + i) * 15;
                    const smokeSize = 10 + smokeT * 15;
                    const smokeAlpha = 1 - (smokeT / 4);
                    
                    // Smoke
                    ctx.fillStyle = `rgba(50, 50, 50, ${smokeAlpha * 0.8})`;
                    ctx.beginPath();
                    ctx.arc(smokeX, smokeY, smokeSize, 0, Math.PI * 2);
                    ctx.fill();
                    
                    // Embers
                    const emberX = smokeX + Math.sin(smokeT * 5 + i * 2) * smokeSize * 0.5;
                    const emberY = smokeY + Math.cos(smokeT * 4 + i) * smokeSize * 0.5;
                    const emberAlpha = smokeAlpha * (0.5 + 0.5 * Math.sin(t * 10 + i));
                    ctx.fillStyle = `rgba(255, 100, 0, ${emberAlpha})`;
                    ctx.beginPath();
                    ctx.arc(emberX, emberY, 2 + Math.abs(Math.sin(i)) * 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        };

        drawSmokestack(-35, -100, 20, 60, 0);
        drawSmokestack(0, -100, 26, 80, 1.5);
        drawSmokestack(35, -100, 20, 60, 2.5);

        ctx.restore();
    }
    
    // Tier 2: Heavy dark metal plating with glowing orange seams
    const showTier2 = (tier >= 2) ? 1 : 0;
    const tier2Prog = (tier >= 2 && prevTier < 2) ? animProgress : showTier2;
    if (tier2Prog > 0) {
        ctx.save();
        ctx.globalAlpha = tier2Prog;
        
        
        
        // Base dark plating
        ctx.fillStyle = '#111';
        ctx.fillRect(-75, -105, 150, 10);
        ctx.fillRect(-75, -10, 150, 10);
        ctx.fillRect(-75, -105, 10, 105);
        ctx.fillRect(65, -105, 10, 105);
        
        // Glowing orange seams
        const pulse = 0.5 + 0.5 * Math.sin(t * 3);
        ctx.fillStyle = `rgba(255, ${100 + pulse * 100}, 0, ${0.7 + pulse * 0.3})`;
        ctx.fillRect(-65, -103, 130, 2); // Top inner seam
        ctx.fillRect(-65, -12, 130, 2);  // Bottom inner seam
        ctx.fillRect(-73, -95, 2, 85);   // Left inner seam
        ctx.fillRect(71, -95, 2, 85);    // Right inner seam
        
        // Rivets
        ctx.fillStyle = '#555';
        for(let i=-60; i<=60; i+=20) {
            ctx.fillRect(i, -102, 4, 4);
            ctx.fillRect(i, -7, 4, 4);
            if (i > -60 && i < 60 && i % 40 === 0) {
                 ctx.fillRect(-72, i - 20, 4, 4);
                 ctx.fillRect(68, i - 20, 4, 4);
            }
        }
        

        ctx.restore();
    }
    
    // Tier 3: Dynamic lava falls spilling into cooling pools
    const showTier3 = (tier >= 3) ? 1 : 0;
    const tier3Prog = (tier >= 3 && prevTier < 3) ? animProgress : showTier3;
    if (tier3Prog > 0) {
        ctx.save();
        ctx.globalAlpha = tier3Prog;
        
        // Lava pools at base
        const poolGrad = ctx.createLinearGradient(0, -10, 0, 0);
        poolGrad.addColorStop(0, '#f90');
        poolGrad.addColorStop(1, '#a20');
        ctx.fillStyle = poolGrad;
        ctx.fillRect(-95, -10, 40, 10);
        ctx.fillRect(55, -10, 40, 10);
        
        // Cooling pools edges
        ctx.fillStyle = '#222';
        ctx.fillRect(-100, -15, 5, 15);
        ctx.fillRect(-55, -15, 5, 15);
        ctx.fillRect(50, -15, 5, 15);
        ctx.fillRect(95, -15, 5, 15);
        
        // Dynamic Lava Falls
        const drawLavaFall = (x) => {
            let scrollOffset = (t * 2) % 1;
            if (scrollOffset < 0) scrollOffset += 1;
            const lavaFallGrad = ctx.createLinearGradient(0, -90, 0, -10);
            
            const stops = [
                { offset: Math.max(0, Math.min(1, (0 + scrollOffset) % 1)), color: '#ff0' },
                { offset: Math.max(0, Math.min(1, (0.33 + scrollOffset) % 1)), color: '#f50' },
                { offset: Math.max(0, Math.min(1, (0.66 + scrollOffset) % 1)), color: '#a20' }
            ];
            
            stops.sort((a, b) => a.offset - b.offset);
            for (const s of stops) {
                lavaFallGrad.addColorStop(s.offset, s.color);
            }
            
            const firstStop = stops[0];
            const lastStop = stops[stops.length - 1];
            if (firstStop.offset > 0) lavaFallGrad.addColorStop(0, lastStop.color);
            if (lastStop.offset < 1) lavaFallGrad.addColorStop(1, firstStop.color);
            
            // Just to be absolutely safe, avoid duplicate stops at 0 or 1. Actually the safest is just adding them if they aren't duplicate, but the clipping in math.max usually prevents exceptions. 
            // The negative issue was due to modulo of negative numbers in JS (if t was negative), so our `if (scrollOffset < 0) scrollOffset += 1;` fixes the negative.
            ctx.fillStyle = lavaFallGrad;
            
            // Straight lava stream
            ctx.fillRect(x - 8, -90, 16, 80);
            
            // Spouts
            ctx.fillStyle = '#333';
            ctx.fillRect(x - 12, -100, 24, 10);
            ctx.fillStyle = '#f90';
            ctx.fillRect(x - 10, -95, 20, 5);
            
            // Steam from pool
            if (tier3Prog > 0.8) {
                for (let i = 0; i < 3; i++) {
                    const steamT = (t + i * 1.5) % 3;
                    const steamY = -10 - steamT * 20;
                    const steamX = x + Math.sin(steamT * 4 + i) * 10;
                    const steamAlpha = 1 - (steamT / 3);
                    ctx.fillStyle = `rgba(200, 200, 200, ${steamAlpha * 0.4})`;
                    ctx.beginPath();
                    ctx.arc(steamX, steamY, 5 + steamT * 5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        };
        
        drawLavaFall(-75);
        drawLavaFall(75);
        
        ctx.restore();
    }
    
    // Tier 5: Heavy Industrial Vents - Glowing orange/red heat emitting from industrial vents
    const showTier5 = (tier >= 5) ? 1 : 0;
    const tier5Prog = (tier >= 5 && prevTier < 5) ? animProgress : showTier5;
    if (tier5Prog > 0) {
        ctx.save();
        ctx.globalAlpha = tier5Prog;
        
        const heatGlow = 0.5 + 0.5 * Math.sin(t * 4);
        
        const drawVent = (x, y, w, h) => {
            ctx.save();
            ctx.translate(x, y);
            
            // Vent casing
            ctx.fillStyle = '#222';
            ctx.fillRect(-w/2, -h/2, w, h);
            ctx.strokeStyle = '#111';
            ctx.lineWidth = 2;
            ctx.strokeRect(-w/2, -h/2, w, h);
            
            // Glowing interior
            ctx.fillStyle = `rgba(255, ${100 + heatGlow * 50}, 0, ${0.6 + 0.4 * heatGlow})`;
            ctx.fillRect(-w/2 + 2, -h/2 + 2, w - 4, h - 4);
            
            // Grates
            ctx.fillStyle = '#000';
            for (let i = -h/2 + 4; i < h/2 - 2; i += 4) {
                ctx.fillRect(-w/2 + 2, i, w - 4, 2);
            }
            
            ctx.restore();
        };

        // Draw vents embedded into the structure walls
        // 3 vents on each side, slightly adjusted to fit
        drawVent(-48, -27, 16, 20); // Bottom left
        drawVent(-48, -54, 16, 20); // Mid left
        drawVent(-48, -81, 16, 20); // Top left
        
        drawVent(48, -27, 16, 20); // Bottom right
        drawVent(48, -54, 16, 20); // Mid right
        drawVent(48, -81, 16, 20); // Top right
        
        // Two vents on top instead of 1 large one
        drawVent(-16, -81, 16, 20);
        drawVent(16, -81, 16, 20);

        ctx.restore();
    }
    
    // Tier 6: Hyper-Accelerated Exhaust - Animated turbine fans blowing intense magma flame jets
    const showTier6 = (tier >= 6) ? 1 : 0;
    const tier6Prog = (tier >= 6 && prevTier < 6) ? animProgress : showTier6;
    if (tier6Prog > 0) {
        ctx.save();
        ctx.globalAlpha = tier6Prog;
        
        const drawTurbineExhaust = (x, isLeft) => {
            ctx.save();
            ctx.translate(x, -80);
            
            // Housing
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(isLeft ? -30 : 0, -20, 30, 40);
            
            // Turbine casing details
            ctx.fillStyle = '#333';
            ctx.fillRect(isLeft ? -25 : 5, -15, 20, 30);
            
            // Glowing red-hot interior
            const heatGlow = 0.5 + 0.5 * Math.sin(t * 8);
            ctx.fillStyle = `rgba(255, ${50 + heatGlow * 100}, 0, 0.8)`;
            ctx.fillRect(isLeft ? -22 : 8, -12, 14, 24);

            // Turbine Fan blades
            ctx.save();
            ctx.translate(isLeft ? -15 : 15, 0);
            ctx.rotate(t * (isLeft ? -20 : 20)); // Spin very fast
            ctx.fillStyle = '#111';
            for (let i = 0; i < 4; i++) {
                ctx.rotate(Math.PI / 2);
                ctx.beginPath();
                ctx.moveTo(-2, 0);
                ctx.lineTo(-8, -10);
                ctx.lineTo(8, -10);
                ctx.lineTo(2, 0);
                ctx.fill();
            }
            // Center spinner
            ctx.fillStyle = '#444';
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Blue flame exhaust
            if (tier6Prog > 0) {
                const firePulse = Math.random() * 0.4;
                const fireW = (40 + firePulse * 20) * (isLeft ? -1 : 1);
                const fireGrad = ctx.createLinearGradient(isLeft ? -30 : 30, 0, isLeft ? -30 + fireW : 30 + fireW, 0);
                fireGrad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
                fireGrad.addColorStop(0.2, 'rgba(255, 200, 0, 0.8)');
                fireGrad.addColorStop(0.5, 'rgba(255, 100, 0, 0.5)');
                fireGrad.addColorStop(1, 'rgba(255, 0, 0, 0)');
                
                ctx.fillStyle = fireGrad;
                ctx.beginPath();
                ctx.moveTo(isLeft ? -30 : 30, -10);
                ctx.lineTo(isLeft ? -30 + fireW : 30 + fireW, -5 - firePulse * 10);
                ctx.lineTo(isLeft ? -30 + fireW : 30 + fireW, 5 + firePulse * 10);
                ctx.lineTo(isLeft ? -30 : 30, 10);
                ctx.fill();
            }
            ctx.restore();
        };

        drawTurbineExhaust(-65, true);
        drawTurbineExhaust(65, false);
        
        ctx.restore();
    }
    
// Tier 7: Lava Containers
    const showTier7 = (tier >= 7) ? 1 : 0;
    const tier7Prog = (tier >= 7 && prevTier < 7) ? animProgress : showTier7;
    if (tier7Prog > 0) {
        ctx.save();
        ctx.globalAlpha = tier7Prog;
        
        const drawLavaContainer = (x, isLeft) => {
            ctx.save();
            ctx.translate(x, -10); // Base of the building
            
            // Pipe connection to the lava pool (KEEP)
            ctx.fillStyle = '#111';
            if (isLeft) {
                ctx.fillRect(15, -20, 25, 15); // Connects to the right (towards the pool)
            } else {
                ctx.fillRect(-40, -20, 25, 15); // Connects to the left (towards the pool)
            }
            
            // Glowing intake (KEEP)
            const heatPulse = 0.5 + 0.5 * Math.sin(t * 8);
            ctx.fillStyle = `rgba(255, ${100 + heatPulse * 100}, 0, 0.8)`;
            if (isLeft) {
                ctx.fillRect(15, -15, 10, 5);
            } else {
                ctx.fillRect(-25, -15, 10, 5);
            }

            // Lifted Silo parameters
            const containerWidth = 30;
            const containerHeight = 40;
            const siloX = isLeft ? -15 : -15; // center of the silo relative to connection point
            const siloY = -containerHeight; // lift it up slightly so it doesn't touch ground

            // Silo Back wall (dark background inside)
            ctx.fillStyle = '#1a0a00';
            ctx.fillRect(siloX, siloY, containerWidth, containerHeight);
            
            // Lava inside
            ctx.save();
            ctx.beginPath();
            ctx.rect(siloX, siloY, containerWidth, containerHeight);
            ctx.clip();
            
            // Lava level and motion
            const lavaLevelBase = 0.7; // 70% full
            const lavaLevelFluctuation = 0.05 * Math.sin(t * 2);
            const currentLavaHeight = containerHeight * (lavaLevelBase + lavaLevelFluctuation);
            const lavaY = siloY + containerHeight - currentLavaHeight;

            // Lava gradient
            const lavaGrad = ctx.createLinearGradient(0, lavaY, 0, siloY + containerHeight);
            lavaGrad.addColorStop(0, '#ffcc00'); // top is hot/bright
            lavaGrad.addColorStop(0.3, '#ff6600');
            lavaGrad.addColorStop(1, '#cc2200'); // bottom is darker
            
            ctx.fillStyle = lavaGrad;
            ctx.fillRect(siloX, lavaY, containerWidth, currentLavaHeight);

            // Lava bubbles moving up
            for (let i = 0; i < 8; i++) {
                const bubbleT = (t * 0.5 + i * 0.43) % 1; // 0 to 1 cycle
                const bubbleX = siloX + 5 + (i * 3) % (containerWidth - 10) + Math.sin(t * 3 + i) * 2;
                const bubbleY = siloY + containerHeight - (bubbleT * currentLavaHeight);
                const bubbleRadius = 1 + (i % 3);
                
                // only draw if below the surface
                if (bubbleY > lavaY + bubbleRadius) {
                    ctx.fillStyle = 'rgba(255, 200, 100, 0.7)';
                    ctx.beginPath();
                    ctx.arc(bubbleX, bubbleY, bubbleRadius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            
            ctx.restore();

            // Glass reflection/shine
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.fillRect(siloX + 3, siloY + 2, 5, containerHeight - 4);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
            ctx.fillRect(siloX + 8, siloY + 2, 3, containerHeight - 4);

            // Metal caps (Top and Bottom of Silo)
            ctx.fillStyle = '#222';
            ctx.fillRect(siloX - 2, siloY - 5, containerWidth + 4, 5); // Top cap
            ctx.fillRect(siloX - 2, siloY + containerHeight, containerWidth + 4, 5); // Bottom cap
            
            // Side supports/frame for the glass
            ctx.fillStyle = '#111';
            ctx.fillRect(siloX, siloY, 3, containerHeight); // Left frame
            ctx.fillRect(siloX + containerWidth - 3, siloY, 3, containerHeight); // Right frame
            
            ctx.restore();
        };

        // Positioned at the outer edges of the cooling pools
        drawLavaContainer(-105, true);
        drawLavaContainer(105, false);
        
        ctx.restore();
    }
    
    // Tier 4: The Core Unleashed - Blast doors open revealing intensely bright plasma core casting rays
    const showTier4 = (tier >= 4) ? 1 : 0;
    const tier4Prog = (tier >= 4 && prevTier < 4) ? animProgress : showTier4;
    
    // Draw furnace opening
    const doorWidth = 40 + tier4Prog * 20;
    const doorHeight = 40 + tier4Prog * 20;
    const pulse = Math.abs(Math.sin(t * 5));
    const corePulse = 0.8 + 0.2 * Math.sin(t * 15);
    
    ctx.fillStyle = '#050505';
    ctx.fillRect(-doorWidth/2, -doorHeight, doorWidth, doorHeight);

    const showTier8ForCore = (tier >= 8) ? 1 : 0;
    const tier8CoreProg = (tier >= 8 && prevTier < 8) ? animProgress : showTier8ForCore;
    
    if (tier4Prog > 0) {
        // Plasma core
        const tier8CoreMult = 1 + (tier8CoreProg * 1.5);
        const coreRadius = (15 + pulse * 5) * tier4Prog * tier8CoreMult;
        const coreGrad = ctx.createRadialGradient(0, -doorHeight/2, 0, 0, -doorHeight/2, coreRadius * 2);
        coreGrad.addColorStop(0, '#ffffff');
        coreGrad.addColorStop(0.2, '#ffcc00');
        coreGrad.addColorStop(0.5, '#ff3300');
        coreGrad.addColorStop(1, 'rgba(255, 50, 0, 0)');
        
        ctx.fillStyle = coreGrad;
        ctx.beginPath();
        ctx.arc(0, -doorHeight/2, coreRadius * 2, 0, Math.PI * 2);
        ctx.fill();

        // Light rays casting outwards
        ctx.save();
        ctx.translate(0, -doorHeight/2);
        for(let i=0; i<6; i++) {
            const angle = (t * 2 + i * Math.PI / 3) % (Math.PI * 2);
            ctx.rotate(angle);
            
            const rayLen = 80 * tier4Prog * corePulse * tier8CoreMult;
            const rayGrad = ctx.createLinearGradient(0, 0, 0, rayLen);
            const rayAlpha = Math.min(1.0, 0.4 * tier4Prog + 0.4 * tier8CoreProg);
            rayGrad.addColorStop(0, `rgba(255, 200, 100, ${rayAlpha})`);
            rayGrad.addColorStop(1, 'rgba(255, 50, 0, 0)');
            
            ctx.fillStyle = rayGrad;
            ctx.beginPath();
            ctx.moveTo(-2 * tier8CoreMult, 0);
            ctx.lineTo(2 * tier8CoreMult, 0);
            ctx.lineTo(10 * tier8CoreMult, rayLen);
            ctx.lineTo(-10 * tier8CoreMult, rayLen);
            ctx.fill();
            ctx.rotate(-angle);
        }
        ctx.restore();

        // Blast doors (opened) logic removed as per requirements

    } else {
        // Base tier opening (closed doors)
        // Fiery orangish-red/yellow/orange glow
        ctx.fillStyle = `rgba(255, ${50 + pulse * 100}, 0, 0.8)`;
        ctx.fillRect(-doorWidth/2 + 5, -doorHeight + 5, doorWidth - 10, doorHeight - 5);
    }
    
    const castGlowRadius = (60 + tier4Prog * 60) * (1 + (typeof tier8CoreProg !== 'undefined' ? tier8CoreProg : 0));
    const groundGlow = ctx.createRadialGradient(0, -doorHeight/2, 10, 0, 0, castGlowRadius);
    if (tier4Prog > 0) {
        groundGlow.addColorStop(0, `rgba(255, 100, 0, ${0.4 * tier4Prog * corePulse})`);
        groundGlow.addColorStop(1, 'rgba(255, 50, 0, 0)');
    } else {
        groundGlow.addColorStop(0, `rgba(255, ${150 + pulse * 50}, 0, 0.4)`);
        groundGlow.addColorStop(1, 'rgba(255, 100, 0, 0)');
    }
    ctx.fillStyle = groundGlow;
    ctx.beginPath();
    ctx.arc(0, 0, castGlowRadius, Math.PI, 0); 
    ctx.fill();
    
/* COMMENTING OUT ALL OF THIS CODE IN CASE I WANT TO REUSE IT FOR A SIMILAR THING ANOTHER TIME. DO NOT REMOVE THIS COMMENTED OUT CODE.
    // Tier 8: The World Forge - Geothermal magma engine
    const showTier8 = (tier >= 8) ? 1 : 0;
    const tier8Prog = (tier >= 8 && prevTier < 8) ? animProgress : showTier8;
    if (tier8Prog > 0) {
        ctx.save();
        ctx.globalAlpha = tier8Prog;
        
        // Cracked Ground Lava removed as per requirements

        // Massive Contained Magma Core (Internal)
        ctx.save();
        ctx.translate(0, -100); // Placed within the base furnace area instead of high up
        
        const corePulse = Math.abs(Math.sin(t * 15));

        // Exhaust magma beam firing upwards infinitely
        const beamW = 30 + corePulse * 15;
        const beamHeight = 1000; // Extend past top of viewport
        
        // Exhaust magma beam matching core colors (reddish-orange)
        // Horizontal gradient for a constant vertical appearance
        const beamGrad = ctx.createLinearGradient(-beamW/2, 0, beamW/2, 0);
        
        beamGrad.addColorStop(0, `rgba(255, 51, 0, ${0.9 * tier8Prog})`);       // Reddish-orange edge
        beamGrad.addColorStop(0.2, `rgba(255, 102, 0, ${0.9 * tier8Prog})`);    // Fiery orange
        beamGrad.addColorStop(0.5, `rgba(255, 204, 0, ${0.9 * tier8Prog})`);    // Yellowish center
        beamGrad.addColorStop(0.8, `rgba(255, 102, 0, ${0.9 * tier8Prog})`);    // Fiery orange
        beamGrad.addColorStop(1, `rgba(255, 51, 0, ${0.9 * tier8Prog})`);       // Reddish-orange edge
        
        ctx.fillStyle = beamGrad;
        ctx.fillRect(-beamW/2, -beamHeight, beamW, beamHeight);

        // Core housing (integrated)
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(-45, -30, 90, 60);
        
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 4;
        ctx.strokeRect(-45, -30, 90, 60);

        // Glowing magma center
        const magmaGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 40);
        magmaGrad.addColorStop(0, '#ffffff');
        magmaGrad.addColorStop(0.2, '#ffcc00');
        magmaGrad.addColorStop(0.6, '#ff3300');
        magmaGrad.addColorStop(1, 'rgba(255, 50, 0, 0)');
        
        ctx.fillStyle = magmaGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 30 + corePulse * 5, 0, Math.PI * 2);
        ctx.fill();

        // Magma containment vents (instead of rings)
        ctx.fillStyle = '#111';
        for(let i = -30; i <= 30; i+= 15) {
             ctx.fillRect(i - 2, -25, 4, 50);
        }

        ctx.restore();
        
        ctx.restore();
    }
*/
}

function drawGear(ctx, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI*2);
    ctx.fill();
    
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(0, 0, r/2, 0, Math.PI*2);
    ctx.fill();
    
    ctx.fillStyle = color;
    for(let i=0; i<8; i++) {
        ctx.save();
        ctx.rotate((i/8)*Math.PI*2);
        ctx.fillRect(-2, -r-3, 4, 6);
        ctx.restore();
    }
}

function drawCharger(ctx, t, tier) {
    ctx.fillStyle = '#b6673f'; 
    ctx.fillRect(-40, -60, 80, 60);
    
    ctx.strokeStyle = '#e99f79';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, -60, 30, Math.PI, 0);
    ctx.stroke();
    
    const arcT = (t * 5) % Math.PI;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(Math.cos(arcT + Math.PI)*30, -60 - Math.sin(arcT)*30, 5, 0, Math.PI*2);
    ctx.fill();
}

function drawRefinery(ctx, t, tier) {
    ctx.fillStyle = '#aab0b6'; 
    ctx.fillRect(-50, -100, 100, 100);
    
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(-50, -50);
    ctx.lineTo(-80, -50);
    ctx.lineTo(-80, 0);
    ctx.stroke();
    
    if (tier >= 2) {
        ctx.beginPath();
        ctx.moveTo(50, -30);
        ctx.lineTo(70, -30);
        ctx.lineTo(70, 0);
        ctx.stroke();
    }
}

function drawVault(ctx, t, tier) {
    ctx.fillStyle = '#d4b22c'; 
    ctx.fillRect(-60, -60, 120, 60);
    
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, -30, 20, 0, Math.PI*2);
    ctx.fill();
    
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-10, -30);
    ctx.lineTo(10, -30);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -40);
    ctx.lineTo(0, -20);
    ctx.stroke();
}

function drawOilRig(ctx, t, tier) {
    ctx.fillStyle = '#50c3ca'; 
    ctx.beginPath();
    ctx.moveTo(-40, 0);
    ctx.lineTo(-20, -120);
    ctx.lineTo(20, -120);
    ctx.lineTo(40, 0);
    ctx.fill();
    
    const drillY = Math.sin(t*10) * 10;
    ctx.fillStyle = '#111';
    ctx.fillRect(-5, -120 + drillY, 10, 140);
}

function drawGreenhouse(ctx, t, tier) {
    ctx.fillStyle = 'rgba(35, 171, 27, 0.3)'; 
    ctx.fillRect(-70, -60, 140, 60);
    ctx.beginPath();
    ctx.arc(0, -60, 70, Math.PI, 0);
    ctx.fill();
    
    ctx.fillStyle = '#47d13f';
    ctx.beginPath();
    ctx.moveTo(-30, 0);
    ctx.lineTo(-20, -40);
    ctx.lineTo(-10, 0);
    ctx.fill();
    
    ctx.beginPath();
    ctx.moveTo(30, 0);
    ctx.lineTo(20, -50 + Math.sin(t)*10);
    ctx.lineTo(10, 0);
    ctx.fill();
}

function drawRadiator(ctx, t, tier) {
    ctx.fillStyle = '#444';
    ctx.fillRect(-40, -100, 80, 100);
    
    const glow = Math.abs(Math.sin(t*4));
    ctx.fillStyle = `rgba(230, 69, 69, ${0.5 + glow * 0.5})`;
    
    for(let i=0; i<5; i++) {
        ctx.fillRect(-30, -90 + (i*18), 60, 10);
    }
}

function drawCentrifuge(ctx, t, tier) {
    ctx.fillStyle = '#555';
    ctx.fillRect(-20, -80, 40, 80);
    
    ctx.save();
    ctx.translate(0, -40);
    ctx.rotate(t * 5); 
    
    ctx.fillStyle = '#1c38d6'; 
    ctx.fillRect(-60, -10, 120, 20);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-50, 0, 8, 0, Math.PI*2);
    ctx.arc(50, 0, 8, 0, Math.PI*2);
    ctx.fill();
    
    ctx.restore();
}

function drawBeacon(ctx, t, tier) {
    ctx.fillStyle = '#330d58'; 
    ctx.beginPath();
    ctx.moveTo(-30, 0);
    ctx.lineTo(-10, -150);
    ctx.lineTo(10, -150);
    ctx.lineTo(30, 0);
    ctx.fill();
    
    ctx.save();
    ctx.translate(0, -150);
    ctx.rotate(t * 2);
    
    const grad = ctx.createLinearGradient(0, 0, 200, 0);
    grad.addColorStop(0, 'rgba(147, 82, 216, 0.8)');
    grad.addColorStop(1, 'rgba(147, 82, 216, 0)');
    ctx.fillStyle = grad;
    
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(200, -50);
    ctx.lineTo(200, 30);
    ctx.lineTo(0, 10);
    ctx.fill();
    
    ctx.restore();
}

function drawSingularity(ctx, t, tier) {
    const fly = Math.sin(t) * 20;
    ctx.save();
    ctx.translate(0, -100 + fly);
    
    const r = 30 + tier * 2;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.2, '#00ffff');
    grad.addColorStop(0.5, '#ff00ff');
    grad.addColorStop(1, '#000');
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI*2);
    ctx.fill();
    
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.save();
    ctx.rotate(t);
    ctx.scale(1, 0.3);
    ctx.beginPath();
    ctx.arc(0, 0, r * 2, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
    
    ctx.save();
    ctx.rotate(-t * 1.5);
    ctx.scale(0.3, 1);
    ctx.beginPath();
    ctx.arc(0, 0, r * 2, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();
    
    ctx.restore();
    
    ctx.fillStyle = '#222';
    ctx.fillRect(-50, -20, 100, 20);
}
