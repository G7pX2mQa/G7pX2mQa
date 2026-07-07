import { RESOURCE_REGISTRY } from "../game/offlinePanel.js";
import { levelBigNumToNumber } from "../game/upgrades.js";
import { playAudio } from "../util/audioManager.js";

let activeCanvas = null;
let activeCtx = null;
let animationFrameId = null;
let currentBuildingId = null;
let lastTime = 0;
let time = 0;

let currentLevelNum = 0;
let levelUpAnimTimes = {};
let tierUpAnimTime = 0;
let previousTier = 0;
let globalDiskAngle = 0; // Integrated angle for smooth accretion disk rotation
let globalPrismAngle = 0; // Integrated angle for smooth prism rotation
let globalRefineryAnimTime = 0; // Integrated time for smooth refinery animations
let globalRefineryPipeTime = 0;
let globalRefineryTankTime = 0;



let canvasResizeObserver = null;
let canvasIntersectionObserver = null;
let isCanvasIntersecting = false;

const TIERS = [10, 25, 50, 100, 200, 400, 800, 1000];

let wasRunningBeforeHide = false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (activeCanvas) {
      activeCanvas.style.display = 'none';
    }
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
      wasRunningBeforeHide = true;
    }
  } else {
    if (activeCanvas) {
      activeCanvas.style.display = '';
    }
    if (wasRunningBeforeHide && activeCanvas && activeCtx && isCanvasIntersecting) {
      lastTime = performance.now();
      loop(performance.now());
      wasRunningBeforeHide = false;
    }
  }
});

const imageCache = {};
let stonePattern = null;
let copperPattern = null;
let ironPattern = null;
let pureGoldPattern = null;

function getMaterialImage(matKey) {
  if (imageCache[matKey]) return imageCache[matKey];
  let actualKey = matKey;
  if (matKey === "core") actualKey = "cores";
  if (matKey === "crystal") actualKey = "crystals";
  const config = RESOURCE_REGISTRY.find((r) => r.key === actualKey);
  if (config && config.icon) {
    const img = new Image();
    img.src = config.icon;
    imageCache[matKey] = img;
    return img;
  }
  return null;
}

function initPureGoldPattern(ctx) {
  if (pureGoldPattern) return;

  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = 64;
  patternCanvas.height = 64;
  const pCtx = patternCanvas.getContext("2d");

  pCtx.fillStyle = "#f0c94c";
  pCtx.fillRect(0, 0, 64, 64);

  const imgData = pCtx.getImageData(0, 0, 64, 64);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 30; // Subtle hammered texture
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise * 0.9));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise * 0.5));
  }
  pCtx.putImageData(imgData, 0, 0);

  const targetCtx = activeCtx || ctx;
  if (targetCtx) {
    try {
      pureGoldPattern = targetCtx.createPattern(patternCanvas, "repeat");
    } catch (e) {
      console.error("Failed to create pure gold pattern", e);
    }
  }
}

function initCopperPattern(ctx) {
  if (copperPattern) return;

  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = 64;
  patternCanvas.height = 64;
  const pCtx = patternCanvas.getContext("2d");

  pCtx.fillStyle = "#c0744b";
  pCtx.fillRect(0, 0, 64, 64);

  const imgData = pCtx.getImageData(0, 0, 64, 64);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * 40;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise * 0.8));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise * 0.6));
  }
  pCtx.putImageData(imgData, 0, 0);

  const targetCtx = activeCtx || ctx;
  if (targetCtx) {
    try {
      copperPattern = targetCtx.createPattern(patternCanvas, "repeat");
    } catch (e) {
      console.error("Failed to create copper pattern", e);
    }
  }
}

function initStonePattern(ctx) {
  if (stonePattern) return;

  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = 64;
  patternCanvas.height = 64;
  const pCtx = patternCanvas.getContext("2d");

  // Base color darker to match user feedback and image analysis (#83817c)
  pCtx.fillStyle = "#83817c";
  pCtx.fillRect(0, 0, 64, 64);

  const imgData = pCtx.getImageData(0, 0, 64, 64);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    // Range based on std_dev of ~18
    const noise = (Math.random() - 0.5) * 36;
    data[i] = Math.max(0, Math.min(255, data[i] + noise));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
  }
  pCtx.putImageData(imgData, 0, 0);

  const targetCtx = activeCtx || ctx;
  if (targetCtx) {
    try {
      stonePattern = targetCtx.createPattern(patternCanvas, "repeat");
    } catch (e) {
      console.error("Failed to create stone pattern", e);
    }
  }
}

function initIronPattern(ctx) {
  if (ironPattern) return;

  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = 64;
  patternCanvas.height = 64;
  const pCtx = patternCanvas.getContext("2d");

  pCtx.fillStyle = "#ced2d6";
  pCtx.fillRect(0, 0, 64, 64);

  const imgData = pCtx.getImageData(0, 0, 64, 64);
  const data = imgData.data;

  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4;
      const diag = (x + y) % 4;
      let noise = (Math.random() - 0.5) * 20;
      if (diag === 0) noise -= 10;
      else if (diag === 2) noise += 10;

      data[i] = Math.max(0, Math.min(255, data[i] + noise));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    }
  }
  pCtx.putImageData(imgData, 0, 0);

  const targetCtx = activeCtx || ctx;
  if (targetCtx) {
    try {
      ironPattern = targetCtx.createPattern(patternCanvas, "repeat");
    } catch (e) {
      console.error("Failed to create iron pattern", e);
    }
  }
}

export function startCanvasLoop(id, canvasEl) {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  window.currentCavernLayout = null;
  activeCanvas = canvasEl;
  activeCtx = canvasEl.getContext("2d");
  currentBuildingId = id;
  lastTime = performance.now();

  initStonePattern(activeCtx);
  if (!pureGoldPattern) {
    initPureGoldPattern(activeCtx);
  }

  if (canvasResizeObserver) {
    canvasResizeObserver.disconnect();
  }
  canvasResizeObserver = new ResizeObserver(() => {
    if (!activeCanvas) return;
    const rect = activeCanvas.parentElement.getBoundingClientRect();
    activeCanvas.width = rect.width;
    activeCanvas.height = rect.height;
  });
  canvasResizeObserver.observe(activeCanvas.parentElement);

  if (canvasIntersectionObserver) {
    canvasIntersectionObserver.disconnect();
  }
  if (typeof IntersectionObserver !== 'undefined') {
    canvasIntersectionObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        isCanvasIntersecting = entry.isIntersecting;
        if (isCanvasIntersecting) {
          if (!document.hidden && !animationFrameId && activeCanvas && activeCtx) {
            lastTime = performance.now();
            loop(performance.now());
          }
        } else {
          if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
            wasRunningBeforeHide = true;
          }
        }
      });
    });
    canvasIntersectionObserver.observe(activeCanvas);
  } else {
    isCanvasIntersecting = true;
  }

  const rect = activeCanvas.parentElement.getBoundingClientRect();
  activeCanvas.width = rect.width;
  activeCanvas.height = rect.height;

  // Using import for ES modules instead of require for local scope
  import("../ui/minerTabs/buildingsTab.js")
    .then((module) => {
      try {
        currentLevelNum = levelBigNumToNumber(module.getBuildingLevel(id));
        let currentTier = getTier();
        previousTier = currentTier;
        tierUpAnimTime = 0;
      } catch {
        currentLevelNum = 1;
      }
    })
    .catch(() => {
      currentLevelNum = 1;
    });

  if (document.hidden || !isCanvasIntersecting) {
    if (activeCanvas && document.hidden) {
      activeCanvas.style.display = 'none';
    }
    wasRunningBeforeHide = true;
  } else {
    if (activeCanvas) {
      activeCanvas.style.display = '';
    }
	loop(performance.now());
  }
}

export function stopCanvasLoop() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (canvasResizeObserver) {
    canvasResizeObserver.disconnect();
    canvasResizeObserver = null;
  }
  if (canvasIntersectionObserver) {
    canvasIntersectionObserver.disconnect();
    canvasIntersectionObserver = null;
  }
  wasRunningBeforeHide = false;
  activeCanvas = null;
  activeCtx = null;
  currentBuildingId = null;
  tierUpAnimTime = 0;
}

export function triggerLevelUpAnimation(id) {
  levelUpAnimTimes[id] = 1.0;
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
      playAudio("sounds/building_tier_up.ogg");
    }
  }
}

function loop(currentTime) {
  if (!activeCanvas) return;
  const dt = (currentTime - lastTime) / 1000;
  lastTime = currentTime;
  time += dt;

  for (const id in levelUpAnimTimes) {
    if (levelUpAnimTimes[id] > 0) {
      levelUpAnimTimes[id] -= dt;
    }
  }
  if (tierUpAnimTime > 0) tierUpAnimTime -= dt;

  // Smoothly integrate global disk angle
  // We calculate the speed multiplier here if it's the core building
  let diskSpeedMult = 1.0;
  if (currentBuildingId === "core") {
    let currentTier = getTier();
    let drawTier = currentTier;
    let animProgress = 1.0;
    if (tierUpAnimTime > 0) {
      animProgress =
        tierUpAnimTime > 2.5 ? 1.0 - (tierUpAnimTime - 2.5) / 3.5 : 1.0;
      drawTier = currentTier;
    }
    const tier8Prog =
      drawTier >= 8 && previousTier < 8 ? animProgress : drawTier >= 8 ? 1 : 0;
    diskSpeedMult = 1.0 + 2.0 * tier8Prog;
  }
  globalDiskAngle += dt * diskSpeedMult;

  let prismSpeedMult = 1.0;
  if (currentBuildingId === "crystal") {
    let currentTier = getTier();
    let drawTier = currentTier;
    let animProgress = 1.0;
    if (tierUpAnimTime > 0) {
      animProgress =
        tierUpAnimTime > 2.5 ? 1.0 - (tierUpAnimTime - 2.5) / 3.5 : 1.0;
      drawTier = currentTier;
    }
    const showTier3 = drawTier >= 3 ? 1 : 0;
    const tier3Prog =
      drawTier >= 3 && previousTier < 3 ? animProgress : showTier3;
    prismSpeedMult = 0.4 + 0.6 * tier3Prog;
    globalPrismAngle += dt * prismSpeedMult;
  }

  let refinerySpeedMult = 1.0;
  let refineryPipeSpeedMult = 1.0;
  let refineryTankSpeedMult = 1.0;
  if (currentBuildingId === "iron") {
    let currentTier = getTier();
    let drawTier = currentTier;
    let animProgress = 1.0;
    if (tierUpAnimTime > 0) {
      animProgress =
        tierUpAnimTime > 2.5 ? 1.0 - (tierUpAnimTime - 2.5) / 3.5 : 1.0;
      drawTier = currentTier;
    }
    const tier8Prog =
      drawTier >= 8 && previousTier < 8 ? animProgress : drawTier >= 8 ? 1 : 0;
    
    refinerySpeedMult = 1.0 + tier8Prog * 2.0; 

    refineryPipeSpeedMult = 1.0 + tier8Prog * 9.0;
    
    refineryTankSpeedMult = 1.0 + tier8Prog * 7.0;
  }
  globalRefineryAnimTime += dt * refinerySpeedMult;
  globalRefineryPipeTime += dt * refineryPipeSpeedMult;
  globalRefineryTankTime += dt * refineryTankSpeedMult;


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
  return t; // 0 to 8
}

function draw(ctx, width, height, t) {
  ctx.clearRect(0, 0, width, height);

  ctx.save();
  let shakeAlpha = 0;
  if (tierUpAnimTime > 0) {
    shakeAlpha =
      tierUpAnimTime > 2.5
        ? (6.0 - tierUpAnimTime) / 3.5
        : tierUpAnimTime / 2.5;
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
      animProgress =
        tierUpAnimTime > 2.5 ? 1.0 - (tierUpAnimTime - 2.5) / 3.5 : 1.0;
      drawTier = currentTier;
    }
    drawBuilding(
      ctx,
      width,
      height,
      t,
      currentBuildingId,
      drawTier,
      previousTier,
      animProgress,
    );
  }
  ctx.restore();
  const currentBuildingFlashAlpha = levelUpAnimTimes[currentBuildingId] || 0;
  if (currentBuildingFlashAlpha > 0) {
    const alpha = Math.max(0, currentBuildingFlashAlpha);
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
        gemType: Math.floor(Math.random() * 20), // 20 cached gemstone combinations
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
        if (!tooClose) {
          valid = true;
          break;
        }
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
        rightPath: rightPath,
      });
    }

    const cracks = [];
    const cols = 15;
    const rows = 12;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (Math.random() > 0.1) {
          // 90% chance to have a crack in this cell, smaller cells -> more cracks
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
  grad.addColorStop(0, "#2e1c11");
  grad.addColorStop(1, "#1a0d05");

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Draw cracky crumbly background details
  ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
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
    const tipX = sx + Math.sin(st.dropPhase) * 10;

    const stalactiteGrad = ctx.createLinearGradient(sx, 0, sx, st.length);
    stalactiteGrad.addColorStop(0, "#1c100a");
    stalactiteGrad.addColorStop(1, "#402618");
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
    if (dropT < 1) {
      // Falling phase
      const dropY = st.length + dropT * (h - st.length);
      ctx.fillStyle = "rgba(100, 200, 255, 0.4)";
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
    { r: 0, g: 255, b: 255 }, // Bright Cyan
    { r: 148, g: 0, b: 211 }, // Deep Purple
    { r: 235, g: 30, b: 50 }, // Red (Ruby)
    { r: 40, g: 220, b: 100 }, // Green (Emerald)
  ];

  if (!window.cachedGemstones) {
    window.cachedGemstones = [];
    for (let i = 0; i < 20; i++) {
      const sharedColor = colors[i % colors.length];
      const clusters = [];
      const numPieces = 3 + Math.floor(Math.abs(Math.sin(i * 123.45)) * 3);
      for (let p = 0; p < numPieces; p++) {
        const pSize = 4 + Math.abs(Math.sin(p * 456.78)) * 6;
        const numVertices = 4 + Math.floor(Math.abs(Math.cos(p * 789.01)) * 4);
        const facets = [];
        for (let v = 0; v < numVertices; v++) {
          const angle = (v / numVertices) * Math.PI * 2;
          const rad = pSize * (0.6 + Math.abs(Math.sin(v * 12.34)) * 0.6);
          const shade = 0.6 + Math.abs(Math.cos(v * 56.78)) * 0.6;
          facets.push({
            dx: Math.cos(angle) * rad,
            dy: Math.sin(angle) * rad,
            shade,
          });
        }
        clusters.push({
          ox: (Math.abs(Math.sin(p * 90.12)) - 0.5) * 10,
          oy: (Math.abs(Math.cos(p * 34.56)) - 0.5) * 10,
          facets,
          size: pSize,
        });
      }

      let cachedImage;
      if (typeof OffscreenCanvas !== "undefined") {
        cachedImage = new OffscreenCanvas(40, 40);
      } else {
        cachedImage = document.createElement("canvas");
        cachedImage.width = 40;
        cachedImage.height = 40;
      }
      const octx = cachedImage.getContext("2d");
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
    let cy = h - floorH * 0.7 + floorH * 0.6 * gem.yFrac;

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

  const targetScale = 1.0 + tier * 0.1;
  const startScale = 1.0 + prevTier * 0.1;
  const scale = startScale + (targetScale - startScale) * animProgress;
  ctx.scale(scale, scale);

  let bounce = 0;

  let topY = 0;
  if (id === "core") topY = -200;
  else if (id === "crystal") topY = -(100 + tier * 10) - 30;
  else if (id === "stone") topY = -140;
  else if (id === "copper") topY = -90;
  else if (id === "iron") topY = -100;
  else if (id === "pure_gold") topY = -60;
  else if (id === "diamond") topY = -120;
  else if (id === "emerald") topY = -130;
  else if (id === "ruby") topY = -100;
  else if (id === "sapphire") topY = -80;
  else if (id === "unobtainium") topY = -160;
  else if (id === "prismatium") topY = -150;
  else topY = -100;

  // Scale the topY
  let finalHighestY = floorY + topY * scale;

  ctx.save();
  const glowRadius = Math.abs(topY) * 0.8 + 40;
  const glowGrad = ctx.createRadialGradient(
    0,
    topY / 2,
    0,
    0,
    topY / 2,
    glowRadius,
  );
  glowGrad.addColorStop(0, "rgba(255, 255, 255, 0.15)");
  glowGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(0, topY / 2, glowRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (id === "core") drawBlackHole(ctx, t, tier, prevTier, animProgress);
  else if (id === "crystal") drawPrism(ctx, t, tier, prevTier, animProgress);
  else if (id === "stone") drawFoundry(ctx, t, tier, prevTier, animProgress);
  else if (id === "copper") drawCharger(ctx, t, tier, prevTier, animProgress);
  else if (id === "iron") drawRefinery(ctx, { base: globalRefineryAnimTime, pipe: globalRefineryPipeTime, tank: globalRefineryTankTime }, tier, prevTier, animProgress);
  else if (id === "pure_gold") drawVault(ctx, t, tier, prevTier, animProgress);
  else if (id === "diamond") drawOilRig(ctx, t, tier);
  else if (id === "emerald") drawGreenhouse(ctx, t, tier);
  else if (id === "ruby") drawRadiator(ctx, t, tier);
  else if (id === "sapphire") drawCentrifuge(ctx, t, tier);
  else if (id === "unobtainium") drawBeacon(ctx, t, tier);
  else if (id === "prismatium") drawSingularity(ctx, t, tier);

  ctx.restore();

  // Update HTML element position
  const levelText = document.getElementById("building-detail-level-text");
  if (levelText) {
    const getOffset = (bId, bTier) => {
      if (bId === "core") return 150 - bTier * 2;
      if (bId === "crystal") return 180 - bTier * 8;
      if (bId === "copper") return 180 + bTier * 8;
      if (bId === "iron") return 220;
      if (bId === "pure_gold") return 250 + bTier * 8 + (bTier >= 4 ? 25 : 0);
      return 180;
    };

    const targetOffset = getOffset(id, tier);
    const startOffset =
      prevTier >= 0 ? getOffset(id, prevTier) : getOffset(id, 0);
    const offset = startOffset + (targetOffset - startOffset) * animProgress;

    levelText.style.position = "absolute";
    // Calculate top offset based on parent container offset (which might be causing the drift)
    // Adjust for padding or margins of the container
    levelText.style.top = Math.max(50, finalHighestY - offset) + "px"; // Magic number offset to fix clipping
    levelText.style.left = "0";
    levelText.style.width = "100%";

    let shakeAlphaText = 0;
    if (tierUpAnimTime > 0) {
      shakeAlphaText =
        tierUpAnimTime > 2.5
          ? (6.0 - tierUpAnimTime) / 3.5
          : tierUpAnimTime / 2.5;
    }
    levelText.style.opacity = Math.max(0, 1 - shakeAlphaText);
  }
}

// ----------------- Building Drawing Routines ----------------- //

function drawBlackHole(ctx, t, tier, prevTier, animProgress) {
  const cx = 0;
  const cy = -80; // Main vertical center of the black hole

  const showTier0 = 1;
  const tier0Prog = tier >= 0 && prevTier < 0 ? animProgress : showTier0;
  const showTier1 = tier >= 1 ? 1 : 0;
  const tier1Prog = tier >= 1 && prevTier < 1 ? animProgress : showTier1;
  const showTier2 = tier >= 2 ? 1 : 0;
  const tier2Prog = tier >= 2 && prevTier < 2 ? animProgress : showTier2;
  const showTier3 = tier >= 3 ? 1 : 0;
  const tier3Prog = tier >= 3 && prevTier < 3 ? animProgress : showTier3;
  const showTier4 = tier >= 4 ? 1 : 0;
  const tier4Prog = tier >= 4 && prevTier < 4 ? animProgress : showTier4;
  const showTier5 = tier >= 5 ? 1 : 0;
  const tier5Prog = tier >= 5 && prevTier < 5 ? animProgress : showTier5;
  const showTier6 = tier >= 6 ? 1 : 0;
  const tier6Prog = tier >= 6 && prevTier < 6 ? animProgress : showTier6;
  const showTier7 = tier >= 7 ? 1 : 0;
  const tier7Prog = tier >= 7 && prevTier < 7 ? animProgress : showTier7;
  const showTier8 = tier >= 8 ? 1 : 0;
  const tier8Prog = tier >= 8 && prevTier < 8 ? animProgress : showTier8;

  const baseRadius = 8;
  let finalRadius = baseRadius;
  if (tier >= 1) finalRadius += 10 * tier1Prog;
  if (tier >= 2) finalRadius += 10 * tier2Prog;

  if (tier5Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier5Prog;

    const coronaRadius = 100 + 30 * tier8Prog;
    const coronaT = t * 0.5;

    ctx.translate(cx, cy);
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate(coronaT + (i * Math.PI) / 2);
      ctx.scale(1, 0.8 + 0.2 * Math.sin(t * 2 + i));

      const mistGrad = ctx.createRadialGradient(0, 0, 20, 0, 0, coronaRadius);
      mistGrad.addColorStop(0, "rgba(30, 10, 50, 0.8)");
      mistGrad.addColorStop(0.5, "rgba(50, 20, 80, 0.4)");
      mistGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

      ctx.fillStyle = mistGrad;
      ctx.beginPath();
      ctx.arc(0, 0, coronaRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
  // Tier 4: Pseudo-3D Accretion Disk Particle System (was Tier 5)
  // Front/Back calculated here. Much more intense at Tier 8.
  const diskOuterRadius = 120 + 40 * tier8Prog;
  const diskInnerRadius = 35;
  const numParticles = 300 + Math.floor(600 * tier8Prog);

  const getParticle = (i) => {
    const hash1 = Math.abs(Math.sin(i * 123.456));
    const hash2 = Math.abs(Math.cos(i * 987.654));
    const hash3 = Math.abs(Math.sin(i * 345.678));

    const radius =
      diskInnerRadius +
      (diskOuterRadius - diskInnerRadius) * Math.pow(hash1, 1.5);

    const normalizedR =
      (radius - diskInnerRadius) / (diskOuterRadius - diskInnerRadius);

    // speed depends on distance, integrated using globalDiskAngle to avoid jumps
    const baseSpeed = 1.0 + (1.0 - normalizedR) * 2.0;

    const baseAngle = hash2 * Math.PI * 2;
    const angle = baseAngle + globalDiskAngle * baseSpeed;

    const rawX = Math.cos(angle) * radius;
    const rawY = Math.sin(angle) * radius;

    const tilt = 0.25;
    const angleRot = Math.PI / 8;

    const flatX = rawX;
    const flatY = rawY * tilt;

    const finalX = flatX * Math.cos(angleRot) - flatY * Math.sin(angleRot);
    const finalY = flatX * Math.sin(angleRot) + flatY * Math.cos(angleRot);

    let color;
    if (normalizedR < 0.1) color = "rgba(255, 255, 255, 1.0)";
    else if (normalizedR < 0.4)
      color = `rgba(255, ${150 + hash3 * 50}, 50, 0.9)`;
    else color = `rgba(200, 50, 0, ${0.8 - normalizedR * 0.6})`;

    const sizeMultiplier = 1.0 + 1.0 * tier8Prog;
    const size = (1.5 + hash3 * 2) * sizeMultiplier;

    const isBack = Math.sin(angle) < 0;

    return { x: cx + finalX, y: cy + finalY, color, size, isBack };
  };

  if (tier4Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier4Prog;
    for (let i = 0; i < numParticles; i++) {
      const p = getParticle(i);
      if (p.isBack) {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  if (tier1Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier1Prog;

    // Base speed a lot faster
    const rotationSpeed = 3.0 + tier * 0.5 + (tier >= 8 ? 4.0 : 0);
    const startAngle = t * rotationSpeed;

    const grad = ctx.createConicGradient(startAngle, cx, cy);
    grad.addColorStop(0, "rgb(200, 50, 0)"); // Deep orange
    grad.addColorStop(0.33, "rgb(255, 100, 0)"); // Orange
    grad.addColorStop(0.66, "rgb(255, 160, 0)"); // Light orange
    grad.addColorStop(1, "rgb(200, 50, 0)"); // Deep orange

    ctx.beginPath();
    ctx.arc(cx, cy, finalRadius + 2, 0, Math.PI * 2);
    ctx.lineWidth = 6;
    ctx.strokeStyle = grad;
    ctx.shadowBlur = 15;
    ctx.shadowColor = "rgba(255, 100, 0, 0.8)";
    ctx.stroke();

    ctx.restore();
  }

  // Tier 6: Orbiting Stars (Spaghettification)
  if (tier6Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier6Prog;
    ctx.translate(cx, cy);

    const numStars = 3;
    for (let i = 0; i < numStars; i++) {
      // cycle goes from 0.0 (far away) to 1.0 (entering event horizon)
      const cycleT = (t * 0.3 + i * (1.0 / numStars)) % 1.0;

      const startDist = finalRadius + 150;
      const currentDist = startDist * (1.0 - cycleT) + finalRadius * cycleT;

      // Faster orbit as it gets closer
      const angle = (i * Math.PI * 2) / numStars + t * 10.0;

      const x = Math.cos(angle) * currentDist;
      const y = Math.sin(angle) * currentDist * 0.3; // Accretion disk perspective

      // Fade in at start, fade out at end
      let alpha = 1.0;
      if (cycleT < 0.1) alpha = cycleT / 0.1;
      else if (cycleT > 0.9) alpha = (1.0 - cycleT) / 0.1;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle + Math.PI / 2); // Point trail along orbit path

      // "Spaghettify" stretch as it gets close
      const stretch = 1.0 + Math.pow(cycleT, 3) * 10.0;
      ctx.scale(1.0 / Math.sqrt(stretch), stretch);

      // Draw star core
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();

      // Draw star glow/trail
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 15);
      grad.addColorStop(0, `rgba(150, 200, 255, ${alpha * 0.8})`);
      grad.addColorStop(1, `rgba(50, 100, 255, 0)`);

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Draw a trailing streak behind the star
      ctx.strokeStyle = `rgba(100, 150, 255, ${alpha * 0.5})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let j = 0; j < 10; j++) {
        const trailCycleT = Math.max(0, cycleT - j * 0.01);
        const trailDist =
          startDist * (1.0 - trailCycleT) + finalRadius * trailCycleT;
        const trailAngle = (i * Math.PI * 2) / numStars + (t - j * 0.03) * 10.0;

        const tx = Math.cos(trailAngle) * trailDist;
        const ty = Math.sin(trailAngle) * trailDist * 0.3;

        if (j === 0) ctx.moveTo(tx, ty);
        else ctx.lineTo(tx, ty);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  // Tier 7: Angled, pulsating beam (was Tier 8, Underneath the black hole body, above photon ring)
  if (tier7Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier7Prog;

    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 4); // Angled to the right

    const beamW = 20 + 10 * Math.abs(Math.sin(t * 12));
    const beamHeight = 600; // Extends way past viewport

    // Intense purple/white beam gradient
    const beamGrad = ctx.createLinearGradient(-beamW / 2, 0, beamW / 2, 0);
    beamGrad.addColorStop(0, `rgba(138, 43, 226, 0)`);
    beamGrad.addColorStop(0.2, `rgba(180, 80, 255, ${0.8 * tier7Prog})`);
    beamGrad.addColorStop(0.5, `rgba(255, 255, 255, ${1.0 * tier7Prog})`);
    beamGrad.addColorStop(0.8, `rgba(180, 80, 255, ${0.8 * tier7Prog})`);
    beamGrad.addColorStop(1, `rgba(138, 43, 226, 0)`);

    ctx.fillStyle = beamGrad;
    // The beam goes straight through (top to bottom)
    ctx.fillRect(-beamW / 2, -beamHeight, beamW, beamHeight * 2);

    // Extra intense core line
    ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + 0.5 * Math.sin(t * 20)})`;
    const coreWidth = 4 + 2 * Math.abs(Math.sin(t * 12));
    ctx.fillRect(-coreWidth / 2, -beamHeight, coreWidth, beamHeight * 2);

    ctx.restore();
  }

  // Tier 2: Debris being sucked in (Back half)
  if (tier2Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier2Prog;
    ctx.translate(cx, cy);

    const numDebris = 15;
    for (let i = 0; i < numDebris; i++) {
      const debrisT = (t * 0.5 + i * (1.0 / numDebris)) % 1.0; // 0 to 1 cycle of falling in
      const startDist = finalRadius + 100;
      const currentDist = startDist * (1.0 - debrisT);

      // Spiral angle
      const angle = (i * Math.PI * 2) / numDebris + debrisT * Math.PI * 4;

      if (Math.sin(angle) <= 0 && currentDist > finalRadius) {
        // Back half
        const size = 1.5 + Math.sin(i * 123) * 1.0;
        const x = Math.cos(angle) * currentDist;
        // Squish y to fit the disk perspective
        const y = Math.sin(angle) * currentDist * 0.3;

        const alpha =
          Math.min(1.0, (startDist - currentDist) / 20) *
          Math.min(1.0, (currentDist - finalRadius) / 10);

        ctx.fillStyle = `rgba(180, 180, 180, ${alpha * 0.5})`; // Dimmer in back
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // The pure black hole body
  ctx.beginPath();
  ctx.arc(cx, cy, finalRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#000000";
  ctx.fill();

  // Tier 2: Debris being sucked in (Front half)
  if (tier2Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier2Prog;
    ctx.translate(cx, cy);

    const numDebris = 15;
    for (let i = 0; i < numDebris; i++) {
      const debrisT = (t * 0.5 + i * (1.0 / numDebris)) % 1.0;
      const startDist = finalRadius + 100;
      const currentDist = startDist * (1.0 - debrisT);

      const angle = (i * Math.PI * 2) / numDebris + debrisT * Math.PI * 4;

      if (Math.sin(angle) > 0 && currentDist > finalRadius) {
        // Front half
        const size = 1.5 + Math.sin(i * 123) * 1.0;
        const x = Math.cos(angle) * currentDist;
        const y = Math.sin(angle) * currentDist * 0.3;

        // Fade out as it crosses the event horizon or starts
        const alpha =
          Math.min(1.0, (startDist - currentDist) / 20) *
          Math.min(1.0, (currentDist - finalRadius) / 10);

        // Brighter in front
        const heat = Math.max(0, 1.0 - (currentDist - finalRadius) / 30); // Heats up as it gets closer
        const r = 180 + heat * 75;
        const g = 180 - heat * 80;
        const b = 180 - heat * 130;

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();

        if (heat > 0.5) {
          ctx.shadowBlur = heat * 10;
          ctx.shadowColor = `rgba(255, 100, 50, ${heat})`;
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  // Tier 3: Gravitational Lensing / Photon Ring
  if (tier3Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier3Prog;
    ctx.translate(cx, cy);

    const lensingRadius = finalRadius * 1.2;
    const lensingThickness = 15;

    // Draw multiple overlapping rings for the lensing effect
    for (let i = 0; i < 3; i++) {
      ctx.save();
      // Counter-rotating rings with different speeds
      const spinDirection = i % 2 === 0 ? 1 : -1;
      ctx.rotate(t * (0.2 + i * 0.1) * spinDirection);

      // Slight elliptical distortion
      ctx.scale(
        1 + 0.05 * Math.sin(t * 1.5 + i),
        1 - 0.05 * Math.sin(t * 1.5 + i),
      );

      const gradient = ctx.createRadialGradient(
        0,
        0,
        finalRadius,
        0,
        0,
        lensingRadius + lensingThickness,
      );

      // Subtle, shifting colors for light bending
      const alpha1 = 0.4 + 0.2 * Math.sin(t * 2 + i * Math.PI);
      const alpha2 = 0.1 + 0.1 * Math.cos(t * 3 + i);

      gradient.addColorStop(0, `rgba(255, 255, 255, 0)`);
      gradient.addColorStop(0.3, `rgba(200, 220, 255, ${alpha1})`);
      gradient.addColorStop(0.7, `rgba(150, 100, 255, ${alpha2})`);
      gradient.addColorStop(1, `rgba(100, 50, 200, 0)`);

      ctx.beginPath();
      ctx.arc(0, 0, lensingRadius + lensingThickness, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.restore();
    }

    // Add a thin, intense photon ring right near the event horizon
    ctx.beginPath();
    ctx.arc(0, 0, finalRadius * 1.05, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 + 0.3 * Math.sin(t * 5)})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }

  // Tier 4: Pseudo-3D Accretion Disk (Front Half)
  if (tier4Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier4Prog;
    for (let i = 0; i < numParticles; i++) {
      const p = getParticle(i);
      if (!p.isBack) {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

function drawPrism(ctx, t, tier, prevTier, animProgress) {
  const showTier1 = tier >= 1 ? 1 : 0;
  const tier1Prog = tier >= 1 && prevTier < 1 ? animProgress : showTier1;
  const showTier2 = tier >= 2 ? 1 : 0;
  const tier2Prog = tier >= 2 && prevTier < 2 ? animProgress : showTier2;
  const showTier3 = tier >= 3 ? 1 : 0;
  const tier3Prog = tier >= 3 && prevTier < 3 ? animProgress : showTier3;
  const showTier4 = tier >= 4 ? 1 : 0;
  const tier4Prog = tier >= 4 && prevTier < 4 ? animProgress : showTier4;
  const showTier5 = tier >= 5 ? 1 : 0;
  const tier5Prog = tier >= 5 && prevTier < 5 ? animProgress : showTier5;
  const showTier6 = tier >= 6 ? 1 : 0;
  const tier6Prog = tier >= 6 && prevTier < 6 ? animProgress : showTier6;
  const showTier7 = tier >= 7 ? 1 : 0;
  const tier7Prog = tier >= 7 && prevTier < 7 ? animProgress : showTier7;
  const showTier8 = tier >= 8 ? 1 : 0;
  const tier8Prog = tier >= 8 && prevTier < 8 ? animProgress : showTier8;

  // --- Hex to RGB helper ---
  const hexToRgbStr = (hex) => {
    const bigint = parseInt(hex.slice(1), 16);
    return `${(bigint >> 16) & 255}, ${(bigint >> 8) & 255}, ${bigint & 255}`;
  };

  // --- Base Pedestal ---
  // Removed base pedestal for all tiers. The Prism just floats.
  // Hover logic
  const hoverY = -25 - 25 + Math.sin(t * 1) * 5;

  // --- 3D Projection Engine ---
  const rotY = globalPrismAngle;
  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);

  // Slight isometric tilt (rotate X)
  const rotX = 0.3; // tilt down
  const cosX = Math.cos(rotX);
  const sinX = Math.sin(rotX);

  function getRotated(x, y, z) {
    // Rotate around Y axis
    const nx = x * cosY - z * sinY;
    const nz = x * sinY + z * cosY;
    return { x: nx, y: y, z: nz };
  }

  function projectRotated(rx, ry, rz) {
    // Apply rotX
    const ny = ry * cosX - rz * sinX;
    const nnz = ry * sinX + rz * cosX;

    // Perspective
    const fov = 300;
    const scale = fov / (fov + nnz + 100);
    return { x: rx * scale, y: hoverY + ny * scale, z: nnz, scale };
  }

  function getNormal(p0, p1, p2) {
    // Cross product of (p1 - p0) and (p2 - p0)
    const v1x = p1.x - p0.x;
    const v1y = p1.y - p0.y;
    const v1z = p1.z - p0.z;
    const v2x = p2.x - p0.x;
    const v2y = p2.y - p0.y;
    const v2z = p2.z - p0.z;

    const nx = v1y * v2z - v1z * v2y;
    const ny = v1z * v2x - v1x * v2z;
    const nz = v1x * v2y - v1y * v2x;

    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len === 0) return { x: 0, y: 0, z: 1 };
    return { x: nx / len, y: ny / len, z: nz / len };
  }

  function getLightIntensity(normal) {
    // Light intensity is fixed so all sides have the same lighting
    // regardless of the direction they are facing.
    return 1.0;
  }

  // Prism geometry (standing on rectangular face)
  const targetSizeMult = 1.25 + tier * 0.125;
  const prevSizeMult = 1.25 + prevTier * 0.125;
  const sizeMult =
    prevSizeMult + (targetSizeMult - prevSizeMult) * animProgress;
  let ipts = null,
    ifaces = null,
    irotPts = null;
  const w = 30 * sizeMult; // base half-width
  const h = 50 * sizeMult; // height (from bottom to peak)
  const d = 25 * sizeMult; // half-depth

  const vertices = [
    { x: -w, y: 0, z: -d },
    { x: w, y: 0, z: -d },
    { x: 0, y: -h, z: -d },
    { x: -w, y: 0, z: d },
    { x: w, y: 0, z: d },
    { x: 0, y: -h, z: d },
  ];

  const rotPts = vertices.map((v) => getRotated(v.x, v.y, v.z));
  const pts = rotPts.map((rp) => projectRotated(rp.x, rp.y, rp.z));

  function project(x, y, z) {
    const rp = getRotated(x, y, z);
    return projectRotated(rp.x, rp.y, rp.z);
  }

  // Tier 5 Orbiting Crystals helper function
  const drawTier5Shards = (isFront) => {
    if (tier5Prog <= 0) return;
    ctx.save();
    ctx.globalAlpha = tier5Prog;

    const numShards = 6;
    const orbitRadius = 70 + tier6Prog * 20;

    for (let i = 0; i < numShards; i++) {
      const orbitRot = t * 1.5 + (i * Math.PI * 2) / numShards;
      const sx = Math.cos(orbitRot) * orbitRadius;
      const sz = Math.sin(orbitRot) * orbitRadius;

      // Determine if this shard is front or back based on its Z position
      // For getRotated, since it rotates around Y, the final Z determines depth.
      const rp = getRotated(sx, 0, sz);
      const isShardFront = rp.z <= 0;

      if (isFront !== isShardFront) continue;

      const sy = -h / 2;
      const sp = project(sx, sy, sz);

      // Draw shard
      ctx.save();
      ctx.translate(sp.x, sp.y);

      ctx.fillStyle = "rgba(220, 100, 255, 0.8)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
      ctx.lineWidth = 1;

      const size = 12 * sp.scale;
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(-size * 0.6, 0);
      ctx.lineTo(0, size);
      ctx.lineTo(size * 0.6, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  };

  // --- Tier 8/4 Rainbow Beam Calculations ---
  // If we draw beams *behind* the prism, we should do it before drawing faces.
  // We will draw all beams with globalCompositeOperation = 'screen' or 'lighter' later, but Z-order matters if it's solid.
  // For glassy light effects, drawing on top is usually fine.

  // Tier 3: Energy vortex swirling below the prism
  if (tier3Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier3Prog;
    ctx.globalCompositeOperation = "lighter";

    const vortexY = hoverY + 20 - tier * 2; // Shift upward slightly as tier increases to prevent ground clipping

    for (let i = 0; i < 3; i++) {
      const ringScale = 1.0 + Math.sin(t * 2 + i * 2) * 0.2;
      const ringRot = t * (1.5 + i * 0.5);
      ctx.save();
      ctx.translate(0, vortexY);
      // Squish to fake 3D perspective
      ctx.scale(1, 0.3);
      ctx.rotate(ringRot);

      ctx.beginPath();
      ctx.arc(0, 0, w * 1.5 * ringScale, 0, Math.PI * 2);
      ctx.lineWidth = 3 - i;
      ctx.strokeStyle = `rgba(200, 80, 220, ${0.4 + 0.2 * Math.sin(t * 4 + i)})`;
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  // --- Tier 8/4 Rainbow Beam (drawn under prism faces) ---
  if (tier4Prog > 0 && tier8Prog < 1) {
    ctx.save();
    ctx.globalAlpha = tier4Prog * (1 - tier8Prog);
    ctx.globalCompositeOperation = "lighter";

    ctx.restore();
  }

  if (tier8Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier8Prog;
    ctx.globalCompositeOperation = "lighter";

    ctx.restore();
  }

  // Ensure center is calculated early so we can draw the beams
  const center = project(0, -h / 2, 0);

  // --- Tier 8/4 Rainbow Beam (drawn under prism faces) ---
  if (tier4Prog > 0 && tier8Prog < 1) {
    ctx.save();
    ctx.globalAlpha = tier4Prog * (1 - tier8Prog);
    ctx.globalCompositeOperation = "lighter";

    // Dispersed Rainbow Beams (exiting horizontally left and right)
    const colors = [
      "#ff0000",
      "#ff7f00",
      "#ffff00",
      "#00ff00",
      "#00ffff",
      "#0000ff",
      "#7000ff",
    ];

    // Tier 7 amplifies the spread and length
    const spread = Math.PI / 4;
    // Retract the ray length as it transitions to tier 8
    const rayLen = 300 * (1 - tier8Prog);

    const drawHorizontalRainbow = (baseAngle, isReversed) => {
      for (let i = 0; i < colors.length; i++) {
        const fraction = i / (colors.length - 1);
        const angleOffset = -spread / 2 + fraction * spread;
        const outAngle = baseAngle + angleOffset;

        const colorIdx = isReversed ? colors.length - 1 - i : i;

        const grad = ctx.createLinearGradient(
          center.x,
          center.y,
          center.x + Math.cos(outAngle) * rayLen,
          center.y + Math.sin(outAngle) * rayLen,
        );
        const rgbStr = hexToRgbStr(colors[colorIdx]);
        grad.addColorStop(0, `rgba(${rgbStr}, 1)`);
        grad.addColorStop(1, `rgba(${rgbStr}, 0)`);

        ctx.strokeStyle = grad;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(center.x, center.y);
        ctx.lineTo(
          center.x + Math.cos(outAngle) * rayLen,
          center.y + Math.sin(outAngle) * rayLen,
        );
        ctx.stroke();
      }
    };

    // Shoot left (PI) and right (0)
    drawHorizontalRainbow(0, false);
    drawHorizontalRainbow(Math.PI, true);

    ctx.restore();
  }

  if (tier8Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier8Prog;
    ctx.globalCompositeOperation = "lighter";

    // SYMMETRICAL Rainbow Beams (Left and Right)
    const colors = [
      "#ff0000",
      "#ff7f00",
      "#ffff00",
      "#00ff00",
      "#00ffff",
      "#0000ff",
      "#7000ff",
    ];
    const spread = Math.PI / 2; // 90 degree spread

    const drawRainbowSide = (baseAngle, isReversed) => {
      for (let i = 0; i < colors.length; i++) {
        const fraction = i / (colors.length - 1);
        // Spread centered around baseAngle
        const angleOffset = -spread / 2 + fraction * spread;
        const outAngle = baseAngle + angleOffset + Math.sin(t * 5 + i) * 0.02; // subtle wave

        const colorIdx = isReversed ? colors.length - 1 - i : i;

        const grad = ctx.createLinearGradient(
          center.x,
          center.y,
          center.x + Math.cos(outAngle) * 400,
          center.y + Math.sin(outAngle) * 400,
        );
        const intensity = 0.6 + 0.4 * Math.sin(t * 8 + i * 2);
        const rgbStr = hexToRgbStr(colors[colorIdx]);
        grad.addColorStop(0, `rgba(${rgbStr}, 1)`);
        grad.addColorStop(0.5, `rgba(${rgbStr}, ${intensity})`);
        grad.addColorStop(1, `rgba(${rgbStr}, 0)`);

        ctx.fillStyle = grad;
        const outW = 8 + Math.sin(t * 15 + i) * 3;

        // Draw thick polygon beam
        ctx.beginPath();
        // Move perpendicular to outAngle to create thickness
        const px = Math.sin(outAngle) * outW;
        const py = -Math.cos(outAngle) * outW;

        ctx.moveTo(center.x - px / 2, center.y - py / 2);
        ctx.lineTo(
          center.x + Math.cos(outAngle) * 400 - px,
          center.y + Math.sin(outAngle) * 400 - py,
        );
        ctx.lineTo(
          center.x + Math.cos(outAngle) * 400 + px,
          center.y + Math.sin(outAngle) * 400 + py,
        );
        ctx.lineTo(center.x + px / 2, center.y + py / 2);
        ctx.fill();
      }
    };

    // Right side (base angle 0)
    drawRainbowSide(0, false);
    // Left side (base angle PI, reverse colors for symmetry)
    drawRainbowSide(Math.PI, true);

    ctx.restore();
  }

  // Draw back tier 5 crystals here
  drawTier5Shards(false);

  // --- Draw Prism Faces (Back-to-Front) ---
  // Faces and normal/lighting colors
  // We want a glassy pink look
  const faces = [
    { id: "front", pts: [0, 1, 2], baseColor: [200, 100, 200] },
    { id: "back", pts: [3, 5, 4], baseColor: [200, 100, 200] },
    { id: "bottom", pts: [0, 3, 4, 1], baseColor: [200, 100, 200] },
    { id: "left", pts: [0, 2, 5, 3], baseColor: [200, 100, 200] },
    { id: "right", pts: [1, 4, 5, 2], baseColor: [200, 100, 200] },
  ];

  faces.forEach((f) => {
    f.normal = getNormal(rotPts[f.pts[0]], rotPts[f.pts[1]], rotPts[f.pts[2]]);
    f.light = getLightIntensity(f.normal);
    f.z = f.pts.reduce((sum, i) => sum + pts[i].z, 0) / f.pts.length;
  });
  faces.sort((a, b) => b.z - a.z); // Sort descending (back faces first)

  // Edges calculation
  const edges = [
    [0, 1],
    [1, 2],
    [2, 0], // front
    [3, 4],
    [4, 5],
    [5, 3], // back
    [0, 3],
    [1, 4],
    [2, 5], // connecting
  ].map((e) => ({ pts: e, isFront: false }));

  edges.forEach((e) => {
    // Top middle connecting line [2, 5] should always be considered 'back' so it renders before the beams
    if (
      (e.pts[0] === 2 && e.pts[1] === 5) ||
      (e.pts[0] === 5 && e.pts[1] === 2)
    ) {
      e.isFront = false;
      return;
    }

    // Determine front/back faces
    const frontFace = faces.find((f) => f.id === "front");
    const backFace = faces.find((f) => f.id === "back");

    // If this edge belongs to the front face and the front face points away, it's NOT front
    if (
      frontFace &&
      frontFace.normal.z > 0 &&
      frontFace.pts.includes(e.pts[0]) &&
      frontFace.pts.includes(e.pts[1])
    ) {
      e.isFront = false;
      return;
    }

    // Same for back face: if it points away, it's NOT front
    if (
      backFace &&
      backFace.normal.z > 0 &&
      backFace.pts.includes(e.pts[0]) &&
      backFace.pts.includes(e.pts[1])
    ) {
      e.isFront = false;
      return;
    }

    // An edge is in front if it belongs to any face pointing towards the camera (normal.z < 0)
    e.isFront = faces.some(
      (f) =>
        f.normal.z < 0 && f.pts.includes(e.pts[0]) && f.pts.includes(e.pts[1]),
    );
  });

  ctx.save();
  // In later tiers, it gets brighter and more transparent
  const glassAlpha = 0.8 - tier1Prog * 0.2 - tier4Prog * 0.2;

  if (tier2Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier2Prog;
    const innerScale = 0.45;

    const iw = w * innerScale;
    const ih = h * innerScale;
    const id_ = d * innerScale;

    const centerOffsetY = -h / 2 + ih / 2;
    const iVertices = [
      { x: -iw, y: centerOffsetY, z: -id_ },
      { x: iw, y: centerOffsetY, z: -id_ },
      { x: 0, y: centerOffsetY - ih, z: -id_ },
      { x: -iw, y: centerOffsetY, z: id_ },
      { x: iw, y: centerOffsetY, z: id_ },
      { x: 0, y: centerOffsetY - ih, z: id_ },
    ];

    irotPts = iVertices.map((v) => getRotated(v.x, v.y, v.z));
    ipts = irotPts.map((rp) => projectRotated(rp.x, rp.y, rp.z));

    ifaces = [
      { id: "front", pts: [0, 1, 2], baseColor: [200, 100, 200] },
      { id: "back", pts: [3, 5, 4], baseColor: [200, 100, 200] },
      { id: "bottom", pts: [0, 3, 4, 1], baseColor: [200, 100, 200] },
      { id: "left", pts: [0, 2, 5, 3], baseColor: [200, 100, 200] },
      { id: "right", pts: [1, 4, 5, 2], baseColor: [200, 100, 200] },
    ];

    ifaces.forEach((f) => {
      f.normal = getNormal(
        irotPts[f.pts[0]],
        irotPts[f.pts[1]],
        irotPts[f.pts[2]],
      );
      f.light = getLightIntensity(f.normal);
      f.z = f.pts.reduce((sum, i) => sum + ipts[i].z, 0) / f.pts.length;
    });
    ifaces.sort((a, b) => b.z - a.z);

    const iedges = [
      [0, 1],
      [1, 2],
      [2, 0], // front
      [3, 4],
      [4, 5],
      [5, 3], // back
      [0, 3],
      [1, 4],
      [2, 5], // connecting
    ].map((e) => ({ pts: e, isFront: false }));

    iedges.forEach((e) => {
      // Top middle connecting line [2, 5] should always be considered 'back' so it renders before the beams
      if (
        (e.pts[0] === 2 && e.pts[1] === 5) ||
        (e.pts[0] === 5 && e.pts[1] === 2)
      ) {
        e.isFront = false;
        return;
      }

      // Determine front/back faces
      const iFrontFace = ifaces.find((f) => f.id === "front");
      const iBackFace = ifaces.find((f) => f.id === "back");

      // If this edge belongs to the front face and the front face points away, it's NOT front
      if (
        iFrontFace &&
        iFrontFace.normal.z > 0 &&
        iFrontFace.pts.includes(e.pts[0]) &&
        iFrontFace.pts.includes(e.pts[1])
      ) {
        e.isFront = false;
        return;
      }

      // Same for back face: if it points away, it's NOT front
      if (
        iBackFace &&
        iBackFace.normal.z > 0 &&
        iBackFace.pts.includes(e.pts[0]) &&
        iBackFace.pts.includes(e.pts[1])
      ) {
        e.isFront = false;
        return;
      }

      e.isFront = ifaces.some(
        (f) =>
          f.normal.z < 0 &&
          f.pts.includes(e.pts[0]) &&
          f.pts.includes(e.pts[1]),
      );
    });

    // Draw all faces
    ifaces.forEach((f) => {
      let c = f.baseColor;
      ctx.fillStyle = `rgba(${c[0] * f.light}, ${c[1] * f.light}, ${c[2] * f.light}, ${glassAlpha * 0.8})`;
      ctx.beginPath();
      ctx.moveTo(ipts[f.pts[0]].x, ipts[f.pts[0]].y);
      for (let i = 1; i < f.pts.length; i++) {
        ctx.lineTo(ipts[f.pts[i]].x, ipts[f.pts[i]].y);
      }
      ctx.closePath();
      ctx.fill();
    });

    // We will store ifaces and ipts and iedges to draw edges later
    // Hack: attach iedges to ifaces for access later
    ifaces.iedges = iedges;

    ctx.restore();
  }

  faces.forEach((f) => {
    let c = f.baseColor;
    ctx.fillStyle = `rgba(${c[0] * f.light}, ${c[1] * f.light}, ${c[2] * f.light}, ${glassAlpha * 0.9})`;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pts[f.pts[0]].x, pts[f.pts[0]].y);
    for (let i = 1; i < f.pts.length; i++) {
      ctx.lineTo(pts[f.pts[i]].x, pts[f.pts[i]].y);
    }
    ctx.closePath();
    ctx.fill();
  });

  // Draw back edges of inner prism
  if (
    tier2Prog > 0 &&
    typeof ipts !== "undefined" &&
    typeof ifaces !== "undefined" &&
    ifaces &&
    ifaces.iedges
  ) {
    ctx.save();
    ctx.globalAlpha = tier2Prog;
    ctx.strokeStyle = `rgba(230, 150, 255, 0.5)`;
    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ifaces.iedges
      .filter((e) => !e.isFront)
      .forEach((e) => {
        ctx.moveTo(ipts[e.pts[0]].x, ipts[e.pts[0]].y);
        ctx.lineTo(ipts[e.pts[1]].x, ipts[e.pts[1]].y);
      });
    ctx.stroke();
    ctx.restore();
  }
  // Draw back edges of outer prism
  ctx.strokeStyle = `rgba(230, 150, 255, 0.5)`;
  ctx.lineWidth = 1;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  edges
    .filter((e) => !e.isFront)
    .forEach((e) => {
      ctx.moveTo(pts[e.pts[0]].x, pts[e.pts[0]].y);
      ctx.lineTo(pts[e.pts[1]].x, pts[e.pts[1]].y);
    });
  ctx.stroke();

  ctx.restore();

  // Tier 6: Resonating Edges (rendered before faces, attached to back edges)
  if (tier6Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier6Prog;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const pulse = 0.5 + 0.5 * Math.sin(t * 4);

    // Draw resonating outer back edges
    ctx.strokeStyle = `rgba(230, 150, 255, 1)`; // Same color as standard lines, but solid
    ctx.lineWidth = 1 + 6 * pulse;

    ctx.beginPath();
    edges
      .filter((e) => !e.isFront)
      .forEach((e) => {
        ctx.moveTo(pts[e.pts[0]].x, pts[e.pts[0]].y);
        ctx.lineTo(pts[e.pts[1]].x, pts[e.pts[1]].y);
      });
    ctx.stroke();

    // Draw resonating inner back edges
    if (
      tier2Prog > 0 &&
      typeof ipts !== "undefined" &&
      typeof ifaces !== "undefined" &&
      ifaces &&
      ifaces.iedges
    ) {
      ctx.save();
      ctx.globalAlpha = tier6Prog * tier2Prog;
      ctx.strokeStyle = `rgba(230, 150, 255, 1)`;
      ctx.lineWidth = 1 + 6 * pulse;

      ctx.beginPath();
      ifaces.iedges
        .filter((e) => !e.isFront)
        .forEach((e) => {
          ctx.moveTo(ipts[e.pts[0]].x, ipts[e.pts[0]].y);
          ctx.lineTo(ipts[e.pts[1]].x, ipts[e.pts[1]].y);
        });
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  // Tier 7: Energy Lightning (Arcs between vertices)
  if (tier7Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier7Prog;
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";

    // Hash function for random-looking but deterministic arcs based on time
    const hash = (n) => Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1;

    const drawLightningArcs = (points) => {
      const numArcs = 4;
      for (let i = 0; i < numArcs; i++) {
        // Create a rapid flicker effect by changing indices frequently
        const timeIndex = Math.floor(t * 15 + i * 2);

        const idx1 = Math.floor(hash(timeIndex) * points.length);
        const idx2 = Math.floor(hash(timeIndex + 1) * points.length);

        if (idx1 !== idx2) {
          const p1 = points[idx1];
          const p2 = points[idx2];

          // Draw jagged line
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);

          const segments = 4;
          for (let j = 1; j < segments; j++) {
            const tPos = j / segments;
            const baseX = p1.x + (p2.x - p1.x) * tPos;
            const baseY = p1.y + (p2.y - p1.y) * tPos;

            // Add jitter perpendicular to the line
            const jitterX = (hash(timeIndex + j * 0.1) - 0.5) * 15;
            const jitterY = (hash(timeIndex + j * 0.2) - 0.5) * 15;

            ctx.lineTo(baseX + jitterX, baseY + jitterY);
          }
          ctx.lineTo(p2.x, p2.y);

          const flickerIntensity = 0.5 + 0.5 * hash(timeIndex + 0.5);
          ctx.strokeStyle = `rgba(255, 182, 193, ${flickerIntensity})`;
          ctx.stroke();
        }
      }
    };

    drawLightningArcs(pts);
    if (tier2Prog > 0 && ipts) {
      drawLightningArcs(ipts);
    }

    ctx.restore();
  }

  // --- Post-Prism Light Effects ---

  // Tier 1: Pink Sparkles
  if (tier1Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier1Prog;

    const numSparkles = 15;
    for (let i = 0; i < numSparkles; i++) {
      const sparkleT = (t + i * (1 / numSparkles)) % 1;
      const hash1 = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const hash2 = (Math.cos(i * 78.233) * 43758.5453) % 1;
      const hash3 = (Math.sin(i * 45.123) * 43758.5453) % 1;

      const angle = hash2 * Math.PI * 2;
      const speed = 100 + 100 * Math.abs(hash1);
      const distance = speed * sparkleT;
      const sx = Math.cos(angle) * distance;
      const sz = Math.sin(angle) * distance;

      const initialVy = -150 - 50 * Math.abs(hash3);
      const gravity = 400;
      const dy = initialVy * sparkleT + 0.5 * gravity * sparkleT * sparkleT;
      const sparkleY = -h / 2 + dy;

      const sp = project(sx, sparkleY, sz);

      const sparkleAlpha = Math.sin(sparkleT * Math.PI); // Fade in and out
      const sparkleSize = 4 * sp.scale * sparkleAlpha;

      ctx.save();
      ctx.translate(sp.x, sp.y);
      ctx.rotate(t + i);

      ctx.fillStyle = `rgba(230, 150, 255, ${sparkleAlpha * 0.9})`;

      // Draw a 4-pointed star
      ctx.beginPath();
      ctx.moveTo(0, -sparkleSize);
      ctx.quadraticCurveTo(0, 0, sparkleSize, 0);
      ctx.quadraticCurveTo(0, 0, 0, sparkleSize);
      ctx.quadraticCurveTo(0, 0, -sparkleSize, 0);
      ctx.quadraticCurveTo(0, 0, 0, -sparkleSize);
      ctx.fill();

      ctx.restore();
    }
    ctx.restore();
  }

  // Tier 4: Incoming White Beam from top & Rainbow Beams shooting out horizontally
  if (tier4Prog > 0 && tier8Prog < 1) {
    ctx.save();
    // Smoothly fade out alpha during tier 8 transition
    ctx.globalAlpha = tier4Prog * (1 - tier8Prog);
    ctx.globalCompositeOperation = "lighter";

    // Incoming white beam (from straight down/top)
    const inAngle = -Math.PI / 2;

    // In Tier 7, the incoming beam gets much wider and intense
    const t7WidthAdd = 0;
    // Shrink the width as it fades into Tier 8 to give a shrinking "fade away" effect
    const beamW = (6 + Math.sin(t * 5) * 2 + t7WidthAdd) * (1 - tier8Prog);

    ctx.fillStyle = "rgba(255, 255, 255, 1)";

    ctx.beginPath();
    ctx.moveTo(center.x - beamW, center.y - 2000);
    ctx.lineTo(center.x + beamW, center.y - 2000);
    ctx.lineTo(center.x + beamW / 2, center.y);
    ctx.lineTo(center.x - beamW / 2, center.y);
    ctx.fill();

    // Glowing impact point
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(
      center.x,
      center.y,
      (8 + t7WidthAdd / 2) * (1 - tier8Prog),
      0,
      Math.PI * 2,
    );
    ctx.fill();

    ctx.restore();
  }

  // --- Tier 8: Symmetrical Zenith ---
  if (tier8Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier8Prog;
    ctx.globalCompositeOperation = "lighter";

    // Incoming massive white beams from BOTH sides (top-left, top-right)
    // OR straight down. "massive white beams enter from both sides (or straight down)"
    // Let's do straight down splitting into two huge rainbows perfectly symmetric

    const inAngle = -Math.PI / 2; // straight up/down
    ctx.fillStyle = ironPattern ? ironPattern : "#1a1c23";

    // Draw incoming thick white beam
    const beamW = 15 + Math.sin(t * 10) * 5;
    // Fix: use center.x for gradient x coordinates to align with the beam!
    ctx.fillStyle = "rgba(255, 255, 255, 1)";

    ctx.beginPath();
    ctx.moveTo(center.x - beamW, center.y - 2000);
    ctx.lineTo(center.x + beamW, center.y - 2000);
    ctx.lineTo(center.x + beamW / 2, center.y);
    ctx.lineTo(center.x - beamW / 2, center.y);
    ctx.fill();

    // Explosive Core (smaller, pulsing)
    ctx.fillStyle = "rgba(255, 255, 255, 1)";
    ctx.beginPath();
    // Inner prism size is about iw = w * 0.45 = 13.5 * sizeMult.
    // We want the ball to be smaller than the inner prism width but still pulse erratically.
    const corePulse = 8 + Math.random() * 6;
    ctx.arc(center.x, center.y, corePulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Draw FRONT edges of the inner prism
  if (
    tier2Prog > 0 &&
    typeof ipts !== "undefined" &&
    typeof ifaces !== "undefined" &&
    ifaces &&
    ifaces.iedges
  ) {
    ctx.save();
    ctx.globalAlpha = tier2Prog;
    ctx.strokeStyle = `rgba(230, 150, 255, 0.5)`;
    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ifaces.iedges
      .filter((e) => e.isFront)
      .forEach((e) => {
        ctx.moveTo(ipts[e.pts[0]].x, ipts[e.pts[0]].y);
        ctx.lineTo(ipts[e.pts[1]].x, ipts[e.pts[1]].y);
      });
    ctx.stroke();
    ctx.restore();
  }
  // Draw FRONT edges of outer prism
  ctx.save();
  ctx.strokeStyle = `rgba(230, 150, 255, 0.5)`;
  ctx.lineWidth = 1;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  edges
    .filter((e) => e.isFront)
    .forEach((e) => {
      ctx.moveTo(pts[e.pts[0]].x, pts[e.pts[0]].y);
      ctx.lineTo(pts[e.pts[1]].x, pts[e.pts[1]].y);
    });
  ctx.stroke();
  ctx.restore();

  // Tier 6: Resonating Edges (rendered after faces, attached to front edges)
  if (tier6Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier6Prog;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    const pulse = 0.5 + 0.5 * Math.sin(t * 4);

    // Draw resonating outer front edges
    ctx.strokeStyle = `rgba(230, 150, 255, 1)`; // Same color as standard lines, but solid
    ctx.lineWidth = 1 + 6 * pulse;
    ctx.beginPath();
    edges
      .filter((e) => e.isFront)
      .forEach((e) => {
        ctx.moveTo(pts[e.pts[0]].x, pts[e.pts[0]].y);
        ctx.lineTo(pts[e.pts[1]].x, pts[e.pts[1]].y);
      });
    ctx.stroke();

    // Draw resonating inner front edges
    if (
      tier2Prog > 0 &&
      typeof ipts !== "undefined" &&
      typeof ifaces !== "undefined" &&
      ifaces &&
      ifaces.iedges
    ) {
      ctx.save();
      ctx.globalAlpha = tier6Prog * tier2Prog;
      ctx.strokeStyle = `rgba(230, 150, 255, 1)`;
      ctx.lineWidth = 1 + 6 * pulse;
      ctx.beginPath();
      ifaces.iedges
        .filter((e) => e.isFront)
        .forEach((e) => {
          ctx.moveTo(ipts[e.pts[0]].x, ipts[e.pts[0]].y);
          ctx.lineTo(ipts[e.pts[1]].x, ipts[e.pts[1]].y);
        });
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }
  // Draw front tier 5 crystals here
  drawTier5Shards(true);
}

function drawFoundry(ctx, t, tier, prevTier, animProgress) {
  // Base structure (Tier 0+)
  if (!stonePattern && activeCtx) {
    initStonePattern(activeCtx);
  }
  if (!pureGoldPattern && activeCtx) {
    initPureGoldPattern(activeCtx);
  }
  if (stonePattern) {
    ctx.fillStyle = stonePattern;
  } else {
    ctx.fillStyle = "#544";
  }

  // Draw base building (rock oven)
  ctx.fillRect(-70, -100, 140, 100);

  // Tier 1: Multiple, staggered smokestacks emitting thick, animated smoke with glowing embers
  const showTier1 = tier >= 1 ? 1 : 0;
  const tier1Prog = tier >= 1 && prevTier < 1 ? animProgress : showTier1;
  if (tier1Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier1Prog;

    const drawSmokestack = (x, y, w, h, timeOffset) => {
      ctx.fillStyle = "#222";
      ctx.fillRect(x - w / 2, y - h, w, h);

      // Rim of smokestack
      ctx.fillStyle = "#111";
      ctx.fillRect(x - w / 2 - 2, y - h, w + 4, 5);

      if (tier1Prog > 0) {
        for (let i = 0; i < 5; i++) {
          const smokeT = (t + i * 0.8 + timeOffset) % 4;
          const smokeY = y - h - smokeT * 40;
          const smokeX = x + Math.sin(smokeT * 3 + i) * 15;
          const smokeSize = 10 + smokeT * 15;
          const smokeAlpha = 1 - smokeT / 4;

          // Smoke
          ctx.fillStyle = `rgba(50, 50, 50, ${smokeAlpha * 0.8})`;
          ctx.beginPath();
          ctx.arc(smokeX, smokeY, smokeSize, 0, Math.PI * 2);
          ctx.fill();

          // Embers
          const emberX =
            smokeX + Math.sin(smokeT * 5 + i * 2) * smokeSize * 0.5;
          const emberY = smokeY + Math.cos(smokeT * 4 + i) * smokeSize * 0.5;
          const emberAlpha = smokeAlpha * (0.5 + 0.5 * Math.sin(t * 10 + i));
          ctx.fillStyle = `rgba(255, 100, 0, ${emberAlpha})`;
          ctx.beginPath();
          ctx.arc(
            emberX,
            emberY,
            2 + Math.abs(Math.sin(i)) * 2,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
    };

    drawSmokestack(-35, -100, 20, 90, 0);
    drawSmokestack(0, -100, 26, 100, 1.5);
    drawSmokestack(35, -100, 20, 80, 2.5);

    ctx.restore();
  }

  // Tier 2: Heavy dark metal plating with glowing orange seams
  const showTier2 = tier >= 2 ? 1 : 0;
  const tier2Prog = tier >= 2 && prevTier < 2 ? animProgress : showTier2;
  if (tier2Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier2Prog;

    // Base dark plating
    ctx.fillStyle = "#111";
    ctx.fillRect(-75, -105, 150, 10);
    ctx.fillRect(-75, -10, 150, 10);
    ctx.fillRect(-75, -105, 10, 105);
    ctx.fillRect(65, -105, 10, 105);

    // Glowing orange seams
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    ctx.fillStyle = `rgba(255, ${100 + pulse * 100}, 0, ${0.7 + pulse * 0.3})`;
    ctx.fillRect(-65, -103, 130, 2); // Top inner seam
    ctx.fillRect(-65, -12, 130, 2); // Bottom inner seam
    ctx.fillRect(-73, -95, 2, 85); // Left inner seam
    ctx.fillRect(71, -95, 2, 85); // Right inner seam

    // Rivets
    ctx.fillStyle = "#555";
    for (let i = -60; i <= 60; i += 20) {
      const boltX = i < 0 ? i - 4 : (i === 0 ? -2 : i);
      ctx.fillRect(boltX, -100, 4, 4);
    }
    
    // Side bolts (4 on each side, spaced by 20, centered vertically)
    const sideY = [-83.5, -63.5, -43.5, -23.5];
    for (const y of sideY) {
      ctx.fillRect(-70, y, 4, 4);
      ctx.fillRect(66, y, 4, 4);
    }
    
    // Bottom bolts
    ctx.fillRect(-64, -7, 4, 4);
    ctx.fillRect(-44, -7, 4, 4);
    ctx.fillRect(-24, -7, 4, 4);
    ctx.fillRect(20, -7, 4, 4);
    ctx.fillRect(40, -7, 4, 4);
    ctx.fillRect(60, -7, 4, 4);

    ctx.restore();
  }

  // Tier 3: Dynamic lava falls spilling into cooling pools
  const showTier3 = tier >= 3 ? 1 : 0;
  const tier3Prog = tier >= 3 && prevTier < 3 ? animProgress : showTier3;
  if (tier3Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier3Prog;

    // Lava pools at base
    const poolGrad = ctx.createLinearGradient(0, -10, 0, 0);
    poolGrad.addColorStop(0, "#f90");
    poolGrad.addColorStop(1, "#a20");
    ctx.fillStyle = poolGrad;
    ctx.fillRect(-95, -10, 40, 10);
    ctx.fillRect(55, -10, 40, 10);

    // Cooling pools edges
    ctx.fillStyle = "#222";
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
        {
          offset: Math.max(0, Math.min(1, (0 + scrollOffset) % 1)),
          color: "#ff0",
        },
        {
          offset: Math.max(0, Math.min(1, (0.33 + scrollOffset) % 1)),
          color: "#f50",
        },
        {
          offset: Math.max(0, Math.min(1, (0.66 + scrollOffset) % 1)),
          color: "#a20",
        },
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
      ctx.fillStyle = "#333";
      ctx.fillRect(x - 12, -100, 24, 10);
      ctx.fillStyle = "#f90";
      ctx.fillRect(x - 10, -95, 20, 5);

      // Steam from pool
      if (tier3Prog > 0.8) {
        for (let i = 0; i < 3; i++) {
          const steamT = (t + i * 1.5) % 3;
          const steamY = -10 - steamT * 20;
          const steamX = x + Math.sin(steamT * 4 + i) * 10;
          const steamAlpha = 1 - steamT / 3;
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
  const showTier5 = tier >= 5 ? 1 : 0;
  const tier5Prog = tier >= 5 && prevTier < 5 ? animProgress : showTier5;
  if (tier5Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier5Prog;

    const heatGlow = 0.5 + 0.5 * Math.sin(t * 4);

    const drawVent = (x, y, w, h) => {
      ctx.save();
      ctx.translate(x, y);

      // Vent casing
      ctx.fillStyle = "#222";
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 2;
      ctx.strokeRect(-w / 2, -h / 2, w, h);

      // Glowing interior
      ctx.fillStyle = `rgba(255, ${100 + heatGlow * 50}, 0, ${0.6 + 0.4 * heatGlow})`;
      ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4);

      // Grates
      ctx.fillStyle = "#000";
      for (let i = -h / 2 + 4; i < h / 2 - 2; i += 4) {
        ctx.fillRect(-w / 2 + 2, i, w - 4, 2);
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
  const showTier6 = tier >= 6 ? 1 : 0;
  const tier6Prog = tier >= 6 && prevTier < 6 ? animProgress : showTier6;
  if (tier6Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier6Prog;

    const drawTurbineExhaust = (x, isLeft) => {
      ctx.save();
      ctx.translate(x, -80);

      // Housing
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(isLeft ? -30 : 0, -20, 30, 40);

      // Turbine casing details
      ctx.fillStyle = "#333";
      ctx.fillRect(isLeft ? -25 : 5, -15, 20, 30);

      // Glowing red-hot interior
      const heatGlow = 0.5 + 0.5 * Math.sin(t * 8);
      ctx.fillStyle = `rgba(255, ${50 + heatGlow * 100}, 0, 0.8)`;
      ctx.fillRect(isLeft ? -22 : 8, -12, 14, 24);

      // Turbine Fan blades
      ctx.save();
      ctx.translate(isLeft ? -15 : 15, 0);
      ctx.rotate(t * (isLeft ? -20 : 20)); // Spin very fast
      ctx.fillStyle = "#111";
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
      ctx.fillStyle = "#444";
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Blue flame exhaust
      if (tier6Prog > 0) {
        const firePulse = Math.random() * 0.4;
        const fireW = (40 + firePulse * 20) * (isLeft ? -1 : 1);
        const fireGrad = ctx.createLinearGradient(
          isLeft ? -30 : 30,
          0,
          isLeft ? -30 + fireW : 30 + fireW,
          0,
        );
        fireGrad.addColorStop(0, "rgba(255, 255, 255, 0.9)");
        fireGrad.addColorStop(0.2, "rgba(255, 200, 0, 0.8)");
        fireGrad.addColorStop(0.5, "rgba(255, 100, 0, 0.5)");
        fireGrad.addColorStop(1, "rgba(255, 0, 0, 0)");

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
  const showTier7 = tier >= 7 ? 1 : 0;
  const tier7Prog = tier >= 7 && prevTier < 7 ? animProgress : showTier7;
  if (tier7Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier7Prog;

    const drawLavaContainer = (x, isLeft) => {
      ctx.save();
      ctx.translate(x, -10); // Base of the building

      // Pipe connection to the lava pool (KEEP)
      ctx.fillStyle = "#111";
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
      ctx.fillStyle = "#1a0a00";
      ctx.fillRect(siloX, siloY, containerWidth, containerHeight);

      // Lava inside
      ctx.save();
      ctx.beginPath();
      ctx.rect(siloX, siloY, containerWidth, containerHeight);
      ctx.clip();

      // Lava level and motion
      const fillLvl = 0.7 + 0.2 * Math.sin(t * 1);
      const currentLavaHeight = containerHeight * fillLvl;
      const lavaY = siloY + containerHeight - currentLavaHeight;

      // Lava gradient
      const lavaGrad = ctx.createLinearGradient(
        0,
        lavaY,
        0,
        siloY + containerHeight,
      );
      lavaGrad.addColorStop(0, "#ffcc00"); // top is hot/bright
      lavaGrad.addColorStop(0.3, "#ff6600");
      lavaGrad.addColorStop(1, "#cc2200"); // bottom is darker

      ctx.fillStyle = lavaGrad;
      ctx.fillRect(siloX, lavaY, containerWidth, currentLavaHeight);

      // Lava bubbles moving up
      for (let i = 0; i < 8; i++) {
        const bubbleT = (t * 0.5 + i * 0.43) % 1; // 0 to 1 cycle
        const bubbleX =
          siloX +
          5 +
          ((i * 3) % (containerWidth - 10)) +
          Math.sin(t * 3 + i) * 2;
        const bubbleY = siloY + containerHeight - bubbleT * currentLavaHeight;
        const bubbleRadius = 1 + (i % 3);

        // only draw if below the surface
        if (bubbleY > lavaY + bubbleRadius) {
          ctx.fillStyle = "rgba(255, 200, 100, 0.7)";
          ctx.beginPath();
          ctx.arc(bubbleX, bubbleY, bubbleRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();

      // Glass reflection/shine
      if (isLeft) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
        ctx.fillRect(siloX + 3, siloY + 2, 5, containerHeight - 4);
        ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
        ctx.fillRect(siloX + 8, siloY + 2, 3, containerHeight - 4);
      } else {
        ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
        ctx.fillRect(
          siloX + containerWidth - 8,
          siloY + 2,
          5,
          containerHeight - 4,
        );
        ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
        ctx.fillRect(
          siloX + containerWidth - 11,
          siloY + 2,
          3,
          containerHeight - 4,
        );
      }

      // Metal caps (Top and Bottom of Silo)
      ctx.fillStyle = "#222";
      ctx.fillRect(siloX - 2, siloY - 5, containerWidth + 4, 5); // Top cap
      ctx.fillRect(siloX - 2, siloY + containerHeight, containerWidth + 4, 5); // Bottom cap

      // Side supports/frame for the glass
      ctx.fillStyle = "#111";
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
  const showTier4 = tier >= 4 ? 1 : 0;
  const tier4Prog = tier >= 4 && prevTier < 4 ? animProgress : showTier4;

  // Draw furnace opening
  const pulse = Math.abs(Math.sin(t * 5));
  const corePulse = 0.8 + 0.2 * Math.sin(t * 15);

  ctx.fillStyle = "#050505";
  if (tier4Prog < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - tier4Prog;
    ctx.fillRect(-20, -40, 40, 40);
    ctx.restore();
  }
  if (tier4Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier4Prog;
    ctx.fillRect(-30, -60, 60, 60);
    ctx.restore();
  }

  const showTier8ForCore = tier >= 8 ? 1 : 0;
  const tier8CoreProg =
    tier >= 8 && prevTier < 8 ? animProgress : showTier8ForCore;

  const drawPlasmaCore = (alpha, mult, baseRayAlpha) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    
    // Plasma core
    const coreRadius = (15 + pulse * 5) * mult;
    const coreGrad = ctx.createRadialGradient(
      0,
      -30,
      0,
      0,
      -30,
      coreRadius * 2,
    );
    coreGrad.addColorStop(0, "#ffffff");
    coreGrad.addColorStop(0.2, "#ffcc00");
    coreGrad.addColorStop(0.5, "#ff3300");
    coreGrad.addColorStop(1, "rgba(255, 50, 0, 0)");

    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, -30, coreRadius * 2, 0, Math.PI * 2);
    ctx.fill();

    // Light rays casting outwards
    ctx.save();
    ctx.translate(0, -30);
    for (let i = 0; i < 6; i++) {
      const angle = (t * 2 + (i * Math.PI) / 3) % (Math.PI * 2);
      ctx.rotate(angle);

      const rayLen = 80 * corePulse * mult;
      const rayGrad = ctx.createLinearGradient(0, 0, 0, rayLen);
      const rayAlpha = Math.min(1.0, baseRayAlpha);
      rayGrad.addColorStop(0, `rgba(255, 200, 100, ${rayAlpha})`);
      rayGrad.addColorStop(1, "rgba(255, 50, 0, 0)");

      ctx.fillStyle = rayGrad;
      ctx.beginPath();
      ctx.moveTo(-2 * mult, 0);
      ctx.lineTo(2 * mult, 0);
      ctx.lineTo(10 * mult, rayLen);
      ctx.lineTo(-10 * mult, rayLen);
      ctx.fill();
      ctx.rotate(-angle);
    }
    ctx.restore();
    ctx.restore();
  };

  if (tier4Prog > 0 && tier8CoreProg < 1) {
    drawPlasmaCore(tier4Prog * (1 - tier8CoreProg), 1, 0.4 * tier4Prog);
  }
  
  if (tier8CoreProg > 0) {
    drawPlasmaCore(tier8CoreProg, 2.5, 0.8 * tier8CoreProg);
  }
  
  if (tier4Prog < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - tier4Prog;
    // Base tier opening (closed doors)
    // Fiery orangish-red/yellow/orange glow
    ctx.fillStyle = `rgba(255, ${50 + pulse * 100}, 0, 0.8)`;
    ctx.fillRect(
      -15,
      -35,
      30,
      35,
    );
    ctx.restore();
  }

  // Handle ground glow crossfading between 3 states
  if (tier4Prog < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - tier4Prog;
    const groundGlow = ctx.createRadialGradient(
      0,
      -20,
      10,
      0,
      0,
      60,
    );
    groundGlow.addColorStop(0, `rgba(255, ${150 + pulse * 50}, 0, 0.4)`);
    groundGlow.addColorStop(1, "rgba(255, 100, 0, 0)");
    ctx.fillStyle = groundGlow;
    ctx.beginPath();
    ctx.arc(0, 0, 60, Math.PI, 0);
    ctx.fill();
    ctx.restore();
  }
  
  if (tier4Prog > 0 && tier8CoreProg < 1) {
    ctx.save();
    ctx.globalAlpha = tier4Prog * (1 - tier8CoreProg);
    const groundGlow = ctx.createRadialGradient(
      0,
      -30,
      10,
      0,
      0,
      120,
    );
    groundGlow.addColorStop(
      0,
      `rgba(255, 100, 0, ${0.4 * corePulse})`,
    );
    groundGlow.addColorStop(1, "rgba(255, 50, 0, 0)");
    ctx.fillStyle = groundGlow;
    ctx.beginPath();
    ctx.arc(0, 0, 120, Math.PI, 0);
    ctx.fill();
    ctx.restore();
  }
  
  if (tier8CoreProg > 0) {
    ctx.save();
    ctx.globalAlpha = tier8CoreProg;
    const groundGlow = ctx.createRadialGradient(
      0,
      -30,
      10,
      0,
      0,
      200,
    );
    groundGlow.addColorStop(
      0,
      `rgba(255, 100, 0, ${0.8 * corePulse})`,
    );
    groundGlow.addColorStop(1, "rgba(255, 50, 0, 0)");
    ctx.fillStyle = groundGlow;
    ctx.beginPath();
    ctx.arc(0, 0, 200, Math.PI, 0);
    ctx.fill();
    ctx.restore();
  }

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
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.arc(0, 0, r / 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  for (let i = 0; i < 8; i++) {
    ctx.save();
    ctx.rotate((i / 8) * Math.PI * 2);
    ctx.fillRect(-2, -r - 3, 4, 6);
    ctx.restore();
  }
}

function drawCharger(ctx, t, tier, prevTier, animProgress) {
  const showTier1 = tier >= 1 ? 1 : 0;
  const tier1Prog = tier >= 1 && prevTier < 1 ? animProgress : showTier1;
  const showTier2 = tier >= 2 ? 1 : 0;
  const tier2Prog = tier >= 2 && prevTier < 2 ? animProgress : showTier2;
  const showTier3 = tier >= 3 ? 1 : 0;
  const tier3Prog = tier >= 3 && prevTier < 3 ? animProgress : showTier3;
  const showTier4 = tier >= 4 ? 1 : 0;
  const tier4Prog = tier >= 4 && prevTier < 4 ? animProgress : showTier4;
  const showTier5 = tier >= 5 ? 1 : 0;
  const tier5Prog = tier >= 5 && prevTier < 5 ? animProgress : showTier5;
  const showTier6 = tier >= 6 ? 1 : 0;
  const tier6Prog = tier >= 6 && prevTier < 6 ? animProgress : showTier6;
  const showTier7 = tier >= 7 ? 1 : 0;
  const tier7Prog = tier >= 7 && prevTier < 7 ? animProgress : showTier7;
  const showTier8 = tier >= 8 ? 1 : 0;
  const tier8Prog = tier >= 8 && prevTier < 8 ? animProgress : showTier8;

  // Common function for drawing lightning bolts
  const drawLightning = (
    sx,
    sy,
    ex,
    ey,
    segments,
    jitter,
    color,
    lineWidth,
  ) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    for (let j = 1; j < segments; j++) {
      const tPos = j / segments;
      const px = sx + (ex - sx) * tPos + (Math.random() - 0.5) * jitter;
      const py = sy + (ey - sy) * tPos + (Math.random() - 0.5) * jitter;
      ctx.lineTo(px, py);
    }
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Core (white)
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = lineWidth * 0.4;
    ctx.stroke();
  };

  const extraBaseWidth = tier4Prog * 10;
  const prongOffset = 40 + extraBaseWidth;

  // Tier 0 (Foundation)
  if (!copperPattern && activeCtx) {
    initCopperPattern(activeCtx);
  }

  // Unpowered prongs/nodes for Tier 0 (Drawn before base so coils are behind)
  ctx.fillStyle = "#111";
  const prongHeight = 10.5 + tier1Prog * 36.4; // 30% shorter in Tier 1
  ctx.fillRect(-prongOffset - 5, -40 - prongHeight, 10, prongHeight);
  ctx.fillRect(prongOffset - 5, -40 - prongHeight, 10, prongHeight);
  ctx.fillStyle = copperPattern ? copperPattern : "#b6673f";
  ctx.beginPath();
  ctx.arc(-prongOffset, -40 - prongHeight, 6, 0, Math.PI * 2);
  ctx.arc(prongOffset, -40 - prongHeight, 6, 0, Math.PI * 2);
  ctx.fill();

  // Tier 1 (Tall Coils & Glow - Drawn before base)
  if (tier1Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier1Prog;

    // Large copper coils wrapping around the tall prongs
    ctx.strokeStyle = "#e99f79"; // bright copper
    ctx.lineWidth = 2;
    const numCoils = 3 + Math.floor(10 * tier1Prog); // Less dense coils
    const coilSpacing = prongHeight / numCoils;
    for (let i = 0; i < numCoils; i++) {
      ctx.beginPath();
      ctx.moveTo(-prongOffset - 8, -40 - prongHeight + 5 + i * coilSpacing);
      ctx.lineTo(-prongOffset + 8, -40 - prongHeight + 7 + i * coilSpacing);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(prongOffset - 8, -40 - prongHeight + 5 + i * coilSpacing);
      ctx.lineTo(prongOffset + 8, -40 - prongHeight + 7 + i * coilSpacing);
      ctx.stroke();
    }

    // Faint glow
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    const topY = -40 - prongHeight;
    const glowRad = ctx.createRadialGradient(
      -prongOffset,
      topY,
      0,
      -prongOffset,
      topY,
      20 + 10 * tier1Prog,
    );
    glowRad.addColorStop(0, `rgba(0, 200, 255, ${0.4 * pulse})`);
    glowRad.addColorStop(1, "rgba(0, 200, 255, 0)");
    ctx.fillStyle = glowRad;
    ctx.beginPath();
    ctx.arc(-prongOffset, topY, 20 + 10 * tier1Prog, 0, Math.PI * 2);
    ctx.fill();

    const glowRad2 = ctx.createRadialGradient(
      prongOffset,
      topY,
      0,
      prongOffset,
      topY,
      20 + 10 * tier1Prog,
    );
    glowRad2.addColorStop(0, `rgba(0, 200, 255, ${0.4 * pulse})`);
    glowRad2.addColorStop(1, "rgba(0, 200, 255, 0)");
    ctx.fillStyle = glowRad2;
    ctx.beginPath();
    ctx.arc(prongOffset, topY, 20 + 10 * tier1Prog, 0, Math.PI * 2);
    ctx.fill();

    // Occasional static spark
    if (Math.random() > 0.9) {
      drawLightning(
        -prongOffset,
        topY,
        -prongOffset + (Math.random() - 0.5) * 20,
        topY - Math.random() * 20,
        2,
        5,
        "rgba(100, 200, 255, 0.6)",
        1,
      );
    }
    if (Math.random() > 0.9) {
      drawLightning(
        prongOffset,
        topY,
        prongOffset + (Math.random() - 0.5) * 20,
        topY - Math.random() * 20,
        2,
        5,
        "rgba(100, 200, 255, 0.6)",
        1,
      );
    }

    ctx.restore();
  }

  // Tier 2 (Small Capacitor Nodes - drawn behind base)
  if (tier2Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier2Prog;

    const drawCapacitor = (x, y, index) => {
      ctx.save();
      ctx.translate(x, y);

      // Capacitor body
      if (copperPattern) {
        ctx.fillStyle = copperPattern;
      } else {
        ctx.fillStyle = "#b6673f";
      }
      ctx.fillRect(-6, -12, 12, 12);
      ctx.fillStyle = "#555";
      ctx.fillRect(-4, -14, 8, 2);

      // Dim glow
      const pulse = 0.5 + 0.5 * Math.sin(t * 3 - index * (Math.PI / 2));
      ctx.fillStyle = `rgba(0, 200, 255, ${0.3 * pulse})`;
      ctx.beginPath();
      ctx.arc(0, -14, 8, 0, Math.PI * 2);
      ctx.fill();

      // Tiny spark
      if (Math.random() > 0.95) {
        ctx.strokeStyle = "rgba(100, 255, 255, 0.8)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.lineTo((Math.random() - 0.5) * 10, -14 - Math.random() * 10);
        ctx.stroke();
      }

      ctx.restore();
    };

    drawCapacitor(-74 - extraBaseWidth, -20, 0);
    drawCapacitor(74 + extraBaseWidth, -20, 1);
    drawCapacitor(-54 - extraBaseWidth, -40, 2);
    drawCapacitor(54 + extraBaseWidth, -40, 3);

    ctx.restore();
  }

  // Draw heavy metallic base / charging pad
  if (copperPattern) {
    ctx.fillStyle = copperPattern;
  } else {
    ctx.fillStyle = "#b6673f";
  }
  ctx.fillRect(-80 - extraBaseWidth, -20, 160 + extraBaseWidth * 2, 20);
  ctx.beginPath();
  ctx.moveTo(-70.5 - extraBaseWidth, -19);
  ctx.lineTo(-60 - extraBaseWidth, -40);
  ctx.lineTo(60 + extraBaseWidth, -40);
  ctx.lineTo(70.5 + extraBaseWidth, -19);
  ctx.fill();

  if (copperPattern) {
    ctx.fillStyle = copperPattern;
  } else {
    ctx.fillStyle = "#b6673f";
  }
  // Copper trim and small prongs
  ctx.fillRect(-80 - extraBaseWidth, -5, 160 + extraBaseWidth * 2, 5);
  ctx.fillRect(-60 - extraBaseWidth, -40, 120 + extraBaseWidth * 2, 5);

  // Tier 0 Occasional Lightning Spark to center (From top of prongs)
  if (Math.random() > 0.9) {
    const yPos = -40 - prongHeight; // Top of the prongs
    drawLightning(
      -prongOffset,
      yPos,
      prongOffset,
      yPos,
      4,
      10,
      "rgba(0, 200, 255, 0.6)",
      1.5,
    );
  }
  // Tier 3 (Tesla Nodes)
  if (tier3Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier3Prog;

    const drawTeslaNode = (x, y, index) => {
      ctx.save();
      // Slight vertical bobbing
      const bobbingY = y + Math.sin(t * 2 + index) * 5;
      ctx.translate(x, bobbingY);

      // Outer Glow
      const glowRad = ctx.createRadialGradient(0, 0, 0, 0, 0, 18);
      glowRad.addColorStop(0, `rgba(0, 255, 255, ${0.6 * tier3Prog})`);
      glowRad.addColorStop(1, "rgba(0, 255, 255, 0)");
      ctx.fillStyle = glowRad;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, Math.PI * 2);
      ctx.fill();

      // Inner bright sphere
      ctx.fillStyle = "#e0ffff";
      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fill();

      // Lightning arcs extending outwards from nodes
      if (Math.random() > 0.9) {
        ctx.strokeStyle = "rgba(150, 255, 255, 0.8)";
        ctx.lineWidth = 1.5;
        const angle = Math.random() * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * 15, Math.sin(angle) * 15);
        ctx.stroke();
      }

      ctx.restore();
    };

    // Positioned hovering slightly above and corresponding to the Tier 2 capacitors
    const nodePositions = [
      { x: -74 - extraBaseWidth, y: -45 },
      { x: 74 + extraBaseWidth, y: -45 },
      { x: -54 - extraBaseWidth, y: -65 },
      { x: 54 + extraBaseWidth, y: -65 },
    ];

    for (let i = 0; i < nodePositions.length; i++) {
      drawTeslaNode(nodePositions[i].x, nodePositions[i].y, i);
    }

    // Connect left nodes (0 and 2) to avoid crossing the center
    if (Math.random() > 0.95) {
      const p1 = nodePositions[0];
      const p2 = nodePositions[2];
      const bobY1 = p1.y + Math.sin(t * 2 + 0) * 5;
      const bobY2 = p2.y + Math.sin(t * 2 + 2) * 5;
      drawLightning(
        p1.x,
        bobY1,
        p2.x,
        bobY2,
        4,
        8,
        "rgba(100, 255, 255, 0.5)",
        1.5,
      );
    }

    // Connect right nodes (1 and 3) to avoid crossing the center
    if (Math.random() > 0.95) {
      const p1 = nodePositions[1];
      const p2 = nodePositions[3];
      const bobY1 = p1.y + Math.sin(t * 2 + 1) * 5;
      const bobY2 = p2.y + Math.sin(t * 2 + 3) * 5;
      drawLightning(
        p1.x,
        bobY1,
        p2.x,
        bobY2,
        4,
        8,
        "rgba(100, 255, 255, 0.5)",
        1.5,
      );
    }

    ctx.restore();
  }

  // Tier 4 (Cyan Stepped Pyramid with Floating Rings and Glowing Orb)

  const drawTier7Rings = (isFrontPass) => {
    if (tier7Prog <= 0) return;
    ctx.save();
    ctx.globalAlpha = tier7Prog * (1.0 - 0.5 * tier8Prog);
    ctx.globalCompositeOperation = "lighter";

    const ringCenterY = -150; // Orbiting high above to prevent ground clipping

    ctx.save();
    ctx.translate(0, ringCenterY);

    const numRings = 4;
    for (let i = 0; i < numRings; i++) {
      ctx.save();

      // Rings have different, nested radii
      const ringRadius = 90 + i * 25;

      // Constrain angles for 3D rotation so they don't clip into the upright Tier 4 Tesla Coil
      // We restrict angleX (tilt) to a small range (e.g., -PI/8 to PI/8)
      // The Rings can spin freely around Y, but with limited tilt in X and Z.
      // Rings act like a gyroscope: fixed tilt per ring, spinning around Y.
      const angleX = Math.PI / 3; // Tilt them so they look like rings (fixed)
      const angleY = t * 1.5 + (i * Math.PI) / (numRings / 2); // Orbit over time, offset per ring
      const angleZ = 0; // Not needed, Z rotation on an XY circle is invisible

      // 3x3 Rotation matrix to calculate true 2D projection and Z-depth
      const sinX = Math.sin(angleX),
        cosX = Math.cos(angleX);
      const sinY = Math.sin(angleY);
      const cosY = Math.cos(angleY);

      const sinZ = Math.sin(angleZ),
        cosZ = Math.cos(angleZ);

      // Elements of the combined rotation matrix R = Ry * Rx * Rz
      const r00 = cosY * cosZ + sinY * sinX * sinZ;
      const r01 = -cosY * sinZ + sinY * sinX * cosZ;
      const r10 = cosX * sinZ;
      const r11 = cosX * cosZ;
      const r20 = -sinY * cosZ + cosY * sinX * sinZ;
      const r21 = sinY * sinZ + cosY * sinX * cosZ;

      // Apply the exact affine transform for the 2D projection
      ctx.transform(r00, r10, r01, r11, 0, 0);

      // Z = r20 * cos(a) + r21 * sin(a)
      // We want to find the angles where Z = 0 (the split between front and back)
      // Z = 0 => r20 * cos(a) + r21 * sin(a) = 0 => tan(a) = -r20 / r21
      const theta0 = Math.atan2(-r20, r21);

      // Check Z at mid-point (theta0 + PI/2)
      const zAtMid =
        r20 * Math.cos(theta0 + Math.PI / 2) +
        r21 * Math.sin(theta0 + Math.PI / 2);
      const isMidFront = zAtMid >= 0;

      let startAngle, endAngle;
      if (isFrontPass) {
        startAngle = isMidFront ? theta0 : theta0 + Math.PI;
        endAngle = startAngle + Math.PI;
      } else {
        startAngle = isMidFront ? theta0 + Math.PI : theta0;
        endAngle = startAngle + Math.PI;
      }

      // Draw the ring path
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, startAngle, endAngle);

      ctx.restore(); // Restore here so strokes and nodes aren't squashed

      ctx.strokeStyle = `rgba(0, 255, 255, ${0.8 * tier7Prog})`;
      ctx.lineWidth = 4;
      ctx.stroke();

      // Inner core of the ring
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * tier7Prog})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Add energy nodes on the ring
      const numNodes = 3;
      for (let j = 0; j < numNodes; j++) {
        const nodeAngle = t * 3 + (j * Math.PI * 2) / numNodes;

        // Normalize nodeAngle to [0, 2PI]
        let normNodeAngle = nodeAngle % (Math.PI * 2);
        if (normNodeAngle < 0) normNodeAngle += Math.PI * 2;

        let nodeIsFront = false;

        // Calculate continuous z-depth to ensure node logic exactly matches arc logic
        const nz = r20 * Math.cos(nodeAngle) + r21 * Math.sin(nodeAngle);
        nodeIsFront = nz >= 0;

        if (nodeIsFront === isFrontPass) {
          const nx = Math.cos(nodeAngle) * ringRadius;
          const ny = Math.sin(nodeAngle) * ringRadius;

          const px = r00 * nx + r01 * ny;
          const py = r10 * nx + r11 * ny;

          ctx.save();
          ctx.translate(px, py);

          const pScale = 0.85 + nz * 0.35;
          ctx.scale(pScale, pScale);

          const sglow = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
          sglow.addColorStop(0, "rgba(255, 255, 255, 1.0)");
          sglow.addColorStop(0.3, "rgba(0, 255, 255, 0.9)");
          sglow.addColorStop(1, "rgba(0, 150, 255, 0)");
          ctx.fillStyle = sglow;
          ctx.beginPath();
          ctx.arc(0, 0, 16, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(0, 0, 5, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        }
      }
    }

    ctx.restore();
    ctx.restore();
  };

  const drawT5Particles = (isFront) => {
    if (tier5Prog <= 0) return;
    ctx.save();
    ctx.globalAlpha = tier5Prog;

    const numRings = 3;
    const numParticles = 3;
    const orbitSpeed = 4;

    for (let r = 0; r < numRings; r++) {
      const ringYOffset = -80 - r * 50;
      const ringWidth = 120 - r * 20;
      const ringHeight = 30; // Matches tier 4 squashed ring

      for (let i = 0; i < numParticles; i++) {
        const dir = r % 2 === 0 ? 1 : -1;
        const angle =
          t * orbitSpeed * dir +
          (i * Math.PI * 2) / numParticles +
          (r * Math.PI) / 3;

        const depth = Math.sin(angle);

        if (isFront && depth < 0) continue;
        if (!isFront && depth >= 0) continue;

        const x = Math.cos(angle) * ringWidth;
        const y = ringYOffset + depth * ringHeight;

        ctx.save();
        ctx.translate(x, y);

        const pScale = 0.85 + depth * 0.35;
        ctx.globalAlpha = tier5Prog;
        ctx.scale(pScale, pScale);

        const sglow = ctx.createRadialGradient(0, 0, 0, 0, 0, 16);
        sglow.addColorStop(0, "rgba(255, 255, 255, 1.0)");
        sglow.addColorStop(0.3, "rgba(0, 255, 255, 0.9)");
        sglow.addColorStop(1, "rgba(0, 150, 255, 0)");
        ctx.fillStyle = sglow;
        ctx.beginPath();
        ctx.arc(0, 0, 16, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }

    ctx.restore();
  };

  if (tier4Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier4Prog;

    const steps = 8;
    const stepHeight = 20;
    const baseWidth = 80;
    const numRings = 3;

    drawTier7Rings(false);

    // 1) Draw the BACK HALF of the Floating Rings first (so they are behind the pyramid)
    ctx.lineWidth = 6;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4); // Shared pulse with the orb
    for (let r = 0; r < numRings; r++) {
      ctx.save();
      const ringYOffset = -80 - r * 50;
      ctx.translate(0, ringYOffset);
      const ringWidth = 120 - r * 20;
      const ringHeight = 30; // perspective squash

      // Add cyan glow applied on top of the rings synced with orb. Glow size/intensity pulses.
      ctx.shadowColor = `rgba(0, 255, 255, ${(0.5 + pulse * 1.5) * tier4Prog})`;
      ctx.shadowBlur = 10 + pulse * 30;

      // Draw back half of the ring with full brightness
      ctx.strokeStyle = `rgba(0, 255, 255, ${0.9 * tier4Prog})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, ringWidth, ringHeight, 0, Math.PI, 0); // top half (back)
      ctx.stroke();

      // Add a pure white core to the back part of the ring for intense electric look
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.7 * tier4Prog})`;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 0; // Turn off glow for the core so it doesn't double apply intensely
      ctx.beginPath();
      ctx.ellipse(0, 0, ringWidth, ringHeight, 0, Math.PI, 0); // top half (back)
      ctx.stroke();

      ctx.restore();
    }

    drawT5Particles(false);

    // 2) Draw the Stepped Pyramid (covers the back half of the rings)
    for (let i = 0; i < steps; i++) {
      const y = -40 - i * stepHeight;
      const width = baseWidth - i * 8; // Gets narrower at the top

      if (copperPattern) {
        ctx.fillStyle = copperPattern;
      } else {
        ctx.fillStyle = "#b6673f";
      }

      ctx.fillRect(-width / 2, y - stepHeight, width, stepHeight);
	  
      // Highlight edges for stepped look
      ctx.strokeStyle = "#00ffff"; // Cyan edges
      ctx.lineWidth = 1;
      ctx.globalAlpha = tier4Prog * 0.3; // subtle
      ctx.strokeRect(-width / 2, y - stepHeight, width, stepHeight);
      ctx.globalAlpha = tier4Prog;
    }

    // 3) The Glowing Orb at the top
    const orbY = -40 - steps * stepHeight - 10;
    const orbRadius = 25;

    // pulse removed

    // Outer glow for Orb
    const orbGlow = ctx.createRadialGradient(
      0,
      orbY,
      10,
      0,
      orbY,
      60 + pulse * 20,
    );
    orbGlow.addColorStop(0, `rgba(0, 255, 255, ${0.8 * tier4Prog})`);
    orbGlow.addColorStop(0.5, `rgba(0, 150, 255, ${0.4 * tier4Prog})`);
    orbGlow.addColorStop(1, "rgba(0, 0, 255, 0)");
    ctx.fillStyle = orbGlow;
    ctx.beginPath();
    ctx.arc(0, orbY, 80, 0, Math.PI * 2);
    ctx.fill();

    // The Orb itself
    ctx.fillStyle = "#ffffff"; // pure white center
    ctx.beginPath();
    ctx.arc(0, orbY, orbRadius, 0, Math.PI * 2);
    ctx.fill();

    // Cyan inner shadow/gradient on Orb
    const orbInner = ctx.createRadialGradient(0, orbY, 0, 0, orbY, orbRadius);
    orbInner.addColorStop(0, "rgba(255,255,255,1)");
    orbInner.addColorStop(0.7, "rgba(0,255,255,1)");
    orbInner.addColorStop(1, "rgba(0,100,255,1)");
    ctx.fillStyle = orbInner;
    ctx.beginPath();
    ctx.arc(0, orbY, orbRadius, 0, Math.PI * 2);
    ctx.fill();

    // 4) Draw the FRONT HALF of the Floating Rings (covers the pyramid)
    ctx.lineWidth = 6;
    for (let r = 0; r < numRings; r++) {
      ctx.save();
      const ringYOffset = -80 - r * 50;
      ctx.translate(0, ringYOffset);
      const ringWidth = 120 - r * 20;
      const ringHeight = 30; // perspective squash

      // Add cyan glow applied on top of the rings synced with orb. Glow size/intensity pulses.
      ctx.shadowColor = `rgba(0, 255, 255, ${(0.5 + pulse * 1.5) * tier4Prog})`;
      ctx.shadowBlur = 10 + pulse * 30;

      // Draw front half of the ring
      ctx.strokeStyle = `rgba(0, 255, 255, ${0.9 * tier4Prog})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, ringWidth, ringHeight, 0, 0, Math.PI); // bottom half (front)
      ctx.stroke();

      // Add a pure white core to the front part of the ring for intense electric look
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.7 * tier4Prog})`;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 0; // Turn off glow for the core
      ctx.beginPath();
      ctx.ellipse(0, 0, ringWidth, ringHeight, 0, 0, Math.PI); // bottom half (front)
      ctx.stroke();

      ctx.restore();
    }

    drawT5Particles(true);

    drawTier7Rings(true);

    ctx.restore();
  }
  // Tier 6 (Plasma Crown)
  if (tier6Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier6Prog;

    const orbY = -40 - 8 * 20 - 10; // orb is at y = -210
    const ringRadiusX = 70;
    const ringRadiusY = 20;
    const numSatellites = 6;
    const orbitSpeed = 3;

    for (let i = 0; i < numSatellites; i++) {
      const angle = t * orbitSpeed + (i * Math.PI * 2) / numSatellites;
      const px = Math.cos(angle) * ringRadiusX;
      // Orbiting around the top orb
      const py =
        orbY + Math.sin(angle) * ringRadiusY + Math.sin(t * 5 + i) * 10;
      const depth = Math.sin(angle);

      // Pseudo-3D scale
      const scale = 0.6 + depth * 0.4;

      ctx.save();
      ctx.translate(px, py);
      ctx.scale(scale, scale);

      // Crown node glow
      const nodeGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, 25);
      nodeGlow.addColorStop(0, `rgba(255, 255, 255, ${1.0 * tier6Prog})`);
      nodeGlow.addColorStop(0.4, `rgba(0, 255, 255, ${0.8 * tier6Prog})`);
      nodeGlow.addColorStop(1, "rgba(0, 200, 255, 0)");

      ctx.fillStyle = nodeGlow;
      ctx.beginPath();
      ctx.arc(0, 0, 25, 0, Math.PI * 2);
      ctx.fill();

      // Node core
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();

      // Connect nodes to the orb with arcs
      if (Math.random() > 0.8) {
        ctx.strokeStyle = `rgba(150, 255, 255, ${0.5 * tier6Prog})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(
          -px + (Math.random() - 0.5) * 10,
          orbY - py + (Math.random() - 0.5) * 10,
        );
        ctx.stroke();
      }

      ctx.restore();
    }

    ctx.restore();
  }

  // Tier 8 (Apex Unbound Energy)
  if (tier8Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier8Prog;

    const steps = 8;
    const stepHeight = 20;
    const orbY = -40 - steps * stepHeight - 10;

    // Blinding plasma sphere enveloping the orb
    const pulse = 0.5 + 0.5 * Math.sin(t * 12);

    const glowRad = ctx.createRadialGradient(
      0,
      orbY,
      20,
      0,
      orbY,
      100 + pulse * 40,
    );
    glowRad.addColorStop(0, "rgba(255, 255, 255, 1.0)");
    glowRad.addColorStop(0.3, "rgba(0, 255, 255, 0.8)");
    glowRad.addColorStop(1, "rgba(0, 100, 255, 0)");
    ctx.fillStyle = glowRad;
    ctx.beginPath();
    ctx.arc(0, orbY, 150, 0, Math.PI * 2);
    ctx.fill();

    // Chaotic white-hot lightning firing OUT in ALL directions (360 degrees)
    const numBolts = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < numBolts; i++) {
      // Random angle in 360 degrees
      const angle = Math.random() * Math.PI * 2;
      // Random distance outwards
      const dist = 100 + Math.random() * 150;

      const destX = Math.cos(angle) * dist;
      const destY = orbY + Math.sin(angle) * dist;

      drawLightning(
        0,
        orbY,
        destX,
        destY,
        6,
        20,
        "rgba(200, 255, 255, 0.9)",
        3 + Math.random() * 3,
      );
    }

    // Small occasional side arcs from the pyramid base
    if (Math.random() > 0.5) {
      drawLightning(
        -40,
        -60,
        -100 - Math.random() * 40,
        -60 + (Math.random() - 0.5) * 40,
        4,
        15,
        "rgba(100, 255, 255, 0.7)",
        2,
      );
    }
    if (Math.random() > 0.5) {
      drawLightning(
        40,
        -60,
        100 + Math.random() * 40,
        -60 + (Math.random() - 0.5) * 40,
        4,
        15,
        "rgba(100, 255, 255, 0.7)",
        2,
      );
    }

    // Calculate and shoot lightning from orb to Tier 5 particles, and outwards from them
    if (tier5Prog > 0) {
      const numRings = 3;
      const numParticles = 3;
      const orbitSpeed = 4;

      for (let r = 0; r < numRings; r++) {
        const ringYOffset = -80 - r * 50;
        const ringWidth = 120 - r * 20;
        const ringHeight = 30;

        for (let i = 0; i < numParticles; i++) {
          // Only occasionally strike a particle
          if (Math.random() > 0.85) continue;

          const dir = r % 2 === 0 ? 1 : -1;
          const angle =
            t * orbitSpeed * dir +
            (i * Math.PI * 2) / numParticles +
            (r * Math.PI) / 3;

          const depth = Math.sin(angle);
          const x = Math.cos(angle) * ringWidth;
          const y = ringYOffset + depth * ringHeight;

          // Strike from orb to particle
          drawLightning(
            0,
            orbY,
            x,
            y,
            4,
            15,
            "rgba(150, 255, 255, 0.9)",
            2 + Math.random(),
          );

          // Strike from particle outwards
          const numOutwardBolts = 1 + Math.floor(Math.random() * 2);
          for (let b = 0; b < numOutwardBolts; b++) {
            // Add random spread to the angle outward
            const outAngle = angle + (Math.random() - 0.5);
            const dist = 60 + Math.random() * 100;
            const endX = x + Math.cos(outAngle) * dist;
            const endY = y + Math.sin(outAngle) * dist;

            drawLightning(
              x,
              y,
              endX,
              endY,
              4,
              15,
              "rgba(200, 255, 255, 0.9)",
              1.5 + Math.random() * 1.5,
            );
          }
        }
      }
    }

    ctx.restore();
  }
}

function drawRefinery(ctx, times, tier, prevTier, animProgress) {
  const t = times.base;
  const tPipe = times.pipe;
  const tTank = times.tank;
  const getProg = (targetTier) =>
    tier >= targetTier && prevTier < targetTier
      ? animProgress
      : tier >= targetTier
        ? 1
        : 0;
  const t1 = getProg(1);
  const t2 = getProg(2);
  const t3 = getProg(3);
  const t4 = getProg(4);
  const t5 = getProg(5);
  const t6 = getProg(6);
  const t7 = getProg(7);
  const t8 = getProg(8);

  if (!ironPattern && typeof activeCtx !== "undefined" && activeCtx) {
    initIronPattern(activeCtx);
  } else if (!ironPattern) {
    initIronPattern(ctx);
  }

  const baseY = -20;
  const baseWidth = 240; // Widened from 160
  const oilColor = "rgba(20, 20, 20, 1)";
  const sparkColor = "rgba(255, 255, 0, 0.9)"; // Bright yellow

  // Common function for drawing lightning bolts
  const drawLightning = (
    sx,
    sy,
    ex,
    ey,
    segments,
    jitter,
    color,
    lineWidth,
  ) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    for (let j = 1; j < segments; j++) {
      const tPos = j / segments;
      const px = sx + (ex - sx) * tPos + (Math.random() - 0.5) * jitter;
      const py = sy + (ey - sy) * tPos + (Math.random() - 0.5) * jitter;
      ctx.lineTo(px, py);
    }
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Core (white)
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = lineWidth * 0.4;
    ctx.stroke();
    ctx.restore();
  };

  // Helper to draw fluid pipes
  const drawFluidPipe = (pathsOrPts, width, fluidColor, flowSpeed, alpha = 1, capStyle = "round") => {
    if (alpha <= 0) return;
    const isMulti = pathsOrPts.length > 0 && Array.isArray(pathsOrPts[0]);
    const paths = isMulti ? pathsOrPts : [pathsOrPts];

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineJoin = "round";
    ctx.lineCap = capStyle;

    // Outer pipe
    ctx.strokeStyle = ironPattern ? ironPattern : "#5a6a75";
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const pts of paths) {
      if (pts.length === 0) continue;
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    // Shadow overlay
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.lineWidth = width * 0.7;
    ctx.stroke();

    // Specular highlight
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = width * 0.2;
    ctx.beginPath();
    for (const pts of paths) {
      if (pts.length === 0) continue;
      for (let i = 0; i < pts.length; i++) {
        if (i === 0) ctx.moveTo(pts[i].x - width * 0.15, pts[i].y - width * 0.15);
        else ctx.lineTo(pts[i].x - width * 0.15, pts[i].y - width * 0.15);
      }
    }
    ctx.stroke();

    // Fluid slit
    if (fluidColor) {
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = width * 0.35;
      ctx.beginPath();
      for (const pts of paths) {
        if (pts.length === 0) continue;
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();

      ctx.strokeStyle = fluidColor;
      ctx.lineWidth = width * 0.2;
      const dashLen = width * 2.5;
      ctx.setLineDash([dashLen, dashLen * 1.5]);
      ctx.lineDashOffset = -tPipe * flowSpeed * 20;
      ctx.stroke();

      ctx.shadowColor = fluidColor;
      ctx.shadowBlur = width;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  };


  const drawPrism3D = (x, y, w, h, d, colorTop, colorFront, colorSide, alpha, t_anim, mode = "all") => {
    if (alpha <= 0) return;
    if (mode === "none") return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(0,0,0,0.6)";

    const dx = d * 0.7;
    const dy = -d * 0.4;

    const left = x - w / 2;
    const right = x + w / 2;
    const top = y - h;
    const bottom = y;
    
    const capHeight = 12;
    const isRefinery = t_anim !== undefined;

    // The line where the main color ends and the cap begins
    const mainTop = isRefinery ? top + capHeight : top;

    const fillFace = (colorArg) => {
      if (Array.isArray(colorArg)) {
        ctx.fillStyle = colorArg[0];
        ctx.fill();
        if (colorArg[1]) {
          ctx.fillStyle = colorArg[1];
          ctx.fill();
        }
      } else {
        ctx.fillStyle = colorArg;
        ctx.fill();
      }
    };

    if (mode === "all" || mode === "bodyOnly") {
      // --- Fill the main body ---
    // Side face
    ctx.beginPath();
    ctx.moveTo(right, bottom);
    ctx.lineTo(right + dx, bottom);
    ctx.lineTo(right + dx, mainTop + dy);
    ctx.lineTo(right, mainTop);
    ctx.closePath();
    fillFace(colorSide);

    // Front face
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.lineTo(right, mainTop);
    ctx.lineTo(left, mainTop);
    ctx.closePath();
    fillFace(colorFront);

    // --- Draw the lines up to mainTop ---
    ctx.beginPath();
    // Front face outline
    ctx.moveTo(left, mainTop);
    ctx.lineTo(left, bottom);
    ctx.moveTo(right, bottom); // Lift pen, don't draw bottom line
    ctx.lineTo(right, mainTop);
    // Side face outline (bottom and right edge)
    ctx.moveTo(right, bottom);
    ctx.moveTo(right + dx, bottom); // Lift pen, don't draw bottom line
    ctx.lineTo(right + dx, mainTop + dy);
    // The vertical line separating front and side
    ctx.moveTo(right, bottom);
    ctx.lineTo(right, mainTop);
    
    // Horizontal line if it's NOT a refinery cap (i.e. standard top)
    if (!isRefinery) {
        ctx.moveTo(left, mainTop);
        ctx.lineTo(right, mainTop);
        ctx.lineTo(right + dx, mainTop + dy);
    }
    
    ctx.stroke();
    }

    // --- Draw the top/cap ---
    if (mode === "all" || mode === "capOnly") {
      if (isRefinery) {
      // The entire cap block should just be a single black polygon without inner lines.
      // We will trace the outer perimeter of the cap area.
      ctx.beginPath();
      // Start at bottom-left of front cap
      ctx.moveTo(left, mainTop);
      // Up to top-left of front face
      ctx.lineTo(left, top);
      // Up-right to top-back corner
      ctx.lineTo(left + dx, top + dy);
      // Right to top-back-right corner
      ctx.lineTo(right + dx, top + dy);
      // Down to bottom-right of side cap
      ctx.lineTo(right + dx, mainTop);
      // Back left to start
      ctx.lineTo(left, mainTop);
      ctx.closePath();
      fillFace(colorTop);
      
      // We do not stroke this so there are no lines in or around the black part.

      // Smoke particles emitting from the top cap
      const cx = x + dx / 2;
      const cy = top + dy / 2;

      ctx.globalAlpha = alpha * 0.7;
      const smokeSpeed = 0.5; // Speed scaled via globalRefineryAnimTime
      for (let i = 0; i < 4; i++) {
         const pT = (t_anim * smokeSpeed + i * 0.25) % 1;
         if (pT > 0) {
             const px = cx + (Math.sin(t_anim * 3 + i) * 5) * pT;
             const py = cy - (pT * 30);
             const pr = 3 + pT * 10;
             
             ctx.fillStyle = `rgba(100, 100, 100, ${1 - pT})`;
             ctx.beginPath();
             ctx.arc(px, py, pr, 0, Math.PI * 2);
             ctx.fill();
         }
      }
    } else {
        // Standard top face
        ctx.beginPath();
        ctx.moveTo(left, top);
        ctx.lineTo(right, top);
        ctx.lineTo(right + dx, top + dy);
        ctx.lineTo(left + dx, top + dy);
        ctx.closePath();
        fillFace(colorTop);
        ctx.stroke();
      }
    }

    ctx.restore();
  };

  const drawTank = (x, y, w, h, fluidColor, fillLevel, alpha = 1, isTier8 = false) => {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);

    // Back frame
    ctx.fillStyle = ironPattern ? ironPattern : "#2c3e50";
    ctx.fillRect(-w / 2, -h, w, h);

    // Fluid
    if (fluidColor) {
      const fHeight = h;
      const yOff = -fHeight;
      ctx.fillStyle = fluidColor;
      ctx.fillRect(-w / 2 + 2, yOff, w - 4, fHeight);

      // Bubbles
      ctx.save();
      ctx.beginPath();
      ctx.rect(-w / 2 + 2, yOff, w - 4, fHeight);
      ctx.clip();

      let bubbles = [];
      for (let i = 0; i < 8; i++) {
        const speedMult = 0.5;
        const bubbleT = (tTank * speedMult + i * 0.43) % 1; // 0 to 1 cycle
        const bubbleX =
          -w / 2 + 4 + ((i * 5) % (w - 8)) + Math.sin(tTank * 3 + i) * 2;
        const bubbleY = -bubbleT * fHeight;
        const bubbleRadius = 1 + (i % 3);

        if (bubbleY > yOff + bubbleRadius) {
          bubbles.push({x: bubbleX, y: bubbleY});
          ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
          ctx.beginPath();
          ctx.arc(bubbleX, bubbleY, bubbleRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      
      ctx.restore();
    }

    // Metal Caps
    ctx.fillStyle = ironPattern ? ironPattern : "#4a4d50";
    ctx.fillRect(-w / 2 - 2, -h - 4, w + 4, 6);
    ctx.fillRect(-w / 2 - 2, -2, w + 4, 6);

    ctx.restore();
  };

  // ----------------------------------------------------




  // Base platform (Tier 0)
  ctx.save();
  ctx.fillStyle = ironPattern ? ironPattern : "#ced2d6";
  ctx.fillRect(-baseWidth / 2, baseY, baseWidth, 20);
  ctx.fillStyle = ironPattern ? ironPattern : "#4a4d50";
  ctx.fillRect(-baseWidth / 2, baseY, baseWidth, 4);
  ctx.fillRect(-baseWidth / 2, baseY + 16, baseWidth, 4);
  ctx.restore();

  // ----------------------------------------------------
  // Tier 0 & 1: Tanks and Piping
  // ----------------------------------------------------
  ctx.save();
  ctx.globalAlpha = 1.0;

  const tankW = 50;
  const tankH = 60;
  // Adjusted left tank position to perfectly mirror the right processing unit space
  const leftTankX = -79;

  // When combining lines in one stroke via our modified drawFluidPipe,
  // overlaps do not create extra inner/outer borders! We can just pass all segments together.
  
  if (t1 > 0) {
    let allPts = [];
    allPts.push([
      { x: 0, y: baseY - tankH + 10 },
      { x: 0, y: baseY - tankH - 15 }, 
    ]);
    // The main flow path from the left tank to the right processor, made as one continuous line so the corners format properly
    allPts.push([
      { x: leftTankX, y: baseY - tankH + 10 },
      { x: leftTankX, y: baseY - tankH - 15 },
      { x: 60, y: baseY - tankH - 15 },
      { x: 60, y: baseY },
    ]);
    
    // Fade out original
    let oldPts = [];
    oldPts.push([
      { x: 0, y: baseY - tankH + 10 },
      { x: 0, y: baseY - tankH - 15 },
      { x: 60, y: baseY - tankH - 15 },
      { x: 60, y: baseY },
    ]);
    drawFluidPipe(oldPts, 8, oilColor, 2.5, 1.0 - t1, "butt");
    
    drawFluidPipe(allPts, 8, oilColor, 2.5, t1, "butt");
    
  } else {
    let allPts = [];
    allPts.push([
      { x: 0, y: baseY - tankH + 10 },
      { x: 0, y: baseY - tankH - 15 },
      { x: 60, y: baseY - tankH - 15 },
      { x: 60, y: baseY },
    ]);
    drawFluidPipe(allPts, 8, oilColor, 2.5, 1.0, "butt");
  }

  // 3. Draw the tanks
  // Central Small Tank sitting directly on the base platform
  drawTank(
    0,
    baseY - 4,
    tankW,
    tankH,
    oilColor,
    0.7 + 0.1 * Math.sin(t * 1.5),
    1.0,
    t8 > 0
  );
  
  // Left Auxiliary Tank
  if (t1 > 0) {
    drawTank(
      leftTankX,
      baseY - 4,
      tankW,
      tankH,
      oilColor,
      0.6 + 0.1 * Math.sin(t * 1.5 + 1),
      t1,
      t8 > 0
    );
  }

  // Right Side Prisms (Moved from Tier 2, now rectangular prisms)
  if (t1 > 0) {
    // Original cylinder: x=90, width=32 -> min_x=74, max_x=106
    // We set w=16, d=16 (dx=11.2). Total x extent is w + dx = 27.2.
    // To span 74 to 106 (32px):
    // Front prism: x=82 -> left=74, right+dx = 90+11.2 = 101.2
    // Back prism: x=87 -> left=79, right+dx = 95+11.2 = 106.2
    // Height=90 for both. Grounded at baseY.
    
    // Back prism (Right-most)
    drawPrism3D(
      87, baseY, 16, 90, 16,
      [ironPattern, 'rgba(0, 0, 0, 0.8)'], [ironPattern, 'rgba(0, 0, 0, 0.0)'], [ironPattern, 'rgba(0, 0, 0, 0.6)'], t1, t, "bodyOnly"
    );
    // Front prism (Middle)
    drawPrism3D(
      82, baseY, 16, 90, 16,
      [ironPattern, 'rgba(0, 0, 0, 0.8)'], [ironPattern, 'rgba(0, 0, 0, 0.0)'], [ironPattern, 'rgba(0, 0, 0, 0.3)'], t1, t, "bodyOnly"
    );
    // Unified cap
    drawPrism3D(
      84.5, baseY, 21, 90, 16,
      [ironPattern, 'rgba(0, 0, 0, 0.8)'], [ironPattern, 'rgba(0, 0, 0, 0.0)'], [ironPattern, 'rgba(0, 0, 0, 0.0)'], t1, t, "capOnly"
    );
  }

  ctx.restore();


  // ----------------------------------------------------
  // Tier 3: Catwalk and Supports
  // ----------------------------------------------------
  if (t3 > 0) {
    ctx.save();
    ctx.globalAlpha = t3;

    // The Catwalk stretching across the entire width of the iron base
    const catwalkW = 340;
    const catwalkH = 10;
    const catwalkY = baseY - 115;
    const catwalkBottom = catwalkY + catwalkH; // baseY - 105

    // Supports for the catwalk, starting from on top of the electrical boxes
    // Electrical boxes are at y = baseY - 40 (actually baseY - 60, top is -60)
    // We draw the supports up to the bottom of the catwalk
    ctx.strokeStyle = ironPattern ? ironPattern : "#444";
    ctx.lineWidth = 8;
    ctx.beginPath();
    
    // Left Box Supports (Box is at x = -150)
    ctx.moveTo(-160, baseY - 40);
    ctx.lineTo(-160, catwalkBottom);
    ctx.moveTo(-140, baseY - 40);
    ctx.lineTo(-140, catwalkBottom);
    
    // Right Box Supports (Box is at x = 150)
    ctx.moveTo(140, baseY - 40);
    ctx.lineTo(140, catwalkBottom);
    ctx.moveTo(160, baseY - 40);
    ctx.lineTo(160, catwalkBottom);
    ctx.stroke();
    
    // X-bracing for supports
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-160, baseY - 40); ctx.lineTo(-140, catwalkBottom);
    ctx.moveTo(-160, catwalkBottom); ctx.lineTo(-140, baseY - 40);
    ctx.moveTo(140, baseY - 40); ctx.lineTo(160, catwalkBottom);
    ctx.moveTo(140, catwalkBottom); ctx.lineTo(160, baseY - 40);
    ctx.stroke();

    // The Catwalk drawn on top of the supports
    ctx.fillStyle = ironPattern ? ironPattern : "#333";
    
    // Main walkway (no stroke/outline)
    ctx.fillRect(-catwalkW/2, catwalkY, catwalkW, catwalkH);
    ctx.restore();
  }

  // ----------------------------------------------------
  // Tier 5: Reinforced Support Scaffolding
  // ----------------------------------------------------
  if (t5 > 0) {
    ctx.save();
    ctx.globalAlpha = t5;

    // Heavy-duty metal scaffolding reinforcing the distillation column
    const columnY = baseY - 115;
    const columnH = 150;
    const columnW = 100;
    
    ctx.strokeStyle = ironPattern ? ironPattern : "#333";
    ctx.lineJoin = "bevel";
    
    const drawScaffoldSide = (isLeft) => {
      ctx.save();
      const dir = isLeft ? -1 : 1;
      const xStart = dir * (columnW / 2 - 5);
      const xOuter = dir * (columnW / 2 + 30);
      
      const scaffoldTopY = columnY - 95; // Lower than observation platform (columnY - 110)
      
      // Vertical main support pillars
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(xOuter, columnY);
      ctx.lineTo(xOuter, scaffoldTopY);
      ctx.stroke();
      
      // Outer pillar highlight
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(xOuter - dir * 2, columnY);
      ctx.lineTo(xOuter - dir * 2, scaffoldTopY);
      ctx.stroke();
      
      ctx.strokeStyle = ironPattern ? ironPattern : "#333";
      
      // Horizontal crossbeams connecting to column
      ctx.lineWidth = 6;
      for (let h = columnY - 20; h >= scaffoldTopY; h -= 35) {
        ctx.beginPath();
        ctx.moveTo(xStart, h);
        ctx.lineTo(xOuter, h);
        ctx.stroke();
        
        // Diagonal bracing (X pattern)
        if (h - 35 >= scaffoldTopY) {
          ctx.lineWidth = 4;
          ctx.beginPath();
          // Diagonal 1
          ctx.moveTo(xStart, h);
          ctx.lineTo(xOuter, h - 35);
          ctx.stroke();
          // Diagonal 2
          ctx.beginPath();
          ctx.moveTo(xOuter, h);
          ctx.lineTo(xStart, h - 35);
          ctx.stroke();
          ctx.lineWidth = 6; // Restore horizontal line width
        }
      }
      
      // Angle support at the base
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(xOuter, columnY - 30);
      ctx.lineTo(xOuter + dir * 20, columnY);
      ctx.stroke();
      
      // Footing pad
      ctx.fillStyle = ironPattern ? ironPattern : "#222";
      ctx.fillRect(xOuter - 10, columnY - 4, 20, 8);
      ctx.fillRect(xOuter + dir * 20 - 10, columnY - 4, 20, 8);
      
      ctx.restore();
    };

    drawScaffoldSide(true);
    drawScaffoldSide(false);
    
    ctx.restore();
  }

    // ----------------------------------------------------
  // Tier 4: Distillation Column & Piping
  // ----------------------------------------------------
  if (t4 > 0) {
    ctx.save();
    ctx.globalAlpha = t4;

    const columnY = baseY - 115; // Starts exactly on top of catwalk
    const columnH = 150;
    const columnW = 100;

    // Pipes connecting to the Distillation Column (Drawn FIRST so they are behind)
    const pipeColor = "rgba(227, 197, 20, 0.8)"; // Golden yellow energy
    
    // Array of configuration for the pipes on the left side.
    // { xOffset, heightPercent }
    // The main T4 pipe is at x=-150, 50% height
    // The others are Tier 7 pipes at varying heights
    const leftPipeConfigs = [
      { x: -170, pct: 0.75, tierAlpha: t7 },
      { x: -160, pct: 0.625, tierAlpha: t7 },
      { x: -150, pct: 0.50, tierAlpha: t4 }, // Existing T4 pipe
      { x: -140, pct: 0.375, tierAlpha: t7 },
      { x: -130, pct: 0.25, tierAlpha: t7 },
    ];
    
    for (const conf of leftPipeConfigs) {
      if (conf.tierAlpha > 0) {
        const pTargetY = columnY - (columnH * conf.pct);
        ctx.save();
        // Since we are in the t4 block which has ctx.globalAlpha = t4, we need to temporarily
        // reset it to 1 to allow drawFluidPipe to draw at the correct t7 alpha.
        ctx.globalAlpha = 1;
        drawFluidPipe([
          { x: conf.x, y: baseY - 40 },
          { x: conf.x, y: pTargetY },
          { x: -columnW/2 + 5, y: pTargetY } // Slightly inside so no gap
        ], 6, pipeColor, 2, conf.tierAlpha);
        ctx.restore();
      }
    }

    // Array of configuration for the pipes on the right side.
    const rightPipeConfigs = [
      { x: 130, pct: 0.25, tierAlpha: t7 },
      { x: 140, pct: 0.375, tierAlpha: t7 },
      { x: 150, pct: 0.50, tierAlpha: t4 }, // Existing T4 pipe
      { x: 160, pct: 0.625, tierAlpha: t7 },
      { x: 170, pct: 0.75, tierAlpha: t7 },
    ];
    
    for (const conf of rightPipeConfigs) {
      if (conf.tierAlpha > 0) {
        const pTargetY = columnY - (columnH * conf.pct);
        ctx.save();
        ctx.globalAlpha = 1;
        drawFluidPipe([
          { x: conf.x, y: baseY - 40 },
          { x: conf.x, y: pTargetY },
          { x: columnW/2 - 5, y: pTargetY } // Slightly inside so no gap
        ], 6, pipeColor, 2, conf.tierAlpha);
        ctx.restore();
      }
    }
    
    // Main Silo Body
    ctx.fillStyle = ironPattern ? ironPattern : "#8c92ac";
    
    // Silo Path
    ctx.beginPath();
    ctx.moveTo(-columnW/2, columnY);
    ctx.lineTo(-columnW/2, columnY - columnH);
    ctx.lineTo(columnW/2, columnY - columnH);
    ctx.lineTo(columnW/2, columnY);
    ctx.closePath();
    
    // Fill the pattern
    ctx.fill();
    
    // Add 3D shading/bevel overlay
    const gradient = ctx.createLinearGradient(-columnW/2, 0, columnW/2, 0);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.4)"); // Highlight on left
    gradient.addColorStop(0.3, "rgba(255, 255, 255, 0.1)");
    gradient.addColorStop(0.7, "rgba(0, 0, 0, 0.2)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0.6)"); // Shadow on right
    
    ctx.fillStyle = gradient;
    ctx.fill();

    // Silo Top (3D effect cylinder top)
    const siloTopY = columnY - columnH;
    const siloEllipseH = 5; // Semi-minor axis representing depth
    ctx.beginPath();
    ctx.ellipse(0, siloTopY, columnW/2, siloEllipseH, 0, 0, Math.PI * 2);
    ctx.fillStyle = ironPattern ? ironPattern : "#8c92ac";
    ctx.fill();
    
    // Top shading / depth bevel
    const topGradient = ctx.createRadialGradient(0, siloTopY - 5, 0, 0, siloTopY, columnW/2);
    topGradient.addColorStop(0, "rgba(255, 255, 255, 0.3)");
    topGradient.addColorStop(0.6, "rgba(0, 0, 0, 0.2)");
    topGradient.addColorStop(1, "rgba(0, 0, 0, 0.7)");
    ctx.fillStyle = topGradient;
    ctx.fill();
    
    
    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(0, siloTopY, columnW/2, siloEllipseH, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Horizontal structural rings / levels on the column
    ctx.strokeStyle = "rgba(0, 0, 0, 0.5)"; // Use transparent dark stroke instead of solid color
    ctx.lineWidth = 2;
    for (let h = columnY - 30; h > columnY - columnH; h -= 30) {
      ctx.beginPath();
      ctx.moveTo(-columnW/2, h);
      ctx.lineTo(columnW/2, h);
      ctx.stroke();
      
      // Ring highlight
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.beginPath();
      ctx.moveTo(-columnW/2, h - 2);
      ctx.lineTo(columnW/2, h - 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.5)"; // Restore for next loop
    }

    // Warning stripes at the base
    const stripeH = 8;
    const stripeY = columnY - stripeH;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-columnW/2, stripeY, columnW, stripeH);
    ctx.clip();
    
    ctx.fillStyle = "#ffcc00"; // Yellow
    ctx.fillRect(-columnW/2, stripeY, columnW, stripeH);
    ctx.fillStyle = "#111111"; // Black
    for(let sx = -columnW/2 - 20; sx < columnW/2 + 20; sx += 15) {
        ctx.beginPath();
        ctx.moveTo(sx, stripeY + stripeH);
        ctx.lineTo(sx + 10, stripeY);
        ctx.lineTo(sx + 18, stripeY);
        ctx.lineTo(sx + 8, stripeY + stripeH);
        ctx.fill();
    }
    
    // Slight shadow on top of the stripes to match column curvature
    ctx.fillStyle = gradient;
    ctx.fillRect(-columnW/2, stripeY, columnW, stripeH);
    ctx.restore();

    // Access hatch (submarine style)
    const hatchX = 0;
    const hatchY = columnY - 20;
    const hatchR = 12;
    
    // Outer hatch ring
    ctx.beginPath();
    ctx.arc(hatchX, hatchY, hatchR, 0, Math.PI * 2);
    ctx.fillStyle = ironPattern ? ironPattern : "#5c6173";
    ctx.fill();
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#222";
    ctx.stroke();
    
    // Inner hatch door
    ctx.beginPath();
    ctx.arc(hatchX, hatchY, hatchR - 3, 0, Math.PI * 2);
    ctx.fillStyle = ironPattern ? ironPattern : "#454957";
    ctx.fill();
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fill();
    ctx.stroke();
    
    // Hatch wheel
    ctx.strokeStyle = ironPattern ? ironPattern : "#999";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(hatchX, hatchY, 4, 0, Math.PI * 2);
    ctx.moveTo(hatchX - 4, hatchY);
    ctx.lineTo(hatchX + 4, hatchY);
    ctx.moveTo(hatchX, hatchY - 4);
    ctx.lineTo(hatchX, hatchY + 4);
    ctx.stroke();

    // Ladder
    const ladderX = -38;
    const ladderW = 10;
    const ladderStartY = columnY; // Starts at base
    const ladderEndY = columnY - 110; // Goes up near the top
    
    // Ladder rails
    ctx.strokeStyle = ironPattern ? ironPattern : "#333";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ladderX - ladderW/2, ladderStartY);
    ctx.lineTo(ladderX - ladderW/2, ladderEndY);
    ctx.moveTo(ladderX + ladderW/2, ladderStartY);
    ctx.lineTo(ladderX + ladderW/2, ladderEndY);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
    ctx.stroke();
    
    // Ladder rungs
    ctx.strokeStyle = ironPattern ? ironPattern : "#333";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let ry = ladderStartY - 5; ry > ladderEndY; ry -= 6) {
        ctx.moveTo(ladderX - ladderW/2, ry);
        ctx.lineTo(ladderX + ladderW/2, ry);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
    ctx.stroke();
    


  // ----------------------------------------------------
  // Tier 8: Overcharged Distillation (Dark Alloy & Neon Core)
  // ----------------------------------------------------
  if (t8 > 0) {
    ctx.save();
    ctx.globalAlpha = t8;

    const columnY = baseY - 115;
    const columnH = 150;
    const columnW = 100;
    const columnTop = columnY - columnH;



    // 2. Transparent Neon Fluid Windows
    const windowW = 40;
    const windowH = 78;
    const windowY = columnY - 36; // Centered vertically
    
    // Window Recess (Dark background)
    ctx.fillStyle = "#0a0c10";
    ctx.beginPath();
    ctx.roundRect(-windowW/2, windowY - windowH, windowW, windowH, 10);
    ctx.fill();
    
    // Inner shadow for depth
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.lineWidth = 4;
    ctx.stroke();

    // Neon fluid bubbling up
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-windowW/2, windowY - windowH, windowW, windowH, 10);
    ctx.clip();
    
    // Oil fluid level (always full)
    const fluidH = windowH;
    const fluidTop = windowY - fluidH;
    
    ctx.fillStyle = oilColor;
    ctx.fillRect(-windowW/2, fluidTop, windowW, fluidH);
    
    // High-speed upward bubbles and lightning sparks
    const bubbleCount = 15;
    let bubbles = [];
    for(let i=0; i<bubbleCount; i++) {
      const bT = (tTank * 0.5 + i * 0.3) % 1; // Fast upward movement, scaling smoothly from 0.5 to 4.0
      const bx = -windowW/2 + 5 + ((i * 7) % (windowW - 10)) + Math.sin(tTank * 1 + i)*2;
      const by = windowY - bT * windowH;
      
      if (by > fluidTop) {
        bubbles.push({x: bx, y: by});
        ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
        ctx.beginPath();
        ctx.arc(bx, by, 1 + (i%3), 0, Math.PI*2);
        ctx.fill();
      }
    }
    
    ctx.restore(); // Remove clip
    
    




    ctx.restore();
  }

    // Observation platform with railings wrapping around the column
    const platY = ladderEndY;
    const platExt = 12; // Extends out from the column by 12px on each side
    const platW = columnW + platExt * 2;
    const railingH = 15;
    
    // Platform base
    ctx.fillStyle = ironPattern ? ironPattern : "#333333";
    ctx.fillRect(-platW/2 - 1, platY, platW + 2, 4);
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(-platW/2 - 1, platY, platW + 2, 4);
    
    // Railings (Vertical posts)
    ctx.strokeStyle = ironPattern ? ironPattern : "#555555";
    ctx.lineWidth = 2;
    const numPosts = 7;
    ctx.beginPath();
    for(let i=0; i<numPosts; i++) {
        const postX = -platW/2 + (platW / (numPosts-1)) * i;
        ctx.moveTo(postX, platY);
        ctx.lineTo(postX, platY - railingH);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
    ctx.stroke();
    
    // Railings (Horizontal bars)
    ctx.strokeStyle = ironPattern ? ironPattern : "#555555";
    ctx.beginPath();
    // Top rail
    ctx.moveTo(-platW/1.99 - 1, platY - railingH);
    ctx.lineTo(platW/1.99 + 1, platY - railingH);
    // Mid rail
    ctx.moveTo(-platW/1.99 - 1, platY - railingH/2);
    ctx.lineTo(platW/1.99 + 1, platY - railingH/2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.6)";
    ctx.stroke();

    ctx.restore();
  }

    // ----------------------------------------------------
  // Tier 2: High Voltage Electrical Boxes
  // ----------------------------------------------------
  // Draw Tier 2 Electrical Boxes and Sparks on top of everything (including the iron base)
  if (t2 > 0) {
    ctx.save();
    ctx.globalAlpha = t2;
    const drawElectricalBox = (bx, by) => {
      ctx.save();
      ctx.translate(bx, by);
      
      const boxW = 60;
      const boxH = 60;
      const lw = 4;
      
      // Prevent stroke clipping by drawing the rect slightly smaller
      const pathW = boxW - lw;
      const pathH = boxH - lw;
      const pathX = -pathW / 2;
      const pathY = -pathH - lw / 2;
      
      // Box body
      ctx.fillStyle = ironPattern ? ironPattern : "#111111";
      ctx.fillRect(pathX, pathY, pathW, pathH);
      
      // 70% black overlay
      ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
      ctx.fillRect(pathX, pathY, pathW, pathH);

      ctx.strokeStyle = "#000000"; // Black outline
      ctx.lineWidth = lw;
      ctx.strokeRect(pathX, pathY, pathW, pathH);
      
      // High voltage symbol (lightning bolt) in the center
      ctx.save();
      ctx.translate(0, -boxH/2); // Center of the box
      ctx.scale(1.5, 1.5);
      ctx.fillStyle = "#e3c514"; // Yellow lightning
      ctx.beginPath();
      ctx.moveTo(3, -10); 
      ctx.lineTo(-5, 2); 
      ctx.lineTo(-1, 2); 
      ctx.lineTo(-4, 12); 
      ctx.lineTo(5, -2); 
      ctx.lineTo(1, -2); 
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Sparks flying from the edges of it infrequently (every 3 seconds)

      // Sparks flying from the edges of it infrequently (every 3 seconds)
      // At tier 8, it becomes continuous.
      const interval = 3.0;
      const threshold = 0.15;
      const sparkCycle = (t + Math.abs(bx)) % interval;
      
      // Calculate a probability of an extra spark to simulate the high frequency of Tier 8 without modulo jumping
      const t8Prog = typeof t8 !== 'undefined' ? t8 : 0;
      const extraSparkProb = t8Prog * 1.0; // 100% chance of a spark per frame at max t8
      const hash = Math.abs(Math.sin(t * 123.456 + bx)) % 1;
      
      if (sparkCycle < threshold || hash < extraSparkProb) {

        ctx.strokeStyle = sparkColor;
        ctx.lineWidth = 2;
        // Generate 1-2 sparks
        for (let i = 0; i < 2; i++) {
          const side = Math.random() > 0.5 ? 1 : -1;
          const sparkX = (boxW/2) * side;
          const sparkY = -boxH + Math.random() * boxH;
          
          ctx.beginPath();
          ctx.moveTo(sparkX, sparkY);
          const extX = sparkX + side * (10 + Math.random() * 15);
          const extY = sparkY + (Math.random() - 0.5) * 20;
          ctx.lineTo(extX, extY);
          ctx.lineTo(extX + side * (5 + Math.random() * 10), extY + (Math.random() - 0.5) * 10);
          ctx.stroke();
        }
      }

      ctx.restore();
    };

    // Draw left and right electrical boxes on the ground
    drawElectricalBox(-150, baseY + 20);
    drawElectricalBox(150, baseY + 20);

    ctx.restore();
  }


  // ----------------------------------------------------
  // Tier 6: Energized Conduit Frame
  // ----------------------------------------------------
  if (t6 > 0) {
    ctx.save();
    ctx.globalAlpha = t6;

    // Use pure white for the frame glow
    const frameGlow = "rgba(255, 255, 255, 0.9)"; // White base
    ctx.strokeStyle = frameGlow;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // Adjust left edge to -120 and right edge to +120 (iron base width is 240)
    // Max out height just above distillation column (column top is at baseY - 115 - 150 = baseY - 265)
    const frameTopY = baseY - 282;
    
    // Because we are overlapping Tier 2, we start the frame at baseY
    
    const drawFramePath = () => {
      ctx.beginPath();
      // Left leg
      ctx.moveTo(-115, baseY);
      ctx.lineTo(-115, frameTopY);
      
      // Top connector
      ctx.lineTo(115, frameTopY);
      
      // Right leg
      ctx.lineTo(115, baseY);
    };

    // Fill with white color (since user asked for inverse colors, white background, yellow pulse)
    ctx.fillStyle = ironPattern ? ironPattern : "#1a1c23";
    
    // To fill it properly, we need a closed shape with thickness
    ctx.beginPath();
    // Outer edge (left to right)
    ctx.moveTo(-120, baseY);
    ctx.lineTo(-120, frameTopY - 5);
    ctx.lineTo(120, frameTopY - 5);
    ctx.lineTo(120, baseY);
    // Inner edge (right to left)
    ctx.lineTo(110, baseY);
    ctx.lineTo(110, frameTopY + 5);
    ctx.lineTo(-110, frameTopY + 5);
    ctx.lineTo(-110, baseY);
    ctx.closePath();
    ctx.fill();

    // Draw thin glowing white strip in the middle
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "rgba(255, 255, 255, 1)";
    drawFramePath();
    ctx.stroke();
    
    // Animate energy pulses converging to the center
    // Increased frequency: smaller gap
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#FFFF00"; // Pure bright yellow
    ctx.shadowBlur = 25;
    ctx.shadowColor = "rgba(255, 255, 0, 1)";
    
    const pulseLength = 30;
    const gapLength = 100; // Much smaller gap for more frequent pulses
    ctx.setLineDash([pulseLength, gapLength]);
    
    // Speed of convergence
    const speed = 250;
    
    // Left side pulse (moving from start to center)
    ctx.save();
    ctx.lineDashOffset = - (t * speed) % (pulseLength + gapLength);
    ctx.beginPath();
    ctx.moveTo(-115, baseY);
    ctx.lineTo(-115, frameTopY);
    ctx.lineTo(0, frameTopY); // Stop at center
    ctx.stroke();
    ctx.restore();
    
    // Right side pulse (moving from end to center)
    // To make it move backwards, we draw the path in reverse
    ctx.save();
    ctx.lineDashOffset = - (t * speed) % (pulseLength + gapLength);
    ctx.beginPath();
    ctx.moveTo(115, baseY);
    ctx.lineTo(115, frameTopY);
    ctx.lineTo(0, frameTopY); // Stop at center
    ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

}

function drawVault(ctx, t, tier, prevTier, animProgress) {
  if (!pureGoldPattern && activeCtx) {
    initPureGoldPattern(activeCtx);
  } else if (!pureGoldPattern) {
    initPureGoldPattern(ctx);
  }

  const fillGold = pureGoldPattern ? pureGoldPattern : "#FFD700";
  const darkMetal = "#000000";
  
  // Progress helpers for smooth fading
  const getProg = (targetTier) => tier >= targetTier && prevTier < targetTier ? animProgress : (tier >= targetTier ? 1 : 0);

  const t0 = getProg(0);
  const t1 = getProg(1);
  const t2 = getProg(2);
  const t3 = getProg(3);
  const t4 = getProg(4);
  const t5 = getProg(5);
  const t6 = getProg(6);
  const t7 = getProg(7);
  const t8 = getProg(8);

  // --- Utility Functions for this building ---
  const drawCyberLine = (x1, y1, x2, y2, color, width, alpha) => {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  };

  const drawPolygon = (points, fill, stroke, strokeW, alpha) => {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeW || 1;
      ctx.stroke();
    }
    ctx.restore();
  };

  // Tier 7 (Seismic Lockdown Clamps) back half is no longer needed.

const drawForcefield = (radiusX, radiusY, centerY, bottomY, alpha, hexScale, timeMultiplier = 1.0) => {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    
    // Smooth 3D Red Holographic Shield Barrier
    const domeGrad = ctx.createRadialGradient(0, centerY + radiusY*0.3, radiusY*0.1, 0, centerY, radiusX);
    domeGrad.addColorStop(0, "rgba(255, 0, 0, 0.05)");
    domeGrad.addColorStop(0.7, "rgba(255, 0, 0, 0.2)");
    domeGrad.addColorStop(1, "rgba(255, 0, 0, 0.8)");
    
    ctx.fillStyle = domeGrad;
    ctx.strokeStyle = "rgba(255, 50, 50, 0.8)";
    ctx.lineWidth = 3;
    
    // Draw the main dome
    ctx.beginPath();
    ctx.ellipse(0, centerY, radiusX, radiusY, 0, Math.PI, 0); 
    ctx.lineTo(radiusX, bottomY);
    ctx.lineTo(-radiusX, bottomY);
    ctx.closePath();
    
    // Animated flowing 3D Hexagonal pattern
    ctx.save();
    
    // Fill the dome over it
    ctx.fill();
    ctx.clip(); // clip hexes to the dome shape
    
    // Draw the hex grid using standard pattern logic mapped spherically
    ctx.strokeStyle = "rgba(255, 100, 100, 0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    const hexSize = 15 * hexScale;
    const scrollSpeed = 20 * hexScale;
    const offsetY = (t * timeMultiplier * scrollSpeed) % (hexSize * Math.sqrt(3));
    
    // Distance across dome to equator is (PI / 2) * radiusX.
    // Past that, it travels vertically.
    const max_hex_dist = (Math.PI / 2) * radiusX + Math.max(0, bottomY - centerY) + 100;

    const maxRows = Math.ceil((max_hex_dist) / (hexSize * Math.sqrt(3))) + 4;
    const minRows = -2;
    const maxCols = Math.ceil((max_hex_dist) / (hexSize * 1.5)) + 4;
    
    // Pole Y is the very top of the dome
    const poleY = centerY - radiusY;
    
    for (let row = minRows; row <= maxRows; row++) {
      for (let col = -maxCols; col <= maxCols; col++) {
        let hx = col * hexSize * 1.5;
        let hy = row * hexSize * Math.sqrt(3) + (col % 2 === 0 ? 0 : hexSize * Math.sqrt(3) / 2) + offsetY;
        
        // Skip hexes completely out of bounds (using 2D radial distance)
        let centerDist = Math.sqrt(hx*hx + hy*hy);
        if (centerDist > max_hex_dist) continue;
        
        for (let i = 0; i < 6; i++) {
          let a1 = i * Math.PI / 3;
          let a2 = (i + 1) * Math.PI / 3;
          
          let px1 = hx + hexSize * Math.cos(a1);
          let py1 = hy + hexSize * Math.sin(a1);
          let px2 = hx + hexSize * Math.cos(a2);
          let py2 = hy + hexSize * Math.sin(a2);
          
          const mapPoint = (px, py) => {
            let dist = Math.sqrt(px*px + py*py);
            
            // Limit wrapping around to the back or going way too far down
            if (dist > max_hex_dist) return null;
            
            let angle = Math.atan2(py, px);
            
            let sR;
            let my;
            
            // If it's above the equator, map to the ellipse
            if (dist / radiusX <= Math.PI / 2) {
              sR = radiusX * Math.sin(dist / radiusX);
              my = centerY - radiusY * Math.cos(dist / radiusX);
            } else {
              // Once it passes the equator, it travels straight down like a cylinder
              sR = radiusX;
              let pastEquatorDist = dist - (Math.PI / 2) * radiusX;
              my = centerY + pastEquatorDist;
            }
            
            let mx = Math.cos(angle) * sR;
            
            // Safe buffer instead of strict clipping
            if (my > bottomY + 100) return null;
            
            return {x: mx, y: my};
          };
          
          let p1 = mapPoint(px1, py1);
          let p2 = mapPoint(px2, py2);
          
          // Only draw if both points are valid (prevents connecting front/back and over bounds)
          if (p1 && p2) {
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
          }
        }
      }
    }
    
    ctx.stroke();
    
    // Add glow
    ctx.shadowColor = "#ff0000";
    ctx.shadowBlur = 10;
    ctx.stroke();
    
    ctx.restore();
    
    // Stroke main dome outline on top
    ctx.strokeStyle = "rgba(255, 50, 50, 0.8)";
    ctx.lineWidth = 4;
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.stroke();
    
    ctx.restore();
  };

  // --- Tier 0: Classic Safe ---
  const drawT0Vault = (alpha) => {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    
    // Main solid golden cube
    drawPolygon([
      {x: -60, y: 0}, {x: -60, y: -100}, {x: 60, y: -100}, {x: 60, y: 0}
    ], fillGold, darkMetal, 4, alpha);
    
    // Vault door outline
    ctx.strokeStyle = darkMetal;
    ctx.lineWidth = 2;
    ctx.strokeRect(-50, -90, 100, 80);
    
    // Central mechanical dial
    ctx.fillStyle = darkMetal;
    ctx.beginPath();
    ctx.arc(0, -50, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Dial markers
    ctx.save();
    ctx.translate(0, -50);
    ctx.rotate(t * 0.5); // Slow mechanical turn
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(18, 0);
      ctx.stroke();
      ctx.rotate((Math.PI * 2) / 12);
    }
    ctx.restore();
    
    // Handle (rounded rectangle)
    const drawRoundRect = (x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };
    
    drawRoundRect(31, -62, 8, 24, 4);
    ctx.fillStyle = "#000000";
    ctx.fill();
    ctx.strokeStyle = darkMetal;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    
    ctx.restore();
  };

  ctx.save();
  // Move building up for T1 reinforcements (with cross-fade for T0)
  if (tier >= 1) {
    if (prevTier === 0 && tier === 1) {
      drawT0Vault(1 - t1);
      ctx.translate(0, -15);
      drawT0Vault(t1);
    } else {
      ctx.translate(0, -15);
      drawT0Vault(1);
    }
  } else {
    drawT0Vault(t0);
  }

  // --- Tier 1: Heavy Reinforced Frame ---
  if (t1 > 0) {
    ctx.save();
    ctx.globalAlpha = t1;
    
    // Steel framing Outline (Darkened pure gold texture)
    
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 15;
    ctx.strokeRect(-67.5, -107.5, 135, 115);
    
    // Draw 1px black outline on edges of the thick frame
    ctx.strokeStyle = darkMetal;
    ctx.lineWidth = 1;
    ctx.strokeRect(-75, -115, 150, 130); // outer bound
    ctx.strokeRect(-60, -100, 120, 100); // inner bound

    // Large industrial rivets
    ctx.fillStyle = "#888";
    
    // The frame is drawn at x: -67.5, y: -107.5, width: 135, height: 115
    // Left edge: x = -67.5
    // Right edge: x = 67.5
    // Top edge: y = -107.5
    // Bottom edge: y = 7.5
    // The corner coordinates are: (-67.5, -107.5), (67.5, -107.5), (67.5, 7.5), (-67.5, 7.5)
    
    const corners = [
      {x: -67.5, y: -107.5},
      {x: 67.5, y: -107.5},
      {x: 67.5, y: 7.5},
      {x: -67.5, y: 7.5}
    ];
    
    // Draw corners
    for (let p of corners) {
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
    }
    
    // Draw edges
    // Distance horizontally is 135. Let's do 8 intervals (7 intermediate points)
    // Distance vertically is 115. Let's do 7 intervals (6 intermediate points)
    
    const hIntervals = 7;
    const vIntervals = 6;
    
    // Top and Bottom edges
    for (let i = 1; i < hIntervals; i++) {
      let x = -67.5 + (135 * i / hIntervals);
      ctx.beginPath(); ctx.arc(x, -107.5, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, 7.5, 3, 0, Math.PI * 2); ctx.fill();
    }
    
    // Left and Right edges
    for (let i = 1; i < vIntervals; i++) {
      let y = -107.5 + (115 * i / vIntervals);
      ctx.beginPath(); ctx.arc(-67.5, y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(67.5, y, 3, 0, Math.PI * 2); ctx.fill();
    }
    
    ctx.restore();
  }

  // --- Tier 2: Electronic Upgrade ---
  if (t2 > 0) {
    ctx.save();
    ctx.globalAlpha = t2;
    
    // Electronic keypad (shifted up to y=-88 to match horizontal margin of 2px)
    ctx.fillStyle = "#111";
    ctx.fillRect(-48, -88, 25, 36);
    
    // Blinking status lights
    const fastBlink = (Math.sin(t * 15) > 0) ? "#00ff00" : "#ff0000";
    ctx.fillStyle = fastBlink;
    ctx.beginPath();
    ctx.arc(-35.5, -80.5, 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Keypad grid
    ctx.fillStyle = "#555";
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        ctx.fillRect(-45 + c * 7, -73 + r * 7, 5, 5);
      }
    }
    
    ctx.restore();
  }

  // --- Tier 3: External Security Sensors ---
  if (t3 > 0) {
    ctx.save();
    ctx.globalAlpha = t3;

      ctx.fillStyle = fillGold;
    // Vault + T1 reinforcement total height is 130px (-115 to +15), top is -115, base is 15
    ctx.fillRect(-90, -115, 10, 130);
    ctx.fillRect(80, -115, 10, 130);
    
    // Sweeping laser scanners
    const sweep = Math.sin(t * 2);
    const laserY = -50 + sweep * 60; // sweep mostly along the new height
    
    ctx.strokeStyle = "rgba(255, 0, 0, 0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-80, laserY);
    ctx.lineTo(80, laserY);
    ctx.stroke();
    
    // Laser glow removed per request (laser is shooting from the inside side of the base, perpendicular to POV)
    
    ctx.restore();
  }

  // --- Tier 4: Core Feature - High-tech Energy Security System ---
  if (t4 > 0) {
    drawForcefield(130, 100, -50, 15, t4, 2.0, 1.0);
  }

  // --- Tier 5: Energy Pylons & Lightning ---
  if (t5 > 0) {
    ctx.save();
    ctx.globalAlpha = t5;
    
    const drawObeliskPylon = (xPos) => {
      ctx.save();
      ctx.translate(xPos, 15); // Anchor to ground
      
      // Base pedestal (pure gold texture)
      ctx.fillStyle = fillGold;
      ctx.beginPath();
      ctx.moveTo(-20, 0);
      ctx.lineTo(20, 0);
      ctx.lineTo(15, -10);
      ctx.lineTo(-15, -10);
      ctx.closePath();
      ctx.fill();
      
      // Main obelisk body (sleek metallic)
      ctx.fillStyle = fillGold;
      ctx.beginPath();
      ctx.moveTo(-15, -10);
      ctx.lineTo(15, -10);
      ctx.lineTo(8, -140);
      ctx.lineTo(0, -155);
      ctx.lineTo(-8, -140);
      ctx.closePath();
      ctx.fill();
      
      // Inner glowing core track (exposed center)
      const pulse = (Math.sin(t * 5) + 1) / 2;
      ctx.fillStyle = `rgba(255, 0, 0, ${0.5 + pulse * 0.5})`;
      ctx.beginPath();
      ctx.moveTo(-4, -20);
      ctx.lineTo(4, -20);
      ctx.lineTo(2, -130);
      ctx.lineTo(-2, -130);
      ctx.closePath();
      ctx.fill();
      
      // Top energy sphere
      ctx.fillStyle = `rgba(255, 50, 50, ${0.8 + pulse * 0.2})`;
      ctx.beginPath();
      ctx.arc(0, -155, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = "#ff0000";
      ctx.shadowBlur = 10;
      ctx.fill();
      
      ctx.restore();
    };

    drawObeliskPylon(-165);
    drawObeliskPylon(165);
    
    // Animated lightning arcs to shield
    if (Math.random() > 0.3) {
      ctx.strokeStyle = "rgba(255, 50, 50, 0.8)"; // Red color
      ctx.lineWidth = 2;
      
      // Arc from left pylon top sphere (-165, 15 - 155 = -140)
      ctx.beginPath();
      ctx.moveTo(-165, -140);
      ctx.lineTo(-80 + Math.random()*20 - 10, -80 + Math.random()*20 - 10);
      ctx.lineTo(0, -50); // Connects to center mechanical dial
      ctx.stroke();
      
      // Arc from right pylon top sphere (165, 15 - 155 = -140)
      ctx.beginPath();
      ctx.moveTo(165, -140);
      ctx.lineTo(80 + Math.random()*20 - 10, -80 + Math.random()*20 - 10);
      ctx.lineTo(0, -50); // Connects to center mechanical dial
      ctx.stroke();
    }
    
    ctx.restore();
  }

  // --- Tier 6: Autonomous Defense Drones ---
  if (t6 > 0) {
    ctx.save();
    ctx.globalAlpha = t6;
    
    const numDrones = 5;
    for (let i = 0; i < numDrones; i++) {
      ctx.save();
      // Calculate drone position using time and phase
      const phase = (i / numDrones) * Math.PI * 2;
      const orbitRadiusX = 220;
      const orbitRadiusY = 60;
      
      // Figure-8 pattern / complex orbit
      const angle = t * 1.5 + phase;
      const dx = Math.cos(angle) * orbitRadiusX;
      // y follows a sine wave to go up and down, plus a bit of tilt based on x
      const dy = Math.sin(angle * 2) * 30 - 80 + Math.sin(angle) * orbitRadiusY;
      
      // Perspective scaling based on y-position in the orbit (closer = bigger)
      const z = Math.sin(angle); // -1 is back, 1 is front
      const scale = 0.8 + (z + 1) * 0.4; // 0.8 to 1.6
      
      // Render back-half drones behind the shield (t8) and vault, front-half in front. 
      // Simplified here: we'll just draw them in their 3D paths with a z-index simulated scale.
      
      ctx.translate(dx, dy);
      ctx.scale(scale, scale);
      
      // Drone Body (sleek diamond / angular shape)
      ctx.fillStyle = darkMetal;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(8, 0);
      ctx.lineTo(0, 10);
      ctx.lineTo(-8, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = fillGold;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
      // Drone Core (pulsing red eye)
      const dronePulse = (Math.sin(t * 10 + i) + 1) / 2;
      ctx.fillStyle = `rgba(255, 50, 50, ${0.8 + dronePulse * 0.2})`;
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      
      // Drone Thruster Trail / Glow
      ctx.shadowColor = "#ff0000";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "rgba(255, 50, 50, 0.6)";
      ctx.beginPath();
      ctx.arc(0, 10, 4, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();
    }
    
    ctx.restore();
  }

  // --- Tier 7: Holographic Surveillance Eye ---
  if (t7 > 0) {
    ctx.save();
    ctx.globalAlpha = t7;
    
    // Position floating above the vault
    ctx.translate(0, -180 + Math.sin(t * 2) * 10);
    
    // Scanner Cone (Sweeping beam downwards)
    const scanSweep = Math.sin(t * 3) * 0.5; // sweep left/right
    ctx.save();
    ctx.rotate(scanSweep);
    
    // Create conical gradient for scanner beam
    const beamGrad = ctx.createLinearGradient(0, 0, 0, 180);
    beamGrad.addColorStop(0, "rgba(255, 0, 0, 0.4)");
    beamGrad.addColorStop(1, "rgba(255, 0, 0, 0.0)");
    
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(100, 180);
    ctx.lineTo(-100, 180);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    
    // Holographic Eye Structure (Sleek sci-fi construct)
    ctx.fillStyle = darkMetal;
    ctx.beginPath();
    ctx.moveTo(0, -25);
    ctx.lineTo(30, 0);
    ctx.lineTo(0, 25);
    ctx.lineTo(-30, 0);
    ctx.closePath();
    ctx.fill();
    
    ctx.strokeStyle = fillGold;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Inner Rings (Rotating)
    ctx.save();
    ctx.rotate(t * 1.5);
    ctx.strokeStyle = "rgba(255, 50, 50, 0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 8, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    
    ctx.save();
    ctx.rotate(-t * 2);
    ctx.strokeStyle = "rgba(255, 50, 50, 0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 15, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    
    // Central Red Pupil / Core
    const eyePulse = (Math.sin(t * 8) + 1) / 2;
    ctx.fillStyle = `rgba(255, 0, 0, ${0.7 + eyePulse * 0.3})`;
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.shadowColor = "#ff0000";
    ctx.shadowBlur = 15;
    ctx.fill();
    
    // Top & Bottom communication antennas/spikes
    ctx.strokeStyle = fillGold;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -25);
    ctx.lineTo(0, -40);
    ctx.moveTo(0, 25);
    ctx.lineTo(0, 40);
    ctx.stroke();
    
    ctx.restore();
  }
  // --- Tier 8: Aegis Matrix Shield Upgrade ---
  if (t8 > 0) {
    // RadiusX: 260 covers cannons
    // RadiusY shrunk to 160. CenterY -50. Base is 15.
    drawForcefield(260, 160, -50, 15, t8, 2.0, 2.0);
  }
  
  ctx.restore();

  // Custom ground overlay for Vault
  ctx.save();
  const targetScale = 1.0 + tier * 0.1;
  const startScale = 1.0 + prevTier * 0.1;
  const currentScale = startScale + (targetScale - startScale) * animProgress;
  ctx.scale(1 / currentScale, 1 / currentScale);
  
  const floorH = 260;
  
  ctx.fillStyle = "rgb(42, 30, 24)";
  ctx.fillRect(-1600, 0, 3200, floorH);

  ctx.fillStyle = "rgb(28, 20, 16)";
  ctx.fillRect(-1600, floorH - floorH * 0.8, 3200, floorH * 0.8);
  
  ctx.fillStyle = "rgb(18, 12, 10)";
  ctx.fillRect(-1600, floorH - floorH * 0.6, 3200, floorH * 0.6);
  ctx.restore();

}

function drawOilRig(ctx, t, tier) {
  ctx.fillStyle = "#50c3ca";
  ctx.beginPath();
  ctx.moveTo(-40, 0);
  ctx.lineTo(-20, -120);
  ctx.lineTo(20, -120);
  ctx.lineTo(40, 0);
  ctx.fill();

  const drillY = Math.sin(t * 10) * 10;
  ctx.fillStyle = "#111";
  ctx.fillRect(-5, -120 + drillY, 10, 140);
}

function drawGreenhouse(ctx, t, tier) {
  ctx.fillStyle = "rgba(35, 171, 27, 0.3)";
  ctx.fillRect(-70, -60, 140, 60);
  ctx.beginPath();
  ctx.arc(0, -60, 70, Math.PI, 0);
  ctx.fill();

  ctx.fillStyle = "#47d13f";
  ctx.beginPath();
  ctx.moveTo(-30, 0);
  ctx.lineTo(-20, -40);
  ctx.lineTo(-10, 0);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(30, 0);
  ctx.lineTo(20, -50 + Math.sin(t) * 10);
  ctx.lineTo(10, 0);
  ctx.fill();
}

function drawRadiator(ctx, t, tier) {
  ctx.fillStyle = "#444";
  ctx.fillRect(-40, -100, 80, 100);

  const glow = Math.abs(Math.sin(t * 4));
  ctx.fillStyle = `rgba(230, 69, 69, ${0.5 + glow * 0.5})`;

  for (let i = 0; i < 5; i++) {
    ctx.fillRect(-30, -90 + i * 18, 60, 10);
  }
}

function drawCentrifuge(ctx, t, tier) {
  ctx.fillStyle = "#555";
  ctx.fillRect(-20, -80, 40, 80);

  ctx.save();
  ctx.translate(0, -40);
  ctx.rotate(t * 5);

  ctx.fillStyle = "#1c38d6";
  ctx.fillRect(-60, -10, 120, 20);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(-50, 0, 8, 0, Math.PI * 2);
  ctx.arc(50, 0, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawBeacon(ctx, t, tier) {
  ctx.fillStyle = "#330d58";
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
  grad.addColorStop(0, "rgba(147, 82, 216, 0.8)");
  grad.addColorStop(1, "rgba(147, 82, 216, 0)");
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
  grad.addColorStop(0, "#fff");
  grad.addColorStop(0.2, "#00ffff");
  grad.addColorStop(0.5, "#ff00ff");
  grad.addColorStop(1, "#000");

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.save();
  ctx.rotate(t);
  ctx.scale(1, 0.3);
  ctx.beginPath();
  ctx.arc(0, 0, r * 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.rotate(-t * 1.5);
  ctx.scale(0.3, 1);
  ctx.beginPath();
  ctx.arc(0, 0, r * 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.restore();

  ctx.fillStyle = "#222";
  ctx.fillRect(-50, -20, 100, 20);
}
