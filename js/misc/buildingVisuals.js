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

const TIERS = [1, 10, 25, 50, 100, 200, 400, 800, 1000];

const imageCache = {};
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

export function startCanvasLoop(id, canvasEl) {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    window.currentCavernLayout = null;
    activeCanvas = canvasEl;
    activeCtx = canvasEl.getContext('2d');
    currentBuildingId = id;
    lastTime = performance.now();
    
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
    import('./buildingsTab.js').then(module => {
        try {
            currentLevelNum = levelBigNumToNumber(module.getBuildingLevel(id));
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
}

export function triggerLevelUpAnimation() {
    levelUpAnimTime = 1.0;
}

export function checkTierUp(id, oldLevelBn, newLevelBn) {
    const oldNum = levelBigNumToNumber(oldLevelBn);
    const newNum = levelBigNumToNumber(newLevelBn);
    currentLevelNum = newNum;
    
    let oldTier = 0;
    let newTier = 0;
    
    for (let i = 0; i < TIERS.length; i++) {
        if (oldNum >= TIERS[i]) oldTier = i + 1;
        if (newNum >= TIERS[i]) newTier = i + 1;
    }
    
    if (newTier > oldTier) {
        tierUpAnimTime = 5.0; 
        playAudio('sounds/building_tier_up.ogg');
    }
}

function loop(currentTime) {
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
        shakeAlpha = tierUpAnimTime > 2.5 ? (5.0 - tierUpAnimTime) / 2.5 : tierUpAnimTime / 2.5;
        const shake = Math.sin(t * 50) * (shakeAlpha * 10);
        const shakeY = Math.cos(t * 40) * (shakeAlpha * 5);
        ctx.translate(shake, shakeY);
    }
    
    drawCavern(ctx, width, height, t);
    
    if (currentBuildingId) {
        drawBuilding(ctx, width, height, t, currentBuildingId, getTier());
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

            stalactites.push({
                xFrac: Math.random(),
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
    grad.addColorStop(0, '#4a3324');
    grad.addColorStop(1, '#2c1c11');
    
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    
    // Draw cracky crumbly background details
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
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

function drawBuilding(ctx, w, h, t, id, tier) {
    const floorY = h - 260; // Match new floor height
    const cx = w / 2;
    
    let currentY = floorY;
    
    ctx.save();
    ctx.translate(cx, floorY);
    
    const scale = 1.0 + (tier * 0.1);
    ctx.scale(scale, scale);
    
    let bounce = 0;
    // Only certain buildings bounce
    if (id === 'crystal' || id === 'prismatium') {
        bounce = Math.sin(t * 2) * 5;
        ctx.translate(0, bounce);
    }

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
    let finalHighestY = floorY + (bounce + topY) * scale;

    if (id === 'core') drawReactor(ctx, t, tier);
    else if (id === 'crystal') drawObelisk(ctx, t, tier);
    else if (id === 'stone') drawFoundry(ctx, t, tier);
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
    }
}

// ----------------- Building Drawing Routines ----------------- //

function drawReactor(ctx, t, tier) {
    const r = 30 + (tier * 2);
    ctx.fillStyle = '#222';
    ctx.fillRect(-50, -20, 100, 20);
    
    ctx.fillStyle = '#444';
    ctx.fillRect(-10, -80, 20, 60);
    
    const pulse = Math.abs(Math.sin(t * 3));
    ctx.fillStyle = `rgba(0, 255, 255, ${0.5 + pulse * 0.5})`;
    ctx.beginPath();
    ctx.arc(0, -90, r, 0, Math.PI * 2);
    ctx.fill();
    
    if (tier >= 5) {
        ctx.strokeStyle = '#0ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -90);
        ctx.lineTo(0, -200);
        ctx.stroke();
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
        const fly = Math.sin(t*2) * 10;
        ctx.fillStyle = '#f0f';
        ctx.beginPath();
        ctx.moveTo(0, -30 - h + fly - 20);
        ctx.lineTo(-10, -30 - h + fly);
        ctx.lineTo(10, -30 - h + fly);
        ctx.fill();
    }
}

function drawFoundry(ctx, t, tier) {
    ctx.fillStyle = '#322';
    ctx.fillRect(-60, -80, 120, 80);
    
    ctx.fillStyle = '#211';
    ctx.fillRect(20, -140, 20, 60);
    
    const pulse = Math.abs(Math.sin(t * 5));
    ctx.fillStyle = `rgba(255, ${100 + pulse * 50}, 0, 1)`;
    ctx.fillRect(-20, -40, 40, 40);
    
    if (tier >= 4) {
        ctx.fillStyle = '#211';
        ctx.fillRect(-40, -120, 20, 40);
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
