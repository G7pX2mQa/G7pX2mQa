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

export function startCanvasLoop(id, canvasEl) {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
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
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    const r = Math.floor(Math.sin(t * 0.5) * 10 + 10);
    const g = Math.floor(Math.sin(t * 0.7) * 20 + 30);
    const b = Math.floor(Math.sin(t * 0.3) * 30 + 60);
    
    grad.addColorStop(0, `rgb(${r}, ${g}, ${b})`);
    grad.addColorStop(1, '#000810');
    
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    
    ctx.fillStyle = 'rgba(5, 10, 20, 0.5)';
    ctx.beginPath();
    ctx.moveTo(0, h * 0.8);
    ctx.lineTo(w * 0.2, h * 0.6);
    ctx.lineTo(w * 0.4, h * 0.7);
    ctx.lineTo(w * 0.7, h * 0.4);
    ctx.lineTo(w, h * 0.6);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fill();
    
    const floorH = 160;

    ctx.fillStyle = "rgb(18, 12, 10)";
    ctx.beginPath();
    ctx.moveTo(0, h);
    let points0 = [0.15, 0.2, 0.1, 0.25, 0.15, 0.2];
    for(let j=0; j<=5; j++){
        ctx.lineTo((w/5)*j, h - floorH + (floorH * points0[j]));
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fill();

    ctx.fillStyle = "rgb(28, 20, 16)";
    ctx.beginPath();
    ctx.moveTo(0, h);
    let points1 = [0.35, 0.4, 0.3, 0.45, 0.35, 0.4];
    for(let j=0; j<=5; j++){
        ctx.lineTo((w/5)*j, h - floorH + (floorH * points1[j]));
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fill();

    ctx.fillStyle = "rgb(42, 30, 24)";
    ctx.beginPath();
    ctx.moveTo(0, h);
    let points2 = [0.55, 0.6, 0.5, 0.65, 0.55, 0.6];
    for(let j=0; j<=5; j++){
        ctx.lineTo((w/5)*j, h - floorH + (floorH * points2[j]));
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.fill();
    
    // draw crystals
    const colors = [
        {r: 0, g: 255, b: 255}, // Bright Cyan
        {r: 148, g: 0, b: 211}, // Deep Purple
        {r: 255, g: 20, b: 147}, // Deep Pink
        {r: 50, g: 205, b: 50}, // Lime Green
        {r: 255, g: 69, b: 0}, // Orange Red
        {r: 255, g: 215, b: 0} // Gold
    ];
    for (let i = 0; i < 8; i++) {
        let cx = (i * 80 + t * 10) % w;
        let cy = h - floorH + (floorH * 0.6) + (Math.sin(i + t*5) * 10);
        
        ctx.save();
        ctx.translate(cx, cy);
        const scale = 0.5 + (i % 3) * 0.2;
        ctx.scale(scale, scale);
        const rot = (i * 0.5);
        ctx.rotate(rot);
        
        const cIndex = i % colors.length;
        const baseColor = colors[cIndex];
        
        ctx.beginPath();
        ctx.moveTo(0, -15);
        ctx.lineTo(10, 0);
        ctx.lineTo(0, 15);
        ctx.lineTo(-10, 0);
        ctx.closePath();
        
        const grad = ctx.createLinearGradient(-10, -15, 10, 15);
        grad.addColorStop(0, `rgb(${Math.min(255, baseColor.r + 50)}, ${Math.min(255, baseColor.g + 50)}, ${Math.min(255, baseColor.b + 50)})`);
        grad.addColorStop(0.4, `rgb(${baseColor.r}, ${baseColor.g}, ${baseColor.b})`);
        grad.addColorStop(1, `rgb(${Math.max(0, baseColor.r - 50)}, ${Math.max(0, baseColor.g - 50)}, ${Math.max(0, baseColor.b - 50)})`);
        
        ctx.fillStyle = grad;
        ctx.fill();
        
        ctx.strokeStyle = `rgba(255, 255, 255, 0.4)`;
        ctx.lineWidth = 1;
        ctx.stroke();
        
        ctx.restore();
    }

    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
    for(let i = 0; i < 20; i++) {
        let bx = ((i * 37 + t * 20) % w);
        let by = h - ((i * 53 + t * 50) % h);
        let radius = (i % 5) + 2;
        ctx.beginPath();
        ctx.arc(bx, by, radius, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawBuilding(ctx, w, h, t, id, tier) {
    const floorY = h - 140;
    const cx = w / 2;
    
    ctx.save();
    ctx.translate(cx, floorY);
    
    const scale = 1.0 + (tier * 0.1);
    ctx.scale(scale, scale);
    
    const bounce = Math.sin(t * 2) * 5;
    ctx.translate(0, bounce);

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
