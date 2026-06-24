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

const TIERS = [10, 25, 50, 100, 200, 400, 800, 1000];

const imageCache = {};
let stonePattern = null;
let copperPattern = null;
let ironPattern = null;

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
  else if (id === "crystal")
    topY = -(100 + tier * 10) - 30;
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
  else if (id === "iron") drawRefinery(ctx, t, tier, prevTier, animProgress);
  else if (id === "pure_gold") drawVault(ctx, t, tier);
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
      return 180;
    };

    const targetOffset = getOffset(id, tier);
    const startOffset = prevTier >= 0 ? getOffset(id, prevTier) : getOffset(id, 0);
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
  if (tier2Prog > 0 && typeof ipts !== "undefined" && typeof ifaces !== "undefined" && ifaces && ifaces.iedges) {
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
    if (tier2Prog > 0 && typeof ipts !== "undefined" && typeof ifaces !== "undefined" && ifaces && ifaces.iedges) {
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
  const center = project(0, -h / 2, 0);

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
    ctx.arc(center.x, center.y, (8 + t7WidthAdd / 2) * (1 - tier8Prog), 0, Math.PI * 2);
    ctx.fill();

    // Dispersed Rainbow Beams (exiting horizontally left and right)
    const colors = [
      "#ff0000",
      "#ff7f00",
      "#ffff00",
      "#00ff00",
      "#00ffff",
      "#0000ff",
      "#ff00ff",
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

  // Tier 5: Orbiting Crystal Shards
  if (tier5Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier5Prog;

    const numShards = 6;
    const orbitRadius = 70 + tier6Prog * 20;

    for (let i = 0; i < numShards; i++) {
      const orbitRot = t * 1.5 + (i * Math.PI * 2) / numShards;
      const sx = Math.cos(orbitRot) * orbitRadius;
      const sz = Math.sin(orbitRot) * orbitRadius;
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
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";

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
    const corePulse = 6 + Math.random() * 6;
    ctx.arc(center.x, center.y, corePulse, 0, Math.PI * 2);
    ctx.fill();

    // SYMMETRICAL Rainbow Beams (Left and Right)
    const colors = [
      "#ff0000",
      "#ff7f00",
      "#ffff00",
      "#00ff00",
      "#00ffff",
      "#0000ff",
      "#ff00ff",
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

  // Draw FRONT edges of the inner prism
  if (tier2Prog > 0 && typeof ipts !== "undefined" && typeof ifaces !== "undefined" && ifaces && ifaces.iedges) {
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
    if (tier2Prog > 0 && typeof ipts !== "undefined" && typeof ifaces !== "undefined" && ifaces && ifaces.iedges) {
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
}

function drawFoundry(ctx, t, tier, prevTier, animProgress) {
  // Base structure (Tier 0+)
  if (!stonePattern && activeCtx) {
    initStonePattern(activeCtx);
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
      const lavaLevelBase = 0.7; // 70% full
      const lavaLevelFluctuation = 0.05 * Math.sin(t * 2);
      const currentLavaHeight =
        containerHeight * (lavaLevelBase + lavaLevelFluctuation);
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
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.fillRect(siloX + 3, siloY + 2, 5, containerHeight - 4);
      ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
      ctx.fillRect(siloX + 8, siloY + 2, 3, containerHeight - 4);

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
  const doorWidth = 40 + tier4Prog * 20;
  const doorHeight = 40 + tier4Prog * 20;
  const pulse = Math.abs(Math.sin(t * 5));
  const corePulse = 0.8 + 0.2 * Math.sin(t * 15);

  ctx.fillStyle = "#050505";
  ctx.fillRect(-doorWidth / 2, -doorHeight, doorWidth, doorHeight);

  const showTier8ForCore = tier >= 8 ? 1 : 0;
  const tier8CoreProg =
    tier >= 8 && prevTier < 8 ? animProgress : showTier8ForCore;

  if (tier4Prog > 0) {
    // Plasma core
    const tier8CoreMult = 1 + tier8CoreProg * 1.5;
    const coreRadius = (15 + pulse * 5) * tier4Prog * tier8CoreMult;
    const coreGrad = ctx.createRadialGradient(
      0,
      -doorHeight / 2,
      0,
      0,
      -doorHeight / 2,
      coreRadius * 2,
    );
    coreGrad.addColorStop(0, "#ffffff");
    coreGrad.addColorStop(0.2, "#ffcc00");
    coreGrad.addColorStop(0.5, "#ff3300");
    coreGrad.addColorStop(1, "rgba(255, 50, 0, 0)");

    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, -doorHeight / 2, coreRadius * 2, 0, Math.PI * 2);
    ctx.fill();

    // Light rays casting outwards
    ctx.save();
    ctx.translate(0, -doorHeight / 2);
    for (let i = 0; i < 6; i++) {
      const angle = (t * 2 + (i * Math.PI) / 3) % (Math.PI * 2);
      ctx.rotate(angle);

      const rayLen = 80 * tier4Prog * corePulse * tier8CoreMult;
      const rayGrad = ctx.createLinearGradient(0, 0, 0, rayLen);
      const rayAlpha = Math.min(1.0, 0.4 * tier4Prog + 0.4 * tier8CoreProg);
      rayGrad.addColorStop(0, `rgba(255, 200, 100, ${rayAlpha})`);
      rayGrad.addColorStop(1, "rgba(255, 50, 0, 0)");

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
    ctx.fillRect(
      -doorWidth / 2 + 5,
      -doorHeight + 5,
      doorWidth - 10,
      doorHeight - 5,
    );
  }

  const castGlowRadius =
    (60 + tier4Prog * 60) *
    (1 + (typeof tier8CoreProg !== "undefined" ? tier8CoreProg : 0));
  const groundGlow = ctx.createRadialGradient(
    0,
    -doorHeight / 2,
    10,
    0,
    0,
    castGlowRadius,
  );
  if (tier4Prog > 0) {
    groundGlow.addColorStop(
      0,
      `rgba(255, 100, 0, ${0.4 * tier4Prog * corePulse})`,
    );
    groundGlow.addColorStop(1, "rgba(255, 50, 0, 0)");
  } else {
    groundGlow.addColorStop(0, `rgba(255, ${150 + pulse * 50}, 0, 0.4)`);
    groundGlow.addColorStop(1, "rgba(255, 100, 0, 0)");
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
  const drawLightning = (sx, sy, ex, ey, segments, jitter, color, lineWidth) => {
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
    for(let i=0; i<numCoils; i++) {
      ctx.beginPath();
      ctx.moveTo(-prongOffset - 8, -40 - prongHeight + 5 + i*coilSpacing);
      ctx.lineTo(-prongOffset + 8, -40 - prongHeight + 7 + i*coilSpacing);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(prongOffset - 8, -40 - prongHeight + 5 + i*coilSpacing);
      ctx.lineTo(prongOffset + 8, -40 - prongHeight + 7 + i*coilSpacing);
      ctx.stroke();
    }

    // Faint glow
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    const topY = -40 - prongHeight;
    const glowRad = ctx.createRadialGradient(-prongOffset, topY, 0, -prongOffset, topY, 20 + 10*tier1Prog);
    glowRad.addColorStop(0, `rgba(0, 200, 255, ${0.4 * pulse})`);
    glowRad.addColorStop(1, "rgba(0, 200, 255, 0)");
    ctx.fillStyle = glowRad;
    ctx.beginPath(); ctx.arc(-prongOffset, topY, 20 + 10*tier1Prog, 0, Math.PI*2); ctx.fill();
    
    const glowRad2 = ctx.createRadialGradient(prongOffset, topY, 0, prongOffset, topY, 20 + 10*tier1Prog);
    glowRad2.addColorStop(0, `rgba(0, 200, 255, ${0.4 * pulse})`);
    glowRad2.addColorStop(1, "rgba(0, 200, 255, 0)");
    ctx.fillStyle = glowRad2;
    ctx.beginPath(); ctx.arc(prongOffset, topY, 20 + 10*tier1Prog, 0, Math.PI*2); ctx.fill();

    // Occasional static spark
    if (Math.random() > 0.9) {
      drawLightning(-prongOffset, topY, -prongOffset + (Math.random()-0.5)*20, topY - Math.random()*20, 2, 5, "rgba(100, 200, 255, 0.6)", 1);
    }
    if (Math.random() > 0.9) {
      drawLightning(prongOffset, topY, prongOffset + (Math.random()-0.5)*20, topY - Math.random()*20, 2, 5, "rgba(100, 200, 255, 0.6)", 1);
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
  if (Math.random() > 0.90) {
    const yPos = -40 - prongHeight; // Top of the prongs
    drawLightning(-prongOffset, yPos, prongOffset, yPos, 4, 10, "rgba(0, 200, 255, 0.6)", 1.5);
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
      { x: 54 + extraBaseWidth, y: -65 }
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
      drawLightning(p1.x, bobY1, p2.x, bobY2, 4, 8, "rgba(100, 255, 255, 0.5)", 1.5);
    }
    
    // Connect right nodes (1 and 3) to avoid crossing the center
    if (Math.random() > 0.95) {
      const p1 = nodePositions[1];
      const p2 = nodePositions[3];
      const bobY1 = p1.y + Math.sin(t * 2 + 1) * 5;
      const bobY2 = p2.y + Math.sin(t * 2 + 3) * 5;
      drawLightning(p1.x, bobY1, p2.x, bobY2, 4, 8, "rgba(100, 255, 255, 0.5)", 1.5);
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
          const sinX = Math.sin(angleX), cosX = Math.cos(angleX);
          const sinY = Math.sin(angleY);
          const cosY = Math.cos(angleY);

          const sinZ = Math.sin(angleZ), cosZ = Math.cos(angleZ);
          
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
          const zAtMid = r20 * Math.cos(theta0 + Math.PI/2) + r21 * Math.sin(theta0 + Math.PI/2);
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
          const dir = (r % 2 === 0) ? 1 : -1;
          const angle = t * orbitSpeed * dir + (i * Math.PI * 2) / numParticles + (r * Math.PI / 3);
          
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
      
      ctx.fillRect(-width/2, y - stepHeight, width, stepHeight);
      
      // Highlight edges for stepped look
      ctx.strokeStyle = "#00ffff"; // Cyan edges
      ctx.lineWidth = 1;
      ctx.globalAlpha = tier4Prog * 0.3; // subtle
      ctx.strokeRect(-width/2, y - stepHeight, width, stepHeight);
      ctx.globalAlpha = tier4Prog;
    }

    // 3) The Glowing Orb at the top
    const orbY = -40 - steps * stepHeight - 10;
    const orbRadius = 25;
    
    // pulse removed
    
    // Outer glow for Orb
    const orbGlow = ctx.createRadialGradient(0, orbY, 10, 0, orbY, 60 + pulse * 20);
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
        const py = orbY + Math.sin(angle) * ringRadiusY + Math.sin(t * 5 + i) * 10;
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
          ctx.lineTo(-px + (Math.random() - 0.5) * 10, orbY - py + (Math.random() - 0.5) * 10);
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
    
    const glowRad = ctx.createRadialGradient(0, orbY, 20, 0, orbY, 100 + pulse * 40);
    glowRad.addColorStop(0, "rgba(255, 255, 255, 1.0)");
    glowRad.addColorStop(0.3, "rgba(0, 255, 255, 0.8)");
    glowRad.addColorStop(1, "rgba(0, 100, 255, 0)");
    ctx.fillStyle = glowRad;
    ctx.beginPath();
    ctx.arc(0, orbY, 150, 0, Math.PI * 2);
    ctx.fill();

    // Chaotic white-hot lightning firing OUT in ALL directions (360 degrees)
    const numBolts = 4 + Math.floor(Math.random() * 4);
    for(let i=0; i<numBolts; i++) {
      // Random angle in 360 degrees
      const angle = Math.random() * Math.PI * 2;
      // Random distance outwards
      const dist = 100 + Math.random() * 150;
      
      const destX = Math.cos(angle) * dist;
      const destY = orbY + Math.sin(angle) * dist;
      
      drawLightning(0, orbY, destX, destY, 6, 20, "rgba(200, 255, 255, 0.9)", 3 + Math.random()*3);
    }
    
    // Small occasional side arcs from the pyramid base
    if (Math.random() > 0.5) {
       drawLightning(-40, -60, -100 - Math.random()*40, -60 + (Math.random()-0.5)*40, 4, 15, "rgba(100, 255, 255, 0.7)", 2);
    }
    if (Math.random() > 0.5) {
       drawLightning(40, -60, 100 + Math.random()*40, -60 + (Math.random()-0.5)*40, 4, 15, "rgba(100, 255, 255, 0.7)", 2);
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

          const dir = (r % 2 === 0) ? 1 : -1;
          const angle = t * orbitSpeed * dir + (i * Math.PI * 2) / numParticles + (r * Math.PI / 3);
          
          const depth = Math.sin(angle);
          const x = Math.cos(angle) * ringWidth;
          const y = ringYOffset + depth * ringHeight;
          
          // Strike from orb to particle
          drawLightning(0, orbY, x, y, 4, 15, "rgba(150, 255, 255, 0.9)", 2 + Math.random());
          
          // Strike from particle outwards
          const numOutwardBolts = 1 + Math.floor(Math.random() * 2);
          for(let b = 0; b < numOutwardBolts; b++) {
             // Add random spread to the angle outward
             const outAngle = angle + (Math.random() - 0.5);
             const dist = 60 + Math.random() * 100;
             const endX = x + Math.cos(outAngle) * dist;
             const endY = y + Math.sin(outAngle) * dist;
             
             drawLightning(x, y, endX, endY, 4, 15, "rgba(200, 255, 255, 0.9)", 1.5 + Math.random()*1.5);
          }
        }
      }
    }


    ctx.restore();
  }
}

function drawRefinery(ctx, t, tier, prevTier, animProgress) {
  // Common Tier progress calculation
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

  // Tier 0 (Foundation): Heavy industrial base with a central fluid holding tank
  if (!ironPattern && activeCtx) {
    initIronPattern(activeCtx);
  }

  const baseWidth = 140;
  const baseHeight = 30;
  const baseY = -baseHeight;

  // Main base block
  ctx.fillStyle = ironPattern ? ironPattern : "#ced2d6";
  ctx.fillRect(-baseWidth / 2, baseY, baseWidth, baseHeight);

  // Darker iron trims/grates
  ctx.fillStyle = "#6b7075";
  ctx.fillRect(-baseWidth / 2 - 5, baseY + 20, baseWidth + 10, 10);
  ctx.fillRect(-baseWidth / 2, baseY, baseWidth, 4);
  
  // Grate details on the front
  ctx.fillStyle = "#3a3d40";
  for (let i = -baseWidth / 2 + 10; i < baseWidth / 2 - 5; i += 15) {
    ctx.fillRect(i, baseY + 6, 8, 12);
  }

  // Central fluid holding tank (embedded in the base)
  const tankWidth = 60;
  const tankHeight = 50;
  const tankY = baseY - tankHeight;

  // Hide the basic Tier 0 tank when Tier 4 is fully active, replacing it with the large chamber.
  // We use tier4Prog to fade it out.
  ctx.save();
  ctx.globalAlpha = 1.0 - tier4Prog;
  
  // Tank backing
  ctx.fillStyle = "#1a1c1e";
  ctx.fillRect(-tankWidth / 2, tankY, tankWidth, tankHeight);
  
  // Fluid inside the tank (Tier 0 uses a basic sludgy grey/green)
  // Later tiers make it brighter and purer
  let fluidR = 100, fluidG = 120, fluidB = 100;
  if (tier2Prog > 0) {
      fluidR = 120 + 30 * tier2Prog;
      fluidG = 120 + 60 * tier2Prog;
      fluidB = 120 + 30 * tier2Prog;
  }
  if (tier4Prog > 0) {
      fluidR = 150 - 100 * tier4Prog;
      fluidG = 180 - 80 * tier4Prog;
      fluidB = 150 + 105 * tier4Prog; // Turns pure bubbling blue in T4
  }
  if (tier8Prog > 0) {
      fluidR = 50 + 205 * tier8Prog; // Turns blinding white
      fluidG = 100 + 155 * tier8Prog;
      fluidB = 255;
  }
  
  // Animate fluid level
  const fluidLevel = 0.6 + 0.1 * Math.sin(t * 1.5);
  const currentFluidHeight = tankHeight * fluidLevel;
  const currentFluidY = tankY + tankHeight - currentFluidHeight;
  
  ctx.fillStyle = `rgb(${fluidR}, ${fluidG}, ${fluidB})`;
  ctx.fillRect(-tankWidth / 2 + 4, currentFluidY, tankWidth - 8, currentFluidHeight);
  
  // Bubbles
  for (let i = 0; i < 5; i++) {
    const bT = (t * 0.8 + i * 0.5) % 1;
    const bY = tankY + tankHeight - bT * currentFluidHeight;
    const bX = -tankWidth / 2 + 10 + (i * 12) % (tankWidth - 20) + Math.sin(t * 4 + i) * 2;
    if (bY > currentFluidY + 2) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.beginPath();
      ctx.arc(bX, bY, 2 + (i % 2), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Tank glass and reflections
  ctx.fillStyle = "rgba(200, 255, 255, 0.1)";
  ctx.fillRect(-tankWidth / 2 + 4, tankY + 4, tankWidth - 8, tankHeight - 8);
  ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
  ctx.fillRect(-tankWidth / 2 + 8, tankY + 6, 5, tankHeight - 12);
  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.fillRect(-tankWidth / 2 + 15, tankY + 6, 2, tankHeight - 12);

  // Tank iron framing
  ctx.strokeStyle = ironPattern ? ironPattern : "#ced2d6";
  ctx.lineWidth = 4;
  ctx.strokeRect(-tankWidth / 2, tankY, tankWidth, tankHeight);
  ctx.fillStyle = "#8b9095";
  // Rivets
  ctx.fillRect(-tankWidth / 2 - 2, tankY - 2, 6, 6);
  ctx.fillRect(tankWidth / 2 - 4, tankY - 2, 6, 6);
  ctx.fillRect(-tankWidth / 2 - 2, tankY + tankHeight - 4, 6, 6);
  ctx.fillRect(tankWidth / 2 - 4, tankY + tankHeight - 4, 6, 6);
  
  ctx.restore(); // End Tier 0 central tank fade out

  // Tier 1 (Piping & Valves)
  if (tier1Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier1Prog;

    const drawPipe = (x, y, w, h, isVertical) => {
      ctx.fillStyle = "#4a4d50"; // dark iron pipe
      ctx.fillRect(x, y, w, h);
      
      // Pipe shading
      if (isVertical) {
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(x + w - 4, y, 4, h);
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.fillRect(x + 2, y, 4, h);
      } else {
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.fillRect(x, y + h - 4, w, 4);
        ctx.fillStyle = "rgba(255,255,255,0.1)";
        ctx.fillRect(x, y + 2, w, 4);
      }
      
      // Pipe flanges
      ctx.fillStyle = "#3a3d40";
      if (isVertical) {
        ctx.fillRect(x - 2, y - 4, w + 4, 8);
        ctx.fillRect(x - 2, y + h - 4, w + 4, 8);
      } else {
        ctx.fillRect(x - 4, y - 2, 8, h + 4);
        ctx.fillRect(x + w - 4, y - 2, 8, h + 4);
      }
    };

    const drawValve = (x, y, ventDirection) => {
      // Valve wheel
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t); // slowly turn
      ctx.fillStyle = "#b03a2e"; // red valve
      ctx.beginPath();
      ctx.arc(0, 0, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1a1c1e";
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#b03a2e";
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.fillRect(-2, -8, 4, 16);
      }
      ctx.restore();

      // Steam venting
      const ventCycle = (t * 2 + x * 0.1) % 4; // Use x as an offset
      if (ventCycle < 1) { // Vent steam 25% of the time
        ctx.save();
        ctx.translate(x, y);
        const steamAlpha = 1 - ventCycle;
        ctx.fillStyle = `rgba(220, 220, 220, ${steamAlpha * 0.5})`;
        
        for(let s=0; s<3; s++) {
            const sx = (ventDirection === 'right' ? 1 : ventDirection === 'left' ? -1 : 0) * (10 + ventCycle * 20) + (Math.random()-0.5)*5;
            const sy = (ventDirection === 'up' ? -1 : ventDirection === 'down' ? 1 : 0) * (10 + ventCycle * 20) + (Math.random()-0.5)*5;
            const sRadius = 5 + ventCycle * 10;
            ctx.beginPath();
            ctx.arc(sx, sy, sRadius, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.restore();
      }
    };

    // Left side piping
    drawPipe(-baseWidth/2 - 20, baseY + 10, 20, 10, false);
    drawPipe(-baseWidth/2 - 25, baseY - 40, 12, 50, true);
    drawPipe(-baseWidth/2 - 40, baseY - 40, 15, 10, false);
    drawValve(-baseWidth/2 - 30, baseY - 35, 'left');

    // Right side piping
    drawPipe(baseWidth/2, baseY + 10, 20, 10, false);
    drawPipe(baseWidth/2 + 13, baseY - 60, 12, 70, true);
    drawPipe(baseWidth/2 + 25, baseY - 50, 15, 10, false);
    drawValve(baseWidth/2 + 30, baseY - 45, 'right');
    
    // Front cross pipe
    drawPipe(-30, baseY - 15, 60, 8, false);
    drawValve(0, baseY - 11, 'up');

    ctx.restore();
  }

  // Tier 2 (Chemical Filtration)
  if (tier2Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier2Prog;

    const drawChemTank = (x, y, w, h) => {
      // Tank body (iron)
      ctx.fillStyle = ironPattern ? ironPattern : "#ced2d6";
      ctx.fillRect(x - w/2, y - h, w, h);
      
      // Tank caps
      ctx.fillStyle = "#4a4d50";
      ctx.beginPath();
      ctx.ellipse(x, y - h, w/2 + 2, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x, y, w/2 + 2, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      // Glass window
      const gw = w - 10;
      const gh = h - 20;
      const gy = y - h + 10;
      
      ctx.fillStyle = "#1a1c1e";
      ctx.fillRect(x - gw/2, gy, gw, gh);

      // Bubbling green solvent
      ctx.fillStyle = "rgba(40, 200, 80, 0.8)";
      ctx.fillRect(x - gw/2 + 2, gy + 2, gw - 4, gh - 4);
      
      // Animate bubbles in solvent
      for (let i = 0; i < 8; i++) {
        const bubbleT = (t * 1.2 + i * 0.3 + x * 0.05) % 1;
        const bY = gy + gh - bubbleT * gh;
        const bX = x - gw/2 + 6 + (i * 7) % (gw - 12) + Math.sin(t * 5 + i) * 3;
        
        if (bY > gy + 5) {
            ctx.fillStyle = "rgba(100, 255, 150, 0.6)";
            ctx.beginPath();
            ctx.arc(bX, bY, 2 + (i % 3), 0, Math.PI * 2);
            ctx.fill();
        }
      }

      // Glass reflections
      ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
      ctx.fillRect(x - gw/2 + 4, gy + 4, 4, gh - 8);
      ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
      ctx.fillRect(x - gw/2 + 10, gy + 4, 2, gh - 8);

      // Warning stripes at the bottom
      ctx.save();
      ctx.translate(x - w/2, y - 8);
      ctx.beginPath();
      ctx.rect(0, 0, w, 8);
      ctx.clip();
      ctx.fillStyle = "#d4b22c";
      ctx.fillRect(0, 0, w, 8);
      ctx.fillStyle = "#111";
      for (let s = -10; s < w + 10; s += 10) {
        ctx.beginPath();
        ctx.moveTo(s, 0);
        ctx.lineTo(s + 5, 0);
        ctx.lineTo(s - 3, 8);
        ctx.lineTo(s - 8, 8);
        ctx.fill();
      }
      ctx.restore();
    };

    // Place tanks on the outer edges
    drawChemTank(-baseWidth/2 - 50, baseY + 10, 30, 80);
    drawChemTank(baseWidth/2 + 50, baseY + 10, 30, 80);

    ctx.restore();
  }

  // Tier 3 (Distillation Columns)
  if (tier3Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier3Prog;

    const drawDistillationTower = (x, y, w, h, levels) => {
      // Main tower body
      ctx.fillStyle = ironPattern ? ironPattern : "#ced2d6";
      ctx.fillRect(x - w/2, y - h, w, h);
      
      // Shading
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(x + w/2 - 4, y - h, 4, h);
      
      // Top dome
      ctx.beginPath();
      ctx.arc(x, y - h, w/2, Math.PI, 0);
      ctx.fill();
      
      const levelHeight = h / levels;
      for (let l = 0; l < levels; l++) {
        const ly = y - h + l * levelHeight;
        
        // Horizontal division flanges
        ctx.fillStyle = "#3a3d40";
        ctx.fillRect(x - w/2 - 2, ly, w + 4, 4);
        
        // Window
        const windowW = w * 0.6;
        const windowH = levelHeight * 0.5;
        const windowY = ly + (levelHeight - windowH) / 2;
        
        ctx.fillStyle = "#1a1c1e";
        ctx.fillRect(x - windowW/2, windowY, windowW, windowH);
        
        // Fluid pulsing logic
        // Bottom is hotter/redder, top is cooler/bluer
        const fraction = 1 - (l / (levels - 1)); // 1 at bottom, 0 at top
        
        // Pulsing based on level and time
        const pulse = Math.max(0, Math.sin(t * 3 - fraction * Math.PI * 2));
        
        let fr = 200 + 55 * fraction;
        let fg = 100 + 100 * fraction;
        let fb = 50 + 200 * (1 - fraction);
        
        ctx.fillStyle = `rgba(${fr}, ${fg}, ${fb}, ${0.4 + 0.6 * pulse})`;
        ctx.fillRect(x - windowW/2 + 2, windowY + 2, windowW - 4, windowH - 4);
      }
    };

    // Draw tall distillation towers slightly offset backward
    drawDistillationTower(-30, baseY - 50, 24, 110, 5);
    drawDistillationTower(30, baseY - 50, 24, 110, 5);
    
    // Connect them to central tank with pipes
    ctx.fillStyle = "#4a4d50";
    ctx.fillRect(-30, baseY - 45, 15, 6);
    ctx.fillRect(15, baseY - 45, 15, 6);

    ctx.restore();
  }

  // Tier 4 (Core - Electrolysis Chamber)
  if (tier4Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier4Prog;

    const chamberWidth = 80;
    const chamberHeight = 120;
    const chamberY = baseY - chamberHeight;

    // Chamber Backing
    ctx.fillStyle = "rgba(10, 20, 30, 0.9)";
    ctx.fillRect(-chamberWidth / 2, chamberY, chamberWidth, chamberHeight);

    // Fluid inside (Blue, intense bubbling)
    const fluidLevel = 0.8 + 0.05 * Math.sin(t * 2);
    const fHeight = chamberHeight * fluidLevel;
    const fY = chamberY + chamberHeight - fHeight;
    
    // In Tier 8, it turns blinding white
    let fluidGradColor1 = `rgba(0, 150, 255, ${0.7 + 0.3 * tier4Prog})`;
    let fluidGradColor2 = `rgba(0, 50, 200, ${0.8 + 0.2 * tier4Prog})`;
    if (tier8Prog > 0) {
      fluidGradColor1 = `rgba(255, 255, 255, ${0.9 + 0.1 * tier8Prog})`;
      fluidGradColor2 = `rgba(200, 230, 255, ${0.9 + 0.1 * tier8Prog})`;
    }

    const fluidGrad = ctx.createLinearGradient(0, fY, 0, chamberY + chamberHeight);
    fluidGrad.addColorStop(0, fluidGradColor1);
    fluidGrad.addColorStop(1, fluidGradColor2);
    
    ctx.fillStyle = fluidGrad;
    ctx.fillRect(-chamberWidth / 2, fY, chamberWidth, fHeight);

    // Intense bubbling
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    for (let i = 0; i < 20; i++) {
        const bT = (t * 2 + i * 0.1) % 1;
        const bY = chamberY + chamberHeight - bT * fHeight;
        const bX = -chamberWidth / 2 + 5 + (i * 17) % (chamberWidth - 10) + Math.sin(t * 8 + i) * 3;
        if (bY > fY + 2) {
            ctx.beginPath();
            ctx.arc(bX, bY, 1 + (i % 4), 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Suspended Raw Iron Lattice
    ctx.save();
    const bobY = Math.sin(t * 1.5) * 5;
    ctx.translate(0, chamberY + chamberHeight / 2 + bobY);
    ctx.rotate(t * 0.5); // Slow rotation

    // Base iron color
    ctx.fillStyle = "#8b9095";
    ctx.strokeStyle = "#4a4d50";
    ctx.lineWidth = 2;

    // Draw a jagged, lattice-like structure
    const numPoints = 8;
    const latticeRadius = 20;
    
    // If Tier 8, the lattice dissolves/reforms into perfect geometry
    if (tier8Prog > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.8 + 0.2 * Math.sin(t * 10)})`;
        ctx.strokeStyle = "#00ffff";
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const angle = i * Math.PI * 2 / 6;
            const r = latticeRadius + Math.sin(t * 5) * 5;
            const px = Math.cos(angle) * r;
            const py = Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    } else {
        // Raw, jagged look
        ctx.beginPath();
        for (let i = 0; i < numPoints; i++) {
            const angle = i * Math.PI * 2 / numPoints;
            const r = latticeRadius + ((i % 2 === 0) ? 10 : -5);
            const px = Math.cos(angle) * r;
            const py = Math.sin(angle) * r;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    ctx.restore();

    // Electrical Arcs striking the lattice
    if (tier8Prog === 0) { // In tier 8, the beam replaces these
        const numArcs = 3;
        ctx.strokeStyle = "rgba(100, 255, 255, 0.8)";
        ctx.lineWidth = 2;
        for (let i = 0; i < numArcs; i++) {
            if (Math.random() > 0.3) {
                const sx = (Math.random() > 0.5 ? -chamberWidth/2 : chamberWidth/2);
                const sy = chamberY + Math.random() * chamberHeight;
                const ex = (Math.random() - 0.5) * 20;
                const ey = chamberY + chamberHeight / 2 + bobY + (Math.random() - 0.5) * 20;
                
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                // Jagged line
                const midX = sx + (ex - sx) / 2 + (Math.random() - 0.5) * 20;
                const midY = sy + (ey - sy) / 2 + (Math.random() - 0.5) * 20;
                ctx.lineTo(midX, midY);
                ctx.lineTo(ex, ey);
                ctx.stroke();
            }
        }
    }

    // Chamber Glass and Frame
    ctx.fillStyle = "rgba(200, 255, 255, 0.1)";
    ctx.fillRect(-chamberWidth / 2, chamberY, chamberWidth, chamberHeight);
    
    // Frame
    ctx.strokeStyle = "#ced2d6";
    ctx.lineWidth = 6;
    ctx.strokeRect(-chamberWidth / 2, chamberY, chamberWidth, chamberHeight);
    
    // Top machinery for electrolysis
    ctx.fillStyle = "#3a3d40";
    ctx.fillRect(-chamberWidth / 2 - 10, chamberY - 15, chamberWidth + 20, 15);
    // Electrodes extending down
    ctx.fillStyle = "#8b9095";
    ctx.fillRect(-chamberWidth / 2 + 10, chamberY, 8, 20);
    ctx.fillRect(chamberWidth / 2 - 18, chamberY, 8, 20);

    ctx.restore();
  }

  // Tier 5 (Exhaust Scrubbers)
  if (tier5Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier5Prog;

    const drawScrubber = (x, y, isRight) => {
      ctx.save();
      ctx.translate(x, y);
      
      // Housing
      ctx.fillStyle = ironPattern ? ironPattern : "#ced2d6";
      ctx.fillRect(-15, -15, 30, 30);
      ctx.strokeStyle = "#4a4d50";
      ctx.lineWidth = 2;
      ctx.strokeRect(-15, -15, 30, 30);
      
      // Spinning Fan
      ctx.fillStyle = "#1a1c1e";
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.save();
      ctx.rotate(t * 10 * (isRight ? -1 : 1)); // Spin fast
      ctx.fillStyle = "#ced2d6";
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-4, -10);
        ctx.lineTo(4, -10);
        ctx.fill();
      }
      ctx.fillStyle = "#b03a2e"; // red spinner center
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      
      // Exhaust fumes (Multi-colored)
      const fumeCycle = (t * 2 + x * 0.1) % 1; // 0 to 1
      const numPuffs = 5;
      for (let i = 0; i < numPuffs; i++) {
          const pt = (fumeCycle + i / numPuffs) % 1;
          const dist = 10 + pt * 40;
          const spread = Math.sin(pt * Math.PI) * 15;
          const dirX = isRight ? dist : -dist;
          const dirY = -dist * 0.5 + spread;
          
          const alpha = (1 - pt) * 0.6;
          
          // Shifting colors
          const fr = 150 + 100 * Math.sin(t * 2 + i);
          const fg = 150 + 100 * Math.cos(t * 3 + i);
          const fb = 150 + 100 * Math.sin(t * 4 + i);
          
          ctx.fillStyle = `rgba(${fr}, ${fg}, ${fb}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(dirX, dirY, 5 + pt * 15, 0, Math.PI * 2);
          ctx.fill();
      }

      ctx.restore();
    };

    // Attach scrubbers to the sides of the Tier 3 Distillation towers
    drawScrubber(-45, baseY - 120, false);
    drawScrubber(45, baseY - 120, true);
    
    // Attach scrubbers lower down as well
    drawScrubber(-45, baseY - 80, false);
    drawScrubber(45, baseY - 80, true);

    ctx.restore();
  }

  // Tier 6 (Magnetic Extractors)
  if (tier6Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier6Prog;

    const drawMagExtractor = (x, y) => {
        ctx.save();
        ctx.translate(x, y);

        const ringRadiusX = 25;
        const ringRadiusY = 8;
        
        const bobY = Math.sin(t * 3 + x) * 4;
        
        ctx.translate(0, bobY);

        // Back half of the ring
        ctx.strokeStyle = "rgba(180, 50, 255, 0.4)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(0, 0, ringRadiusX, ringRadiusY, 0, Math.PI, Math.PI * 2);
        ctx.stroke();

        // Draw the tower inside (the ring wraps around it)
        // Since we already drew the tower, we just draw the front half of the ring OVER it

        // Front half of the ring (brighter)
        ctx.strokeStyle = "rgba(220, 100, 255, 0.9)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(0, 0, ringRadiusX, ringRadiusY, 0, 0, Math.PI);
        ctx.stroke();
        
        // Inner bright core of the front ring
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, ringRadiusX, ringRadiusY, 0, 0, Math.PI);
        ctx.stroke();

        // Magnetic impurities being extracted (dark particles flying away)
        for (let i = 0; i < 5; i++) {
            const pT = (t * 2 + i * 0.2 + x * 0.05) % 1;
            const startAngle = (i * Math.PI * 2 / 5) + t;
            
            // Particles start at the ring edge and fly outwards
            const startX = Math.cos(startAngle) * ringRadiusX;
            const startY = Math.sin(startAngle) * ringRadiusY;
            
            const dist = pT * 30;
            const pX = startX + Math.cos(startAngle) * dist;
            const pY = startY + Math.sin(startAngle) * dist - dist * 0.5; // slight upward drift
            
            const pAlpha = 1 - pT;
            ctx.fillStyle = `rgba(30, 10, 40, ${pAlpha})`;
            ctx.beginPath();
            ctx.arc(pX, pY, 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    };

    // Draw magnetic rings wrapping the Distillation Towers
    drawMagExtractor(-30, baseY - 100);
    drawMagExtractor(30, baseY - 100);
    
    // Additional lower rings
    drawMagExtractor(-30, baseY - 60);
    drawMagExtractor(30, baseY - 60);

    ctx.restore();
  }

  // Tier 7 (Hyper-Pressure Silos)
  if (tier7Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier7Prog;

    const drawSilo = (x, y) => {
        ctx.save();
        ctx.translate(x, y);

        const sW = 40;
        const sH = 110;

        // Sleek, high-tech shell
        ctx.fillStyle = "#e0e5ea"; // Lighter, cleaner metal
        ctx.fillRect(-sW/2, -sH, sW, sH);
        
        // Curved shading for cylindrical look
        const siloGrad = ctx.createLinearGradient(-sW/2, 0, sW/2, 0);
        siloGrad.addColorStop(0, "rgba(0,0,0,0.5)");
        siloGrad.addColorStop(0.2, "rgba(255,255,255,0.4)");
        siloGrad.addColorStop(0.5, "rgba(0,0,0,0)");
        siloGrad.addColorStop(0.8, "rgba(0,0,0,0.2)");
        siloGrad.addColorStop(1, "rgba(0,0,0,0.6)");
        ctx.fillStyle = siloGrad;
        ctx.fillRect(-sW/2, -sH, sW, sH);

        // Domed top
        ctx.fillStyle = "#e0e5ea";
        ctx.beginPath();
        ctx.arc(0, -sH, sW/2, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.beginPath();
        ctx.arc(0, -sH, sW/2, Math.PI, 0);
        ctx.fill();

        // Glowing pressure gauges/seams
        const pulse = Math.abs(Math.sin(t * 5 + x * 0.1));
        ctx.fillStyle = `rgba(0, 255, 255, ${0.5 + 0.5 * pulse})`;
        ctx.fillRect(-sW/2 + 5, -sH + 20, sW - 10, 2);
        ctx.fillRect(-sW/2 + 5, -sH + 50, sW - 10, 2);
        ctx.fillRect(-sW/2 + 5, -sH + 80, sW - 10, 2);

        // Occasional Shockwave venting
        const shockCycle = (t * 0.5 + x * 0.05) % 1;
        if (shockCycle > 0.9) { // Trigger near end of cycle
            const shockRadius = (shockCycle - 0.9) * 10 * 80;
            const shockAlpha = 1 - (shockCycle - 0.9) * 10;
            
            ctx.strokeStyle = `rgba(200, 255, 255, ${shockAlpha})`;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.ellipse(0, -sH, shockRadius, shockRadius * 0.3, 0, 0, Math.PI * 2);
            ctx.stroke();
            
            // Core vent flash
            ctx.fillStyle = `rgba(255, 255, 255, ${shockAlpha})`;
            ctx.beginPath();
            ctx.arc(0, -sH, 10, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    };

    // Position outside the Tier 2 chem tanks
    drawSilo(-baseWidth/2 - 90, baseY + 15);
    drawSilo(baseWidth/2 + 90, baseY + 15);

    ctx.restore();
  }

  // Tier 8 (Zenith - Apex Purifier)
  if (tier8Prog > 0) {
    ctx.save();
    ctx.globalAlpha = tier8Prog;
    ctx.globalCompositeOperation = "lighter";

    const chamberWidth = 80;
    const chamberHeight = 120;
    const chamberY = baseY - chamberHeight;
    const cy = chamberY + chamberHeight / 2;

    // Blinding continuous vertical beam from the core
    const beamW = 25 + Math.sin(t * 15) * 5;
    const beamGrad = ctx.createLinearGradient(-beamW/2, 0, beamW/2, 0);
    beamGrad.addColorStop(0, "rgba(0, 200, 255, 0)");
    beamGrad.addColorStop(0.2, `rgba(150, 220, 255, ${0.8 * tier8Prog})`);
    beamGrad.addColorStop(0.5, `rgba(255, 255, 255, ${1.0 * tier8Prog})`);
    beamGrad.addColorStop(0.8, `rgba(150, 220, 255, ${0.8 * tier8Prog})`);
    beamGrad.addColorStop(1, "rgba(0, 200, 255, 0)");

    ctx.fillStyle = beamGrad;
    ctx.fillRect(-beamW/2, -800, beamW, 800 - cy); // Shoots up

    // Intense Core Glow
    const pulse = Math.abs(Math.sin(t * 10));
    const glowRad = ctx.createRadialGradient(0, cy, 10, 0, cy, 100 + pulse * 50);
    glowRad.addColorStop(0, "rgba(255, 255, 255, 1.0)");
    glowRad.addColorStop(0.3, "rgba(100, 200, 255, 0.8)");
    glowRad.addColorStop(1, "rgba(0, 100, 255, 0)");
    
    ctx.fillStyle = glowRad;
    ctx.beginPath();
    ctx.arc(0, cy, 150, 0, Math.PI * 2);
    ctx.fill();

    // Geometric Iron Crystals growing and dissolving in the fluid
    const numCrystals = 6;
    for (let i = 0; i < numCrystals; i++) {
        const cT = (t * 0.5 + i * (1/numCrystals)) % 1; // 0 to 1 cycle
        
        // Appear, grow, shrink, disappear
        let cScale = 0;
        if (cT < 0.2) cScale = cT / 0.2;
        else if (cT < 0.8) cScale = 1;
        else cScale = 1 - (cT - 0.8) / 0.2;

        const cx = (Math.random() > 0.5 ? 1 : -1) * (15 + (i * 23) % 20);
        const cyPos = chamberY + chamberHeight - cT * chamberHeight * 0.8 - 10;
        
        ctx.save();
        ctx.translate(cx, cyPos);
        ctx.rotate(t * 2 + i);
        ctx.scale(cScale, cScale);

        ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
        ctx.strokeStyle = "rgba(0, 255, 255, 1)";
        ctx.lineWidth = 1;

        // Draw perfect diamond/octahedron cross-section
        const s = 8;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s*0.8, 0);
        ctx.lineTo(0, s);
        ctx.lineTo(-s*0.8, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }

    ctx.restore();
  }

}

function drawVault(ctx, t, tier) {
  ctx.fillStyle = "#d4b22c";
  ctx.fillRect(-60, -60, 120, 60);

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(0, -30, 20, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#555";
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
