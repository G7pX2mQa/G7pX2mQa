import { RESOURCE_REGISTRY } from "../game/offlinePanel.js";
import { levelBigNumToNumber } from "../game/upgrades.js";
import { playAudio } from "../util/audioManager.js";
import { getVaultSequence, setVaultSequence, getVaultCoinCollected, setVaultCoinCollected, checkSecretAchievements } from "../game/secretAchievements.js";
import { createCursorTrail } from "../game/cursorTrail.js";
import { getPreRenderedItem } from "../game/spawnerCore.js";
import { settingsManager } from "../game/settingsManager.js";

let activeCanvas = null;
let activeCtx = null;
let animationFrameId = null;
let currentBuildingId = null;
let lastTime = 0;
let time = 0;
let lastDrawTime = 0;

let currentLevelNum = 0;
let tierUpAnimTime = 0;
let previousTier = 0;
let globalDiskAngle = 0; // Integrated angle for smooth accretion disk rotation
let globalPrismAngle = 0; // Integrated angle for smooth prism rotation
let globalRefineryAnimTime = 0; // Integrated time for smooth refinery animations
let globalRefineryPipeTime = 0;
let globalRefineryTankTime = 0;
let globalOilRigAnimTime = 0;

let keypadZoomedIn = false;
let isVaultOpening = false;
let vaultOpeningTime = 0;
let isVaultOpen = false;
let canvasClickListener = null;
let canvasPointerMoveListener = null;
let canvasKeyDownListener = null;
let lastHotkeyNum = null;
let canvasMouseX = 0;
let canvasMouseY = 0;
const coinImg = new Image();
coinImg.src = 'img/currencies/coin/coin.webp';

let vaultCursorTrail = null;
let vaultCoinCollectedLocal = false;

// Physics state for Oil Rig
let oilPhysicsNodes = [];
let oilPhysicsParticles = [];
let oilPhysicsLastUpdate = 0;
let oilPhysicsLastWidth = 0;



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
      lastDrawTime = 0;
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
let diamondPattern = null;
let darkDiamondPattern = null;
let emeraldPattern = null;
let rubyPattern = null;
let sapphirePattern = null;
let unobtainiumPattern = null;

// for specifically the Greenhouse building:
let cachedGrowLightNormal = null;
let cachedGrowLightMagic = null;
let cachedFireflyGlow1 = null;
let cachedFireflyGlow2 = null;

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

function initDiamondPattern(ctx) {
  if (diamondPattern) return;

  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = 64;
  patternCanvas.height = 64;
  const pCtx = patternCanvas.getContext("2d");

  // Brighter base cyan color for diamond
  pCtx.fillStyle = "#00FFFF"; // brighter cyan base
  pCtx.fillRect(0, 0, 64, 64);

  // Fine, uniform noise grain to match reference image
  const imgData = pCtx.getImageData(0, 0, 64, 64);
  const data = imgData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const noise = Math.random();
    
    // Smooth random mix of light blues and cyans
    // Mix between #5acde2 (90, 205, 226) and #b2f0f8 (178, 240, 248)
    const baseR = 90 + noise * 88;
    const baseG = 205 + noise * 35;
    const baseB = 226 + noise * 22;
    
    // Add tiny extra noise for that grainy feel
    const speckle = (Math.random() - 0.5) * 20;

    data[i] = Math.max(0, Math.min(255, baseR + speckle));
    data[i+1] = Math.max(0, Math.min(255, baseG + speckle));
    data[i+2] = Math.max(0, Math.min(255, baseB + speckle));
    data[i+3] = 255; // Alpha
  }
  pCtx.putImageData(imgData, 0, 0);

  const targetCtx = activeCtx || ctx;
  if (targetCtx) {
    try {
      diamondPattern = targetCtx.createPattern(patternCanvas, "repeat");
    } catch (e) {
      console.error("Failed to create diamond pattern", e);
    }
  }
}

function initDarkDiamondPattern(ctx) {
  if (darkDiamondPattern) return;

  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = 64;
  patternCanvas.height = 64;
  const pCtx = patternCanvas.getContext("2d");

  // Darker base cyan color for drill
  pCtx.fillStyle = "#008888"; 
  pCtx.fillRect(0, 0, 64, 64);

  const imgData = pCtx.getImageData(0, 0, 64, 64);
  const data = imgData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const noise = Math.random();
    
    // Darker mix for dark diamond
    const baseR = 43 + noise * 33;
    const baseG = 120 + noise * 51;
    const baseB = 134 + noise * 57;
    
    const speckle = (Math.random() - 0.5) * 15;

    data[i] = Math.max(0, Math.min(255, baseR + speckle));
    data[i+1] = Math.max(0, Math.min(255, baseG + speckle));
    data[i+2] = Math.max(0, Math.min(255, baseB + speckle));
    data[i+3] = 255; 
  }
  pCtx.putImageData(imgData, 0, 0);

  const targetCtx = activeCtx || ctx;
  if (targetCtx) {
    try {
      darkDiamondPattern = targetCtx.createPattern(patternCanvas, "repeat");
    } catch (e) {
      console.error("Failed to create dark diamond pattern", e);
    }
  }
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

function initEmeraldPattern(ctx) {
  if (emeraldPattern) return;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const pCtx = canvas.getContext('2d');

  // Base vibrant green matching the reference emerald image
  pCtx.fillStyle = '#5ed65e';
  pCtx.fillRect(0, 0, size, size);

  // Cloudy dark mottling — larger irregular splotchy patches
  for (let i = 0; i < 100; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 4 + Math.random() * 14;
    const alpha = 0.06 + Math.random() * 0.06;
    pCtx.fillStyle = Math.random() > 0.5
      ? `rgba(25, 85, 20, ${alpha})`
      : `rgba(35, 100, 28, ${alpha})`;
    pCtx.beginPath();
    pCtx.arc(x, y, r, 0, Math.PI * 2);
    pCtx.fill();
  }

  // Fine dark speckles for grain texture
  for (let i = 0; i < 500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const w = 1 + Math.random() * 2;
    const h = 1 + Math.random() * 1.5;
    pCtx.fillStyle = `rgba(20, 65, 12, ${0.06 + Math.random() * 0.06})`;
    pCtx.fillRect(x, y, w, h);
  }

  // Subtle brighter highlight spots
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 3 + Math.random() * 8;
    pCtx.fillStyle = `rgba(130, 255, 110, ${0.03 + Math.random() * 0.04})`;
    pCtx.beginPath();
    pCtx.arc(x, y, r, 0, Math.PI * 2);
    pCtx.fill();
  }

  const targetCtx = activeCtx || ctx;
  if (targetCtx) {
    try {
      emeraldPattern = targetCtx.createPattern(canvas, 'repeat');
    } catch (e) {
      console.error('Failed to create emerald pattern', e);
    }
  }
}

function initRubyPattern(ctx) {
  if (rubyPattern) return;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const pCtx = canvas.getContext('2d');

  // Vibrant ruby red base
  pCtx.fillStyle = '#ff2020';
  pCtx.fillRect(0, 0, size, size);

  // Diagonal strokes to mimic the gem grain seen in ruby.webp
  for (let i = 0; i < 800; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 2 + Math.random() * 8;
    
    pCtx.strokeStyle = Math.random() > 0.5
      ? `rgba(200, 10, 10, ${0.1 + Math.random() * 0.1})`  // darker red strokes
      : `rgba(255, 60, 60, ${0.1 + Math.random() * 0.1})`; // lighter red strokes
    
    pCtx.lineWidth = 1 + Math.random() * 2;
    pCtx.beginPath();
    pCtx.moveTo(x, y);
    pCtx.lineTo(x + len, y + len); // Diagonal bottom-right
    pCtx.stroke();
  }

  const targetCtx = activeCtx || ctx;
  if (targetCtx) {
    try {
      rubyPattern = targetCtx.createPattern(canvas, 'repeat');
    } catch (e) {
      console.error('Failed to create ruby pattern', e);
    }
  }
}

function initSapphirePattern(ctx) {
  if (sapphirePattern) return;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const pCtx = canvas.getContext('2d');

  // Vibrant blue base matching the reference image
  pCtx.fillStyle = '#2634f5';
  pCtx.fillRect(0, 0, size, size);

  // Cloudy swirling patches
  for (let i = 0; i < 400; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 4 + Math.random() * 12;
    
    pCtx.fillStyle = Math.random() > 0.5
      ? `rgba(70, 90, 255, ${0.04 + Math.random() * 0.06})`
      : `rgba(10, 15, 180, ${0.04 + Math.random() * 0.06})`;

    for (let ox of [-size, 0, size]) {
      for (let oy of [-size, 0, size]) {
        pCtx.beginPath();
        pCtx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        pCtx.fill();
      }
    }
  }

  // Small swirly curlicues to mimic the marbled texture
  for (let i = 0; i < 800; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 1 + Math.random() * 4;
    const startAngle = Math.random() * Math.PI * 2;
    const endAngle = startAngle + Math.PI * (0.5 + Math.random());
    
    pCtx.strokeStyle = Math.random() > 0.5
      ? `rgba(90, 120, 255, ${0.05 + Math.random() * 0.1})`  // lighter swirls
      : `rgba(15, 20, 160, ${0.05 + Math.random() * 0.1})`;  // darker swirls

    pCtx.lineWidth = 1 + Math.random() * 1.5;
    for (let ox of [-size, 0, size]) {
      for (let oy of [-size, 0, size]) {
        pCtx.beginPath();
        pCtx.arc(x + ox, y + oy, r, startAngle, endAngle);
        pCtx.stroke();
      }
    }
  }

  const targetCtx = activeCtx || ctx;
  if (targetCtx) {
    try {
      sapphirePattern = targetCtx.createPattern(canvas, 'repeat');
    } catch (e) {
      console.error('Failed to create sapphire pattern', e);
    }
  }
}

function initUnobtainiumPattern(ctx) {
  if (unobtainiumPattern) return;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const pCtx = canvas.getContext('2d');

  pCtx.fillStyle = '#4c1e7a';
  pCtx.fillRect(0, 0, size, size);

  for (let i = 0; i < 400; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 4 + Math.random() * 12;
    
    pCtx.fillStyle = Math.random() > 0.5
      ? `rgba(130, 40, 200, ${0.04 + Math.random() * 0.06})`
      : `rgba(60, 10, 110, ${0.04 + Math.random() * 0.06})`;

    for (let ox of [-size, 0, size]) {
      for (let oy of [-size, 0, size]) {
        pCtx.beginPath();
        pCtx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        pCtx.fill();
      }
    }
  }

  for (let i = 0; i < 800; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 1 + Math.random() * 4;
    const startAngle = Math.random() * Math.PI * 2;
    const endAngle = startAngle + Math.PI * (0.5 + Math.random());
    
    pCtx.strokeStyle = Math.random() > 0.5
      ? `rgba(170, 70, 255, ${0.05 + Math.random() * 0.1})`
      : `rgba(30, 5, 60, ${0.05 + Math.random() * 0.1})`;

    pCtx.lineWidth = 1 + Math.random() * 1.5;
    for (let ox of [-size, 0, size]) {
      for (let oy of [-size, 0, size]) {
        pCtx.beginPath();
        pCtx.arc(x + ox, y + oy, r, startAngle, endAngle);
        pCtx.stroke();
      }
    }
  }

  const targetCtx = activeCtx || ctx;
  if (targetCtx) {
    try {
      unobtainiumPattern = targetCtx.createPattern(canvas, 'repeat');
    } catch (e) {
      console.error('Failed to create unobtainium pattern', e);
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
  lastDrawTime = 0;

  initStonePattern(activeCtx);
  if (!pureGoldPattern) {
    initPureGoldPattern(activeCtx);
  }
  if (!diamondPattern) {
    initDiamondPattern(activeCtx);
  }
  if (!rubyPattern) {
    initRubyPattern(activeCtx);
  }
  if (!sapphirePattern) {
    initSapphirePattern(activeCtx);
  }
  if (!unobtainiumPattern) {
    initUnobtainiumPattern(activeCtx);
  }

  if (canvasResizeObserver) {
    canvasResizeObserver.disconnect();
  }
  canvasResizeObserver = new ResizeObserver(() => {
    if (!activeCanvas) return;
    const rect = activeCanvas.parentElement.getBoundingClientRect();
    activeCanvas.width = rect.width;
    activeCanvas.height = rect.height;
    const keypadCanvas = document.getElementById('building-keypad-canvas');
    if (keypadCanvas) {
      keypadCanvas.width = rect.width;
      keypadCanvas.height = rect.height;
    }
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
  const keypadCanvas = document.getElementById('building-keypad-canvas');
  if (keypadCanvas) {
    keypadCanvas.width = rect.width;
    keypadCanvas.height = rect.height;
  }

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

  if (currentBuildingId === 'pure_gold') {
    canvasEl.style.pointerEvents = 'auto';
    canvasEl.setAttribute('data-ghost-tap-target', 'true');
    keypadZoomedIn = false;
    isVaultOpening = false;
    vaultOpeningTime = 0;
    isVaultOpen = false;
    vaultCoinCollectedLocal = getVaultCoinCollected();

    canvasClickListener = (e) => {
      handleVaultCanvasClick(e);
    };
    canvasPointerMoveListener = (e) => {
      handleVaultCanvasPointerMove(e);
    };
    canvasKeyDownListener = (e) => {
      handleVaultCanvasKeyDown(e);
    };

    canvasEl.addEventListener('click', canvasClickListener);
    canvasEl.addEventListener('pointermove', canvasPointerMoveListener);
    window.addEventListener('keydown', canvasKeyDownListener);
  }

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
  const wasOpeningOrOpen = isVaultOpening || isVaultOpen;

  if (activeCanvas) {
    if (canvasClickListener) {
      activeCanvas.removeEventListener('click', canvasClickListener);
      canvasClickListener = null;
    }
    if (canvasPointerMoveListener) {
      activeCanvas.removeEventListener('pointermove', canvasPointerMoveListener);
      canvasPointerMoveListener = null;
    }
  }
  if (canvasKeyDownListener) {
    window.removeEventListener('keydown', canvasKeyDownListener);
    canvasKeyDownListener = null;
  }
  lastHotkeyNum = null;

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
  keypadZoomedIn = false;
  isVaultOpening = false;
  vaultOpeningTime = 0;
  isVaultOpen = false;
  vaultCoinCollectedLocal = false;
  if (vaultCursorTrail) {
    vaultCursorTrail.destroy();
    vaultCursorTrail = null;
  }
  const overlayEl = document.getElementById('building-detail-overlay');
  if (overlayEl) {
    overlayEl.style.cursor = '';
  }

  if (wasOpeningOrOpen) {
    if (typeof window !== 'undefined' && window.resetSystem && window.resetSystem.updateBuildingsOverlayUi) {
      window.resetSystem.updateBuildingsOverlayUi();
    }
    window.dispatchEvent(new CustomEvent('audio:restartMusic'));
  }
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

  const fpsInterval = 1000 / 60;
  const elapsedSinceLastDraw = currentTime - lastDrawTime;

  if (elapsedSinceLastDraw < fpsInterval) {
    animationFrameId = requestAnimationFrame(loop);
    return;
  }

  // Adjust lastDrawTime using the accumulator approach
  lastDrawTime = currentTime - (elapsedSinceLastDraw % fpsInterval);

  if (activeCanvas.parentElement) {
    activeCanvas.parentElement.style.zIndex = keypadZoomedIn ? '999999' : '0';
    const upgSheet = activeCanvas.closest('.upg-sheet');
    if (upgSheet) {
      if (keypadZoomedIn) {
        upgSheet.classList.add('keypad-zoomed-blur');
      } else {
        upgSheet.classList.remove('keypad-zoomed-blur');
      }
    }
  }

  const dt = (currentTime - lastTime) / 1000;
  lastTime = currentTime;
  time += dt;

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

  let oilRigSpeedMult = 1.0;
  if (currentBuildingId === "diamond") {
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
    
    // 5x faster
    oilRigSpeedMult = 1.0 + tier8Prog * 4.0; 
  }
  globalOilRigAnimTime += dt * oilRigSpeedMult;

  if (isVaultOpening) {
    vaultOpeningTime -= dt;
    if (vaultOpeningTime <= 0) {
      isVaultOpening = false;
      isVaultOpen = true;
      document.dispatchEvent(new CustomEvent('ccc:buildings:changed'));
    }
  }

  if (activeCanvas && currentBuildingId === 'pure_gold') {
    const overlayEl = document.getElementById('building-detail-overlay');
    const isOnlyBuilding = settingsManager.get('only_show_building');
    
    // Handle cursor trail and entire overlay's cursor hiding
    if (overlayEl) {
      if (isOnlyBuilding || (isVaultOpen && !vaultCoinCollectedLocal)) {
        overlayEl.style.cursor = 'none';
        if (isVaultOpen && !vaultCoinCollectedLocal) {
          if (!vaultCursorTrail) {
            vaultCursorTrail = createCursorTrail(overlayEl, { initInCenter: true, zIndex: '999999' });
          }
        } else {
          if (vaultCursorTrail) {
            vaultCursorTrail.destroy();
            vaultCursorTrail = null;
          }
        }
      } else {
        overlayEl.style.cursor = '';
        if (vaultCursorTrail) {
          vaultCursorTrail.destroy();
          vaultCursorTrail = null;
        }
      }
    }

    let cursor = 'default';
    if (isOnlyBuilding) {
      cursor = 'none';
    } else if (isVaultOpen && !vaultCoinCollectedLocal) {
      cursor = 'none';
      const scale = 1.0 + getTier() * 0.1;
      const coin_cx = activeCanvas.width / 2;
      const floorY = activeCanvas.height - 260;
      const coin_cy = floorY - (getTier() >= 1 ? 65 : 50) * scale;
      
      // Hitbox is a circular radius of 20 * scale representing the coin's physical boundaries.
      // This ensures collecting the coin is perfectly accurate and works responsive from any direction.
      const dx = canvasMouseX - coin_cx;
      const dy = canvasMouseY - coin_cy;
      const radius = 20 * scale;
      
      if (dx * dx + dy * dy <= radius * radius) {
        cursor = 'pointer';
        vaultCoinCollectedLocal = true;
        setVaultCoinCollected(true);
        playAudio("sounds/coin_pickup_size5.ogg");
        checkSecretAchievements();
        
        // Restore ONLY Close Button
        const closeBtn = document.querySelector('#building-detail-overlay .shop-close');
        if (closeBtn) {
          closeBtn.style.display = '';
        }
        
        document.dispatchEvent(new CustomEvent('ccc:buildings:changed'));
        
        window.dispatchEvent(new CustomEvent('audio:restartMusic'));
      }
    } else if (isVaultOpening) {
      cursor = 'none';
    } else if (keypadZoomedIn) {
      const w = activeCanvas.width;
      const h = activeCanvas.height;
      const kx = (canvasMouseX - w / 2) / 8;
      const ky = (canvasMouseY - h / 2) / 8;
      if (kx >= -12.5 && kx <= 12.5 && ky >= -18 && ky <= 18) {
        let onBtn = false;
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            const bx = -9.5 + c * 7;
            const by = -3 + r * 7;
            if (kx >= bx && kx <= bx + 5 && ky >= by && ky <= by + 5) {
              onBtn = true;
            }
          }
        }
        cursor = onBtn ? 'pointer' : 'default';
      } else {
        cursor = 'pointer';
      }
    } else {
      const scale = 1.0 + getTier() * 0.1;
      const floorY = activeCanvas.height - 260;
      const centerX = activeCanvas.width / 2;
      const dy = 15;
      const left = centerX - 48 * scale;
      const right = centerX - 23 * scale;
      const top = floorY - (88 + dy) * scale;
      const bottom = floorY - (52 + dy) * scale;
      if (canvasMouseX >= left && canvasMouseX <= right && canvasMouseY >= top && canvasMouseY <= bottom && getTier() >= 2) {
        cursor = 'pointer';
      }
    }
    if (activeCanvas.style.cursor !== cursor) {
      activeCanvas.style.cursor = cursor;
    }
  } else if (activeCanvas) {
    const isOnlyBuilding = settingsManager.get('only_show_building');
    let cursor = isOnlyBuilding ? 'none' : 'default';
    if (activeCanvas.style.cursor !== cursor) {
      activeCanvas.style.cursor = cursor;
    }
  }

  if (activeCanvas && activeCtx) {
    const keypadCanvas = document.getElementById('building-keypad-canvas');
    let keypadCtx = null;
    if (keypadCanvas) {
      keypadCtx = keypadCanvas.getContext('2d');
    }
    draw(activeCtx, keypadCtx, activeCanvas.width, activeCanvas.height, time);
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

function draw(ctx, keypadCtx, width, height, t) {
  ctx.clearRect(0, 0, width, height);
  if (keypadCtx) {
    keypadCtx.clearRect(0, 0, width, height);
  }

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
      keypadCtx,
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
  ctx.fillRect(-50, -50, w + 100, h + 100);

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

  if (currentBuildingId === 'sapphire') {
    let currentTier = getTier();
    let drawTier = currentTier;
    let animProgress = 1.0;
    if (tierUpAnimTime > 0) {
      animProgress = tierUpAnimTime > 2.5 ? 1.0 - (tierUpAnimTime - 2.5) / 3.5 : 1.0;
      drawTier = currentTier;
    }
    const t7 = drawTier >= 7 && previousTier < 7 ? animProgress : (drawTier >= 7 ? 1 : 0);
    
    if (t7 > 0) {
      if (!sapphirePattern) {
        if (activeCtx) initSapphirePattern(activeCtx);
        else initSapphirePattern(ctx);
      }
      const fillSapphire = sapphirePattern || '#1122cc';
      
      const floorY = h - 260;
      const cx = w / 2;
      const targetScale = 1.0 + drawTier * 0.1;
      const startScale = 1.0 + previousTier * 0.1;
      const scale = startScale + (targetScale - startScale) * animProgress;
      
      ctx.save();
      ctx.translate(cx, floorY);
      ctx.scale(scale, scale);
      
      ctx.globalAlpha = t7;
      
      const vortexX = 0;
      const vortexY = -120;
      
      ctx.save();
      ctx.scale(2, 1); // DOUBLE THE WIDTH
      
      // 1. Massive Background Aura (Cached for extreme performance)
      if (!window.cachedVortexAura) {
          const offC = document.createElement('canvas');
          offC.width = 600; // 600x600 provides perfect quality while being 4x faster than 1200x1200
          offC.height = 600;
          const offCtx = offC.getContext('2d');
          const grad = offCtx.createRadialGradient(300, 300, 25, 300, 300, 300);
          grad.addColorStop(0, 'rgba(17, 34, 204, 0.4)');
          grad.addColorStop(0.5, 'rgba(0, 26, 77, 0.2)');
          grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          offCtx.fillStyle = grad;
          offCtx.fillRect(0, 0, 600, 600);
          window.cachedVortexAura = offC;
      }
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 1.0;
      ctx.drawImage(window.cachedVortexAura, vortexX - 600, vortexY - 600, 1200, 1200);
      
      // 2. Swirling Vortex Center (Restored using optimized thick strokes instead of slow annular fills)
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.translate(vortexX, vortexY);
      ctx.rotate(t * -0.2);
      
      const numLayers = 5;
      for (let l = numLayers; l > 0; l--) {
          const layerScale = l * 50;
          const layerSpeed = t * (0.5 + l * 0.2);
          
          ctx.save();
          ctx.rotate(layerSpeed);
          
          // Draw the thick textured ring using a stroke, which is ~100x faster than filling a donut path
          ctx.beginPath();
          ctx.arc(0, 0, layerScale - 20, 0, Math.PI * 2); 
          ctx.strokeStyle = fillSapphire; 
          ctx.lineWidth = 40; 
          ctx.globalAlpha = t7 * (0.2 + (numLayers - l) * 0.15);
          ctx.stroke();
          
          // Thin solid outer structural line
          ctx.beginPath();
          ctx.arc(0, 0, layerScale, 0, Math.PI * 2);
          ctx.strokeStyle = '#2244ff';
          ctx.lineWidth = 2 + (numLayers - l);
          ctx.globalAlpha = t7 * 0.5;
          ctx.stroke();
          
          // Thin solid inner structural line
          ctx.beginPath();
          ctx.arc(0, 0, Math.max(0, layerScale - 40), 0, Math.PI * 2);
          ctx.stroke();
          
          ctx.restore();
      }
      
      ctx.beginPath();
      ctx.arc(0, 0, 45, 0, Math.PI * 2);
      ctx.fillStyle = '#010515';
      ctx.fill();
      
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#2244ff';
      ctx.stroke();
      
      const numStars = 60;
      ctx.globalCompositeOperation = 'source-over'; // Guaranteed hardware fast-path
      ctx.fillStyle = '#4488ff'; // Brighter to compensate for lack of additive blending
      ctx.strokeStyle = 'rgba(68, 136, 255, 0.8)'; // Brighter trail
      ctx.lineWidth = 1.5; // Constant width for batching
      ctx.globalAlpha = t7;
      
      ctx.beginPath();
      for (let i = 0; i < numStars; i++) {
          const currentRadius = 140 + (Math.cos(i * 321.12) * 90);
          const angleOffset = Math.sin(i * 789.12) * Math.PI * 2;
          
          const speedMultiplier = (230 - currentRadius) / 50 + 0.5;
          const currentAngle = angleOffset + t * speedMultiplier;
          
          const starX = Math.cos(currentAngle) * currentRadius;
          const starY = Math.sin(currentAngle) * currentRadius * 0.7;
          
          const starSize = 2.0 + (50 / currentRadius) * 3;
          
          ctx.beginPath();
          ctx.arc(starX, starY, starSize, 0, Math.PI * 2);
          ctx.fill();
          
          const prevAngle = currentAngle - 0.05 - (speedMultiplier * 0.03); 
          const prevX = Math.cos(prevAngle) * currentRadius;
          const prevY = Math.sin(prevAngle) * currentRadius * 0.7;
          
          ctx.beginPath();
          ctx.moveTo(starX, starY);
          ctx.lineTo(prevX, prevY);
          ctx.stroke();
      }
      
      ctx.restore();
      ctx.restore();
      ctx.restore();
    }
  }

  const floorH = 260;

  // Draw flat floor layers
  ctx.fillStyle = "rgb(42, 30, 24)";
  ctx.fillRect(-50, h - floorH, w + 100, floorH + 50);

  ctx.fillStyle = "rgb(28, 20, 16)";
  ctx.fillRect(-50, h - floorH * 0.8, w + 100, floorH * 0.8 + 50);

  ctx.fillStyle = "rgb(18, 12, 10)";
  ctx.fillRect(-50, h - floorH * 0.6, w + 100, floorH * 0.6 + 50);

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
      if (typeof OffscreenCanvas !== 'undefined') {
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

  // Gemstones completely removed from standard ground visuals
}

function drawBuilding(ctx, keypadCtx, w, h, t, id, tier, prevTier, animProgress) {
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
  let glowOffsetX = 0;
  if (id === "core") topY = -200;
  else if (id === "crystal") topY = -(100 + tier * 10) - 30;
  else if (id === "stone") topY = -140;
  else if (id === "copper") topY = -90;
  else if (id === "iron") topY = -100;
  else if (id === "pure_gold") topY = -100; // Fixed vertical height for the glow
  else if (id === "diamond") topY = -120;
  else if (id === "emerald") topY = -130;
  else if (id === "ruby") topY = -200;
  else if (id === "sapphire") topY = -80;
  else if (id === "unobtainium") topY = -160;
  else if (id === "prismatium") topY = -150;
  else topY = -100;

  // Scale the topY
  let finalHighestY = floorY + topY * scale;

  ctx.save();
  const glowRadius = Math.abs(topY) * 0.8 + 40;
  const glowGrad = ctx.createRadialGradient(
    glowOffsetX,
    topY / 2,
    0,
    glowOffsetX,
    topY / 2,
    glowRadius,
  );
  glowGrad.addColorStop(0, "rgba(255, 255, 255, 0.15)");
  glowGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(glowOffsetX, topY / 2, glowRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (id === "core") drawBlackHole(ctx, t, tier, prevTier, animProgress);
  else if (id === "crystal") drawPrism(ctx, t, tier, prevTier, animProgress);
  else if (id === "stone") drawFoundry(ctx, t, tier, prevTier, animProgress);
  else if (id === "copper") drawCharger(ctx, t, tier, prevTier, animProgress);
  else if (id === "iron") drawRefinery(ctx, { base: globalRefineryAnimTime, pipe: globalRefineryPipeTime, tank: globalRefineryTankTime }, tier, prevTier, animProgress);
  else if (id === "pure_gold") drawVault(ctx, keypadCtx, w, h, t, tier, prevTier, animProgress);
  else if (id === "diamond") drawOilRig(ctx, globalOilRigAnimTime, tier, prevTier, animProgress, w, h, scale);
  else if (id === "emerald") drawGreenhouse(ctx, t, tier, prevTier, animProgress);
  else if (id === "ruby") drawReactor(ctx, t, tier, prevTier, animProgress);
  else if (id === "sapphire") drawCentrifuge(ctx, t, tier, prevTier, animProgress);
  else if (id === "unobtainium") drawBeacon(ctx, t, tier, prevTier, animProgress);
  else if (id === "prismatium") drawTesseract(ctx, t, tier);

  ctx.restore();

  // Update HTML element position
  const levelText = document.getElementById("building-detail-level-text");
  if (levelText) {
    const getOffset = (bId, bTier) => {
      if (bId === "core") return 150 - bTier * 2;
      if (bId === "crystal") return 180 - bTier * 8;
      if (bId === "copper") return 180 + bTier * 8;
      if (bId === "iron") return 220;
      if (bId === "pure_gold") return 250 + bTier * 10 + (bTier >= 4 ? 35 : 0);
      if (bId === "diamond") return 200 + bTier * 15;
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
  if (tier4Prog > 0 && tier8Prog <= 0) {
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
    // Combined alpha: keeps beam fully visible during transition (tier4Prog is 1)
    // and smoothly hands off from tier 4 beam to tier 8 beam in a single draw
    ctx.globalAlpha = Math.min(tier4Prog * (1 - tier8Prog) + tier8Prog, 1);
    ctx.globalCompositeOperation = "lighter";

    // Interpolate beam width from tier 4 to tier 8
    const t4BeamW = 6 + Math.sin(t * 5) * 2;
    const t8BeamW = 15 + Math.sin(t * 10) * 5;
    const beamW = t4BeamW + (t8BeamW - t4BeamW) * tier8Prog;

    ctx.fillStyle = "rgba(255, 255, 255, 1)";

    ctx.beginPath();
    ctx.moveTo(center.x - beamW, center.y - 2000);
    ctx.lineTo(center.x + beamW, center.y - 2000);
    ctx.lineTo(center.x + beamW / 2, center.y);
    ctx.lineTo(center.x - beamW / 2, center.y);
    ctx.fill();

    // Interpolate core: starts as tier 4 impact point (radius 8),
    // smoothly introduces tier 8 erratic pulsing
    ctx.fillStyle = "rgba(255, 255, 255, 1)";
    ctx.beginPath();
    const coreR = 8 + Math.random() * 6 * tier8Prog;
    ctx.arc(center.x, center.y, coreR, 0, Math.PI * 2);
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

  const drawBaseStructures = (extraBaseWidth) => {
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
    ctx.globalAlpha = ctx.globalAlpha * tier1Prog;

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
    ctx.globalAlpha = ctx.globalAlpha * tier2Prog;

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
    ctx.globalAlpha = ctx.globalAlpha * tier3Prog;

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
      { x: -74 - extraBaseWidth, y: -46 },
      { x: 74 + extraBaseWidth, y: -46 },
      { x: -54 - extraBaseWidth, y: -66 },
      { x: 54 + extraBaseWidth, y: -66 },
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
  }; // end of drawBaseStructures

  if (tier4Prog < 1) {
    ctx.save();
    ctx.globalAlpha = (ctx.globalAlpha || 1) * (1 - tier4Prog);
    drawBaseStructures(0);
    ctx.restore();
  }
  if (tier4Prog > 0) {
    ctx.save();
    ctx.globalAlpha = (ctx.globalAlpha || 1) * tier4Prog;
    drawBaseStructures(10);
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

// Global helper to draw animated fluid pipes
function drawFluidPipe(ctx, pathsOrPts, width, fluidColor, flowSpeed, timeOffset, alpha = 1, capStyle = "round", customStroke = null, customSlit = null, customDash = null, fullFill = false, glow = true) {
    if (alpha <= 0) return;
    const isMulti = pathsOrPts.length > 0 && Array.isArray(pathsOrPts[0]);
    const paths = isMulti ? pathsOrPts : [pathsOrPts];

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineJoin = "round";
    ctx.lineCap = capStyle;

    // Outer pipe
    ctx.strokeStyle = customStroke ? customStroke : (ironPattern ? ironPattern : "#5a6a75");
    ctx.lineWidth = width;
    ctx.beginPath();
    for (const pts of paths) {
      if (pts.length === 0) continue;
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();

    if (!fullFill) {
      // Pipe shadow overlay
      ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
      ctx.lineWidth = width * 0.7;
      ctx.stroke();

      // Specular highlight
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
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
    }

    // Fluid slit
    if (fluidColor) {
      let innerSlitW = fullFill ? (width > 6 ? width - 2 : width - 3) : width * 0.35;
      let innerDashW = fullFill ? (width > 6 ? width - 2 : width - 3) : width * 0.2;

      ctx.strokeStyle = customSlit ? customSlit : "#1a1a1a";
      ctx.lineWidth = innerSlitW;
      ctx.beginPath();
      for (const pts of paths) {
        if (pts.length === 0) continue;
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      }
      ctx.stroke();

      ctx.strokeStyle = fluidColor;
      ctx.lineWidth = innerDashW;
      
      if (customDash) {
          ctx.setLineDash(customDash);
      } else {
          const dashLen = width * 2.5;
          ctx.setLineDash([dashLen, dashLen * 1.5]);
      }
      
      ctx.lineDashOffset = -timeOffset * flowSpeed * 20;
      ctx.stroke();

      if (glow) {
          ctx.shadowColor = fluidColor;
          ctx.shadowBlur = width;
          ctx.stroke();
          ctx.shadowBlur = 0;
      }
      ctx.setLineDash([]);
    }

    ctx.restore();
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
    drawFluidPipe(ctx, oldPts, 8, oilColor, 2.5, tPipe, 1.0 - t1, "butt");
    
    drawFluidPipe(ctx, allPts, 8, oilColor, 2.5, tPipe, t1, "butt");
    
  } else {
    let allPts = [];
    allPts.push([
      { x: 0, y: baseY - tankH + 10 },
      { x: 0, y: baseY - tankH - 15 },
      { x: 60, y: baseY - tankH - 15 },
      { x: 60, y: baseY },
    ]);
    drawFluidPipe(ctx, allPts, 8, oilColor, 2.5, tPipe, 1.0, "butt");
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
        drawFluidPipe(ctx, [
          { x: conf.x, y: baseY - 40 },
          { x: conf.x, y: pTargetY },
          { x: -columnW/2 + 5, y: pTargetY } // Slightly inside so no gap
        ], 6, pipeColor, 2, tPipe, conf.tierAlpha);
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
        drawFluidPipe(ctx, [
          { x: conf.x, y: baseY - 40 },
          { x: conf.x, y: pTargetY },
          { x: columnW/2 - 5, y: pTargetY } // Slightly inside so no gap
        ], 6, pipeColor, 2, tPipe, conf.tierAlpha);
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

let cachedFaceOnLink = null;
let cachedSideOnLink = null;
const cachedForcefields = {};

function drawVault(ctx, keypadCtx, w, h, t, tier, prevTier, animProgress) {
  if (!pureGoldPattern && activeCtx) {
    initPureGoldPattern(activeCtx);
  } else if (!pureGoldPattern) {
    initPureGoldPattern(ctx);
  }

  const fillGold = pureGoldPattern ? pureGoldPattern : "#FFD700";
  const darkMetal = "#000000";
  
  // Progress helpers for smooth fading
  const getProg = (targetTier) => tier >= targetTier && prevTier < targetTier ? animProgress : (tier >= targetTier ? 1 : 0);

  let t0 = getProg(0);
  let t1 = getProg(1);
  let t2 = getProg(2);
  let t3 = getProg(3);
  let t4 = getProg(4);
  let t5 = getProg(5);
  let t6 = getProg(6);
  let t7 = getProg(7);
  let t8 = getProg(8);

  if (isVaultOpening || isVaultOpen) {
    t1 = 0;
    t2 = 0;
    t3 = 0;
    t4 = 0;
    t5 = 0;
    t6 = 0;
    t7 = 0;
    t8 = 0;
  }

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


  // Caching arrays for the forcefield frames to avoid computing/rendering hexagon paths every single frame
  const getCachedForcefield = (radiusX, radiusY, centerY, bottomY, hexScale, isBack) => {
    // A unique key for this configuration
    const key = `${radiusX}_${radiusY}_${centerY}_${bottomY}_${hexScale}_${isBack}`;
    
    if (cachedForcefields[key]) {
      return cachedForcefields[key];
    }
    
    const frames = 30; // 30 frames for a smooth looping animation
    const cachedFrames = [];
    
    const hexSize = 15 * hexScale;
    const sqrt3 = Math.sqrt(3);
    const loopDistance = hexSize * sqrt3;
    
    // We need the canvas to cover the whole dome
    // Width is 2 * radiusX
    // Height is from (centerY - radiusY) to bottomY
    const width = radiusX * 2 + 10; // plus some margin for stroke width
    const height = (bottomY - (centerY - radiusY)) + 10;
    
    const offsetX = width / 2;
    const offsetY_canvas = (centerY - radiusY) - 5;
    
    for (let f = 0; f < frames; f++) {
      let offCanvas;
      if (typeof OffscreenCanvas !== 'undefined') {
        offCanvas = new OffscreenCanvas(width, height);
      } else {
        offCanvas = document.createElement("canvas");
        offCanvas.width = width;
        offCanvas.height = height;
      }
      
      const octx = offCanvas.getContext("2d");
      octx.translate(offsetX, -offsetY_canvas);
      
      // Render frame
      // Smooth 3D Red Holographic Shield Barrier
      if (!isBack) {
        const domeGrad = octx.createRadialGradient(0, centerY + radiusY*0.3, radiusY*0.1, 0, centerY, radiusX);
        domeGrad.addColorStop(0, "rgba(255, 0, 0, 0.05)");
        domeGrad.addColorStop(0.7, "rgba(255, 0, 0, 0.2)");
        domeGrad.addColorStop(1, "rgba(255, 0, 0, 0.8)");
        
        octx.fillStyle = domeGrad;
        octx.strokeStyle = "rgba(255, 50, 50, 0.8)";
        octx.lineWidth = 3;
        
        octx.beginPath();
        octx.ellipse(0, centerY, radiusX, radiusY, 0, Math.PI, 0); 
        octx.lineTo(radiusX, bottomY);
        octx.lineTo(-radiusX, bottomY);
        octx.closePath();
        octx.fill();
      } else {
        octx.beginPath();
        octx.ellipse(0, centerY, radiusX, radiusY, 0, Math.PI, 0); 
        octx.lineTo(radiusX, bottomY);
        octx.lineTo(-radiusX, bottomY);
        octx.closePath();
      }
      
      octx.save();
      octx.clip();
      
      octx.strokeStyle = "rgba(255, 100, 100, 0.4)";
      octx.lineWidth = 1;
      octx.beginPath();
      
      // Calculate offsetY for this frame specifically
      let offsetY = (f / frames) * loopDistance;
      if (isBack) {
          offsetY = -offsetY;
      }
      
      const halfPi = Math.PI / 2;
      const equatorDist = halfPi * radiusX;
      const max_hex_dist = equatorDist + Math.max(0, bottomY - centerY) + 100;

      const maxRows = Math.ceil((max_hex_dist) / (hexSize * sqrt3)) + 4;
      const minRows = -2;
      const maxCols = Math.ceil((max_hex_dist) / (hexSize * 1.5)) + 4;
      
      const anglesCos = [
        Math.cos(0), Math.cos(Math.PI / 3), Math.cos(2 * Math.PI / 3), Math.cos(Math.PI)
      ];
      const anglesSin = [
        Math.sin(0), Math.sin(Math.PI / 3), Math.sin(2 * Math.PI / 3), Math.sin(Math.PI)
      ];
      
      const mapPoint = (px, py) => {
          let dist = Math.sqrt(px*px + py*py);
          if (dist > max_hex_dist) return null;
          let sR, my;
          if (dist / radiusX <= halfPi) {
              sR = radiusX * Math.sin(dist / radiusX);
              my = centerY - radiusY * Math.cos(dist / radiusX);
          } else {
              sR = radiusX;
              let pastEquatorDist = dist - equatorDist;
              my = centerY + pastEquatorDist;
          }
          let mx = dist === 0 ? 0 : (px / dist) * sR;
          if (my > bottomY + 100) return null;
          return {x: mx, y: my};
      };
      
      for (let row = minRows; row <= maxRows; row++) {
        for (let col = -maxCols; col <= maxCols; col++) {
          let hx = col * hexSize * 1.5;
          let hy = row * hexSize * sqrt3 + (col % 2 === 0 ? 0 : hexSize * sqrt3 / 2) + offsetY;
          
          let centerDist = Math.sqrt(hx*hx + hy*hy);
          if (centerDist > max_hex_dist) continue;
          
          for (let i = 0; i < 3; i++) {
            let px1 = hx + hexSize * anglesCos[i];
            let py1 = hy + hexSize * anglesSin[i];
            let px2 = hx + hexSize * anglesCos[i+1];
            let py2 = hy + hexSize * anglesSin[i+1];
            
            let p1 = mapPoint(px1, py1);
            let p2 = mapPoint(px2, py2);
            
            if (p1 && p2) {
              octx.moveTo(p1.x, p1.y);
              octx.lineTo(p2.x, p2.y);
            }
          }
        }
      }
      
      octx.strokeStyle = "rgba(255, 70, 70, 0.6)";
      octx.lineWidth = 2.5;
      octx.shadowBlur = 0;
      octx.stroke();
      
      octx.restore();

      if (!isBack) {
        octx.strokeStyle = "rgba(255, 50, 50, 0.8)";
        octx.lineWidth = 4;
        octx.beginPath();
        octx.ellipse(0, centerY, radiusX, radiusY, 0, Math.PI, 0); 
        octx.lineTo(radiusX, bottomY);
        octx.lineTo(-radiusX, bottomY);
        octx.closePath();
        octx.stroke();
      }
      
      cachedFrames.push(offCanvas);
    }
    
    cachedForcefields[key] = {
      frames: cachedFrames,
      offsetX: offsetX,
      offsetY: offsetY_canvas,
      loopDistance: loopDistance
    };
    
    return cachedForcefields[key];
  };

  const drawForcefield = (radiusX, radiusY, centerY, bottomY, alpha, hexScale, timeMultiplier = 1.0, isBack = false) => {
    if (alpha <= 0) return;
    
    // Get or generate the cached frames for this configuration
    const cachedData = getCachedForcefield(radiusX, radiusY, centerY, bottomY, hexScale, isBack);
    
    const hexSize = 15 * hexScale;
    const scrollSpeed = 20 * hexScale;
    
    // Calculate the continuous un-moduloed distance it should have traveled
    let rawDist = t * timeMultiplier * scrollSpeed;
    
    // Find the fractional progress through a single loop cycle (0.0 to 0.999...)
    // Handling negative safely using modulo
    let cycleProgress = (rawDist % cachedData.loopDistance) / cachedData.loopDistance;
    if (cycleProgress < 0) cycleProgress += 1; // fix for negative t
    
    // Find nearest frame index
    let frameIndex = Math.floor(cycleProgress * cachedData.frames.length);
    if (frameIndex >= cachedData.frames.length) frameIndex = cachedData.frames.length - 1;
    
    const img = cachedData.frames[frameIndex];
    
    ctx.save();
    ctx.globalAlpha = alpha;
    
    // Draw the image at the correct offset
    ctx.drawImage(img, -cachedData.offsetX, cachedData.offsetY);
    
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
    ], fillGold, fillGold, 4, alpha);

    // If opening or open, draw dark interior and spinning coin
    if (isVaultOpening || isVaultOpen) {
      ctx.fillStyle = "#111111";
      ctx.fillRect(-50, -90, 100, 80);
      ctx.strokeStyle = darkMetal;
      ctx.lineWidth = 2;
      ctx.strokeRect(-50, -90, 100, 80);
      
      // Draw spinning coin
      if ((isVaultOpening || isVaultOpen) && !vaultCoinCollectedLocal) {
        ctx.save();
        ctx.translate(0, -50);
        ctx.scale(Math.sin(time * 5), 1);
        const prCoin = getPreRenderedItem('img/currencies/coin/coin.webp', 40);
        if (prCoin) {
          ctx.drawImage(prCoin, -20, -20, 40, 40);
        } else {
          ctx.drawImage(coinImg, -15, -15, 30, 30);
        }
        ctx.restore();
      }
    }
    
    // Now draw the door (which swings open)
    ctx.save();
    if (isVaultOpening || isVaultOpen) {
      const prog = isVaultOpen ? 1.0 : (5.0 - vaultOpeningTime) / 5.0;
      const maxAngle = Math.acos(-0.5); // 120 degrees
      const doorScaleX = Math.cos(prog * maxAngle);
      ctx.translate(-50, 0);
      ctx.scale(doorScaleX, 1);
      ctx.translate(50, 0);
    }
    
    // Vault door fill (using pure gold texture)
    ctx.fillStyle = fillGold;
    ctx.fillRect(-50, -90, 100, 80);
    
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
    
    ctx.restore(); // restore door swing
    
    ctx.restore(); // restore global alpha
  };

  


  function initChainPaths(fillGold) {
    if (cachedFaceOnLink) return;
    
    let hw = 6, hh = 3.5, r = 3;
    const faceOnLinkPath = new Path2D();
    faceOnLinkPath.moveTo(-hw + r, -hh);
    faceOnLinkPath.lineTo(hw - r, -hh);
    faceOnLinkPath.quadraticCurveTo(hw, -hh, hw, -hh + r);
    faceOnLinkPath.lineTo(hw, hh - r);
    faceOnLinkPath.quadraticCurveTo(hw, hh, hw - r, hh);
    faceOnLinkPath.lineTo(-hw + r, hh);
    faceOnLinkPath.quadraticCurveTo(-hw, hh, -hw, hh - r);
    faceOnLinkPath.lineTo(-hw, -hh + r);
    faceOnLinkPath.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

    const faceOnLinkShadowPath = new Path2D();
    r = 1.5; hw = 4.5; hh = 2;
    faceOnLinkShadowPath.moveTo(-hw + r, -hh);
    faceOnLinkShadowPath.lineTo(hw - r, -hh);
    faceOnLinkShadowPath.quadraticCurveTo(hw, -hh, hw, -hh + r);
    faceOnLinkShadowPath.lineTo(hw, hh - r);
    faceOnLinkShadowPath.quadraticCurveTo(hw, hh, hw - r, hh);
    faceOnLinkShadowPath.lineTo(-hw + r, hh);
    faceOnLinkShadowPath.quadraticCurveTo(-hw, hh, -hw, hh - r);
    faceOnLinkShadowPath.lineTo(-hw, -hh + r);
    faceOnLinkShadowPath.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

    const sideOnLinkPath = new Path2D();
    sideOnLinkPath.moveTo(-5.5, 0);
    sideOnLinkPath.lineTo(5.5, 0);

    const sideOnLinkShadowPath = new Path2D();
    sideOnLinkShadowPath.moveTo(-4.5, 1);
    sideOnLinkShadowPath.lineTo(4.5, 1);

    const sideOnLinkHighlightPath = new Path2D();
    sideOnLinkHighlightPath.moveTo(-4.5, -1);
    sideOnLinkHighlightPath.lineTo(4.5, -1);

    if (typeof OffscreenCanvas !== 'undefined') {
        cachedFaceOnLink = new OffscreenCanvas(20, 20);
        cachedSideOnLink = new OffscreenCanvas(20, 20);
    } else {
        cachedFaceOnLink = document.createElement("canvas");
        cachedFaceOnLink.width = 20;
        cachedFaceOnLink.height = 20;
        cachedSideOnLink = document.createElement("canvas");
        cachedSideOnLink.width = 20;
        cachedSideOnLink.height = 20;
    }

    const faceCtx = cachedFaceOnLink.getContext("2d");
    faceCtx.translate(10, 10);
    faceCtx.strokeStyle = fillGold;
    faceCtx.lineWidth = 2.5;
    faceCtx.lineCap = "round";
    faceCtx.lineJoin = "round";
    faceCtx.stroke(faceOnLinkPath);
    faceCtx.strokeStyle = "#B39700";
    faceCtx.lineWidth = 0.5;
    faceCtx.stroke(faceOnLinkShadowPath);

    const sideCtx = cachedSideOnLink.getContext("2d");
    sideCtx.translate(10, 10);
    sideCtx.strokeStyle = fillGold;
    sideCtx.lineWidth = 3.5; 
    sideCtx.lineCap = "round"; 
    sideCtx.stroke(sideOnLinkPath);
    sideCtx.strokeStyle = "#B39700";
    sideCtx.lineWidth = 1;
    sideCtx.stroke(sideOnLinkShadowPath);
    sideCtx.strokeStyle = "#FFE866";
    sideCtx.lineWidth = 1;
    sideCtx.stroke(sideOnLinkHighlightPath);
}
  const drawT7Chains = (isBack, part = "all") => {
    if (t7 <= 0) return;
    ctx.save();
    ctx.globalAlpha = t7;

    const endY = -50;
    
    let leftAnchorX, leftAnchorY, rightAnchorX, rightAnchorY;
    
    if (isBack) {
      leftAnchorX = -240;
      leftAnchorY = 15; // ground
      rightAnchorX = 240;
      rightAnchorY = 15; // ground
    } else {
      leftAnchorX = -230;
      leftAnchorY = 15; // ground
      rightAnchorX = 230;
      rightAnchorY = 15; // ground
    }
    
    const drawChain = (startX, startY, sign, groundOffset = 0, vaultOffset = 0) => {
      // End point on the vault
      const vaultX = sign * 67.5 + vaultOffset;
      startX = startX + groundOffset;
      const vaultY = endY;
      
      // Control point for a drooping curve
      const midX = (startX + vaultX) / 2;
      
      // Modest upright concavity
      const midY = Math.min(startY, vaultY) - 20; 
      
      // Calculate length to determine number of links
      const waveAmp = 8;
      const waveFreq = Math.PI * 2.5; // 1.25 waves
      const waveSpeed = 4;
      const phase = Math.PI;
      
      const approxLen = Math.sqrt(Math.pow(vaultX - startX, 2) + Math.pow(vaultY - startY, 2)) * 1.2;
      const numLinks = Math.floor(approxLen / 8); // distance per link
      
      for (let i = 0; i <= numLinks; i++) {
        const p = i / numLinks;
        
        // Quadratic bezier
        const invP = 1 - p;
        const x = invP * invP * startX + 2 * invP * p * midX + p * p * vaultX;
        const base_y = invP * invP * startY + 2 * invP * p * midY + p * p * vaultY;
        
        // Envelope makes it rigid at ends
        const env = Math.pow(Math.sin(p * Math.PI), 2);
        const dEnv_dp = Math.PI * Math.sin(2 * p * Math.PI);
        
        const waveVal = Math.sin(p * waveFreq - t * waveSpeed + phase);
        const dWave_dp = waveFreq * Math.cos(p * waveFreq - t * waveSpeed + phase);
        
        const waveOffset = env * waveAmp * waveVal;
        const dWaveOffset_dp = dEnv_dp * waveAmp * waveVal + env * waveAmp * dWave_dp;
        
        const y = base_y + waveOffset;
        
        // Derivative for rotation
        const dx = 2 * invP * (midX - startX) + 2 * p * (vaultX - midX);
        const base_dy = 2 * invP * (midY - startY) + 2 * p * (vaultY - midY);
        const dy = base_dy + dWaveOffset_dp;
        const angle = Math.atan2(dy, dx);
        
        // Filter parts for front chains entering the tier 4 forcefield (rx = 130)
        if (part !== "all") {
            const isInner = Math.abs(x) < 130;
            if (part === "inner" && !isInner) continue;
            if (part === "outer" && isInner) continue;
        }

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        
        // Draw individual link
        initChainPaths(fillGold);
        if (i % 2 === 0) {
            // "Face on" link
            ctx.drawImage(cachedFaceOnLink, -10, -10);
        } else {
            // "Side on" link
            ctx.drawImage(cachedSideOnLink, -10, -10);
        }
        
        ctx.restore();
      }
    };
    
    if (isBack) {
      // Offset back chains so they don't hide behind front ones
      // We also need to triple them like the front chains.
      const offsets = [-20, 0, 20];
      offsets.forEach(off => {
        drawChain(leftAnchorX, leftAnchorY, -1, off, 0);
        drawChain(rightAnchorX, rightAnchorY, 1, off, 0);
      });
    } else {
      const offsets = [-20, 0, 20];
      offsets.forEach(off => {
        drawChain(leftAnchorX, leftAnchorY, -1, off, 0);
        drawChain(rightAnchorX, rightAnchorY, 1, off, 0);
      });
    }
    
    ctx.restore();
  };



  const drawT6Drones = (isBack, renderPass = "both") => {
    if (t6 <= 0) return;
    ctx.save();
    ctx.globalAlpha = t6;
    
    const numDrones = 2;
    const droneOrbitRadiusX = 220;
    const droneOrbitRadiusY = 30;
    const droneHeight = -90; // Height they fly at
    
    for (let i = 0; i < numDrones; i++) {
      const phase = (i / numDrones) * Math.PI * 2;
      const speedMultiplier = 1.2;
      
      const angle = phase + (t * 0.8 * speedMultiplier); 
      
      const z = Math.sin(angle);
      
      // Filter out based on depth
      if (isBack && z >= 0) continue;
      if (!isBack && z < 0) continue;
      
      ctx.save();
      
      const dx = Math.cos(angle) * droneOrbitRadiusX;
      // Add isometric depth and small bob
      const dy = z * droneOrbitRadiusY + Math.sin(angle * 2) * 5 + droneHeight;
      
      const scale = 0.7 + (z + 1) * 0.3; // Scale between 0.7 and 1.3
      
      ctx.translate(dx, dy);
      ctx.scale(scale, scale);
      
      if (renderPass === "both" || renderPass === "body") {
        // Drone Body (Sleek black & gold)
        ctx.fillStyle = darkMetal;
        ctx.beginPath();
        ctx.moveTo(-15, 0);
        ctx.lineTo(0, -10);
        ctx.lineTo(15, 0);
        ctx.lineTo(0, 10);
        ctx.closePath();
        ctx.fill();
        
        ctx.strokeStyle = fillGold;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      
      if (renderPass === "both" || renderPass === "lights") {
        // If it's a back drone's light, clip it so it doesn't draw over the central vault and pylons
        if (isBack) {
          ctx.save();
          // We define a clip region that excludes the center area containing the vault and pylons.
          // The laser only shines downwards from droneHeight (-90), so we mainly need to avoid
          // drawing it in the center. We can achieve an inverted clip using `clip("evenodd")`
          // Note we are inside a context translated to (dx, dy) and scaled.
          // Instead of popping the transform (which messes up the stack), we temporarily invert it.
          ctx.scale(1/scale, 1/scale);
          ctx.translate(-dx, -dy);
          
          ctx.beginPath();
          ctx.rect(-2000, -2000, 4000, 4000); // Massive background rect
          
          // Vault bounding box
          // T1 frame bounds roughly -75 to 75, height -115 to 15. 
          ctx.rect(-75, -115, 150, 130);
          
          // Pylon bounding polygons (x: -165 and 165, anchored at y=15)
          const pylonPoints = [
            {x: -20, y: 0}, {x: 20, y: 0}, {x: 15, y: -10}, 
            {x: 15, y: -9}, {x: 8, y: -140}, {x: 0, y: -155}, {x: -8, y: -140}, {x: -15, y: -9},
            {x: -15, y: -10}
          ];
          
          [-165, 165].forEach(xPos => {
            ctx.moveTo(xPos + pylonPoints[0].x, 15 + pylonPoints[0].y);
            for(let j=1; j<pylonPoints.length; j++) {
              ctx.lineTo(xPos + pylonPoints[j].x, 15 + pylonPoints[j].y);
            }
            ctx.closePath();
          });
          
          ctx.clip("evenodd");
          
          // Re-apply drone transform inside this save state
          ctx.translate(dx, dy);
          ctx.scale(scale, scale);
        }

        // Drone Core (Glowing Red Eye)
        const pulse = (Math.sin(t * 8 + i * Math.PI) + 1) / 2;
        ctx.fillStyle = `rgba(255, 50, 50, ${0.8 + pulse * 0.2})`;
        ctx.shadowColor = "#ff0000";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        // Scanning Laser Cone (Pointing Down)
        const sweepAngle = Math.sin(t * 3 + i * Math.PI) * 0.5;
        
        ctx.save();
        ctx.rotate(sweepAngle);
        
        const laserGrad = ctx.createLinearGradient(0, 0, 0, 150);
        laserGrad.addColorStop(0, "rgba(255, 50, 50, 0.4)");
        laserGrad.addColorStop(1, "rgba(255, 50, 50, 0.0)");
        
        ctx.fillStyle = laserGrad;
        ctx.beginPath();
        ctx.moveTo(0, 5);
        ctx.lineTo(-40, 150);
        ctx.lineTo(40, 150);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
        
        // Restore inverted clip state if this was a backside drone
        if (isBack) {
          ctx.restore();
        }
      }
      
      ctx.restore();
    }
    
    ctx.restore();
  };
  ctx.save();
  // Move building up for T1 reinforcements (with cross-fade for T0)
  if (tier >= 1) {
    if (prevTier === 0 && tier === 1 && !isVaultOpening && !isVaultOpen) {
      drawT0Vault(1 - t1);
      ctx.translate(0, -15);
      
      // --- Tier 6: Hovering Security Drones (Backside) ---
      if (t6 > 0) {
        drawT6Drones(true, "body");
      }
      
      // --- Tier 7: Back Chains ---
      if (t7 > 0) {
        drawT7Chains(true, "outer");
      }
      
      // --- Tier 4 & 8: Backside Forcefield ---
      if (t8 > 0) {
        drawForcefield(280, 160, -50, 15, t8, 2.0, 1.0, true);
      }
      if (t4 > 0) {
        drawForcefield(130, 100, -50, 15, t4, 2.0, 1.0, true);
      }
      
      drawT0Vault(t1);
    } else {
      ctx.translate(0, -15);
      
      // --- Tier 6: Hovering Security Drones (Backside) ---
      if (t6 > 0) {
        drawT6Drones(true, "body");
      }
      
      // --- Tier 7: Back Chains ---
      if (t7 > 0) {
        drawT7Chains(true, "outer");
      }
      
      // --- Tier 4 & 8: Backside Forcefield ---
      if (t8 > 0) {
        drawForcefield(280, 160, -50, 15, t8, 2.0, 1.0, true);
      }
      if (t4 > 0) {
        drawForcefield(130, 100, -50, 15, t4, 2.0, 1.0, true);
      }
      
      drawT0Vault(1);
    }
  } else {
    // --- Tier 6: Hovering Security Drones (Backside) ---
    if (t6 > 0) {
      drawT6Drones(true, "body");
    }

    // --- Tier 7: Back Chains ---
      if (t7 > 0) {
        drawT7Chains(true, "outer");
      }
      
      // --- Tier 4 & 8: Backside Forcefield ---
    if (t8 > 0) {
      drawForcefield(280, 160, -50, 15, t8, 2.0, 1.0, true);
    }
    if (t4 > 0) {
      drawForcefield(130, 100, -50, 15, t4, 2.0, 1.0, true);
    }
    
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
    // If vault is open / perfectly matched: solid green
    // If we have entered some numbers but not matched yet: let's determine if we have a valid prefix prefix sequence
    const seq = getVaultSequence();
    const target = "7887773346665553";
    let lightColor = "#ff0000"; // Solid red by default/idle (not touched)
    
    if (seq === target) {
      lightColor = "#00ff00"; // Solid green
    } else if (seq && seq !== "0000000000000000" && seq.length > 0) {
      const matchLen = getMatchLength(seq, target);
      if (matchLen > 0) {
        lightColor = "#00ff00"; // Solid green on correct prefix match
      } else {
        lightColor = "#ff0000"; // Solid red on incorrect prefix
      }
    }

    ctx.fillStyle = lightColor;
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

  // --- Tier 7: Chains (Inner) ---
  if (t7 > 0) {
    drawT7Chains(true, "inner");
    drawT7Chains(false, "inner");
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
      ctx.moveTo(-15, -9);
      ctx.lineTo(15, -9);
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
    ctx.strokeStyle = "rgba(255, 50, 50, 0.8)"; // Red color
    ctx.lineWidth = 2;
      
    // Arc from left pylon top sphere (-165, 15 - 155 = -140)
    ctx.beginPath();
    ctx.moveTo(-165, -140);
    ctx.lineTo(-80 + Math.random()*20 - 10, -80 + Math.random()*20 - 10);
    ctx.lineTo(0, -49); // Connects to center mechanical dial
    ctx.stroke();
      
    // Arc from right pylon top sphere (165, 15 - 155 = -140)
    ctx.beginPath();
    ctx.moveTo(165, -140);
    ctx.lineTo(80 + Math.random()*20 - 10, -80 + Math.random()*20 - 10);
    ctx.lineTo(0, -49); // Connects to center mechanical dial
    ctx.stroke();
    
    ctx.restore();
  }

  // --- Tier 7: Front Chains (Outer) ---
  if (t7 > 0) {
    drawT7Chains(false, "outer");
  }
  // --- Tier 6: Hovering Security Drones (Backside Lights) ---
  if (t6 > 0) {
    drawT6Drones(true, "lights");
  }


  
  // --- Tier 6: Hovering Security Drones ---
  if (t6 > 0) {
    drawT6Drones(false);
  }

  // --- Tier 8: Aegis Matrix Shield Upgrade ---
  if (t8 > 0) {
    // RadiusX: 260 covers cannons
    // RadiusY shrunk to 160. CenterY -50. Base is 15.
    drawForcefield(280, 160, -50, 15, t8, 2.0, 1.0);
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
  ctx.fillRect(-1600, 0, 3200, floorH + 50);

  ctx.fillStyle = "rgb(28, 20, 16)";
  ctx.fillRect(-1600, floorH - floorH * 0.8, 3200, floorH * 0.8 + 50);
  
  ctx.fillStyle = "rgb(18, 12, 10)";
  ctx.fillRect(-1600, floorH - floorH * 0.6, 3200, floorH * 0.6 + 50);

  // Gemstones completely removed from fake ground for Vault building

  ctx.restore();

  if (keypadZoomedIn && keypadCtx) {
    keypadCtx.save();
    keypadCtx.resetTransform();

    // Dark background overlay on the keypad canvas
    keypadCtx.fillStyle = "rgba(0, 0, 0, 0.75)";
    keypadCtx.fillRect(0, 0, w, h);

    // Translate to center
    keypadCtx.translate(Math.floor(w / 2), Math.floor(h / 2));
    const zoomFactor = 8;
    keypadCtx.scale(zoomFactor, zoomFactor);

    // Keypad body
    keypadCtx.fillStyle = "#111111";
    keypadCtx.fillRect(-12.5, -18, 25, 36);

    // Status light on zoomed keypad
    const zoomSeq = getVaultSequence();
    const zoomTarget = "7887773346665553";
    let zoomLightColor = "#ff0000"; // Solid red by default/idle
    
    if (zoomSeq === zoomTarget) {
      zoomLightColor = "#00ff00"; // Solid green
    } else if (zoomSeq && zoomSeq !== "0000000000000000" && zoomSeq.length > 0) {
      const matchLen = getMatchLength(zoomSeq, zoomTarget);
      if (matchLen > 0) {
        zoomLightColor = "#00ff00"; // Solid green on correct prefix match
      } else {
        zoomLightColor = "#ff0000"; // Solid red on incorrect prefix
      }
    }
    
    keypadCtx.fillStyle = zoomLightColor;
    keypadCtx.beginPath();
    keypadCtx.arc(0, -10.5, 2, 0, Math.PI * 2);
    keypadCtx.fill();

    // 3x3 Button grid
    const kx = (canvasMouseX - Math.floor(w / 2)) / zoomFactor;
    const ky = (canvasMouseY - Math.floor(h / 2)) / zoomFactor;

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const bx = -9.5 + c * 7;
        const by = -3 + r * 7;
        const btnNum = r * 3 + c + 1;

        const isHovered = kx >= bx && kx <= bx + 5 && ky >= by && ky <= by + 5;
        const isHighlighted = isHovered || (lastHotkeyNum === btnNum);
        keypadCtx.fillStyle = isHighlighted ? "#656565" : "#434343";
        keypadCtx.fillRect(bx, by, 5, 5);

        if (isHighlighted) {
          keypadCtx.strokeStyle = "#00ffff";
          keypadCtx.lineWidth = 0.5;
          keypadCtx.strokeRect(bx, by, 5, 5);
        }

        // Draw numbers
        keypadCtx.save();
        keypadCtx.resetTransform();
        keypadCtx.translate(Math.floor(w / 2), Math.floor(h / 2));
        keypadCtx.fillStyle = "#ffffff";
        keypadCtx.font = "bold 24px sans-serif";
        keypadCtx.textAlign = "center";
        
        const text = String(btnNum);
        const metrics = keypadCtx.measureText(text);
        const textHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
        
        const renderX = Math.round((bx + 2.5) * zoomFactor);
        const renderY = Math.round((by + 2.5) * zoomFactor + (metrics.actualBoundingBoxAscent - textHeight / 2));

        keypadCtx.fillText(text, renderX, renderY);
        keypadCtx.restore();
      }
    }

    keypadCtx.restore();
  }
}

function drawOilRig(ctx, t, tier, prevTier, animProgress, w, h, scale) {
  if (!diamondPattern && activeCtx) {
    initDiamondPattern(activeCtx);
  } else if (!diamondPattern) {
    initDiamondPattern(ctx);
  }
  if (!darkDiamondPattern && activeCtx) {
    initDarkDiamondPattern(activeCtx);
  } else if (!darkDiamondPattern) {
    initDarkDiamondPattern(ctx);
  }
  const fillDiamond = diamondPattern ? diamondPattern : "#8be9ed";
  const fillDarkDiamond = darkDiamondPattern ? darkDiamondPattern : "#008888";
  
  // Progress helpers for smooth fading
  const getProg = (targetTier) => tier >= targetTier && prevTier < targetTier ? animProgress : (tier >= targetTier ? 1 : 0);

  let t0 = getProg(0);
  let t1 = getProg(1);
  let t2 = getProg(2);
  let t3 = getProg(3);
  let t4 = getProg(4);
  let t5 = getProg(5);
  let t6 = getProg(6);
  let t7 = getProg(7);
  let t8 = getProg(8);

  let effTier = prevTier + (tier - prevTier) * animProgress;
  effTier = Math.max(0, Math.min(8, effTier));
  // Scale the physical width of the rig gradually from 1.0 (Tier 0) to 2.666 (Tier 8, making a 30px top drive become 80px)
  const widthScale = 1.0 + (effTier / 8.0) * ((80.0 / 30.0) - 1.0);

  ctx.save();

  // --- Tier 0+: Underground Cavern & Oil Reservoir ---
  ctx.save();
  
  // Undo scaling so the cavern is constant size and perfectly centered in the 260px underground space
  if (scale) ctx.scale(1/scale, 1/scale);
  
  // 130 is exactly halfway down the 260px underground area (floorY is at h - 260)
  let cy = 130; 
  let cavernRadiusX = w * 0.45; // 90% of viewport width
  cavernRadiusX = Math.round(cavernRadiusX / 10) * 10; // Snap to nearest 10 to ensure perfectly symmetric physics nodes around x=0
  
  // Define Cavern Path
  let cavernPath = new Path2D();
  cavernPath.ellipse(0, cy, cavernRadiusX, 90, 0, 0, Math.PI * 2); 
  
  let baseLiquidLevel = cy - 10; // Scales proportionally with the width of the oval by staying at a fixed relative height
  // Cut out the cavern
  ctx.fillStyle = "#050302"; // Inside the cavern
  ctx.fill(cavernPath);

  let radiusNarrow = 18;
  let radiusWide = 32;
  
  let gapAngleNarrow = Math.asin((radiusNarrow + 4) / cavernRadiusX);
  let strokeBottomYNarrow = cy - 90 * Math.cos(gapAngleNarrow) + 6;
  
  let gapAngleWide = Math.asin((radiusWide + 4) / cavernRadiusX);
  let strokeBottomYWide = cy - 90 * Math.cos(gapAngleWide) + 6;
  
  // Drill shaft base darkness (always solid to prevent transparency)
  ctx.fillStyle = "#050302";
  ctx.fillRect(-radiusNarrow, 0, radiusNarrow * 2, cy); 
  
  if (t8 > 0) {
      ctx.save();
      ctx.globalAlpha = t8;
      ctx.fillStyle = "#050302";
      ctx.fillRect(-radiusWide, 0, radiusWide * 2, cy); 
      ctx.restore();
  }
  
  // --- NEW: Draw Drill Shaft BEFORE oil ---
  if (t0 > 0) {
      ctx.save();
      let drillY = 0;
      let drillLength = 175; // Deep, but not touching the bottom
      
      let spinOffsetX = Math.round(t * 80) % 64;
      let spinOffsetY = Math.round(t * 40) % 64;
      
      // 1. Narrow upper shaft (drawn first, extended to overlap underneath the top drive and chuck)
      // Keep these unscaled so the top drive stays near the ground, allowing cables to elongate as derrick scales
      let topDriveTop = -90;
      let topDriveBottom = -60;
      let shaftTop = -65;
      
      // Edge shading to give it a 3D cylindrical look
      let grad = ctx.createLinearGradient(-15, 0, 15, 0);
      grad.addColorStop(0, "rgba(0,0,0,0.45)");
      grad.addColorStop(0.15, "rgba(0,0,0,0)");
      grad.addColorStop(0.85, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.45)");

      if (t4 < 1) {
          ctx.save();
          // Fade out the physical drill as tier 4 activates
          ctx.globalAlpha = 1 - t4; 

          ctx.save();
          ctx.beginPath();
          ctx.rect(-8, shaftTop + drillY, 16, -shaftTop);
          ctx.clip();
          
          // Draw moving texture
          ctx.translate(spinOffsetX, spinOffsetY);
          ctx.fillStyle = fillDiamond;
          ctx.fillRect(-8 - spinOffsetX, shaftTop + drillY - spinOffsetY - 64, 16 + 64, -shaftTop + 200);
          ctx.translate(-spinOffsetX, -spinOffsetY);
          
          ctx.restore();

          // 2. Main drill body clipping path (for moving texture and shading)
          ctx.beginPath();
          ctx.moveTo(-8, drillY - 15);
          ctx.lineTo(8, drillY - 15);
          ctx.lineTo(15, drillY);
          ctx.lineTo(15, drillY + drillLength - 30);
          ctx.lineTo(0, drillY + drillLength);
          ctx.lineTo(-15, drillY + drillLength - 30);
          ctx.lineTo(-15, drillY);
          ctx.closePath();
          ctx.save();
          ctx.clip();
          
          // Draw moving texture
          ctx.translate(spinOffsetX, spinOffsetY);
          ctx.fillStyle = fillDiamond;
          ctx.fillRect(-15 - spinOffsetX, drillY - 20 - spinOffsetY - 64, 30 + 64, drillLength + 200);
          ctx.translate(-spinOffsetX, -spinOffsetY);
          
          // Edge shading to give it a 3D cylindrical look
          ctx.fillStyle = grad;
          ctx.fillRect(-15, drillY - 15, 30, drillLength + 15);
          ctx.restore();

          // 3D Grooves for the main body
          ctx.save();
          ctx.strokeStyle = fillDarkDiamond;
          ctx.lineWidth = 3; // slightly thicker so pattern is visible
          let grooveOffset = (t * 80) % 8; // Grooves slide down
          let numGrooves = Math.floor((drillLength - 30) / 8) + 2; 
          
          ctx.translate(spinOffsetX, spinOffsetY);
          for(let i=-2; i<numGrooves; i++) {
              let gy = drillY + grooveOffset + i*8;
              if (gy > drillY && gy < drillY + drillLength - 35) {
                  ctx.beginPath();
                  ctx.moveTo(-15 - spinOffsetX, gy - 2 - spinOffsetY);
                  ctx.quadraticCurveTo(0 - spinOffsetX, gy + 3 - spinOffsetY, 15 - spinOffsetX, gy + 6 - spinOffsetY);
                  ctx.stroke();
              }
          }
          ctx.translate(-spinOffsetX, -spinOffsetY);
          ctx.restore();
          ctx.restore(); // Restore alpha
      }

      // --- Tier 2: Heavy Mud Circulation Pipes ---
      // Drawn here (unscaled section) so they go behind the top drive
      if (t2 > 0) {
          ctx.save();
          ctx.globalAlpha = t2;
          
          let s = scale || 1;
          const drawPipe = (xSign) => {
              // Mud pumps are drawn in scaled section at x=55, y=-40
              let xPos = xSign * 55 * s;
              let startY = -40 * s;
              
              let tdCenterY = -75; // Top drive sits between -60 and -90 (unscaled)
              
              let pts = [
                  { x: xPos, y: startY },
                  { x: xPos, y: -140 * s }, // Up (Standpipe)
                  { x: xSign * 30 * s, y: -140 * s }, // Inwards
                  { x: xSign * 30 * s, y: tdCenterY }, // Down (Rotary hose loop)
                  { x: 0, y: tdCenterY }, // Connect exactly into the center of the top drive
              ];
              
              let mudDash = "#594940"; 
              let mudSlit = null; 
              
              let flowSpeed = (12.5 / Math.PI) * s; 
              let timeOffset = t + Math.PI / 20;
              
              drawFluidPipe(ctx, pts, 6 * s, mudDash, flowSpeed, timeOffset, t2, "butt", fillDiamond, mudSlit, [25 * s, 25 * s], true, false);
          };
          
          drawPipe(-1);
          drawPipe(1);
          
          ctx.restore();
      }



      ctx.restore();
  }

  // 3. Fluid Oil Pool inside the Cavern
  ctx.save();
  ctx.clip(cavernPath); // Restrict fluid entirely to the cavern
  
  let laserStrength = (t4 * 1.0) + (t8 * 2.0); // 0 to 4 max
  
  // --- PHYSICS UPDATE ---
  let now = performance.now();
  if (oilPhysicsLastUpdate === 0) oilPhysicsLastUpdate = now;
  // Maximum dt to prevent explosion on lag
  let dt = Math.min((now - oilPhysicsLastUpdate) / 1000, 0.05);
  oilPhysicsLastUpdate = now;
  
  let impactY = baseLiquidLevel; // Center of the fluid pool

  // Initialize or resize physics nodes
  let numNodes = Math.ceil((cavernRadiusX * 2) / 10) + 1;
  if (oilPhysicsNodes.length !== numNodes || oilPhysicsLastWidth !== cavernRadiusX) {
      oilPhysicsNodes = [];
      for (let i = 0; i < numNodes; i++) {
          oilPhysicsNodes.push({
              y: baseLiquidLevel,
              vy: 0,
              baseY: baseLiquidLevel
          });
      }
      oilPhysicsParticles = [];
      oilPhysicsLastWidth = cavernRadiusX;
  }

  // Physics params
  const k = 0.03; // Slightly stronger spring to keep it controlled
  const d = 0.04; // Higher damping to prevent unnatural spikes
  const spread = 0.12; // Faster wave propagation to smooth out the surface
  
  // 1. Update spring node velocities and positions
  let drillTipY = baseLiquidLevel + (173 - baseLiquidLevel) * (1 - t4); // Smoothly retracts from 173 up to surface level during t4 transition

  for (let i = 0; i < numNodes; i++) {
      let node = oilPhysicsNodes[i];
      let px = -cavernRadiusX + i * 10;
      
      // Ambient gentle waves
      let ambientWave = Math.sin(px * 0.015 + t * 1.5) * 4 + Math.sin(px * 0.025 - t * 2.1) * 2;
      
      // Violent, asymmetric chaotic swells when laser is active
      let laserSwell = 0;
      if (laserStrength > 0) {
          // Use very low frequencies for large, rolling, tsunami-like waves
          let swell1 = Math.sin(px * 0.006 + t * 3.7) * 25;
          let swell2 = Math.sin(px * 0.011 - t * 4.9 + Math.sin(t * 2.1)) * 18;
          let falloff = 1 - Math.pow(Math.abs(px) / cavernRadiusX, 2); // Stronger near center
          laserSwell = (swell1 + swell2) * laserStrength * falloff;
          
          // Break symmetry explicitly
          if (px < 0) laserSwell *= 0.6; 
      }
      
      // Node wants to return to flat pool
      let vortexDip = 0;
      if (t4 < 1 && Math.abs(px) <= 45) { 
          let pt = Math.abs(px) / 45;
          vortexDip = (1 - pt) * (drillTipY - baseLiquidLevel); // Naturally fades as drillTipY goes to baseLiquidLevel
      }
      node.baseY = baseLiquidLevel + ambientWave + laserSwell + vortexDip;
      
      let x = node.y - node.baseY;
      node.vy -= k * x;
      node.vy *= (1 - d);
      
      // Clamp max velocity to prevent chaotic spikes
      if (node.vy > 12) node.vy = 12;
      if (node.vy < -12) node.vy = -12;
      
      node.y += node.vy;
  }
  
  // Volume Conservation (Softened to prevent violent bounciness)
  let currentVol = 0;
  for (let i = 0; i < numNodes; i++) {
      currentVol += (oilPhysicsNodes[i].y - oilPhysicsNodes[i].baseY);
  }
  let correction = (currentVol / numNodes) * 0.1; 
  for (let i = 0; i < numNodes; i++) {
      oilPhysicsNodes[i].vy -= correction; 
  }

  // 2. Propagate waves to neighbors
  let lDeltas = new Array(numNodes).fill(0);
  let rDeltas = new Array(numNodes).fill(0);
  for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < numNodes; i++) {
          if (i > 0) {
              lDeltas[i] = spread * (oilPhysicsNodes[i].y - oilPhysicsNodes[i - 1].y);
              oilPhysicsNodes[i - 1].vy += lDeltas[i];
          }
          if (i < numNodes - 1) {
              rDeltas[i] = spread * (oilPhysicsNodes[i].y - oilPhysicsNodes[i + 1].y);
              oilPhysicsNodes[i + 1].vy += rDeltas[i];
          }
      }
      for (let i = 0; i < numNodes; i++) {
          if (i > 0) oilPhysicsNodes[i - 1].y += lDeltas[i];
          if (i < numNodes - 1) oilPhysicsNodes[i + 1].y += rDeltas[i];
      }
  }

  // Enforce hard physical boundary for the drill 
  if (t4 < 1) {
      for (let i = 0; i < numNodes; i++) {
          let px = -cavernRadiusX + i * 10;
          if (Math.abs(px) <= 45) {
              let pt = Math.abs(px) / 45;
              let boundaryY = baseLiquidLevel + (1 - pt) * (drillTipY - baseLiquidLevel);
              if (oilPhysicsNodes[i].y < boundaryY) {
                  oilPhysicsNodes[i].y = boundaryY;
                  if (oilPhysicsNodes[i].vy < 0) oilPhysicsNodes[i].vy = 0;
              }
          }
      }
  }

  // Drill Interaction (Tier 0-3) Particles
  if (t4 < 1) {
      let numToSpawn = 0;
      for(let k=0; k<7; k++) {
          if (Math.random() < 0.3 * (1 - t4)) numToSpawn++; // Smoothly fade out drill particles
      }
      for(let i=0; i<numToSpawn; i++) {
          let px = (Math.random() - 0.5) * 50; 
          let isLeft = px < 0;
          
          let nodeIdx = Math.floor((px + cavernRadiusX) / 10);
          let py = baseLiquidLevel;
          if (nodeIdx >= 0 && nodeIdx < numNodes) {
              py = oilPhysicsNodes[nodeIdx].y;
          } else {
              py = drillTipY;
          }

          oilPhysicsParticles.push({
              x: px,
              y: py,
              vx: (isLeft ? -1 : 1) * (Math.random() * 6 + 2), 
              vy: -Math.random() * 16 - 6, 
              mass: Math.random() * 2 + 1,
              life: 1.0,
              isHot: false
          });
      }
  }

  // 3. Laser interaction (Crater & Flung Droplets)
  if (laserStrength > 0) {
      let blastRadius = 15; // Only affect immediate center nodes for vertical cliffs
      for (let i = 0; i < numNodes; i++) {
          let px = -cavernRadiusX + i * 10;
          let distFromCenter = Math.abs(px);
          
          // Global boiling/turbulence caused by the laser impact (affects entire pool, scaling down towards edges)
          let globalTurbulence = (1 - Math.min(1, distFromCenter / cavernRadiusX)) * laserStrength;
          
          // Random explosive boiling rather than uniform sine waves
          if (Math.random() < 0.15 * globalTurbulence) {
              oilPhysicsNodes[i].vy -= (Math.random() * 25 + 5); // Violent upward burst
          }
          if (Math.random() < 0.1 * globalTurbulence) {
              oilPhysicsNodes[i].vy += (Math.random() * 15 + 5); // Downward suction
          }
          
          if (distFromCenter <= blastRadius) {
              let forceFactor = 1.0; 
              
              let craterDepth = baseLiquidLevel + 100 * laserStrength * forceFactor;
              let maxDepth = 130 + 90 * Math.sqrt(1 - Math.pow(Math.abs(px) / cavernRadiusX, 2)); 
              if (craterDepth > maxDepth) craterDepth = maxDepth;
              
              if (oilPhysicsNodes[i].y < craterDepth) {
                  let spawnChance = 0.8 * forceFactor;
                  if (t8 > 0) spawnChance *= 3.0; // Spawn way more droplets in tier 8
                  
                  if (Math.random() < spawnChance) { 
                      let spawnPx = px + (Math.random()-0.5)*10;
                      let dir = spawnPx < 0 ? -1 : 1;
                      let pushVx = dir * (Math.random() * 40 + 15) * laserStrength;
                      let pushVy = -Math.random() * 50 * laserStrength - 20;
                      
                      if (t8 > 0) {
                          pushVx *= 2.5; // Fling violently away horizontally
                          pushVy *= 0.5; // More horizontal, less vertical
                      }
                      
                      oilPhysicsParticles.push({
                          x: spawnPx,
                          y: oilPhysicsNodes[i].y,
                          vx: pushVx,
                          vy: pushVy,
                          mass: Math.random() * 3 + 1,
                          life: 1.0,
                          isHot: Math.random() < t8
                      });
                  }
                  
                  oilPhysicsNodes[i].y = craterDepth;
                  if (oilPhysicsNodes[i].vy < 0) oilPhysicsNodes[i].vy = 0;
                  
                  oilPhysicsNodes[i].vy += forceFactor * 15.0 * laserStrength;
              } else {
                  oilPhysicsNodes[i].vy += forceFactor * 4.0 * laserStrength;
              }
              
              if (oilPhysicsNodes[i].y > maxDepth - 2) {
                  oilPhysicsNodes[i].y = maxDepth - 2;
                  if (oilPhysicsNodes[i].vy > 0) oilPhysicsNodes[i].vy = 0;
              }
          }
      }
      
      // Baseline continuous sparks for aesthetics
      let numToSpawn = Math.floor(laserStrength * 4 * (Math.random() + 0.5));
      for (let j = 0; j < numToSpawn; j++) {
          let spawnPx = (Math.random() - 0.5) * blastRadius * 1.5;
          let nodeIdx = Math.floor((spawnPx + cavernRadiusX) / 10);
          if (nodeIdx >= 0 && nodeIdx < numNodes - 1) {
              let tFrac = (spawnPx + cavernRadiusX) / 10 - nodeIdx;
              let surfaceY = oilPhysicsNodes[nodeIdx].y * (1 - tFrac) + oilPhysicsNodes[nodeIdx+1].y * tFrac;
              
              let dir = spawnPx < 0 ? -1 : 1;
              let pushVx = dir * (Math.random() * 30 + 10) * laserStrength;
              
              oilPhysicsParticles.push({
                  x: spawnPx,
                  y: surfaceY,
                  vx: pushVx,
                  vy: -Math.random() * 35 * laserStrength - 10,
                  mass: Math.random() * 2 + 1,
                  life: 1.0,
                  isHot: Math.random() < t8
              });
          }
      }
  }

  // Ambient bubbling - smoothed across multiple nodes to prevent sharp spikes
  if (Math.random() < 0.15 + tier * 0.05) {
      let bubNode = Math.floor(Math.random() * numNodes);
      let force = 12 + Math.random() * 6 * tier;
      
      // Spread the bubble force to avoid a jagged spike
      if (bubNode > 0) oilPhysicsNodes[bubNode - 1].vy -= force * 0.25;
      oilPhysicsNodes[bubNode].vy -= force * 0.5;
      if (bubNode < numNodes - 1) oilPhysicsNodes[bubNode + 1].vy -= force * 0.25;
      
      let px = -cavernRadiusX + bubNode * 10;
      oilPhysicsParticles.push({
          x: px,
          y: oilPhysicsNodes[bubNode].y,
          vx: (Math.random() - 0.5) * 5,
          vy: -Math.random() * 12 - 5,
          mass: Math.random() * 1.5 + 0.5,
          life: 1.0,
          isHot: false
      });
  }

  // 4. Update Particles
  for (let i = oilPhysicsParticles.length - 1; i >= 0; i--) {
      let p = oilPhysicsParticles[i];
      p.vy += 0.9; // Gravity
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.01;
      
      // Hit cavern walls with a visual buffer so they don't clip into the walls
      if (p.x < -cavernRadiusX + 15) { p.x = -cavernRadiusX + 15; p.vx *= -0.5; }
      if (p.x > cavernRadiusX - 15) { p.x = cavernRadiusX - 15; p.vx *= -0.5; }
      
      // Hit cavern roof (true ellipse boundary: cy = 130, rx = cavernRadiusX, ry = 90)
      let ellipseDistX = Math.abs(p.x) / cavernRadiusX;
      if (ellipseDistX > 1) ellipseDistX = 1; // Clamp to avoid NaN
      let ellipseY = 90 * Math.sqrt(1 - (ellipseDistX * ellipseDistX));
      
      // Add visual padding so the particle's size and motion-blur tail don't visually clip through the mask
      let roofY = cy - ellipseY + 15;
      
      if (p.y < roofY) {
          p.y = roofY;
          p.vy *= -0.5; // Bounce off the ceiling!
          p.vx *= 0.8; // Lose some horizontal speed on ceiling hit
      }
      
      let nodeIdx = Math.floor((p.x + cavernRadiusX) / 10);
      let hit = false;
      if (nodeIdx >= 0 && nodeIdx < numNodes - 1) {
          let tFrac = (p.x + cavernRadiusX) / 10 - nodeIdx;
          let surfaceY = oilPhysicsNodes[nodeIdx].y * (1 - tFrac) + oilPhysicsNodes[nodeIdx+1].y * tFrac;
          if (p.y > surfaceY && p.vy > 0) {
              hit = true;
              let force = p.vy * p.mass * 0.15;
              // Smooth the droplet impact across 4 nodes to prevent sharp spikes
              if (nodeIdx > 0) oilPhysicsNodes[nodeIdx - 1].vy += force * 0.15;
              oilPhysicsNodes[nodeIdx].vy += force * 0.35;
              oilPhysicsNodes[nodeIdx+1].vy += force * 0.35;
              if (nodeIdx < numNodes - 2) oilPhysicsNodes[nodeIdx + 2].vy += force * 0.15;
          }
      }
      
      if (hit || p.life <= 0 || p.y > cy + 110) {
          oilPhysicsParticles.splice(i, 1);
      }
  }

  // --- RENDERING ---
  const drawPhysicsWave = (layerIdx, r, g, b, alpha, yOffset) => {
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(-cavernRadiusX, cy + 110);
      
      let baseShift = (layerIdx - 1) * 5;
      
      let firstNode = oilPhysicsNodes[0];
      let firstPx = -cavernRadiusX;
      let firstShift = baseShift * Math.min(1, Math.abs(firstPx) / 100);
      ctx.lineTo(firstPx + firstShift, firstNode.y + yOffset);
      
      // Use quadratic curves to draw the fluid completely smoothly, eliminating jagged spikes
      for (let i = 0; i < numNodes - 1; i++) {
          let p0 = oilPhysicsNodes[i];
          let p1 = oilPhysicsNodes[i + 1];
          let nx0 = -cavernRadiusX + i * 10;
          let nx1 = -cavernRadiusX + (i + 1) * 10;
          
          // Taper the horizontal parallax near the center so the hole perfectly aligns with the drill
          let shift0 = baseShift * Math.min(1, Math.abs(nx0) / 100);
          let shift1 = baseShift * Math.min(1, Math.abs(nx1) / 100);
          
          let px0 = nx0 + shift0;
          let py0 = p0.y + yOffset;
          let px1 = nx1 + shift1;
          let py1 = p1.y + yOffset;
          
          // Visually squish the U-shape heavily towards the center
          if (laserStrength > 0) {
              const squish = (x) => {
                  let absX = Math.abs(x);
                  if (absX < 80) {
                      if (absX === 0) return 0;
                      // Use a power curve to heavily compress the center, smoothly blending out
                      let factor = Math.pow(absX / 80, 2.5);
                      let targetX = 3.5 + factor * 76.5; // 3.5px is just slightly inside the laser beam's visual radius
                      return x < 0 ? -targetX : targetX;
                  }
                  return x;
              };
              
              let blend = Math.min(1, laserStrength);
              px0 = px0 + (squish(px0) - px0) * blend;
              px1 = px1 + (squish(px1) - px1) * blend;
          }
          
          let cx = (px0 + px1) / 2;
          let cy_curve = (py0 + py1) / 2;
          
          // Bypass smoothing for the tight center to ensure it reaches the flat bottom and stays sharp
          if (laserStrength > 0 && (Math.abs(nx0) <= 20 || Math.abs(nx1) <= 20)) {
              ctx.lineTo(px0, py0);
          } else {
              ctx.quadraticCurveTo(px0, py0, cx, cy_curve);
          }
      }
      
      let lastNode = oilPhysicsNodes[numNodes - 1];
      let lastNx = -cavernRadiusX + (numNodes - 1) * 10;
      let lastShift = baseShift * Math.min(1, Math.abs(lastNx) / 100);
      ctx.lineTo(lastNx + lastShift, lastNode.y + yOffset);
      
      ctx.lineTo(cavernRadiusX, cy + 110);
      ctx.closePath();
      ctx.fill();
      
      // Draw subtle rising bubbles in the front layer
      if (layerIdx === 0) {
          ctx.save();
          ctx.clip(); // Clip perfectly to the physics fluid surface
          for (let i = 0; i < 40; i++) {
              // Base peaceful rising
              const bubbleT = (t * 0.2 + i * 0.37) % 1;
              let bubbleY = (cy + 110) - bubbleT * 160;
              
              // Chaotic turbulence added when laser is active
              const wobbleSpeed = 2 + laserStrength * 15;
              const wobbleAmount = 5 + laserStrength * 15;
              let bubbleX = -cavernRadiusX + ((i * 47) % (cavernRadiusX * 2)) + Math.sin(t * wobbleSpeed + i) * wobbleAmount;
              
              // Violent vertical shaking/churning
              bubbleY += Math.sin(t * (8 + (i % 5)) + i * 13) * (40 * laserStrength);
              
              const bubbleRadius = 1.5 + (i % 3);
              ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
              ctx.beginPath();
              ctx.arc(bubbleX, bubbleY, bubbleRadius, 0, Math.PI * 2);
              ctx.fill();
          }
          ctx.restore();
      }
  };

  // Draw layers of fluid (Refinery colors: 20,20,20)
  drawPhysicsWave(2, 12, 12, 12, 1.0, 15);
  drawPhysicsWave(1, 16, 16, 16, 1.0, 5);
  drawPhysicsWave(0, 20, 20, 20, 1.0, -5);

  // (Laser Impact Core Flash removed)
  
  ctx.restore(); // End fluid clip (pops SAVE 3)
  
  // Render Particles physically in front of the laser and derrick, but still inside the cavern
  ctx.save(); // Temporary save for the clip
  ctx.clip(cavernPath); // Don't let particles fly outside the 3D hole
  
  for (let i = 0; i < oilPhysicsParticles.length; i++) {
      let p = oilPhysicsParticles[i];
      let alpha = Math.max(0, p.life);
      
      let r = 20, g = 20, b = 20; // Default dark oil color (Refinery match)
      if (p.isHot) {
          // Hot glowing droplets blasted by the laser
          r = 255; 
          g = 100 + Math.random() * 100; // Flicker yellow/orange
          b = 50; 
          alpha *= t8;
      }
      
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      
      // Motion blur effect
      ctx.beginPath();
      let stretchX = p.vx * 0.8;
      let stretchY = p.vy * 0.8;
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - stretchX, p.y - stretchY);
      ctx.lineWidth = p.mass * 2;
      ctx.stroke();
      
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.mass * 1.5, 0, Math.PI * 2);
      ctx.fill();
  }
  ctx.restore(); // End particle clip

  // Cavern rough edges/texture drawn over the fluid and particles so it cleanly acts as a solid wall
  ctx.strokeStyle = "#38291f";
  ctx.lineWidth = 12;
  ctx.lineCap = "butt";
  
  if (t8 < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - t8;
      ctx.beginPath();
      ctx.rect(-w, -h, w * 3, h * 3); // Outer bounds
      ctx.rect(-radiusNarrow - 4, 0, radiusNarrow * 2 + 8, strokeBottomYNarrow); // Inner hole to protect
      ctx.clip("evenodd");
      
      let cavernWallPathNarrow = new Path2D();
      cavernWallPathNarrow.ellipse(0, cy, cavernRadiusX, 90, 0, -Math.PI/2 + gapAngleNarrow, Math.PI * 1.5 - gapAngleNarrow);
      ctx.stroke(cavernWallPathNarrow);
      ctx.restore();
  }
  
  if (t8 > 0) {
      ctx.save();
      ctx.globalAlpha = t8;
      ctx.beginPath();
      ctx.rect(-w, -h, w * 3, h * 3); // Outer bounds
      ctx.rect(-radiusWide - 4, 0, radiusWide * 2 + 8, strokeBottomYWide); // Inner hole to protect
      ctx.clip("evenodd");
      
      let cavernWallPathWide = new Path2D();
      cavernWallPathWide.ellipse(0, cy, cavernRadiusX, 90, 0, -Math.PI/2 + gapAngleWide, Math.PI * 1.5 - gapAngleWide);
      ctx.stroke(cavernWallPathWide);
      ctx.restore();
  }

  // Draw retaining walls AFTER cavern strokes so they are not overlapped by the dirt edge
  if (t8 < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - t8;
      ctx.fillStyle = fillDiamond;
      ctx.fillRect(-radiusNarrow - 4, 0, 4, strokeBottomYNarrow); 
      ctx.fillRect(radiusNarrow, 0, 4, strokeBottomYNarrow);
      ctx.restore();
  }
  
  if (t8 > 0) {
      ctx.save();
      ctx.globalAlpha = t8;
      ctx.fillStyle = fillDiamond;
      ctx.fillRect(-radiusWide - 4, 0, 4, strokeBottomYWide); 
      ctx.fillRect(radiusWide, 0, 4, strokeBottomYWide);
      ctx.restore();
  }

  ctx.restore(); // End cavern transform (pops SAVE 2)

// --- Tier 1: High-Pressure Mud Pumps ---
  if (t1 > 0) {
    ctx.save();
    ctx.globalAlpha = t1;
    
    // Noticeable dirt brown palette
    const brownDark = "#594940"; // Exact palette brown
    
    const drawMudPump = (xPos, facingRight) => {
        ctx.save();
        ctx.translate(xPos, 0);
        let dir = facingRight ? 1 : -1;
        ctx.scale(dir, 1); 
        
        // Base plate (skid)
        ctx.fillStyle = fillDiamond;
        ctx.fillRect(-41, -5, 56, 5); 
        
        // Power end (main housing)
        ctx.fillStyle = fillDiamond;
        ctx.beginPath();
        ctx.moveTo(-37, -5);
        ctx.lineTo(-37, -28); // High back
        ctx.lineTo(-25, -28); // Flat top
        ctx.lineTo(-5, -18);  // Sloped front
        ctx.lineTo(-5, -5);   // Down
        ctx.fill();
        
        // Housing side panel/door
        ctx.fillStyle = fillDiamond;
        ctx.fillRect(-33, -22, 10, 12);
        
        // Spinning external shaft/wheel for animation
        ctx.save();
        ctx.translate(-28, -16);
        ctx.rotate(t * 10); // Synced with pressure cycle
        ctx.fillStyle = brownDark; // Circle is brown
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = fillDiamond; // Rectangle is diamond
        ctx.fillRect(-5, -1, 10, 2);
        ctx.restore();
        
        // Fluid end (valves and block)
        ctx.fillStyle = fillDiamond;
        ctx.fillRect(-5, -18, 12, 13);
        
        // 3 horizontal valve covers (triplex) - extended slightly
        ctx.fillStyle = fillDiamond;
        for(let i=0; i<3; i++) {
            let vy = -16 + i * 4;
            ctx.fillRect(7, vy, 10, 3);
            ctx.fillStyle = fillDiamond; // bolt cap
            ctx.fillRect(17, vy + 0.5, 2, 2);
            ctx.fillStyle = fillDiamond;
        }
        
        // Pulsation dampener (sphere on top of fluid end)
        ctx.fillStyle = fillDiamond;
        ctx.fillRect(-3, -22, 6, 4); // Neck
        ctx.fillStyle = fillDiamond;
        ctx.beginPath();
        ctx.arc(0, -30, 9, 0, Math.PI*2); // Sphere exactly at local x=0
        ctx.fill();
        ctx.fillStyle = fillDiamond;
        ctx.fillRect(-3, -40, 6, 2); // Top cap
        
        // High-pressure pulsing animation (Dampener swells slightly)
        let pressure = (Math.sin(t * 10) + 1) / 2;
        // Inner mud is visible dirt brown
        ctx.fillStyle = `rgba(89, 73, 64, ${0.5 + pressure * 0.5})`; // #594940 is rgb(89, 73, 64)
        ctx.beginPath();
        ctx.arc(0, -30, 4 + pressure * 2.5, 0, Math.PI*2);
        ctx.fill();
        
        // Ground suction pipe
        ctx.fillStyle = fillDiamond;
        ctx.fillRect(-3, -5, 6, 5);
        
        ctx.restore();
    };
    
    // Positioned at +/- 55, facing inwards
    drawMudPump(-55, true);
    drawMudPump(55, false);
    
    ctx.restore();
  }

  // --- Tier 6: Scaffolding (Drawn before A-frame) ---
  if (t6 > 0) {
    ctx.save();
    ctx.globalAlpha = t6;
    let baseY = -175; 
    let drawScaffold = (xSign) => {
        let legX = xSign * 20.5; // X pos of leg at y = -175
        let pylonX = xSign * 75; // X pos of pylon core
        
        ctx.fillStyle = fillDiamond;
        
        ctx.beginPath();
        ctx.moveTo(legX, baseY - 5);
        ctx.lineTo(pylonX + xSign * 12, baseY - 5);
        ctx.lineTo(pylonX + xSign * 12, baseY + 5);
        ctx.lineTo(legX, baseY + 20);
        ctx.closePath();
        ctx.fill();
    };
    drawScaffold(-1);
    drawScaffold(1);
    ctx.restore();
  }

  // --- Tier 0: Diamond Derrick (A-Frame) ---
  if (t0 > 0) {
    ctx.save();
    ctx.translate(0, -1.5); // Lift the derrick by half the line width so it doesn't clip into the ground
    
    // Traditional Oil Derrick (A-Frame) made of Diamond
    ctx.fillStyle = fillDiamond;
    ctx.strokeStyle = fillDiamond; // Use diamond texture for the supports
    ctx.lineWidth = 3; // Slightly thicker so the pattern is visible on lines
    
    // Derrick legs
    ctx.beginPath();
    ctx.moveTo(-40, 0);
    ctx.lineTo(-20, -180);
    ctx.lineTo(20, -180);
    ctx.lineTo(40, 0);
    ctx.lineTo(30, 0);
    ctx.lineTo(12, -170);
    ctx.lineTo(-12, -170);
    ctx.lineTo(-30, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Cross bracing (X patterns)
    ctx.beginPath();
    for(let i=0; i<4; i++) {
        let yBottom = -i * 42.5;
        let yTop = -(i+1) * 42.5;
        let wBottom = 30 - i*5;
        let wTop = 30 - (i+1)*5;
        
        ctx.moveTo(-wBottom, yBottom);
        ctx.lineTo(wTop, yTop);
        ctx.moveTo(wBottom, yBottom);
        ctx.lineTo(-wTop, yTop);
    }
    ctx.stroke();

    // Top Platform / Crown Block
    ctx.fillRect(-25, -200, 50, 20);
    ctx.strokeRect(-25, -200, 50, 20);
    
    ctx.restore();
  }


  // --- NEW: Draw Main Drive In Front of Supports ---
  if (t0 > 0) {
      ctx.save();
      // Undo scaling just like we did for the drill shaft
      if (scale) ctx.scale(1/scale, 1/scale);
      
      let drillY = 0;
      let topDriveTop = -90;
      let topDriveBottom = -60;
      let spinOffsetX = Math.round(t * 80) % 64;
      let spinOffsetY = Math.round(t * 40) % 64;
      
      // Top Drive Mechanism (motor that spins the drill, origin of the laser)
      let topDriveH = Math.round(topDriveBottom - topDriveTop);
      let topDriveW = Math.round(30 * widthScale);
      let topDriveX = Math.round(-15 * widthScale);
      
      let tdGrad = ctx.createLinearGradient(topDriveX, 0, topDriveX + topDriveW, 0);
      tdGrad.addColorStop(0, "rgba(0,0,0,0.45)");
      tdGrad.addColorStop(0.15, "rgba(0,0,0,0)");
      tdGrad.addColorStop(0.85, "rgba(0,0,0,0)");
      tdGrad.addColorStop(1, "rgba(0,0,0,0.45)");

      ctx.save();
      ctx.beginPath();
      ctx.rect(topDriveX, topDriveTop + drillY, topDriveW, topDriveH);
      ctx.clip();
      
      // Draw moving texture to match the drill material
      ctx.translate(spinOffsetX, spinOffsetY);
      ctx.fillStyle = fillDiamond;
      ctx.fillRect(topDriveX - spinOffsetX - 100, topDriveTop + drillY - spinOffsetY - 64, topDriveW + 200, topDriveH + 200);
      
      // Mechanical bands
      ctx.fillStyle = fillDarkDiamond; 
      ctx.fillRect(topDriveX - spinOffsetX - 100, topDriveTop + 5 + drillY - spinOffsetY, topDriveW + 200, 5);
      ctx.fillRect(topDriveX - spinOffsetX - 100, topDriveBottom - 10 + drillY - spinOffsetY, topDriveW + 200, 5);
      ctx.translate(-spinOffsetX, -spinOffsetY);
      
      // Tier 4: Red glowing oscillation for the mechanical bands (2 second interval)
      let redAlpha = 0;
      if (t4 > 0) {
          let basePulse = (Math.sin(t * Math.PI) + 1) / 2;
          let glowPulse = basePulse + (t8 * 0.5 * (1 - basePulse)); 
          redAlpha = glowPulse * t4;
          
          if (redAlpha > 0) {
              ctx.save();
              
              ctx.globalCompositeOperation = "color";
              ctx.fillStyle = `rgba(255, 0, 0, ${redAlpha})`;
              ctx.fillRect(topDriveX - 100, topDriveTop + 5 + drillY, topDriveW + 200, 5);
              ctx.fillRect(topDriveX - 100, topDriveBottom - 10 + drillY, topDriveW + 200, 5);
              
              ctx.globalCompositeOperation = "lighter";
              ctx.fillStyle = `rgba(200, 0, 0, ${redAlpha})`;
              ctx.fillRect(topDriveX - 100, topDriveTop + 5 + drillY, topDriveW + 200, 5);
              ctx.fillRect(topDriveX - 100, topDriveBottom - 10 + drillY, topDriveW + 200, 5);
              
              ctx.restore();
          }
      }
      
      // Edge shading
      ctx.fillStyle = tdGrad; 
      ctx.fillRect(topDriveX, topDriveTop + drillY, topDriveW, topDriveH);
      ctx.restore(); // Popping the clip mask
      
      // Cables suspending the top drive from the crown block
      let cablePosScale = 1.0 + (widthScale - 1.0) * 0.5;
      ctx.strokeStyle = fillDiamond;
      ctx.lineWidth = 2 * widthScale; // Increase the width (thickness) of the cables gradually
      ctx.beginPath();
      ctx.moveTo(-10 * cablePosScale, -200 * (scale || 1));
      ctx.lineTo(-10 * cablePosScale, topDriveTop + drillY);
      ctx.moveTo(10 * cablePosScale, -200 * (scale || 1));
      ctx.lineTo(10 * cablePosScale, topDriveTop + drillY);
      ctx.stroke();

      // Tier 8 Wider Emitter
      if (t8 > 0) {
          ctx.save();
          ctx.globalAlpha = t8;
          let lensPulse = 0.5 + 0.5 * Math.sin(t * 25);
          
          // Wider Lens casing
          ctx.fillStyle = fillDarkDiamond;
          ctx.beginPath();
          ctx.moveTo(-15 * widthScale, topDriveBottom + drillY);
          ctx.lineTo(15 * widthScale, topDriveBottom + drillY);
          ctx.lineTo(11.25 * widthScale, topDriveBottom + drillY + 12);
          ctx.lineTo(-11.25 * widthScale, topDriveBottom + drillY + 12);
          ctx.closePath();
          ctx.fill();

          // Glowing emitter crystal
          ctx.fillStyle = `rgba(255, 50, 50, ${0.8 + 0.2 * lensPulse})`;
          ctx.beginPath();
          ctx.moveTo(-11.25 * widthScale, topDriveBottom + drillY + 12);
          ctx.lineTo(11.25 * widthScale, topDriveBottom + drillY + 12);
          ctx.lineTo(6 * widthScale, topDriveBottom + drillY + 18);
          ctx.lineTo(-6 * widthScale, topDriveBottom + drillY + 18);
          ctx.closePath();
          ctx.fill();
          
          // White hot core in the crystal
          ctx.fillStyle = `rgba(255, 255, 255, 0.95)`;
          ctx.beginPath();
          ctx.moveTo(-6.75 * widthScale, topDriveBottom + drillY + 12);
          ctx.lineTo(6.75 * widthScale, topDriveBottom + drillY + 12);
          ctx.lineTo(3 * widthScale, topDriveBottom + drillY + 16);
          ctx.lineTo(-3 * widthScale, topDriveBottom + drillY + 16);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
      }
      
      ctx.restore();
  }

  // --- Tier 3: Auxiliary Pumpjacks ---
  if (t3 > 0) {
    ctx.save();
    ctx.globalAlpha = t3;
    
    const drawPumpjack = (xPos) => {
        ctx.save();
        ctx.translate(xPos, 0);
        ctx.scale(2, 2);
        
        let dir = xPos > 0 ? -1 : 1; 
        
        // A-Frame support
        ctx.strokeStyle = fillDiamond;
        ctx.lineWidth = 4;
        ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(-14, -2);
        ctx.lineTo(0, -35);
        ctx.lineTo(14, -2);
        ctx.stroke();
        
        // Base (reduced size to prevent overlap)
        ctx.fillStyle = fillDiamond;
        ctx.fillRect(-20, -6, 40, 6);
        
        let cycle = t * 3;
        
        let crankRot = cycle;
        let cx = -dir * 16;
        let cy = -12;
        let crankRad = 8;
        let pinX = cx + Math.cos(crankRot) * crankRad;
        let pinY = cy + Math.sin(crankRot) * crankRad;
        
        // Inverse Kinematics for Pitman Arm
        let dx = pinX;
        let dy = pinY - (-35);
        let d = Math.sqrt(dx * dx + dy * dy);
        let L_beam = 18;
        let L_pitman = 28;
        
        let cosAlpha = (d * d + L_beam * L_beam - L_pitman * L_pitman) / (2 * d * L_beam);
        cosAlpha = Math.max(-1, Math.min(1, cosAlpha));
        let alpha = Math.acos(cosAlpha);
        
        let theta_pin = Math.atan2(dy, dx);
        let theta_back = theta_pin + dir * alpha;
        let beamAngle = theta_back - (dir === 1 ? Math.PI : 0);
        
        // Pitman arm (Connecting rod)
        let beamBackX = -dir * 18 * Math.cos(beamAngle);
        let beamBackY = -35 - dir * 18 * Math.sin(beamAngle);
        
        ctx.strokeStyle = fillDiamond;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pinX, pinY);
        ctx.lineTo(beamBackX, beamBackY);
        ctx.stroke();
        
        // Counter weight crank
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(crankRot);
        ctx.fillRect(-3, -2, crankRad + 3, 4); // Arm from center to pin
        ctx.beginPath();
        ctx.arc(crankRad/2, 0, 5, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
        
        // Walking beam (Nodding Donkey head)
        ctx.save();
        ctx.translate(0, -35);
        ctx.rotate(beamAngle);
        
        // Main beam
        ctx.fillRect(-20, -3, 40, 6);
        
        // Horsehead
        ctx.beginPath();
        let hx = dir * 20;
        ctx.moveTo(hx + dir * 1, -8);
        ctx.quadraticCurveTo(hx + dir * 7, -2, hx + dir * 1, 12);
        ctx.lineTo(hx - dir * 2, 10);
        ctx.lineTo(hx - dir * 3, -7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        
        ctx.restore();
    };
    
    drawPumpjack(-140);
    drawPumpjack(140);
    
    ctx.restore();
  }

  // --- Tier 4: Concentrated Laser Drill ---
  if (t4 > 0) {
    ctx.save();
    ctx.globalAlpha = t4 * (1 - t8); // Fade out during tier 8 transition
    
    // Laser originates from the top drive position (where the drill used to start)
    const laserStartY = -60 / scale; // Bottom of top drive mechanism
    const laserEndY = (cy + 88) / scale; // Cavern floor in scaled coords
    const beamHeight = laserEndY - laserStartY;
    
    // Outer glow (subtle red haze, pulsing)
    const glowPulse = 0.7 + 0.3 * Math.sin(t * 8);
    const glowWidth = 7.5 * glowPulse;
    ctx.fillStyle = `rgba(255, 30, 30, 0.15)`;
    ctx.fillRect(-glowWidth, laserStartY, glowWidth * 2, beamHeight);
    
    // Main beam (bright red core, pulsing)
    const corePulse = 0.85 + 0.15 * Math.sin(t * 15);
    const coreWidth = 3.75 * corePulse;
    ctx.fillStyle = `rgba(255, 80, 80, 0.7)`;
    ctx.fillRect(-coreWidth, laserStartY, coreWidth * 2, beamHeight);
    
    // White-hot center (thin, pulsing)
    const centerPulse = 0.8 + 0.2 * Math.sin(t * 22);
    const centerWidth = 1.5 * centerPulse;
    ctx.fillStyle = `rgba(255, 230, 230, 0.95)`;
    ctx.fillRect(-centerWidth, laserStartY, centerWidth * 2, beamHeight);
    
    // Spinning helical lines wrapping around the beam (3D rotating effect)
    const helixSpeed = t * 40;
    const helixAmp = 5.25;
    const helixFreq = 0.06;
    
    for (let hx = 0; hx < 2; hx++) {
        const phaseOffset = hx * Math.PI;
        
        for (let ly = 2; ly < beamHeight; ly += 2) {
            // Subtract helixSpeed so the wave travels downwards (increasing Y)
            const anglePrev = (ly - 2) * helixFreq - helixSpeed + phaseOffset;
            const angle = ly * helixFreq - helixSpeed + phaseOffset;
            
            const lxPrev = Math.sin(anglePrev) * helixAmp;
            const lx = Math.sin(angle) * helixAmp;
            
            // Calculate z-depth (-1 to 1) for 3D effect
            const lz = (Math.cos(anglePrev) + Math.cos(angle)) / 2;
            
            // Adjust opacity and thickness based on depth
            const alpha = 0.4 + 0.35 * lz;
            const thickness = 1.4 + 1.0 * lz;
            
            ctx.strokeStyle = `rgba(255, 160, 160, ${Math.max(0.05, alpha)})`;
            ctx.lineWidth = Math.max(0.2, thickness);
            
            ctx.beginPath();
            ctx.moveTo(lxPrev, laserStartY + ly - 2);
            ctx.lineTo(lx, laserStartY + ly);
            ctx.stroke();
        }
    }
    
    ctx.restore();
  }

  // --- Tier 5: Flare Stacks (Ground Mounted) ---
  if (t5 > 0) {
    ctx.save();
    ctx.globalAlpha = t5;
    
    const drawFlareStack = (xPos) => {
        ctx.save();
        ctx.translate(xPos, 0); // On the ground
        
        // Stack body
        ctx.fillStyle = fillDiamond;
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(-4, -140);
        ctx.lineTo(4, -140);
        ctx.lineTo(10, 0);
        ctx.fill();
        
        // Heat shield / rim at top
        ctx.fillStyle = fillDiamond;
        ctx.fillRect(-6, -140, 12, 4);
        ctx.fillRect(-8, -135, 16, 2);
        
        // Flame
        let flameScale = 1;
        let flicker = Math.sin(t * 15) * 0.2 + Math.sin(t * 23) * 0.1;
        
        ctx.translate(0, -140);
        ctx.scale(flameScale, flameScale);
        
        // Inner white-hot
        ctx.fillStyle = `rgba(255, 255, 200, 0.9)`;
        ctx.beginPath();
        ctx.moveTo(-2, 0);
        ctx.quadraticCurveTo(-3, -15 + flicker * 5, 0, -20 - flicker * 10);
        ctx.quadraticCurveTo(3, -15 - flicker * 5, 2, 0);
        ctx.fill();
        
        // Mid yellow/orange
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(255, 150, 0, 0.7)`;
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.quadraticCurveTo(-6, -20 + flicker * 8, 0, -35 - flicker * 15);
        ctx.quadraticCurveTo(6, -20 - flicker * 8, 4, 0);
        ctx.fill();
        
        // Outer red/dark orange
        ctx.fillStyle = `rgba(255, 50, 0, 0.5)`;
        ctx.beginPath();
        ctx.moveTo(-5, 0);
        ctx.quadraticCurveTo(-8, -25 + flicker * 10, 0, -45 - flicker * 20);
        ctx.quadraticCurveTo(8, -25 - flicker * 10, 5, 0);
        ctx.fill();
        
        ctx.restore();
    };
    
    drawFlareStack(-205);
    drawFlareStack(205);
    
    ctx.restore();
  }

  // --- Tier 6: Arc Amplification Pylons (Leg Mounted) ---
  if (t6 > 0) {
    ctx.save();
    ctx.globalAlpha = t6;
    
    const drawPylon = (xSign) => {
        ctx.save();
        
        let baseY = -175; 
        let legX = xSign * 20.5; // X pos of leg at y = -175
        let pylonX = xSign * 75; // X pos of pylon core (much wider)
        
        ctx.translate(pylonX, baseY);
        
        // --- Pylon Structure (Larger) ---
        let pScale = 1.6;
        ctx.scale(pScale, pScale);
        
        // Tesla coil rings (BACK half)
        ctx.strokeStyle = fillDarkDiamond;
        ctx.lineWidth = 1.5 / pScale;
        for (let i = 0; i < 4; i++) {
            let ry = -10 - i * 8;
            let rw = 6 - i * 1;
            ctx.beginPath();
            ctx.ellipse(0, ry, rw, 2, 0, Math.PI, Math.PI * 2);
            ctx.stroke();
        }
        
        // Pylon spire (points up)
        ctx.fillStyle = fillDiamond;
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.lineTo(-1, -31); // Extended up to connect directly to the orb
        ctx.lineTo(1, -31);
        ctx.lineTo(4, 0);
        ctx.fill();
        
        // Tesla coil rings (FRONT half)
        for (let i = 0; i < 4; i++) {
            let ry = -10 - i * 8;
            let rw = 6 - i * 1;
            ctx.beginPath();
            ctx.ellipse(0, ry, rw, 2, 0, 0, Math.PI);
            ctx.stroke();
        }
        
        // Solid Diamond Core (Restored)
        ctx.fillStyle = fillDiamond;
        ctx.beginPath();
        ctx.arc(0, -35, 4, 0, Math.PI * 2);
        ctx.fill();
        
        // Glowing core orb
        let coreGlow = 0.5 + 0.5 * Math.sin(t * 5); // Synced
        if (t8 > 0) {
            let t8Glow = 0.7 + 0.3 * Math.sin(t * 25);
            coreGlow = coreGlow * (1 - t8) + t8Glow * t8;
        }
        
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(100, 200, 255, ${0.4 + coreGlow * 0.6})`;
        ctx.beginPath();
        ctx.arc(0, -35, 6 + coreGlow * 2, 0, Math.PI * 2); // Smaller glow
        ctx.fill();
        
        ctx.restore(); // Restores scale and translate
    };
    
    drawPylon(-1);
    drawPylon(1);
    
    // Lightning Arc connecting the two pylons (Always visible, changes shape based on interval)
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = `rgba(150, 220, 255, ${0.6 + t8 * 0.4})`;
    ctx.lineWidth = 2 + t8 * 2;
    
    let pScale = 1.6;
    let pylonX = 75;
    let baseY = -175;
    let startY = baseY - (35 * pScale); // y = -231
    
    // Determine how often the shape updates. Time is already 5x faster in tier 8,
    // so a constant interval here results in a 5x faster real-world update rate (83.33ms -> 16.67ms)
    let stepInterval = 0.08333;
    let stepSeed = Math.floor(t / stepInterval);
    
    // Deterministic random function based on the time step
    const pRand = (seed, index) => {
        let x = Math.sin(seed * 1.2345 + index * 5.4321) * 10000;
        return x - Math.floor(x);
    };
    
    ctx.beginPath();
    ctx.moveTo(-pylonX, startY);
    
    let segments = 8 + Math.floor(pRand(stepSeed, 0) * 4);
    for (let i = 1; i < segments; i++) {
        let p = i / segments;
        let mx = -pylonX + (pylonX * 2) * p;
        let my = startY;
        // Add jagged randomness that persists for the duration of the step
        mx += (pRand(stepSeed, i) - 0.5) * 20;
        my += (pRand(stepSeed, i + 100) - 0.5) * 35; // Vertical jitter
        ctx.lineTo(mx, my);
    }
    ctx.lineTo(pylonX, startY);
    ctx.stroke();
    
    // Extra inner core for the arc
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 + t8 * 0.2})`;
    ctx.lineWidth = 1 + t8;
    ctx.stroke();
    
    ctx.restore();
    
    ctx.restore();
  }

  // --- Tier 7: Overcharge Capacitor Banks (Leg Mounted) ---
  if (t7 > 0) {
    ctx.save();
    ctx.globalAlpha = t7;
    
    const drawCapacitor = (xSign) => {
        ctx.save();
        // Positioned perfectly aligned with the Tier 3 Pumpjacks (x = 140)
        let capX = xSign * 140; 
        let capY = -210;
        ctx.translate(capX, capY);
        
        let width = 12;
        let height = 60;
        
        // --- Single heavy support beam connecting to A-frame ---
        // Drawn first so it tucks neatly behind the capacitor body
        ctx.strokeStyle = fillDiamond;
        ctx.lineWidth = 6;
        ctx.lineJoin = "round";
        
        // Start exactly at true midpoint (-150) between Tier 6 platform bottom (-155) and mud pipe upper edge (-145)
        let startX = -xSign * 116.5; // Local x for global x = 23.5
        let startY = 60; // Local y for global y = -150
        
        // Bend horizontally further out (global 125)
        let bendX = -xSign * 15; // Local x for global x = 125
        
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(bendX, startY); 
        // Offset target X by 2.5 to perfectly counteract the visual shift of the thick angled stroke!
        ctx.lineTo(xSign * 2.5, height/2); 
        ctx.stroke();
        
        // Background/Back housing
        ctx.fillStyle = fillDarkDiamond;
        ctx.fillRect(-width, -height/2, width * 2, height);
        
        // Inner glowing core/coil
        let coreY = -height/2;
        let coreH = height;
        
        // The core spins/pulses
        let pulse = (Math.sin(t * 5) + 1) / 2;
        let glow = 0.4 + 0.4 * pulse + (t8 * 0.2); // Brighter in Tier 8
        
        let grad = ctx.createLinearGradient(0, coreY, 0, coreY + coreH);
        grad.addColorStop(0, `rgba(0, 200, 255, ${glow})`);
        grad.addColorStop(0.5, `rgba(255, 255, 255, ${glow + 0.2})`);
        grad.addColorStop(1, `rgba(0, 150, 255, ${glow})`);
        
        ctx.fillStyle = grad;
        ctx.fillRect(-width + 3, coreY, width * 2 - 6, coreH);
        
        // Coil rings (moving downwards to simulate energy flow)
        ctx.fillStyle = `rgba(0, 0, 0, 0.5)`;
        let numCoils = 6;
        let coilSpacing = coreH / numCoils;
        let coilOffset = (t * 15) % coilSpacing; // Positive offset moves them DOWN
        
        ctx.save();
        ctx.beginPath();
        ctx.rect(-width + 3, coreY, width * 2 - 6, coreH);
        ctx.clip();
        for(let i = -1; i <= numCoils + 1; i++) {
            ctx.fillRect(-width + 3, coreY + i * coilSpacing + coilOffset, width * 2 - 6, 2.5);
        }
        ctx.restore();
        
        // Front cage / struts
        ctx.fillStyle = fillDiamond;
        ctx.fillRect(-width, -height/2, 3, height);
        ctx.fillRect(width - 3, -height/2, 3, height);
        
        // Top and bottom caps
        ctx.fillRect(-width - 2, -height/2 - 4, width * 2 + 4, 6);
        ctx.fillRect(-width - 2, height/2 - 2, width * 2 + 4, 6);
        
        ctx.restore();
    };
    
    drawCapacitor(-1);
    drawCapacitor(1);
    
    ctx.restore();
  }

  // --- Tier 8: Mega Laser Meltdown ---
  if (t8 > 0) {
    ctx.save();
    ctx.globalAlpha = t8;

    // The top drive is physically drawn wider, but its *visible* width is bounded by the A-frame legs
    // At this height, the inner space between the legs is exactly 47 pixels wide.
    const hazeWidth = 47; // Haze reaches the visible edges of the top drive
    const megaLaserWidth = 35; // Main beam is exactly 75% of the visible top drive width
    
    const megaStartY = -60 / scale;
    const megaEndY = (cy + 88) / scale;
    const megaBeamHeight = megaEndY - megaStartY;
    
    // Deep red outer glow/haze (reaches exactly to the edge of the top drive)
    const outerGrad = ctx.createLinearGradient(-hazeWidth / 2, 0, hazeWidth / 2, 0);
    outerGrad.addColorStop(0, `rgba(200, 0, 0, 0)`);
    outerGrad.addColorStop(0.2, `rgba(255, 0, 0, ${0.4 * t8})`);
    outerGrad.addColorStop(0.5, `rgba(255, 0, 0, ${0.8 * t8})`);
    outerGrad.addColorStop(0.8, `rgba(255, 0, 0, ${0.4 * t8})`);
    outerGrad.addColorStop(1, `rgba(200, 0, 0, 0)`);
    
    ctx.fillStyle = outerGrad;
    ctx.fillRect(-hazeWidth / 2, megaStartY, hazeWidth, megaBeamHeight);

    // Main intense beam (75% width)
    const megaGrad = ctx.createLinearGradient(-megaLaserWidth / 2, 0, megaLaserWidth / 2, 0);
    megaGrad.addColorStop(0, `rgba(255, 0, 0, 0)`);
    megaGrad.addColorStop(0.15, `rgba(255, 50, 50, ${0.9 * t8})`);
    megaGrad.addColorStop(0.3, `rgba(255, 200, 200, ${1.0 * t8})`);
    megaGrad.addColorStop(0.5, `rgba(255, 255, 255, ${1.0 * t8})`);
    megaGrad.addColorStop(0.7, `rgba(255, 200, 200, ${1.0 * t8})`);
    megaGrad.addColorStop(0.85, `rgba(255, 50, 50, ${0.9 * t8})`);
    megaGrad.addColorStop(1, `rgba(255, 0, 0, 0)`);
    
    ctx.fillStyle = megaGrad;
    ctx.fillRect(-megaLaserWidth / 2, megaStartY, megaLaserWidth, megaBeamHeight);

    // Extreme white-hot core (flickering intensity and width, but perfectly straight)
    const coreWidth = 14 + Math.random() * 6;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.9 + 0.1 * Math.random()})`;
    ctx.fillRect(-coreWidth / 2, megaStartY, coreWidth, megaBeamHeight);
    
    ctx.restore();
  }

  // Draw the front (bottom) half of the cavern rim OVER everything (lasers, derricks, particles)
  // This provides perfect 3D occlusion, making the laser pass "over" the back rim but "behind" the front rim.
  ctx.save();
  if (scale) ctx.scale(1/scale, 1/scale);
  ctx.beginPath();
  // cy is 130. We clip to only draw the bottom half of the screen
  ctx.rect(-w, 130, w * 2, h); 
  ctx.clip();
  
  ctx.strokeStyle = "#38291f";
  ctx.lineWidth = 12;
  ctx.stroke(cavernPath);
  ctx.restore();

  ctx.restore();
}

function drawGreenhouse(ctx, t, tier, prevTier, animProgress) {
  // Initialize emerald pattern
  if (!emeraldPattern) {
    if (activeCtx) initEmeraldPattern(activeCtx);
    else initEmeraldPattern(ctx);
  }
  const fillEmerald = emeraldPattern || '#5ed65e';

  // Tier progress helpers
  const getProg = (targetTier) => tier >= targetTier && prevTier < targetTier ? animProgress : (tier >= targetTier ? 1 : 0);
  const t0 = getProg(0), t1 = getProg(1), t2 = getProg(2), t3 = getProg(3);
  const t4 = getProg(4), t5 = getProg(5), t6 = getProg(6), t7 = getProg(7), t8 = getProg(8);

  // Core geometry constants (Pure ellipse dome!)
  const bw = 560;       // planter width
  const hw = bw / 2;    // planter half-width (280)
  const domeH = 265;    // vertical radius
  const domeCY = -3;    // center Y (so the dome springs perfectly from the floor)

  // Helper: dome envelope path
  const domePath = () => {
    ctx.beginPath();
    ctx.moveTo(-hw, -3); 
    if (ctx.ellipse) {
      ctx.ellipse(0, domeCY, hw, domeH, 0, Math.PI, 0);
    } else {
      ctx.save();
      ctx.translate(0, domeCY);
      ctx.scale(1, domeH / hw);
      ctx.arc(0, 0, hw, Math.PI, 0);
      ctx.restore();
    }
    ctx.closePath(); 
  };

  // Helper function to draw extremely detailed leaves with veins
  const drawDetailedLeaf = (lx, ly, rot, length, width, colorA, colorB, veinColor) => {
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(rot);
      
      // Leaf body left half
      ctx.fillStyle = colorA;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-width, -length/2, 0, -length);
      ctx.lineTo(0, 0);
      ctx.fill();
      
      // Leaf body right half
      ctx.fillStyle = colorB;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(width, -length/2, 0, -length);
      ctx.lineTo(0, 0);
      ctx.fill();

      // Clip veins so they don't stick out of the leaf
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-width, -length/2, 0, -length);
      ctx.quadraticCurveTo(width, -length/2, 0, 0);
      ctx.clip();

      // Main Center Stem/Vein
      ctx.strokeStyle = veinColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.lineTo(0, -length + 2);
      ctx.stroke();

      // Side branching veins
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let v=0.2; v<0.8; v+=0.15) {
          let vy = -length * v;
          ctx.moveTo(0, vy);
          ctx.quadraticCurveTo(-width*0.5, vy-2, -width*0.8, vy - length*0.1);
          ctx.moveTo(0, vy);
          ctx.quadraticCurveTo(width*0.5, vy-2, width*0.8, vy - length*0.1);
      }
      ctx.stroke();
      ctx.restore();
  };

  // Helper function to simulate falling and swirling whirlwind petals
  const drawWhirlwindPetals = (isFront) => {
      const numPetals = Math.floor(80 + t8 * 160);
      const blossomGrowth = t5 * 0.15 + t6 * 0.15 + t7 * 0.2; 
      const flowerCY = -92 - blossomGrowth * 91; 

      for(let s=0; s<numPetals; s++) {
          const bList = [1, 2, 11, 12];
          const bI = bList[s % 4];
          const offset = (bI < 7) ? 0.4 : 0.6;
          const xRatio = -0.9 + ((bI + offset) / 14) * 1.8;
          
          const branchX = xRatio * hw;
          const branchY = domeCY - domeH * Math.sqrt(1 - xRatio * xRatio);
          
          const dir = branchX < 0 ? 1 : -1;
          const scale = 0.6 + 0.4 * (1 - Math.abs(xRatio));
          
          // Match the exact geometry of the 13 discrete blossom clusters on the branch
          const simulatedI = Math.floor((s * 7.3) % 13);
          const isOutward = (simulatedI >= 8);
          let localBx, localBy;
          
          if (!isOutward) {
              // 8 clusters on the main branch for dense coverage all the way down
              const u = 0.2 + (simulatedI / 7) * 0.75; // u ranges 0.2 to 0.95
              localBx = 2 * (1 - u) * u * 50 + u * u * 120;
              localBy = 2 * (1 - u) * u * 20 + u * u * 60;
          } else {
              // 5 clusters on the outward branch
              const subI = simulatedI - 8;
              const u = 0.3 + (subI / 4) * 0.7; // u ranges 0.3 to 1.0 to avoid overlapping the fork
              localBx = (1 - u) * (1 - u) * 40 + 2 * (1 - u) * u * 70 + u * u * 110;
              localBy = (1 - u) * (1 - u) * 15 + 2 * (1 - u) * u * 0 + u * u * 20;
          }
          
          // Tiny scatter so they spawn naturally around the cluster
          const scatterX = ((s * 11.3) % 10) - 5;
          const scatterY = ((s * 17.7) % 10) - 5;
          
          const startX = branchX + (localBx + scatterX) * dir * scale;
          const startY = branchY + (localBy + scatterY) * scale + 5; // slightly under the flowers
          
          const totalLife = 220 + ((s * 11.7) % 60);
          const age = (t * 30 + s * 113.1) % totalLife;
          let progress = age / totalLife;
          
          // Make petals only start dropping once the tier 7 transition has begun
          if (t7 < 1.0) {
              progress *= t7;
          }
          
          const swirlY = flowerCY + ((s * 7.9) % 60) - 30; 
          // Tier 7 flower radius is ~67.5px. Set radius to clear it, expanding for Tier 8.
          const finalRadius = 75 + (t8 * 55) + ((s * 15.3) % 40); 
          const groundY = -35 - ((s * 4.1) % 15); // Drop just a few pixels above the dirt layer (which starts at -28)
          
          let sy;
          if (progress < 0.25) {
              // Fall to the ground
              const p = progress / 0.25;
              const ease = p * (2 - p); // ease-out
              sy = startY * (1 - ease) + groundY * ease;
          } else if (progress < 0.45) {
              // Get swept up into the whirlwind
              const p = (progress - 0.25) / 0.2;
              const ease = p * p * (3 - 2 * p); // smoothstep
              sy = groundY * (1 - ease) + swirlY * ease;
          } else {
              // Chilling in the whirlwind
              sy = swirlY;
          }
          
          // Delay the swirl so they only spin once they start getting swept up
          const swirlPhase = Math.min(1.0, Math.max(0.0, (progress - 0.25) / 0.3));
          const smoothSwirl = swirlPhase * swirlPhase * (3 - 2 * swirlPhase);
          
          const startRadius = Math.abs(startX);
          const radius = startRadius * (1 - smoothSwirl) + finalRadius * smoothSwirl;
          
          const startAngle = startX >= 0 ? 0 : Math.PI;
          const swirlDir = startX >= 0 ? 1 : -1;
          
          let swirlAngleAdded = 0;
          if (progress > 0.25) {
              const swirlAge = (progress - 0.25) * totalLife;
              const swirlSpeed = 0.06 + ((s * 2.3) % 0.04); // Consistent moderate rotation speed
              const rampTicks = 45; // Gradual speedup over 1.5 seconds
              
              if (swirlAge < rampTicks) {
                  // Accelerate linearly: integral of v(t) = t^2 / (2*rampTicks)
                  swirlAngleAdded = swirlSpeed * (swirlAge * swirlAge) / (2 * rampTicks);
              } else {
                  // Constant speed after ramp
                  const angleAtRampEnd = swirlSpeed * rampTicks / 2;
                  swirlAngleAdded = angleAtRampEnd + swirlSpeed * (swirlAge - rampTicks);
              }
          }
          
          const angle = startAngle + swirlAngleAdded * swirlDir;
          
          // Drift while falling, transitions out as swirl takes over
          const driftX = Math.sin(t * 1.5 + s) * 12 * (1 - smoothSwirl);
          const driftZ = Math.cos(t * 1.5 + s) * 0.5 * (1 - smoothSwirl);
          
          const sx = radius * Math.cos(angle) + driftX;
          const normDepth = Math.sin(angle) + driftZ; 
          
          const isCurrentFront = normDepth > 0;
          if (isCurrentFront === isFront) {
              const rot = t * 2 + s + sx * 0.05;
              const scale = 0.7 + normDepth * 0.3; 
              let alpha = 0.8;
              if (normDepth < -0.5) alpha = 0.5;
              
              // Fade in as it spawns on branch, fade out as it reaches the end of the whirlwind
              if (progress < 0.1) alpha *= (progress / 0.1);
              if (progress > 0.8) alpha *= (1 - progress) / 0.2;
              
              ctx.fillStyle = `rgba(255, 180, 220, ${alpha})`;
              ctx.beginPath();
              ctx.ellipse(sx, sy, 4 * scale, 2 * scale, rot, 0, Math.PI*2);
              ctx.fill();
          }
      }
  };

  // --- Tier 0-3: Evolving Sprout (Drawn before ground to hide base naturally) ---
  if (t0 > 0) {
    ctx.save();
    ctx.globalAlpha = t0 * (1 - t4);
    const swayAmount = Math.sin(t * 1.5);
    const swayAngle = swayAmount * 0.08; 
    const growth = t1 * 0.4 + t2 * 0.5 + t3 * 0.6 + t4 * 0.3; 
    const sproutScale = 1.0 + growth;
    const tipX = swayAmount * 2.0 * sproutScale;
    
    // Main center sprout
    ctx.save();
    // Translate slightly below ground level (-28) so the stem gets buried naturally
    ctx.translate(0, -20);     
    ctx.scale(sproutScale, sproutScale);
    
    // Organic Stem
    ctx.strokeStyle = '#3aad30';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(0, -15, tipX * 0.5, -25, tipX, -35);
    ctx.stroke();
    
    // Leaves attach exactly where they originally were (y=-23).
    let leafOffsetX = tipX * 0.6;
    drawDetailedLeaf(-1 + leafOffsetX, -23, -0.9 + swayAngle, 21, 9.5, '#55d048', '#3aad30', '#2d8a24'); // Left leaf (Bright outside, Dark inside)
    drawDetailedLeaf(1 + leafOffsetX, -23, 0.9 + swayAngle, 21, 9.5, '#3aad30', '#55d048', '#2d8a24'); // Right leaf (Dark inside, Bright outside)

    ctx.restore();
    ctx.restore();
  }

  // --- Tier 2: Lush Tropical Framing (Bush/Foliage) ---
  if (t2 > 0) {
    ctx.save();
    ctx.globalAlpha = t2;
    
    // Draw intricate clusters of ferns and monstera-like broad leaves framing the edges
    // Leaving the center clear for the main Tier 4/8 flower!
    const leafClusters = [
        // Left Side Group (Scaled down and pushed in slightly)
        {x: -220, y: -26, r: -0.8, l: 55, w: 23, ca: '#287522', cb: '#1c5e20', cv: '#134716', sway: 1.2, phase: 0},
        {x: -200, y: -26, r: -0.5, l: 72, w: 29, ca: '#2e8a2a', cb: '#21731f', cv: '#155217', sway: 1.0, phase: 1.1},
        {x: -160, y: -26, r: -0.3, l: 85, w: 34, ca: '#35a133', cb: '#278525', cv: '#1a611b', sway: 0.8, phase: 2.2},
        {x: -120, y: -26, r: -0.6, l: 63, w: 25, ca: '#2e8a2a', cb: '#21731f', cv: '#155217', sway: 1.3, phase: 0.5},
        {x: -80, y: -26, r: -0.4, l: 45, w: 20, ca: '#35a133', cb: '#278525', cv: '#1a611b', sway: 1.1, phase: 1.5},

        // Right Side Group (Perfectly mirrored coordinates)
        {x: 220, y: -26, r: 0.8, l: 55, w: 23, ca: '#287522', cb: '#1c5e20', cv: '#134716', sway: 1.2, phase: 0.5},
        {x: 200, y: -26, r: 0.4, l: 72, w: 29, ca: '#2e8a2a', cb: '#21731f', cv: '#155217', sway: 1.0, phase: 1.6},
        {x: 160, y: -26, r: 0.25, l: 85, w: 34, ca: '#35a133', cb: '#278525', cv: '#1a611b', sway: 0.8, phase: 2.7},
        {x: 120, y: -26, r: 0.5, l: 63, w: 25, ca: '#2e8a2a', cb: '#21731f', cv: '#155217', sway: 1.4, phase: 1.0},
        {x: 80, y: -26, r: 0.35, l: 45, w: 20, ca: '#35a133', cb: '#278525', cv: '#1a611b', sway: 1.2, phase: 2.0}
    ];

    for (let c of leafClusters) {
        let activeSway = Math.sin(t * c.sway + c.phase) * 0.1;
        drawDetailedLeaf(c.x, c.y, c.r + activeSway, c.l, c.w, c.ca, c.cb, c.cv);
        
        // Add sweeping fern fronds overlapping the leaves
        ctx.save();
        ctx.translate(c.x + (c.x > 0 ? -15 : 15), c.y);
        ctx.rotate(c.r * 1.5 + activeSway * 1.5);
        ctx.strokeStyle = c.cb;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo((c.x > 0 ? -20 : 20), -c.l*0.6, (c.x > 0 ? -30 : 30), -c.l*0.9);
        ctx.stroke();
        // Tiny fern leaflets along the stalk
        ctx.fillStyle = c.ca;
        ctx.beginPath();
        for(let f=0.1; f<0.9; f+=0.1) {
            let fx = (c.x > 0 ? -20 : 20) * f;
            let fy = -c.l * 0.9 * f;
            ctx.moveTo(fx - 4, fy - 2);
            ctx.ellipse(fx - 4, fy - 2, 6, 2, -0.4, 0, Math.PI*2);
            ctx.moveTo(fx + 4, fy - 2);
            ctx.ellipse(fx + 4, fy - 2, 6, 2, 0.4, 0, Math.PI*2);
        }
        ctx.fill();
        ctx.restore();
    }

    ctx.restore();
  }


  // =============================================
  // LAYER 1: FOUNDATION (planter box & dirt)
  // =============================================
  if (t0 > 0) {
    ctx.save();
    ctx.globalAlpha = t0;

    // Stylized flat dirt bed extending all the way down (now dark brown)
    ctx.fillStyle = '#3a2110';
    ctx.fillRect(-hw, -28, bw, 28);
    
    // Slight lighter top edge for simple stylized depth
    ctx.fillStyle = '#4a2e18';
    ctx.fillRect(-hw, -28, bw, 4);

    ctx.restore();
  }

  // =============================================
  // LAYER 2: DOME GLASS
  // =============================================
  if (t0 > 0) {
    ctx.save();
    ctx.globalAlpha = t0;
    
    // Base dome tint is now perfectly plain green
    ctx.fillStyle = 'rgba(40, 180, 60, 0.12)'; 
    domePath();
    ctx.fill();

    ctx.restore();
  }

  // =============================================
  // LAYER 3: INTERIOR ELEMENTS
  // =============================================
  ctx.save();
  
  // Clip out the dirt region so interior elements (like light beams) don't bleed into it
  ctx.beginPath();
  ctx.rect(-hw - 10, -9999, bw + 20, 9999 - 28);
  ctx.clip();

  domePath();
  ctx.clip(); 

  // --- Tier 3: Angled Grow Lights (Drawn behind flora for depth) ---
  if (t3 > 0) {
    ctx.save();
    ctx.globalAlpha = t3;

    // Cache the light beams to avoid creating 15 linear gradients per frame
    if (!cachedGrowLightNormal) {
        const createLightCache = (rTop, rBot) => {
            const canvas = document.createElement('canvas');
            canvas.width = 200; canvas.height = 300; 
            const bCtx = canvas.getContext('2d');
            
            const rayGrad = bCtx.createLinearGradient(100, 10, 100, 200);
            rayGrad.addColorStop(0, `rgba(${rTop}, 0.8)`);
            rayGrad.addColorStop(0.3, `rgba(${rBot}, 0.2)`);
            rayGrad.addColorStop(1, `rgba(${rBot}, 0)`);
            
            bCtx.fillStyle = rayGrad;
            bCtx.beginPath();
            bCtx.moveTo(100 - 8, 10);
            bCtx.lineTo(100 + 8, 10);
            bCtx.lineTo(100 + 45, 200);
            bCtx.lineTo(100 - 45, 200);
            bCtx.fill();
            return canvas;
        };
        cachedGrowLightNormal = createLightCache('255, 250, 200', '255, 220, 100');
        cachedGrowLightMagic = createLightCache('255, 200, 255', '180, 100, 255');
    }
    
    const numLights = 15;
    const activeCache = cachedGrowLightNormal;

    for (let i = 1; i < numLights - 1; i++) {
        const xRatio = -0.9 + (i / (numLights - 1)) * 1.8;
        const fixtureX = xRatio * hw;
        const fixtureY = domeCY - domeH * Math.sqrt(1 - xRatio * xRatio);

        const nx = -fixtureX / (hw * hw);
        const ny = -(fixtureY - domeCY) / (domeH * domeH);
        const angle = Math.atan2(ny, nx);
        
        ctx.save();
        ctx.translate(fixtureX, fixtureY);
        ctx.rotate(angle - Math.PI/2);
        
        // Fixture casing
        ctx.fillStyle = '#666';
        ctx.fillRect(-10, 0, 20, 6);
        ctx.fillStyle = '#fffae6';
        ctx.fillRect(-8, 6, 16, 4);
        
        // Beam
        const rayAlpha = 0.4 + Math.sin(t * 1.5 + i) * 0.1;
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = rayAlpha * t3; 
        // We draw the cached canvas which is 200x300. Center it at -100 on X.
        ctx.drawImage(activeCache, -100, 0);
        
        ctx.restore(); // Restores globalAlpha and CompositeOperation
    }
    ctx.restore();
  }

  // --- Tier 1: Seamless Emerald Irrigation & Splash Physics ---
  if (t1 > 0) {
    ctx.save();
    ctx.globalAlpha = t1;
    const pipeY = -140;
    const nozzleXs = [-200, -133, -66, 0, 66, 133, 200];

    // Draw Water Drops FIRST (behind the pipe)
    if (t1 > 0.05) {
      ctx.save();
      ctx.globalAlpha = t1 * Math.min(1, (t1 - 0.05) * 2);
      
      const fallDist = Math.abs(-30 - (pipeY + 4)); 
      const dropSpeed = 140; 
      const dropLifetime = fallDist / dropSpeed;

      // 1. Batch falling drops
      ctx.fillStyle = 'rgba(120, 200, 255, 0.8)';
      ctx.beginPath();
      for (let i = 0; i < nozzleXs.length; i++) {
        const nx = nozzleXs[i];
        for (let d = 0; d < 2; d++) {
          const phase = (i * 0.37 + d * 0.5); 
          const dropT = (t + phase) % (dropLifetime + 0.3); 
          if (dropT < dropLifetime) {
              const dropY = (pipeY + 4) + dropT * dropSpeed;
              ctx.moveTo(nx, dropY);
              ctx.ellipse(nx, dropY, 2.5, 5.5, 0, 0, Math.PI*2);
          }
        }
      }
      ctx.fill();

      // 2. Individual splashes
      for (let i = 0; i < nozzleXs.length; i++) {
        const nx = nozzleXs[i];
        for (let d = 0; d < 2; d++) {
          const phase = (i * 0.37 + d * 0.5); 
          const dropT = (t + phase) % (dropLifetime + 0.3); 
          if (dropT >= dropLifetime) {
              const splashT = (dropT - dropLifetime) / 0.3; 
              const splashAlpha = 1.0 - splashT;
              ctx.fillStyle = `rgba(120, 200, 255, ${0.8 * splashAlpha})`;
              const pDist = splashT * 8; 
              const pHeight = Math.sin(splashT * Math.PI) * 6; 
              ctx.beginPath();
              ctx.moveTo(nx - pDist, -30 - pHeight); ctx.arc(nx - pDist, -30 - pHeight, 1.5, 0, Math.PI*2);
              ctx.moveTo(nx + pDist, -30 - pHeight); ctx.arc(nx + pDist, -30 - pHeight, 1.5, 0, Math.PI*2);
              ctx.moveTo(nx, -30 - pHeight * 1.2); ctx.arc(nx, -30 - pHeight * 1.2, 1.5, 0, Math.PI*2);
              ctx.fill();
          }
        }
      }
      ctx.restore();
    }

    // Main Pipe using emerald pattern
    ctx.fillStyle = fillEmerald;
    ctx.fillRect(-240, pipeY - 4, 480, 8);
    
    // Pipe Shading & Highlight for 3D depth
    ctx.fillStyle = 'rgba(0, 50, 10, 0.4)';
    ctx.fillRect(-240, pipeY + 1, 480, 3);
    ctx.fillStyle = 'rgba(200, 255, 200, 0.4)';
    ctx.fillRect(-240, pipeY - 3, 480, 2);

    // End caps
    ctx.fillStyle = '#4cc940';
    ctx.beginPath(); ctx.arc(-240, pipeY, 4, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(240, pipeY, 4, 0, Math.PI*2); ctx.fill();

    for (let i = 0; i < nozzleXs.length; i++) {
      const nx = nozzleXs[i];
      
      // Seamless Nozzle drawn with bezier curves blending perfectly into pipe
      ctx.fillStyle = fillEmerald;
      ctx.beginPath();
      ctx.moveTo(nx - 12, pipeY + 4);
      ctx.quadraticCurveTo(nx - 4, pipeY + 4, nx - 4, pipeY + 10);
      ctx.lineTo(nx + 4, pipeY + 10);
      ctx.quadraticCurveTo(nx + 4, pipeY + 4, nx + 12, pipeY + 4);
      ctx.fill();
      
      // Nozzle Shading
      ctx.fillStyle = 'rgba(0, 50, 10, 0.4)';
      ctx.beginPath();
      ctx.moveTo(nx - 8, pipeY + 4);
      ctx.quadraticCurveTo(nx - 4, pipeY + 4, nx - 4, pipeY + 10);
      ctx.lineTo(nx + 4, pipeY + 10);
      ctx.quadraticCurveTo(nx + 4, pipeY + 4, nx + 8, pipeY + 4);
      ctx.fill();
    }
    ctx.restore();
  }

  // --- Tier 7: Falling Blossom Petals (Backside) ---
  if (t7 > 0) {
    ctx.save();
    ctx.globalAlpha = t7;
    domePath();
    ctx.clip(); // Ensure petals stay inside dome
    // Falling petals (Drifting from branches) - BACKSIDE
    drawWhirlwindPetals(false);
    ctx.restore();
  }

  // --- Tier 5: Hanging Vines & Ivy ---
  if (t5 > 0) {
    ctx.save();
    ctx.globalAlpha = t5;

    // Draw cascading vines from the ceiling
    const numVines = 16;
    
    // 1. Draw Vine Stems
    ctx.strokeStyle = '#2d6a24';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < numVines; i++) {
        const xRatio = -0.9 + (i / (numVines - 1)) * 1.8;
        const vx = xRatio * hw;
        const vyStart = domeCY - domeH * Math.sqrt(1 - xRatio * xRatio);
        
        const targetY = -45; // End perfectly above dirt layer
        const vineLength = Math.max(10, targetY - vyStart);
        const sway = Math.sin(t * 1.2 + i) * 15;
        
        ctx.moveTo(vx, vyStart);
        ctx.quadraticCurveTo(vx + sway * 0.2, vyStart + vineLength * 0.5, vx + sway, vyStart + vineLength);
    }
    ctx.stroke();
    
    // 2. Draw Light Leaves (Now same dark green color)
    ctx.fillStyle = '#2d8a24';
    ctx.beginPath();
    for (let i = 0; i < numVines; i++) {
        const xRatio = -0.9 + (i / (numVines - 1)) * 1.8;
        const vx = xRatio * hw;
        const vyStart = domeCY - domeH * Math.sqrt(1 - xRatio * xRatio);
        const targetY = -45;
        const vineLength = Math.max(10, targetY - vyStart);
        const sway = Math.sin(t * 1.2 + i) * 15;
        const swayVel = Math.cos(t * 1.2 + i) * 18;
        const numLeaves = Math.floor(vineLength / 12);
        
        for(let l = 0; l < numLeaves; l++) {
            const lT = l / numLeaves;
            const lx = vx + sway * (0.4 * lT + 0.6 * lT * lT);
            const ly = vyStart + vineLength * lT;
            const isLeft = (l % 2 === 0);
            
            // Calculate the exact geometric slope of the vine at this specific height (the "track")
            const stemAngle = -(sway / Math.max(10, vineLength)) * (0.4 + 1.2 * lT);
            
            // Exaggerate the angle to create the "rollercoaster" effect.
            // This ensures they physically bob up and down dramatically depending on their height,
            // while staying 100% perfectly synced with the vine's oscillation.
            const vineTilt = stemAngle * 2;
            
            const baseRot = isLeft ? 0.5 : -0.5;
            const actualRot = baseRot + vineTilt;
            const cx = isLeft ? -4 : 4;
            const cy = 0;
            
            const rCx = cx * Math.cos(actualRot) - cy * Math.sin(actualRot);
            const rCy = cx * Math.sin(actualRot) + cy * Math.cos(actualRot);
            
            ctx.moveTo(lx + rCx, ly + rCy);
            ctx.ellipse(lx + rCx, ly + rCy, 5, 2.5, actualRot + (isLeft ? -0.2 : 0.2), 0, Math.PI*2);
        }
    }
    ctx.fill();
    
    // 3. Draw Dark Leaves
    ctx.fillStyle = '#2d8a24';
    ctx.beginPath();
    for (let i = 0; i < numVines; i++) {
        const xRatio = -0.9 + (i / (numVines - 1)) * 1.8;
        const vx = xRatio * hw;
        const vyStart = domeCY - domeH * Math.sqrt(1 - xRatio * xRatio);
        const targetY = -45;
        const vineLength = Math.max(10, targetY - vyStart);
        const sway = Math.sin(t * 1.2 + i) * 15;
        const swayVel = Math.cos(t * 1.2 + i) * 18;
        const numLeaves = Math.floor(vineLength / 12);
        
        for(let l = 0; l < numLeaves; l++) {
            const lT = l / numLeaves;
            const lx = vx + sway * (0.4 * lT + 0.6 * lT * lT);
            const ly = vyStart + vineLength * lT;
            const isLeft = (l % 2 === 0);
            
            // Calculate the exact geometric slope of the vine at this specific height (the "track")
            const stemAngle = -(sway / Math.max(10, vineLength)) * (0.4 + 1.2 * lT);
            
            // Exaggerate the angle to create the "rollercoaster" effect.
            // This ensures they physically bob up and down dramatically depending on their height,
            // while staying 100% perfectly synced with the vine's oscillation.
            const vineTilt = stemAngle * 2.5;
            
            const baseRot = isLeft ? 0.5 : -0.5;
            const actualRot = baseRot + vineTilt;
            const cx = isLeft ? -4 : 4;
            const cy2 = 1;
            
            const rCx2 = cx * Math.cos(actualRot) - cy2 * Math.sin(actualRot);
            const rCy2 = cx * Math.sin(actualRot) + cy2 * Math.cos(actualRot);
            
            ctx.moveTo(lx + rCx2, ly + rCy2);
            ctx.ellipse(lx + rCx2, ly + rCy2, 4, 1.5, actualRot + (isLeft ? -0.2 : 0.2), 0, Math.PI*2);
        }
    }
    ctx.fill();

    ctx.restore();
  }

  // --- Tier 7: Falling Blossom Petals & Canopy ---
  if (t7 > 0) {
    ctx.save();
    ctx.globalAlpha = t7;

    domePath();
    ctx.clip(); // Ensure petals stay inside dome

    // Draw blossom canopy branches stretching inward from the top edges
    ctx.strokeStyle = '#3a2110';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    
    const drawBranch = (xBase, yBase, xDir, scale) => {
      ctx.save();
      ctx.translate(xBase, yBase);
      ctx.scale(xDir, scale);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(50, 20, 120, 60);
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(40, 15);
      ctx.quadraticCurveTo(70, 0, 110, 20); // Fixed unnatural U-shape sag to a natural upward arch
      ctx.stroke();
      
      // Blossoms on branch - using the exact Bezier curve of the branch so they don't float
      ctx.fillStyle = 'rgba(255, 180, 220, 0.9)';
      ctx.beginPath();
      for(let i=0; i<13; i++) {
        const isOutward = (i >= 8);
        let u, bx, by, rOuter;
        if (!isOutward) {
            u = 0.2 + (i / 7) * 0.75;
            bx = 2 * (1 - u) * u * 50 + u * u * 120;
            by = 2 * (1 - u) * u * 20 + u * u * 60;
        } else {
            const subI = i - 8;
            u = 0.3 + (subI / 4) * 0.7;
            bx = (1 - u) * (1 - u) * 40 + 2 * (1 - u) * u * 70 + u * u * 110;
            by = (1 - u) * (1 - u) * 15 + 2 * (1 - u) * u * 0 + u * u * 20;
        }
        const outerRadii = [6.375, 4.125, 5.25];
        rOuter = outerRadii[i % 3];
        ctx.moveTo(bx, by);
        ctx.arc(bx, by, rOuter, 0, Math.PI*2);
      }
      ctx.fill();
      
      ctx.fillStyle = 'rgba(255, 140, 190, 0.9)';
      ctx.beginPath();
      for(let i=0; i<13; i++) {
        const isOutward = (i >= 8);
        let u, bx, by, rInner;
        if (!isOutward) {
            u = 0.2 + (i / 7) * 0.75;
            bx = 2 * (1 - u) * u * 50 + u * u * 120;
            by = 2 * (1 - u) * u * 20 + u * u * 60;
        } else {
            const subI = i - 8;
            u = 0.3 + (subI / 4) * 0.7;
            bx = (1 - u) * (1 - u) * 40 + 2 * (1 - u) * u * 70 + u * u * 110;
            by = (1 - u) * (1 - u) * 15 + 2 * (1 - u) * u * 0 + u * u * 20;
        }
        const innerRadii = [3.75, 2.625, 3.375]; // Scaled down 25%
        rInner = innerRadii[i % 3];
        ctx.moveTo(bx-2, by+2);
        ctx.arc(bx-2, by+2, rInner, 0, Math.PI*2);
      }
      ctx.fill();
      ctx.restore();
    };

    const branchIndices = [1, 2, 11, 12];
    for (let i of branchIndices) {
        // Shift slightly towards the LOWER light to account for visual crowding 
        // from the branch's own curve (which sweeps towards the upper light)
        // and the geometric skew of the ellipse.
        const offset = (i < 7) ? 0.4 : 0.6; 
        const xRatio = -0.9 + ((i + offset) / 14) * 1.8;
        
        const bx = xRatio * hw;
        const by = domeCY - domeH * Math.sqrt(1 - xRatio * xRatio);
        
        const dir = bx < 0 ? 1 : -1;
        const scale = 0.6 + 0.4 * (1 - Math.abs(xRatio));
        drawBranch(bx, by, dir, scale);
    }



    
    ctx.restore();
  }

  // --- Tier 6: Glowing Fireflies Swarm ---
  if (t6 > 0) {
    ctx.save();
    ctx.globalAlpha = t6;

    const numFireflies = 80;
    for(let i=0; i<numFireflies; i++) {
        const seed1 = (i * 13.7) % 1;
        const seed2 = (i * 29.3) % 1;
        
        const freqX = 0.5 + seed1 * 0.5;
        const freqY = 0.8 + seed2 * 0.6;
        const fireT = t * (0.3 + seed1 * 0.2) + i * 11;
        
        // Safe natural bounds without clamping jolts
        const centerY = -140;
        const ampY = 80;
        let sy = centerY + Math.cos(fireT * freqY) * ampY + Math.cos(fireT * 4.2) * 10;

        // Dynamic X amplitude based on Y position (Dome shape constraint)
        const yOffset = Math.abs(sy - domeCY);
        // Ensure we don't pass negative values to sqrt if sy somehow exceeds domeH
        const maxDomeX = hw * Math.sqrt(Math.max(0, 1 - Math.pow(yOffset / domeH, 2)));
        
        // Keep 60 pixels away from the dome edge to avoid lights and glass
        const ampX = Math.max(0, maxDomeX - 60);
        let sx = Math.sin(fireT * freqX) * ampX + Math.sin(fireT * 3.5) * 15;
        
        const alphaPulse = (Math.sin(t * (1.5 + seed2) + i * 2.1) + 1) / 2;
        const isType1 = seed1 < 0.5;

        if (!cachedFireflyGlow1) {
            const createGlowCache = (rG, rB) => {
                const canvas = document.createElement('canvas');
                canvas.width = 16; canvas.height = 16;
                const bCtx = canvas.getContext('2d');
                const sporeGrad = bCtx.createRadialGradient(8, 8, 0, 8, 8, 8);
                sporeGrad.addColorStop(0, `rgba(${rG}, 0.8)`);
                sporeGrad.addColorStop(1, `rgba(${rG}, 0)`);
                bCtx.fillStyle = sporeGrad;
                bCtx.beginPath(); bCtx.arc(8, 8, 8, 0, Math.PI * 2); bCtx.fill();
                bCtx.fillStyle = `rgba(${rB}, 1.0)`;
                bCtx.beginPath(); bCtx.arc(8, 8, 1.5, 0, Math.PI * 2); bCtx.fill();
                return canvas;
            };
            cachedFireflyGlow1 = createGlowCache('200, 255, 100', '255, 255, 150');
            cachedFireflyGlow2 = createGlowCache('150, 255, 150', '200, 255, 200');
        }

        if (alphaPulse > 0.01) {
            ctx.save();
            ctx.globalAlpha = t6 * (0.2 + 0.8 * alphaPulse);
            ctx.drawImage(isType1 ? cachedFireflyGlow1 : cachedFireflyGlow2, sx - 8, sy - 8);
            ctx.restore();
        }
    }

    ctx.restore();
  }

  // --- Majestic Static Stem for Tier 4-8 ---
  if (t4 > 0) {
    ctx.save();
    ctx.globalAlpha = t4;
    // Base stem transitions from dark green to very dark purple (#110022)
    const r = Math.floor(58 * (1 - t8) + 17 * t8);
    const g = Math.floor(173 * (1 - t8) + 0 * t8);
    const b = Math.floor(48 * (1 - t8) + 34 * t8);
    let stemColor = `rgb(${r}, ${g}, ${b})`;
    
    // Mid stem transitions from mid green to purple (#b300b3)
    const mr = Math.floor(65 * (1 - t8) + 179 * t8);
    const mg = Math.floor(190 * (1 - t8) + 0 * t8);
    const mb = Math.floor(55 * (1 - t8) + 179 * t8);
    let midColor = `rgb(${mr}, ${mg}, ${mb})`;

    // Highlight stem transitions from light green to vibrant pink (#ff00ff)
    const hr = Math.floor(85 * (1 - t8) + 255 * t8);
    const hg = Math.floor(208 * (1 - t8) + 0 * t8);
    const hb = Math.floor(72 * (1 - t8) + 255 * t8);
    let highlightColor = `rgb(${hr}, ${hg}, ${hb})`;

    if (t8 >= 1) {
        stemColor = '#110022';
        midColor = '#b300b3';
        highlightColor = '#ff00ff';
    }

    const breathe = 1.05; // Max width permanently
    const blossomGrowth = t5 * 0.15 + t6 * 0.15 + t7 * 0.2; 
    const staticBlossomScale = 1.0 + blossomGrowth;
    // Base blossomScale from Tier 4
    let displayScale = staticBlossomScale;
    if (t8 > 0) {
        const coreBreathe = 1.08; // Max width permanently
        const apexScale = coreBreathe * 0.85; 
        displayScale = staticBlossomScale * (1 - t8) + apexScale * t8;
    } else {
        displayScale *= breathe;
    }

    const flowerCX = 0;
    const flowerCY = -92 - blossomGrowth * 91;

    // Stem body (base)
    const stemThickness = (12 + t8 * 8) * displayScale;
    ctx.strokeStyle = stemColor;
    ctx.lineWidth = stemThickness;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.bezierCurveTo(-15, -40, 15, flowerCY + 40, flowerCX, flowerCY + 5 * displayScale);
    ctx.stroke();
    
    // Stem mid
    ctx.strokeStyle = midColor;
    ctx.lineWidth = (8 + t8 * 4) * displayScale;
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.bezierCurveTo(-15, -40, 15, flowerCY + 40, flowerCX, flowerCY + 5 * displayScale);
    ctx.stroke();

    // Stem highlight
    ctx.strokeStyle = highlightColor;
    ctx.lineWidth = (4 + t8 * 2) * displayScale;
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.bezierCurveTo(-15, -40, 15, flowerCY + 40, flowerCX, flowerCY + 5 * displayScale);
    ctx.stroke();


    ctx.restore();
  }

  // --- Tier 4: Rooted Purple Blossom & Wildlife ---
  if (t4 > 0) {
    ctx.save();
    
    // Bees persist through Tier 8
    ctx.globalAlpha = t4;

    const breathe = 1 + Math.sin(t * 1.8) * 0.05;
    // Scale up based on T5, T6, T7 progress
    const blossomGrowth = t5 * 0.15 + t6 * 0.15 + t7 * 0.2; 
    const blossomScale = breathe * (1.0 + blossomGrowth);
    
    const flowerCX = 0;
    const flowerCY = -92 - blossomGrowth * 91; 
    
    // Add glowing bees/wildlife buzzing around the blossom
    ctx.save();
    for (let i = 0; i < 12; i++) {
        const beeT = t * (0.6 + (i%3)*0.1) + i * 7.3;
        
        // Safe natural bounds without clamping jolts
        const beeCenterY = -140;
        const beeAmpY = 80;
        let by = beeCenterY + Math.cos(beeT * 0.9) * beeAmpY + Math.cos(beeT * 5.1) * 15;
        
        // Dynamic X amplitude based on Y position (Dome shape constraint)
        const yOffset = Math.abs(by - domeCY);
        const maxDomeX = hw * Math.sqrt(Math.max(0, 1 - Math.pow(yOffset / domeH, 2)));
        
        // Keep 65 pixels away from the dome edge
        const sweepRadius = Math.max(0, maxDomeX - 65);
        let bx = Math.sin(beeT * 0.7) * sweepRadius; 
        // Add local buzzing X
        bx += Math.sin(beeT * 4.3) * 15;
        
        ctx.translate(bx, by);
        
        // Calculate precise next position to determine true facing direction
        const nextBeeT = beeT + 0.05;
        let nextBx = Math.sin(nextBeeT * 0.7) * sweepRadius; 
        nextBx += Math.sin(nextBeeT * 4.3) * 15;
        
        const isFacingRight = nextBx > bx;
        ctx.scale(isFacingRight ? 1 : -1, 1);

        // Bee body
        ctx.fillStyle = '#e6b800'; 
        ctx.beginPath(); ctx.ellipse(0, 0, 4, 3, 0.2, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#332200'; 
        ctx.beginPath(); ctx.ellipse(1, 0.5, 1.5, 3, 0.2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(-2, -0.5, 1.5, 2.5, 0.2, 0, Math.PI*2); ctx.fill();
        
        // Bee head
        ctx.fillStyle = '#1a1100';
        ctx.beginPath(); ctx.arc(4, -1, 2, 0, Math.PI*2); ctx.fill();
        
        // Tiny wings
        ctx.fillStyle = 'rgba(200, 230, 255, 0.7)';
        const wingFlap = Math.sin(t * 80 + i) * 0.8;
        ctx.save();
        ctx.translate(0, -2); ctx.rotate(wingFlap);
        ctx.beginPath(); ctx.ellipse(-1, -3, 2, 4, 0.4, 0, Math.PI*2); ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.translate(1, -2); ctx.rotate(-wingFlap);
        ctx.beginPath(); ctx.ellipse(1, -3, 1.5, 3.5, -0.4, 0, Math.PI*2); ctx.fill();
        ctx.restore();

        // Removed the glowing circle around the bee

        ctx.scale(isFacingRight ? 1 : -1, 1);
        ctx.translate(-bx, -by);
    }
    ctx.restore();

    // Cross-fade out the plant when T8 comes in
    ctx.globalAlpha = t4 * (1 - t8);

    // Bioluminescent glow behind the flower
    const glowInt = 0.35 + Math.sin(t * 1.8) * 0.15;
    const podGlow = ctx.createRadialGradient(flowerCX, flowerCY, 5, flowerCX, flowerCY, 100 * blossomScale);
    podGlow.addColorStop(0, `rgba(255, 100, 200, ${glowInt})`);
    podGlow.addColorStop(0.5, `rgba(180, 50, 180, ${glowInt * 0.4})`);
    podGlow.addColorStop(1, 'rgba(100, 0, 150, 0)');
    ctx.fillStyle = podGlow;
    ctx.beginPath(); ctx.arc(flowerCX, flowerCY, 100 * blossomScale, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.translate(flowerCX, flowerCY);
    ctx.scale(blossomScale, blossomScale);

    // Sepals (Green base leaves cupping the flower)
    ctx.fillStyle = '#3aad30'; // Matches Tier 0-3 stem color
    for (let i=0; i<4; i++) {
        ctx.save();
        ctx.rotate(i * Math.PI/2 + Math.PI/4);
        ctx.beginPath(); ctx.moveTo(0,0); ctx.quadraticCurveTo(20, 20, 0, 45); ctx.quadraticCurveTo(-20, 20, 0, 0); ctx.fill();
        ctx.restore();
    }

    // Helper to draw a full radial layer of beautiful petals
    const drawPetalLayer = (num, radius, width, colA, colB, offset, pulsePhase) => {
        for(let i=0; i<num; i++) {
            ctx.save();
            const angle = (i/num) * Math.PI * 2 + offset;
            const wobble = Math.sin(t * 1.2 + pulsePhase + i) * 0.1;
            ctx.rotate(angle + wobble);
            
            const pGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
            pGrad.addColorStop(0, colA);
            pGrad.addColorStop(1, colB);
            
            ctx.fillStyle = pGrad;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.bezierCurveTo(width, radius * 0.3, width * 0.5, radius * 0.8, 0, radius);
            ctx.bezierCurveTo(-width * 0.5, radius * 0.8, -width, radius * 0.3, 0, 0);
            ctx.fill();
            
            // Subtle glowing vein down the center of each petal
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(0,0); ctx.quadraticCurveTo(width*0.1, radius*0.5, 0, radius*0.9); ctx.stroke();
            
            ctx.restore();
        }
    };

    // Layer 1: Back dark petals
    drawPetalLayer(6, 45, 25, '#4b0082', '#1a0033', 0, 0);
    // Layer 2: Mid vibrant petals
    drawPetalLayer(8, 38, 20, '#d860d0', '#660099', Math.PI/8, 2);
    // Layer 3: Inner bright petals
    drawPetalLayer(5, 28, 15, '#ffb0f0', '#b300b3', Math.PI/5, 4);

    // Center Stigma / Energy Core
    const spotAlpha = 0.7 + Math.sin(t * 3.6) * 0.3;
    ctx.fillStyle = `rgba(255, 200, 255, ${spotAlpha})`;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(255, 255, 255, ${spotAlpha})`;
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();

    // Outward reaching Anthers
    ctx.strokeStyle = '#ff99ff';
    ctx.lineWidth = 1.5;
    for (let i=0; i<7; i++) {
        const a = (i/7) * Math.PI*2 + t;
        ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(a)*14, Math.sin(a)*14); ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(Math.cos(a)*14, Math.sin(a)*14, 2, 0, Math.PI*2); ctx.fill();
    }

    ctx.restore();
    ctx.restore();
  }



  // --- Tier 8: The Apex Flora ---
  if (t8 > 0) {
    ctx.save();
    ctx.globalAlpha = t8;

    const coreBreathe = 1 + Math.sin(t * 2.0) * 0.08;
    const apexScale = coreBreathe * 0.85; // 15% reduction in size
    
    const blossomGrowth = t5 * 0.15 + t6 * 0.15 + t7 * 0.2; 
    const flowerCX = 0;
    const flowerCY = -92 - blossomGrowth * 91; 

    // Massive Bioluminescent aura
    const auraR = (180 + Math.sin(t * 2.0) * 20) * apexScale;
    const auraA = 0.4 + Math.sin(t * 2.0) * 0.15;
    const auraGrad = ctx.createRadialGradient(flowerCX, flowerCY, 10, flowerCX, flowerCY, auraR);
    auraGrad.addColorStop(0, `rgba(255, 150, 255, ${auraA})`);
    auraGrad.addColorStop(0.3, `rgba(200, 50, 255, ${auraA * 0.6})`);
    auraGrad.addColorStop(0.7, `rgba(100, 0, 200, ${auraA * 0.2})`);
    auraGrad.addColorStop(1, 'rgba(50, 0, 100, 0)');
    ctx.fillStyle = auraGrad;
    ctx.beginPath(); ctx.arc(flowerCX, flowerCY, auraR, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.translate(flowerCX, flowerCY);
    ctx.scale(apexScale, apexScale);

    // Fractal / Geometric Petal Generation for the Apex Flora
    const drawApexPetals = (numPetals, radius, widthMult, colorCenter, colorEdge, zRot, pulseSpeed) => {
        for(let i=0; i<numPetals; i++) {
            ctx.save();
            const angle = (i/numPetals) * Math.PI * 2 + zRot;
            // Complex petal flutter animation
            const flutter = Math.sin(t * pulseSpeed + i * 1.5) * 0.15;
            ctx.rotate(angle + flutter);
            
            const pGrad = ctx.createLinearGradient(0, 0, 0, radius);
            pGrad.addColorStop(0, colorCenter);
            pGrad.addColorStop(1, colorEdge);
            
            ctx.fillStyle = pGrad;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            const w = radius * widthMult;
            // Pointed, elegant apex petals mimicking fractal growth
            ctx.bezierCurveTo(w, radius * 0.2, w * 0.8, radius * 0.7, 0, radius);
            ctx.bezierCurveTo(-w * 0.8, radius * 0.7, -w, radius * 0.2, 0, 0);
            ctx.fill();
            
            // Intricate neon veining inside petals
            ctx.strokeStyle = `rgba(255, 200, 255, ${0.4 + flutter})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0, radius*0.85); ctx.stroke();
            for(let v=0.2; v<0.8; v+=0.15) {
                ctx.beginPath(); ctx.moveTo(0, radius*v); ctx.quadraticCurveTo(w*0.4, radius*(v+0.1), w*0.3, radius*(v+0.2)); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0, radius*v); ctx.quadraticCurveTo(-w*0.4, radius*(v+0.1), -w*0.3, radius*(v+0.2)); ctx.stroke();
            }
            ctx.restore();
        }
    };

    // Layer 1: Massive dark purple background petals
    drawApexPetals(12, 100, 0.4, '#330066', '#110022', t * 0.2, 1.2);
    // Layer 2: Long slender magenta petals (rotating opposite)
    drawApexPetals(16, 120, 0.15, '#b300b3', '#4d004d', -t * 0.15, 1.5);
    // Layer 3: Vibrant core petals
    drawApexPetals(8, 70, 0.5, '#ff66ff', '#800080', t * 0.3, 2.0);
    // Layer 4: Inner glowing starburst
    drawApexPetals(6, 45, 0.6, '#ffffff', '#ff00ff', -t * 0.4, 2.5);

    // Blinding Pulsating Core
    const coreFlash = 0.7 + Math.sin(t * 4.0) * 0.3;
    const innerGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
    innerGrad.addColorStop(0, `rgba(255, 255, 255, ${coreFlash})`);
    innerGrad.addColorStop(0.3, `rgba(255, 150, 255, ${coreFlash * 0.8})`);
    innerGrad.addColorStop(1, 'rgba(200, 0, 255, 0)');
    ctx.fillStyle = innerGrad;
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
    
    ctx.restore();

    ctx.restore();
  }

  // --- Tier 7: Falling Blossom Petals (Frontside) ---
  if (t7 > 0) {
    ctx.save();
    ctx.globalAlpha = t7;

    domePath();
    ctx.clip(); // Ensure petals stay inside dome

    // Falling petals (Drifting from branches) - FRONTSIDE
    drawWhirlwindPetals(true);
    
    ctx.restore();
  }



  ctx.restore(); // end interior clip



  // =============================================
  // LAYER 4: DOME STRUCTURE (The Emerald U-Shape)
  // =============================================
  if (t0 > 0) {
    ctx.save();
    ctx.globalAlpha = t0;
    // Pure emerald structural framing for the dome perfectly bounding everything
    ctx.strokeStyle = fillEmerald;
    ctx.lineWidth = 6;
    domePath();
    ctx.stroke();
    ctx.restore();
  }



}


let cachedAshCanvas = null;
function getAshCanvas() {
    if (!cachedAshCanvas) {
        cachedAshCanvas = document.createElement('canvas');
        cachedAshCanvas.width = 16;
        cachedAshCanvas.height = 16;
        let pCtx = cachedAshCanvas.getContext('2d');
        let grad = pCtx.createRadialGradient(8, 8, 0, 8, 8, 8);
        grad.addColorStop(0, 'rgba(255, 150, 150, 1)'); // Intense hot core (pure red + white mix to look super bright, no orange)
        grad.addColorStop(0.2, 'rgba(255, 0, 0, 1)');    // Pure red
        grad.addColorStop(0.6, 'rgba(255, 0, 0, 0.4)');
        grad.addColorStop(1, 'rgba(255, 0, 0, 0)');
        pCtx.fillStyle = grad;
        pCtx.fillRect(0, 0, 16, 16);
    }
    return cachedAshCanvas;
}

function drawReactor(ctx, t, tier, prevTier, animProgress) {
  if (!rubyPattern) {
    if (activeCtx) initRubyPattern(activeCtx);
    else initRubyPattern(ctx);
  }
  const fillRuby = rubyPattern || '#ff2020';
  const getProg = (targetTier) => tier >= targetTier && prevTier < targetTier ? animProgress : (tier >= targetTier ? 1 : 0);

  const t0 = getProg(0), t1 = getProg(1), t2 = getProg(2), t3 = getProg(3);
  const t4 = getProg(4), t5 = getProg(5), t6 = getProg(6), t7 = getProg(7), t8 = getProg(8);

  const bw = 540;
  const hw = bw / 2;
  const baseY = 0;
  const coreY = -180;
  
  const drawAsh = (isRisingPass) => {
      if (t6 <= 0) return;
      
      const numAsh = 400; // Doubled
      const maxLifetime = 5.0; // seconds
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      const ashImg = getAshCanvas();
      
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      
      for (let i = 0; i < numAsh; i++) {
          const rand1 = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
          const rand2 = Math.abs(Math.cos(i * 78.233) * 43758.5453) % 1;
          const rand3 = Math.abs(Math.sin(i * 39.346) * 43758.5453) % 1;
          
          const offset = rand1 * maxLifetime;
          let age = (t + offset) % maxLifetime;
          let spawnTime = t - age;
          
          // Initial size based on spawn oscillation
          let spawnPulse = 0.5 + 0.5 * Math.sin(spawnTime * 3);
          
          let isLeft = (i % 2 === 0);
          let startX = isLeft ? -255 : 255;
          let startY = baseY - 290; // Spawn deep inside the tower (rim is -310 to -300)
          
          // Equal chance to go left or right (no outward bias)
          let vx = (rand2 - 0.5) * (150 + 450 * spawnPulse);
          
          let vy = -150 - (rand3 * 150) - (250 * spawnPulse);
          let gravity = 220; 
          
          let current_vy = vy + gravity * age;
          let isRising = current_vy < 0;
          
          // Filter by pass to handle z-indexing (rising is behind tower, falling is in front)
          if (isRisingPass !== isRising) continue;
          
          let finalX = startX + vx * (1 - Math.exp(-1.2 * age));
          finalX += Math.sin(age * 3 + i) * 25; 
          
          let finalY = startY + (vy * age) + (0.5 * gravity * age * age);
          
          if (finalY >= baseY) continue;
          
          let alpha = 1.0;
          if (age < 0.1) alpha = age / 0.1;
          else if (age > maxLifetime - 1.0) alpha = maxLifetime - age;
          
          // Real-time Glow Oscillation
          let brightness = 0.2 + (pulse * 0.8) + (t8 * 0.5);
          
          // Spawn size strictly based on spawn oscillation
          let baseSize = 3 + (rand1 * 2) + (spawnPulse * 6) + (t8 * 4);
          
          // Peak real-time oscillation doubles the current size of the particle
          let size = baseSize * (1.0 + 1.0 * pulse); 
          
          ctx.globalAlpha = t6 * alpha * Math.min(1, 0.4 + 0.6 * brightness);
          ctx.drawImage(ashImg, finalX - size, finalY - size, size * 2, size * 2);
      }
      ctx.restore();
  };

  const drawCoreSymbol = (overdriveAlpha, t8Alpha = 0) => {
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      const radColor = `rgba(255, 0, 0, ${0.5 + 0.5 * pulse + 0.2 * t8Alpha})`;

      // Dark window casing
      ctx.beginPath();
      ctx.arc(0, 0, 45, 0, Math.PI * 2);
      ctx.fillStyle = '#111'; 
      ctx.fill();

      // Overdrive Background Glow
      if (overdriveAlpha > 0 || t8Alpha > 0) {
          ctx.save();
          const maxAlpha = Math.max(overdriveAlpha, t8Alpha);
          ctx.globalAlpha = ctx.globalAlpha * maxAlpha;
          let glowRadius = 30 + 15 * pulse + 15 * t8Alpha; 
          ctx.beginPath();
          ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
          let bgGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, glowRadius);
          bgGrad.addColorStop(0, `rgba(255, 0, 0, ${Math.min(1, 0.9 * pulse + 0.5 * t8Alpha)})`);
          bgGrad.addColorStop(0.5, `rgba(200, 0, 0, ${Math.min(1, 0.5 * pulse + 0.3 * t8Alpha)})`);
          bgGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = bgGrad;
          ctx.fill();
          ctx.restore();
      }

      ctx.save();
      ctx.rotate(t * 0.5); 
      
      // Basic Symbol Blades
      ctx.fillStyle = radColor;
      let coreSpread = (Math.PI/6) + (0.1 * t8Alpha) + 0.05;
      for(let i=0; i<3; i++) {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.arc(0, 0, 32, -coreSpread, coreSpread);
          ctx.lineTo(0,0);
          ctx.fill();
          ctx.rotate((Math.PI * 2) / 3);
      }
      
      // Mask out inner ring
      let innerGapRadius = 12;
      ctx.beginPath();
      ctx.arc(0, 0, innerGapRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#111'; 
      ctx.fill();

      // Central Dot
      const maxAlpha = Math.max(overdriveAlpha, t8Alpha);

      if (maxAlpha < 1) {
          ctx.save();
          ctx.globalAlpha = ctx.globalAlpha * (1 - maxAlpha);
          ctx.beginPath();
          ctx.arc(0, 0, 7, 0, Math.PI * 2);
          ctx.fillStyle = radColor;
          ctx.fill();
          ctx.restore();
      }

      if (maxAlpha > 0) {
          ctx.save();
          ctx.globalAlpha = ctx.globalAlpha * maxAlpha;
          
          // Cap dot radius so it never bleeds into the blades (innerGapRadius is 12)
          let dotRadius = 6 + 3 * pulse; 
          
          ctx.beginPath();
          ctx.arc(0, 0, innerGapRadius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 0, 0, ${Math.min(1, 0.4 * pulse + 0.2 * t8Alpha)})`; 
          ctx.fill();

          ctx.beginPath();
          ctx.arc(0, 0, dotRadius, 0, Math.PI * 2);
          
          ctx.fillStyle = radColor;
          
          ctx.shadowBlur = 10 + 10 * pulse;
          ctx.shadowColor = 'red';
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.restore();
      }
      
      ctx.restore(); // Undo spin
  };

  const drawOverdriveBeams = (overdriveAlpha, t8Alpha = 0) => {
      if (overdriveAlpha <= 0 && t8Alpha <= 0) return;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      const innerGapRadius = 12;
      
      ctx.save();
      ctx.rotate(t * 0.5); 
      
      const maxAlpha = Math.max(overdriveAlpha, t8Alpha);
      ctx.globalAlpha = ctx.globalAlpha * maxAlpha;
      ctx.globalCompositeOperation = 'screen';
      let bladeRadius = 32 + 12 * pulse + 8 * t8Alpha; 
      let starterSpread = (Math.PI/6) + (0.1 * t8Alpha);
      let beamSpread = starterSpread + 0.05;
      
      for(let i=0; i<3; i++) {
          ctx.beginPath();
          ctx.arc(0, 0, bladeRadius, -starterSpread, starterSpread);
          ctx.lineTo(innerGapRadius * Math.cos(starterSpread), innerGapRadius * Math.sin(starterSpread));
          ctx.arc(0, 0, innerGapRadius, starterSpread, -starterSpread, true);
          ctx.closePath();
          
          ctx.fillStyle = `rgba(255, 0, 0, ${Math.min(1, 0.6 * pulse + 0.4 * t8Alpha)})`;
          ctx.fill();
          
          ctx.lineWidth = 1 + 3 * pulse + 2 * t8Alpha;
          ctx.strokeStyle = `rgba(255, 0, 0, ${Math.min(1, 0.9 * pulse + 0.5 * t8Alpha)})`;
          ctx.stroke();

          ctx.save();
          let beamLength = (180 + 140 * pulse) * (1 + t8Alpha);
          let beamGrad = ctx.createRadialGradient(0, 0, bladeRadius, 0, 0, beamLength);
          beamGrad.addColorStop(0, `rgba(255, 0, 0, ${Math.min(1, 0.9 * pulse + 0.5 * t8Alpha)})`);
          beamGrad.addColorStop(0.5, `rgba(200, 0, 0, ${Math.min(1, 0.5 * pulse + 0.3 * t8Alpha)})`);
          beamGrad.addColorStop(1, 'rgba(255, 0, 0, 0)');
          
          ctx.fillStyle = beamGrad;
          ctx.beginPath();
          ctx.arc(0, 0, bladeRadius - 1, -beamSpread, beamSpread);
          ctx.arc(0, 0, beamLength, beamSpread, -beamSpread, true);
          ctx.closePath();
          ctx.fill();

          // Removed the smaller inner beam of light per user request
          
          ctx.restore();
          ctx.rotate((Math.PI * 2) / 3);
      }
      ctx.restore(); // Undo spin
  };

  ctx.save();
  
  const symDraw = (drawFunc) => {
    ctx.save();
    drawFunc();
    ctx.restore();
    ctx.save();
    ctx.scale(-1, 1);
    drawFunc();
    ctx.restore();
  };

  // Tier 8 background glow removed
  // TIER 7 BACKGROUND MENACING SYMBOL
  if (t7 > 0) {
      ctx.save();
      ctx.globalAlpha = t7;
      
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      const scale = 12; // Back to 12x
      
      ctx.translate(0, baseY - 120); // Center on core

      // 3. Clip the symbol so it doesn't draw below the ground (y = 120)
      ctx.beginPath();
      ctx.rect(-3000, -3000, 6000, 3000 + 120);
      ctx.clip();

      // 1. Exact same rotation as center symbol
      ctx.rotate(t * 0.5); 
      ctx.scale(scale, scale);
      
      // Use normal alpha blending instead of 'screen' to keep the reds deep and saturated
      ctx.globalCompositeOperation = 'source-over';
      
      const bladeRadius = 32; // Kept constant, no extension ever
      const innerGapRadius = 12;
      let t7Spread = (Math.PI/6) + (0.1 * t8) + 0.05;

      for(let i=0; i<3; i++) {
          // Hollow hologram blade path
          ctx.beginPath();
          ctx.arc(0, 0, bladeRadius, -t7Spread, t7Spread);
          ctx.arc(0, 0, innerGapRadius, t7Spread, -t7Spread, true);
          ctx.closePath();
          
          // 1. Deeper, richer red holographic fill
          ctx.fillStyle = `rgba(180, 0, 0, ${Math.min(1, 0.15 + 0.35 * pulse + 0.2 * t8 * pulse)})`;
          ctx.fill();
          
          // 2. Simulated shadow/glow (Darker red)
          ctx.lineWidth = 2 + 1 * pulse;
          ctx.strokeStyle = `rgba(120, 0, 0, ${Math.min(1, 0.15 + 0.35 * pulse + 0.2 * t8 * pulse)})`;
          ctx.stroke();

          // 3. Sharp hologram outline (Pure red, no green/blue to prevent pinkness)
          ctx.lineWidth = 1 + 0.5 * pulse + 1 * t8;
          ctx.strokeStyle = `rgba(255, 0, 0, ${Math.min(1, 0.3 + 0.7 * pulse + 0.4 * t8 * pulse)})`;
          ctx.stroke();

          ctx.rotate((Math.PI * 2) / 3);
      }
      
      // Holographic Central Dot
      ctx.save();
      // Fade out for tier 8 transition
      ctx.globalAlpha = ctx.globalAlpha * (1 - t8);
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      
      ctx.fillStyle = `rgba(180, 0, 0, ${Math.min(1, 0.15 + 0.35 * pulse + 0.2 * t8 * pulse)})`;
      ctx.fill();
      
      ctx.lineWidth = 2 + 1 * pulse;
      ctx.strokeStyle = `rgba(120, 0, 0, ${Math.min(1, 0.15 + 0.35 * pulse + 0.2 * t8 * pulse)})`;
      ctx.stroke();

      ctx.lineWidth = 1 + 0.5 * pulse + 1 * t8;
      ctx.strokeStyle = `rgba(255, 0, 0, ${Math.min(1, 0.3 + 0.7 * pulse + 0.4 * t8 * pulse)})`;
      ctx.stroke();
      ctx.restore();

      ctx.restore();
  }

  // Draw Rising Ash (Behind Cooling Towers)
  drawAsh(true);

  // Shared Ring Drawing for Tier 1
  const ringPulse = 0.5 + 0.5 * Math.sin(t * 3);
  const t4RingBoost = t4 * ringPulse; 
  const ringGlow = `rgba(255, 0, 0, ${0.3 + 0.7 * ringPulse + 0.3 * t4RingBoost})`;
  const coreVal = Math.floor(80 + 40 * ringPulse + 15 * t4RingBoost);
  const ringCore = `rgb(255, ${coreVal}, ${coreVal})`;
  const baseGlowWidth = 6 + 3 * t4RingBoost;
  const baseCoreWidth = 2.5 + 1 * t4RingBoost;
  
  const drawRings = (isBack) => {
      ctx.save();
      const drawRing = (cx, yOffset, width, height) => {
          // 1. Draw Red Glow
          ctx.beginPath();
          if (isBack) {
              ctx.ellipse(cx, baseY - yOffset, width, height, 0, Math.PI, Math.PI * 2, false);
          } else {
              ctx.ellipse(cx, baseY - yOffset, width, height, 0, 0, Math.PI, false);
          }
          ctx.lineCap = 'butt';
          ctx.shadowBlur = isBack ? 5 : (20 + 8 * t4RingBoost);
          ctx.shadowColor = 'red';
          ctx.strokeStyle = ringGlow;
          ctx.lineWidth = baseGlowWidth;
          ctx.stroke();

          // 2. Draw White Core
          ctx.beginPath();
          if (isBack) {
              ctx.ellipse(cx, baseY - yOffset, width, height, 0, Math.PI, Math.PI * 2, false);
          } else {
              // Tiny overhang angle so the white core draws exactly over the red shadow bleed
              const oh = 3.5 / width; 
              ctx.ellipse(cx, baseY - yOffset, width, height, 0, -oh, Math.PI + oh, false);
          }
          ctx.lineCap = 'round';
          ctx.shadowBlur = 0;
          ctx.strokeStyle = ringCore;
          ctx.lineWidth = baseCoreWidth;
          ctx.stroke();
      };

      // Dome Bottom Rings (below symbol)
      drawRing(0, 53.5, 140, 18);
      drawRing(0, 83.5, 140, 18);
      
      // Dome Top Rings (above symbol) - moved down more
      drawRing(0, 190, 121.5, 16);
      drawRing(0, 220, 98, 14);

      // Cooling Tower Rings
      symDraw(() => {
          const drawTRings = () => {
              // Tower Bottom Rings
              drawRing(-220, 53.5, 50, 10);
              drawRing(-220, 83.5, 48, 9);
              
              // Tower Top Rings
              drawRing(-220, 225, 38.5, 8);
              drawRing(-220, 255, 38.5, 8);
          };

          if (t5 < 1) {
              ctx.save();
              ctx.globalAlpha = ctx.globalAlpha * (1 - t5);
              drawTRings();
              ctx.restore();
          }
          if (t5 > 0) {
              ctx.save();
              ctx.globalAlpha = ctx.globalAlpha * t5;
              ctx.translate(-40, 0);
              drawTRings();
              ctx.restore();
          }
      });
      ctx.restore();
  };

  // Draw backside of Tier 1 rings before Tier 0 structures
  if (t1 > 0) {
      ctx.save();
      ctx.globalAlpha = t1;
      drawRings(true);
      ctx.restore();
  }


  // TIER 0: BASE STRUCTURE (Containment Dome and Cooling Towers)
  if (t0 > 0) {
    ctx.save();
    ctx.globalAlpha = t0;

    // Steam Animation for Cooling Towers
    symDraw(() => {
        const drawSteam = () => {
            for(let i=0; i<3; i++) {
                let pTime = (t * 0.4 + i * 0.333) % 1; 
                let steamY = baseY - 280 - pTime * 140;
                let steamX = -215 + Math.sin(t * 2 + i * 3) * 8;
                let steamAlpha = (1 - pTime) * 0.5 * (1 - t6);
                let steamSize = 12 + pTime * 20;
                
                ctx.fillStyle = `rgba(180, 180, 180, ${steamAlpha})`;
                ctx.beginPath();
                ctx.arc(steamX, steamY, steamSize, 0, Math.PI * 2);
                ctx.fill();
            }
        };

        if (t5 < 1) {
            ctx.save();
            ctx.globalAlpha = ctx.globalAlpha * (1 - t5);
            drawSteam();
            ctx.restore();
        }
        if (t5 > 0) {
            ctx.save();
            ctx.globalAlpha = ctx.globalAlpha * t5;
            ctx.translate(-40, 0);
            drawSteam();
            ctx.restore();
        }
    });

    // Background Cooling Towers
    symDraw(() => {
        const drawTowers = () => {
            ctx.beginPath();
            ctx.moveTo(-170, baseY);
            ctx.bezierCurveTo(-170, baseY - 150, -190, baseY - 200, -180, baseY - 300);
            ctx.lineTo(-260, baseY - 300);
            ctx.bezierCurveTo(-250, baseY - 200, -270, baseY - 150, -270, baseY);
            ctx.closePath();
            
            ctx.fillStyle = fillRuby;
            ctx.fill();

            // Simple rim
            ctx.fillStyle = '#111';
            ctx.fillRect(-265, baseY - 310, 90, 10);
            
            // Minimalist vertical ribs perfectly centered to suggest the hyperboloid shape
            for(let j=1; j<3; j++) {
               ctx.beginPath();
               let bx = -170 - j * (100 / 3);
               let cp1x = -170 - j * (100 / 3);
               let cp2x = -190 - j * (60 / 3);
               let tx = -180 - j * (80 / 3);
               ctx.moveTo(bx, baseY);
               ctx.bezierCurveTo(cp1x, baseY-150, cp2x, baseY-200, tx, baseY-300);
               ctx.strokeStyle = 'rgba(0,0,0,0.3)';
               ctx.lineWidth = 3;
               ctx.stroke();
            }
        };

        if (t5 < 1) {
            ctx.save();
            ctx.globalAlpha = ctx.globalAlpha * (1 - t5);
            drawTowers();
            ctx.restore();
        }
        if (t5 > 0) {
            ctx.save();
            ctx.globalAlpha = ctx.globalAlpha * t5;
            ctx.translate(-40, 0);
            drawTowers();
            ctx.restore();
        }
    });

    // Central Containment Building (Dome shape)
    ctx.beginPath();
    ctx.moveTo(-140, baseY);
    ctx.lineTo(-140, baseY - 120);
    ctx.arc(0, baseY - 120, 140, Math.PI, 0);
    ctx.lineTo(140, baseY);
    ctx.closePath();
    
    ctx.fillStyle = fillRuby;
    ctx.fill();

    // Core Window and Radiation Symbol (Handles Tier 4 transition internally)
    ctx.save();
    ctx.translate(0, baseY - 120);
    drawCoreSymbol(t4, t8);
    ctx.restore();

    ctx.restore();
  }

  // TIER 1: Red Containment Rings (Front side)
  if (t1 > 0) {
    ctx.save();
    ctx.globalAlpha = t1;
    drawRings(false);
    ctx.restore();
  }

  // TIER 2: Auxiliary Core Sensors / Viewports
  if (t2 > 0) {
    ctx.save();
    ctx.globalAlpha = t2;
    
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    const radColor = `rgba(255, 0, 0, ${0.5 + 0.5 * pulse})`;

    symDraw(() => {
        // Structural band connecting sensors to main core
        ctx.fillStyle = '#111';
        ctx.fillRect(-125, baseY - 122, 80, 4);

        // Inner Sensor 1 Dark Backdrop (Allows oscillation to show)
        ctx.beginPath();
        ctx.arc(-80, baseY - 120, 16, 0, Math.PI * 2);
        ctx.fillStyle = '#111';
        ctx.fill();

        // Inner Sensor 1 Glowing Core
        ctx.beginPath();
        ctx.arc(-80, baseY - 120, 16, 0, Math.PI * 2);
        ctx.fillStyle = radColor;
        ctx.fill();
        if (t4 > 0 && pulse > 0.01) {
            ctx.beginPath();
            ctx.arc(-80, baseY - 120, 16 + 25 * pulse * t4, 0, Math.PI * 2);
            let sensorGrad1 = ctx.createRadialGradient(-80, baseY - 120, 16, -80, baseY - 120, 16 + 25 * pulse * t4);
            sensorGrad1.addColorStop(0, `rgba(255, 0, 0, ${0.7 * pulse * t4})`);
            sensorGrad1.addColorStop(1, 'rgba(255, 0, 0, 0)');
            ctx.fillStyle = sensorGrad1;
            ctx.fill();
        }

        // Inner Sensor 1 Ring & Crosshair
        ctx.beginPath();
        ctx.arc(-80, baseY - 120, 16, 0, Math.PI * 2);
        ctx.moveTo(-96, baseY - 120);
        ctx.lineTo(-64, baseY - 120);
        ctx.moveTo(-80, baseY - 136);
        ctx.lineTo(-80, baseY - 104);
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#111';
        ctx.stroke();

        // Outer Sensor 2 Dark Backdrop (Allows oscillation to show)
        ctx.beginPath();
        ctx.arc(-115, baseY - 120, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#111';
        ctx.fill();

        // Outer Sensor 2 Glowing Core
        ctx.beginPath();
        ctx.arc(-115, baseY - 120, 10, 0, Math.PI * 2);
        ctx.fillStyle = radColor;
        ctx.fill();
        if (t4 > 0 && pulse > 0.01) {
            ctx.beginPath();
            ctx.arc(-115, baseY - 120, 10 + 20 * pulse * t4, 0, Math.PI * 2);
            let sensorGrad2 = ctx.createRadialGradient(-115, baseY - 120, 10, -115, baseY - 120, 10 + 20 * pulse * t4);
            sensorGrad2.addColorStop(0, `rgba(255, 0, 0, ${0.7 * pulse * t4})`);
            sensorGrad2.addColorStop(1, 'rgba(255, 0, 0, 0)');
            ctx.fillStyle = sensorGrad2;
            ctx.fill();
        }
        
        // Outer Sensor 2 Ring & Crosshair
        ctx.beginPath();
        ctx.arc(-115, baseY - 120, 10, 0, Math.PI * 2);
        ctx.moveTo(-125, baseY - 120);
        ctx.lineTo(-105, baseY - 120);
        ctx.moveTo(-115, baseY - 130);
        ctx.lineTo(-115, baseY - 110);
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#111';
        ctx.stroke();
    });
    
    ctx.restore();
  }

  // TIER 3: Radial Heat Sinks / Thermal Vents
  if (t3 > 0) {
    ctx.save();
    ctx.globalAlpha = t3;
    
    ctx.translate(0, baseY - 120);
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    
    // Apply clipping mask matching the dome boundary
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-140, 120);
    ctx.lineTo(-140, 0);
    ctx.arc(0, 0, 140, Math.PI, 0);
    ctx.lineTo(140, 120);
    ctx.closePath();
    ctx.clip();
    
    // 18 radiating mechanical fins bleeding heat (adjusted angle to avoid rings)
    for(let i = 0; i < 18; i++) {
        // Skip horizontal fins (left and right) to not cover Tier 2 sensors
        if (i === 0 || i === 9) continue;

        ctx.save();
        let angle = i * Math.PI / 9;
        ctx.rotate(angle);
        
        // Calculate distance R to the edge of the dome for the gradient
        let R = 140; // Default for top half (y <= 0 in local coords)
        if (Math.sin(angle) > 0.0001) { // Bottom half (y > 0)
            let distY = 120 / Math.sin(angle);
            let distX = Infinity;
            if (Math.cos(angle) > 0.0001) distX = 140 / Math.cos(angle);
            else if (Math.cos(angle) < -0.0001) distX = 140 / -Math.cos(angle);
            R = Math.min(distX, distY);
        }
        
        // Fin path touching the core (45) and overshooting the edge slightly
        // The clip mask will perfectly trim the tips to match the building contour
        let overR = R + 25;
        let overH = 5 - ((overR - 45) / (R - 45)) * 2; // Taper calculation
        
        ctx.beginPath();
        ctx.moveTo(45, -5);
        ctx.lineTo(overR, -overH);
        ctx.lineTo(overR, overH);
        ctx.lineTo(45, 5);
        ctx.closePath();
        
        // Pure gradient from pulsing red to black
        const heatGrad = ctx.createLinearGradient(45, 0, R, 0);
        let redComponent = Math.floor(155 + 100 * pulse);
        heatGrad.addColorStop(0, `rgb(${redComponent}, 0, 0)`);
        
        let t4VentBoost = t4 * pulse;
        if (t4VentBoost > 0) {
            // Keep the bright red intensity extending strongly outward
            heatGrad.addColorStop(0.8 * t4VentBoost, `rgb(${redComponent}, 0, 0)`);
        }
        
        // Let the tip reach a solid, bright red
        let endColorVal = Math.floor(220 * t4VentBoost);
        heatGrad.addColorStop(1, `rgb(${endColorVal}, 0, 0)`);
        
        ctx.fillStyle = heatGrad;
        ctx.fill();
        
        // Vent slats
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let d = 55; d < R - 5; d += 12) {
            let h = 5 - ((d - 45) / (R - 45)) * 2;
            ctx.moveTo(d, -h + 0.3); 
            ctx.lineTo(d, h - 0.3);
        }
        ctx.stroke();
        
        ctx.restore();
    }
    
    ctx.restore(); // end clipping mask

    ctx.restore();
  }

  // TIER 5: Massive Steam Generator Towers (Foreground)
  // Drawn after everything except Tier 4 so it's in front of the dome
  if (t5 > 0) {
      ctx.save();
      ctx.globalAlpha = t5;
      
      symDraw(() => {
          // Centered between Dome and offset Cooling Tower (-210)
          let tX = -175;
          let tW = 50; // Wider
          let tH = 260; // Height 260
          let tY = baseY; 

          // Base structure (Dark armor)
          ctx.fillStyle = '#0a0a0a';
          ctx.beginPath();
          // Slightly curved top
          ctx.moveTo(tX - tW/2, tY);
          ctx.lineTo(tX - tW/2, tY - tH + 20);
          ctx.quadraticCurveTo(tX, tY - tH, tX + tW/2, tY - tH + 20);
          ctx.lineTo(tX + tW/2, tY);
          ctx.closePath();
          ctx.fill();

          // Armor trim
          ctx.strokeStyle = fillRuby;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Red-hot vertical vents
          let ventW = 24; 
          let ventX = tX - ventW/2;
          let ventTop = tY - tH + 30; // Original vent top position
          let ventH = tH - 40;        // Original vent height
          
          ctx.fillStyle = '#000'; // Original pure black background
          ctx.fillRect(ventX, ventTop, ventW, ventH);

          ctx.save();
          ctx.beginPath();
          ctx.rect(ventX, ventTop, ventW, ventH);
          ctx.clip();
          
          // Uniform smooth oscillation exactly matching the other tiers
          let pulse = 0.5 + 0.5 * Math.sin(t * 3);
          
          // Background glow (simulating shadow blur without triggering canvas scaling jitter bugs)
          if (pulse > 0.05) {
              let glowGrad = ctx.createLinearGradient(ventX, 0, ventX + ventW, 0);
              let alpha = Math.min(1, (0.4 + 0.6 * t8) * pulse);
              glowGrad.addColorStop(0, `rgba(255, 0, 0, 0)`);
              glowGrad.addColorStop(0.3, `rgba(255, 0, 0, ${alpha})`);
              glowGrad.addColorStop(0.7, `rgba(255, 0, 0, ${alpha})`);
              glowGrad.addColorStop(1, `rgba(255, 0, 0, 0)`);
              ctx.fillStyle = glowGrad;
              ctx.fillRect(ventX, ventTop, ventW, ventH);
          }
          
          // Smoothly transition from dark crimson to pure bright red
          let r = Math.floor(100 + 155 * pulse);
          let g = 0; // Removed the green mix so it stays strictly red instead of orange
          let b = 0;
          ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
          
          // Draw horizontal coils going all the way to the top
          // Starting EXACTLY at ventTop so there's no black gap above the first coil
          for (let y = ventTop; y < tY; y += 8) {
              ctx.fillRect(ventX, y, ventW, 5);
          }
          ctx.restore(); // end clip
      });
      ctx.restore();
  }

  // TIER 4 (Ocular Core Overdrive) is now drawn internally by drawCoreSymbol in Tier 0


  // TIER 6: Radioactive Crimson Fallout (Optimized Eruption)
  if (t6 > 0) {
    ctx.save();
    ctx.globalAlpha = t6;
    
    const cx = 0;
    const cy = baseY - 120; // Center of the core
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);

    // 1. Ambient Toxic Radiation Haze (Fast screen overlay)
    let hazeRadius = 400 + 200 * pulse;
    let hazeGrad = ctx.createRadialGradient(cx, cy, 50, cx, cy, hazeRadius);
    hazeGrad.addColorStop(0, `rgba(255, 0, 0, ${0.15 * pulse})`);
    hazeGrad.addColorStop(0.5, `rgba(200, 0, 0, ${0.05 * pulse})`);
    hazeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    
    ctx.fillStyle = hazeGrad;
    ctx.globalCompositeOperation = 'screen';
    ctx.beginPath();
    ctx.arc(cx, cy, hazeRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = 'source-over';
    
    // 2. Cooling Tower Symbols (1 visual tier behind main dome)
    // Left Tower
    ctx.save();
    ctx.translate(-40, 0); 
    ctx.translate(-220, baseY - 148); 
    ctx.scale(0.65, 0.65); 
    drawCoreSymbol(t8); 
    ctx.restore();

    // Right Tower (No horizontal flip, so it spins clockwise normally)
    ctx.save();
    ctx.translate(40, 0); 
    ctx.translate(220, baseY - 148); 
    ctx.scale(0.65, 0.65); 
    drawCoreSymbol(t8); 
    ctx.restore();

    // 3. Radioactive Erupting Fallout (Falling particles drawn in front)
    drawAsh(false);

    ctx.restore();
  }



  // Tier 8 logic is now handled internally by drawCoreSymbol.

  // Draw Overdrive Beams on top of absolutely everything else
  if (t4 > 0 || t8 > 0) {
      // Main core beams
      ctx.save();
      ctx.translate(0, baseY - 120);
      drawOverdriveBeams(t4, t8);
      ctx.restore();
  }

  if (t6 > 0 && t8 > 0) {
      // Cooling tower beams
      ctx.save();
      ctx.globalAlpha = t6; // Fade in with tier 6
      ctx.translate(-40, 0); 
      ctx.translate(-220, baseY - 148); 
      ctx.scale(0.65, 0.65); 
      drawOverdriveBeams(t8); 
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = t6;
      ctx.translate(40, 0); 
      ctx.translate(220, baseY - 148); 
      ctx.scale(0.65, 0.65); 
      drawOverdriveBeams(t8); 
      ctx.restore();
  }

  ctx.restore();
}




function drawCentrifuge(ctx, t, tier, prevTier, animProgress) {
  if (!sapphirePattern) {
    if (activeCtx) initSapphirePattern(activeCtx);
    else initSapphirePattern(ctx);
  }
  const fillSapphire = sapphirePattern || '#1122cc';
  
  const getProg = (targetTier) => tier >= targetTier && prevTier < targetTier ? animProgress : (tier >= targetTier ? 1 : 0);
  
  const t0 = getProg(0), t1 = getProg(1), t2 = getProg(2), t3 = getProg(3);
  const t4 = getProg(4), t5 = getProg(5), t6 = getProg(6), t7 = getProg(7), t8 = getProg(8);

  ctx.save();
  // Lift everything up a bit
  
  
  // Base styling for metallic parts
  const metalGradients = {
    dark: ctx.createLinearGradient(-100, 0, 100, 0),
    light: ctx.createLinearGradient(-100, 0, 100, 0),
    accent: ctx.createLinearGradient(-100, 0, 100, 0),
  };
  
  metalGradients.dark.addColorStop(0, '#111');
  metalGradients.dark.addColorStop(0.5, '#333');
  metalGradients.dark.addColorStop(1, '#111');
  
  metalGradients.light.addColorStop(0, '#555');
  metalGradients.light.addColorStop(0.5, '#aaa');
  metalGradients.light.addColorStop(1, '#555');
  
  metalGradients.accent.addColorStop(0, '#001a4d');
  metalGradients.accent.addColorStop(0.5, '#004080');
  metalGradients.accent.addColorStop(1, '#001a4d');


  const drawSpinningCore = (x, y, scale, timeMult) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    
    const coreRadius = 80;
    
    // Outer static casing
    ctx.beginPath();
    ctx.arc(0, 0, coreRadius + 15, 0, Math.PI * 2);
    ctx.fillStyle = '#051020';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = fillSapphire;
    ctx.stroke();
    
    if (t8 < 1) {
        ctx.save();
        ctx.globalAlpha = 1 - t8;
        
        // Complex rotating layers
        ctx.save();
        ctx.rotate(t * timeMult);
        
        // Outer gear teeth
        ctx.fillStyle = fillSapphire;
        ctx.strokeStyle = 'transparent';
        ctx.lineWidth = 2;
        for (let i = 0; i < 12; i++) {
            ctx.save();
            ctx.rotate(Math.PI * 2 * (i / 12));
            ctx.beginPath();
            ctx.moveTo(-10, coreRadius);
            ctx.lineTo(10, coreRadius);
            ctx.lineTo(6, coreRadius + 12);
            ctx.lineTo(-6, coreRadius + 12);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
        
        // Inner structural ring
        ctx.beginPath();
        ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
        ctx.lineWidth = 6;
        ctx.strokeStyle = fillSapphire;
        ctx.stroke();
        // Energy track ring
        ctx.beginPath();
        ctx.arc(0, 0, coreRadius - 10, 0, Math.PI * 2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'transparent';
        ctx.stroke();

        // Advanced 4-spoke turbine
        for (let i = 0; i < 4; i++) {
            ctx.save();
            ctx.rotate(Math.PI / 2 * i);
            
            // Blade
            ctx.beginPath();
            ctx.moveTo(-15, 20);
            ctx.lineTo(15, 20);
            ctx.lineTo(4, coreRadius - 15);
            ctx.lineTo(-4, coreRadius - 15);
            ctx.closePath();
            ctx.fillStyle = fillSapphire;
            ctx.fill();
            ctx.stroke();
            
            ctx.restore();
        }
        
        ctx.restore(); // Close the forward rotation group

        // Inner counter-rotating core
        ctx.save();
        ctx.rotate(-t * timeMult);
        
        // Symmetrical geometric housing and inner elements
        ctx.beginPath();
        ctx.moveTo(-10, -10);
        ctx.lineTo(10, -10);
        ctx.lineTo(10, 10);
        ctx.lineTo(-10, 10);
        ctx.closePath();
        ctx.fillStyle = fillSapphire;
        ctx.fill();
        ctx.strokeStyle = 'transparent';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
        ctx.restore(); // Close t8 alpha group
    }

    // --- Tier 8: Micro-Galaxy ---
    if (t8 > 0) {
        ctx.save();
        ctx.globalAlpha = t8;
        
        ctx.beginPath();
        ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
        ctx.clip();
        
        // Deep space void
        ctx.fillStyle = '#01020a';
        ctx.fill();
        
        const galaxyTime = t * timeMult * 3;
        
        // Cosmic Dust Nebula (Deep Violets and Blues)
        ctx.save();
        ctx.rotate(-galaxyTime * 0.1);
        const nebula1 = ctx.createRadialGradient(20, -20, 0, 20, -20, coreRadius);
        nebula1.addColorStop(0, 'rgba(40, 20, 100, 0.5)'); // deep violet
        nebula1.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = nebula1;
        ctx.fill();
        
        const nebula2 = ctx.createRadialGradient(-30, 30, 0, -30, 30, coreRadius);
        nebula2.addColorStop(0, 'rgba(10, 30, 120, 0.5)'); // deep navy
        nebula2.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = nebula2;
        ctx.fill();
        ctx.restore();
        

        
        // Stars spiraling inwards
        ctx.fillStyle = '#88aaff'; // Soft ice blue (no cyan)
        ctx.beginPath();
        for (let s = 0; s < 100; s++) {
            let sDist = ((s * 11) - galaxyTime * 40) % coreRadius;
            if (sDist < 0) sDist += coreRadius;
            const sAngle = (s * 13) + (galaxyTime * (1.5 + 20 / (sDist + 10)));
            const px = Math.cos(sAngle) * sDist;
            const py = Math.sin(sAngle) * sDist;
            
            const sSize = (s % 3 === 0) ? 3 : 1.6;
            ctx.rect(px - sSize/2, py - sSize/2, sSize, sSize);
        }
        ctx.fill();

        ctx.fillStyle = '#4477ff'; // Deeper blue
        ctx.beginPath();
        for (let s = 100; s < 200; s++) {
            let sDist = ((s * 17) - galaxyTime * 60) % coreRadius;
            if (sDist < 0) sDist += coreRadius;
            const sAngle = (s * 19) + (galaxyTime * (2.0 + 15 / (sDist + 10)));
            const px = Math.cos(sAngle) * sDist;
            const py = Math.sin(sAngle) * sDist;
            
            const sSize = (s % 4 === 0) ? 3 : 1.6;
            ctx.rect(px - sSize/2, py - sSize/2, sSize, sSize);
        }
        ctx.fill();
        
        // Continuous Supernova
        const novaGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
        novaGrad.addColorStop(0, '#fff');
        novaGrad.addColorStop(0.2, 'rgba(120, 160, 255, 0.95)');
        novaGrad.addColorStop(0.5, 'rgba(20, 50, 200, 0.5)');
        novaGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = novaGrad;
        ctx.beginPath();
        ctx.arc(0, 0, 40, 0, Math.PI * 2);
        ctx.fill();
        
        // Outer Core Shield Rim
        ctx.strokeStyle = '#3366ff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, coreRadius - 1, 0, Math.PI * 2);
        ctx.stroke();

        ctx.restore();
    }

    ctx.restore();
  };
  
  // Standalone function to draw the Tier 4 Ferrofluid Aura ON TOP of other elements
  const drawTier4Aura = (x, y, scale, timeMult) => {
      if (t4 <= 0) return;
      
      const coreRadius = 80;
      
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      
      ctx.rotate(t * timeMult); 
      
      ctx.globalAlpha = t4 * 0.75; // Semi-transparent so blades show through
      ctx.globalCompositeOperation = 'screen';
      
      // Main volatile ferrofluid blob with energy concentrated at the center
      ctx.beginPath();
      const numPoints = 360;
      for (let i = 0; i <= numPoints; i++) {
          const angle = (i / numPoints) * Math.PI * 2;
          
          let r = 15; 
          
          // Distance to the closest blade tip angle (0, 90, 180, 270)
          const distToTip = Math.abs((angle + Math.PI/4) % (Math.PI/2) - Math.PI/4);
          
          // The physical 8px tip is 0.061 radians wide. Keep the math 100% stable out to 0.065 rads.
          let stabilityFade = (distToTip - 0.065) / 0.05;
          stabilityFade = Math.max(0, Math.min(1, Math.pow(stabilityFade, 2)));
          
          // A high exponent (6) ensures the star is sleek and stays safely inside the blade walls.
          const spikeBase = Math.max(0, Math.cos(angle * 4));
          const spike = Math.pow(spikeBase, 6) * 60; 
          
          // Violent high-frequency ripples
          const ripple = Math.sin(angle * 20 - t * 25) * 4 + Math.cos(angle * 35 + t * 40) * 3;
          const pulse = Math.sin(t * 10 + angle * 3) * 6;
          
          r += spike + (ripple + pulse) * stabilityFade;
          
          // STRICT GEOMETRIC CLAMP
          const slope = -4.0909; 
          const yIntercept = 81.3636; 
          const bladeLimit = (yIntercept - 0.5) / (Math.cos(distToTip) - slope * Math.sin(distToTip));
          
          r = Math.min(r, coreRadius - 15 - 0.5, bladeLimit);
          
          const px = Math.cos(angle) * r;
          const py = Math.sin(angle) * r;
          
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
      }
      ctx.closePath();
      
      const fluidGrad = ctx.createRadialGradient(0, 0, 5, 0, 0, coreRadius - 15);
      fluidGrad.addColorStop(0, '#aaddff'); 
      fluidGrad.addColorStop(0.3, '#2244ff'); 
      fluidGrad.addColorStop(0.7, 'rgba(10, 26, 136, 0.8)'); 
      fluidGrad.addColorStop(1, 'rgba(2, 4, 18, 0)'); 
      
      ctx.fillStyle = fluidGrad;
      ctx.strokeStyle = '#4466ff'; 
      ctx.lineWidth = 1.0;
      
      ctx.fill();
      ctx.stroke();
      
      // Detached droplets swirling violently
      ctx.fillStyle = '#1122cc';
      ctx.beginPath();
      for (let d = 0; d < 80; d++) {
          const dAngle = t * (3 + (d % 4)) + (d * 0.1);
          const baseDR = 30 + (d % 30);
          const dR = baseDR + Math.sin(t * 20 + d) * 10;
          
          if (dR > 30 && dR < coreRadius - 12) {
              const dropX = Math.cos(dAngle) * dR;
              const dropY = Math.sin(dAngle) * dR;
              const dropSize = 0.5 + (d % 2);
              
              ctx.moveTo(dropX + dropSize, dropY);
              ctx.arc(dropX, dropY, dropSize, 0, Math.PI * 2);
          }
      }
      ctx.fill();
      ctx.restore();
  };

  // Function to draw Tier 1 nodes (either front or back pass)
  const drawTier1Nodes = (isFront) => {
      if (t1 <= 0) return;
      
      ctx.save();
      ctx.globalAlpha = t1;
      
      // Orbital height center
      ctx.translate(0, -90);
      
      const numNodes = 4;
      const orbitRadiusX = 230;
      const orbitRadiusY = 76; // Finetuned tilt so front clears ground, back hides behind foundation
      
      let nodes = [];
      for (let i = 0; i < numNodes; i++) {
          const angle = t * 1.5 + (Math.PI * 2 / numNodes) * i;
          const x = Math.cos(angle) * orbitRadiusX;
          const y = Math.sin(angle) * orbitRadiusY;
          const depth = Math.sin(angle); // < 0 is back, >= 0 is front
          nodes.push({x, y, depth, angle});
      }
      
      // Sort nodes to draw from back to front
      nodes.sort((a, b) => a.depth - b.depth);
      
      for (const node of nodes) {
          const isNodeFront = node.depth >= 0;
          if (isNodeFront !== isFront) continue;
          
          ctx.save();
          
          // Faint glowing trail behind the node, tracing the ellipse backwards
          ctx.beginPath();
          const trailLength = 20;
          for (let j = 0; j <= trailLength; j++) {
              const trailAngle = node.angle - (j * 0.04); 
              const tx = Math.cos(trailAngle) * orbitRadiusX;
              const ty = Math.sin(trailAngle) * orbitRadiusY;
              if (j === 0) ctx.moveTo(tx, ty);
              else ctx.lineTo(tx, ty);
          }
          // Gradient for the trail fading out
          let trailGrad = ctx.createLinearGradient(
              node.x, node.y, 
              Math.cos(node.angle - trailLength * 0.04) * orbitRadiusX, 
              Math.sin(node.angle - trailLength * 0.04) * orbitRadiusY
          );
          // Dark blue trail color
          trailGrad.addColorStop(0, `rgba(38, 52, 245, ${0.7 * t1})`);
          trailGrad.addColorStop(1, 'rgba(38, 52, 245, 0)');
          
          ctx.strokeStyle = trailGrad;
          ctx.lineWidth = 6;
          ctx.lineCap = 'round';
          ctx.stroke();

          // Translate to node position to draw the node itself
          ctx.translate(node.x, node.y);

          // Soft white underglow
          let whiteGlowGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, 15);
          whiteGlowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
          whiteGlowGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = whiteGlowGrad;
          ctx.beginPath();
          ctx.arc(0, 0, 15, 0, Math.PI * 2);
          ctx.fill();

          // Crystal only - simple orb with sapphire texture
          ctx.fillStyle = fillSapphire;
          ctx.beginPath();
          ctx.arc(0, 0, 8, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.restore();
      }
      ctx.restore();
  };

  // --- Tier 7: Massive Sapphire Vortex (Background) ---
  // Moved to drawCavern so it can be drawn behind the ground layer


// Draw back nodes
  drawTier1Nodes(false);

  // Tier 0: The Massive Centrifuge Foundation & Main Wheel
  if (t0 > 0) {
    ctx.save();
    ctx.globalAlpha = t0;
    
    const neonCyan = 'transparent';
    const drawGlow = (x, y, radius, color1, color2) => {
        let grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        grad.addColorStop(0, color1);
        grad.addColorStop(1, color2);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
    };
    
    // --- Advanced Massive Base Structure ---
    // We are replacing the old isometric Tier 0 base with a massive high-tech 2D profile.
    
    // --- Tier 4: Massive Structure Aura ---
    if (t4 > 0) {
        ctx.save();
        
        // Prevent aura from bleeding into the ground (which is y > 0)
        ctx.beginPath();
        ctx.rect(-1000, -1000, 2000, 1000); // Only allow drawing above y = 0
        ctx.clip();
        
        ctx.globalAlpha = t4 * 0.8;
        
        // Volumetric organic energy rising from the structure
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const auraGrad = ctx.createLinearGradient(0, 0, 0, -350);
        auraGrad.addColorStop(0, 'rgba(17, 34, 204, 0.25)');
        auraGrad.addColorStop(0.5, 'rgba(10, 26, 136, 0.1)');
        auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = auraGrad;
        
        for (let j = 0; j < 4; j++) {
            ctx.beginPath();
            ctx.moveTo(-290, 0);
            
            // Left side going up
            for (let y = 0; y >= -350; y -= 25) {
                const prog = -y / 350;
                const width = 290 - (100 * prog);
                const sway = Math.sin(t * 1.5 + prog * 5 + j * 2) * 40 * prog;
                ctx.lineTo(-width + sway, y);
            }
            
            // Right side coming down
            for (let y = -350; y <= 0; y += 25) {
                const prog = -y / 350;
                const width = 290 - (100 * prog);
                const sway = Math.sin(t * 1.7 + prog * 5 + j * 2 + 1) * 40 * prog;
                ctx.lineTo(width + sway, y);
            }
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();

        // Massive pulsating dark-energy aura tracing the base
        ctx.shadowColor = '#1122cc';
        ctx.shadowBlur = 50 + Math.sin(t * 5) * 20;
        
        ctx.beginPath();
        ctx.moveTo(-280, 0);
        ctx.lineTo(280, 0);
        ctx.lineTo(250, -25);
        ctx.lineTo(190, -60);
        ctx.lineTo(146, -148);
        ctx.lineTo(140, -170);
        ctx.lineTo(85, -215);
        ctx.lineTo(51.2, -200);
        ctx.arc(0, -120, 95, Math.atan2(-80, 51.2), Math.atan2(-80, -51.2), true);
        ctx.lineTo(-51.2, -200);
        ctx.lineTo(-85, -215);
        ctx.lineTo(-140, -170);
        ctx.lineTo(-146, -148);
        ctx.lineTo(-190, -60);
        ctx.lineTo(-250, -25);
        ctx.closePath();
        
        ctx.lineWidth = 15;
        ctx.strokeStyle = 'rgba(10, 26, 136, 0.6)';
        ctx.stroke();
        
        // Inner intense edge aura
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#2233ee';
        ctx.stroke();
        
        ctx.restore();
    }

    ctx.fillStyle = fillSapphire;
    ctx.strokeStyle = 'transparent';
    
    // Draw the entire massive base as a single continuous polygon to prevent subpixel gaps
    ctx.beginPath();
    ctx.moveTo(-280, 0);
    ctx.lineTo(280, 0);
    ctx.lineTo(250, -25);
    ctx.lineTo(190, -60);
    ctx.lineTo(130, -180);
    ctx.lineTo(-130, -180);
    ctx.lineTo(-190, -60);
    ctx.lineTo(-250, -25);
    ctx.closePath();
    ctx.fill();
    

    // --- Tier 2: Core Cradle / Chassis Expansion (Drawn BEHIND the core) ---
    if (t2 > 0) {
      ctx.save();
      ctx.globalAlpha = t2;
      
      for (let i = -1; i <= 1; i += 2) {
        ctx.save();
        ctx.scale(i, 1); // Flip horizontally for symmetry
        
        // Main Chassis Arm
        ctx.fillStyle = '#051020'; // matches outer casing of Tier 0
        ctx.strokeStyle = fillSapphire; // bright sapphire accent
        ctx.lineWidth = 4;
        
        // The path of the chassis
        const chassisPath = new Path2D();
        chassisPath.moveTo(170, -60);
        chassisPath.lineTo(140, -170);
        chassisPath.lineTo(85, -215);
        chassisPath.lineTo(51.2, -200); // Inner tip touching casing
        // Arc along the casing (radius 95, center 0, -120)
        chassisPath.arc(0, -120, 95, Math.asin(-80/95), Math.asin(60/95), false);
        chassisPath.closePath();
        
        ctx.fill(chassisPath);
        ctx.stroke(chassisPath);

        // --- Animated Fluid Chamber ---
        ctx.save();
        
        // Define the window/chamber path
        const chamberPath = new Path2D();
        chamberPath.moveTo(140, -85);
        chamberPath.lineTo(120, -160);
        chamberPath.lineTo(90, -190);
        chamberPath.lineTo(80, -180);
        chamberPath.lineTo(110, -150);
        chamberPath.lineTo(125, -80);
        chamberPath.closePath();
        
        // Dark background for the chamber
        ctx.fillStyle = '#020610';
        ctx.fill(chamberPath);
        
        // Clip to the chamber window
        ctx.clip(chamberPath);
        
        // Liquid Sapphire Fill with linear triangle waves for constant speed
        const phase = t * 0.5 + (i === 1 ? 0 : Math.PI);
        const cycle = phase / Math.PI;
        // Math.abs produces a perfect triangle wave 0..1..0
        const fluidLevel = 1 - Math.abs((cycle % 2 + 2) % 2 - 1);
        
        // Calculate Y based on bounding box of chamber (approx -190 to -80, span 110)
        const fluidY = -80 - (110 * fluidLevel);
        
        const fluidGrad = ctx.createLinearGradient(0, fluidY, 0, -80);
        fluidGrad.addColorStop(0, 'rgba(100, 150, 255, 0.9)');
        fluidGrad.addColorStop(0.2, 'rgba(50, 100, 255, 0.9)');
        fluidGrad.addColorStop(1, 'rgba(10, 30, 200, 0.9)');
        
        ctx.fillStyle = fluidGrad;
        
        ctx.beginPath();
        // Sine wave surface (reduce surface wave amplitude slightly to prevent jitter)
        const firstWaveOffset = Math.sin(70 * 0.1 + t * 4 + (i === 1 ? 0 : Math.PI)) * 2.5;
        ctx.moveTo(70, fluidY + firstWaveOffset);
        for(let wx = 75; wx <= 150; wx += 5) {
            const waveOffset = Math.sin(wx * 0.1 + t * 4 + (i === 1 ? 0 : Math.PI)) * 2.5;
            ctx.lineTo(wx, fluidY + waveOffset);
        }
        ctx.lineTo(150, -80);
        ctx.lineTo(70, -80);
        ctx.closePath();
        ctx.fill();
        
        // Bubbles rising in the chamber
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        for(let b = 0; b < 8; b++) {
            const bTime = (t * 1.5 + b * 2.3 + (i === 1 ? 0 : 5.1)) % 3.0;
            if (bTime < 3.0) { // Active bubble
                const bx = 90 + ((b * 17) % 40) + Math.sin(t * 3 + b) * 3;
                const startY = -80;
                const endY = fluidY;
                // Move bubble up
                const by = startY - (startY - endY) * (bTime / 3.0);
                
                // Only draw if below fluid surface
                if (by > fluidY - 5) {
                    ctx.beginPath();
                    ctx.arc(bx, by, 1.5 + (b % 2), 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
        
        // Glass Reflection on the window
        const glassGrad = ctx.createLinearGradient(80, 0, 140, 0);
        glassGrad.addColorStop(0, "rgba(255, 255, 255, 0.25)");
        glassGrad.addColorStop(0.2, "rgba(255, 255, 255, 0.05)");
        glassGrad.addColorStop(0.8, "rgba(255, 255, 255, 0.05)");
        glassGrad.addColorStop(1, "rgba(255, 255, 255, 0.2)");
        
        ctx.fillStyle = glassGrad;
        ctx.fill(chamberPath);
        
        ctx.restore(); // Remove clip

        // Inner frame for the chamber window
        ctx.strokeStyle = fillSapphire;
        ctx.lineWidth = 2;
        ctx.stroke(chamberPath);

        // Glow bolts for mechanical attachment
        ctx.save();
        ctx.globalAlpha = t2;
        ctx.fillStyle = '#888';
        ctx.shadowColor = fillSapphire;
        ctx.shadowBlur = 8;
        const bolts = [
          {x: 140, y: -70},
          {x: 147, y: -100},
          {x: 132, y: -165},
          {x: 88,  y: -202}
        ];
        for (let bolt of bolts) {
          ctx.beginPath();
          ctx.arc(bolt.x, bolt.y, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore(); // restores glow/shadow

        ctx.restore(); // restores scale
      }
      ctx.restore(); // restores globalAlpha from t2 block
    }
    // --- High-Tech Spinning Core Element ---
    const spinnerCy = -120;
    
    drawSpinningCore(0, spinnerCy, 1.0, 0.5);

    ctx.restore();
  }


  // Tier 3: Four Mini Centrifuges
  if (t3 > 0) {
    ctx.save();
    ctx.globalAlpha = t3;
    
    // Left side mini centrifuges
    drawSpinningCore(-98, -31, 0.30, 0.5);
    drawSpinningCore(-168, -31, 0.30, 0.5);
    
    // Right side mini centrifuges
    drawSpinningCore(98, -31, 0.30, 0.5);
    drawSpinningCore(168, -31, 0.30, 0.5);
    
    ctx.restore();
  }

  // Tier 4: Integrated into drawSpinningCore
  const coreCy = -90;

  // (Ice Crystals block moved)

  // Tier 8 is now handled inside drawSpinningCore to apply to all cores

  // Tier 1: Orbital Data Nodes (Front Pass)
  drawTier1Nodes(true);

  // Tier 5: 3D Ice Crystal Centrifuges
  if (t5 > 0) {
    ctx.save();
    ctx.globalAlpha = t5;
    ctx.translate(0, coreCy);

    const drawCrystalShard = (x, y, w, h, angle, colorMain, colorHighlight) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        
        ctx.beginPath();
        ctx.moveTo(0, -h); 
        ctx.lineTo(w/2, 0); 
        ctx.lineTo(0, h * 0.2); 
        ctx.lineTo(-w/2, 0); 
        ctx.closePath();
        
        ctx.fillStyle = colorMain;
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(0, -h);
        ctx.lineTo(w/2, 0);
        ctx.lineTo(0, h * 0.2);
        ctx.closePath();
        ctx.fillStyle = colorHighlight;
        ctx.fill();
        
        ctx.strokeStyle = '#2233ee';
        ctx.lineWidth = 1;
        ctx.lineJoin = 'round';
        ctx.stroke();
        
        ctx.restore();
    };

    // Draw two ice crystal centrifuges, one on each side
    for (let side of [-1, 1]) {
        ctx.save();
        
        // Positioned between windmills and main structure
        const baseX = side * 241; 
        const hoverY = 9 + Math.sin(t * 2 + side) * 2;
        
        ctx.translate(baseX, hoverY);
        
        // Tilt towards the main structure. 
        const tiltAngle = side * -0.4;
        ctx.rotate(tiltAngle);

        const pulse = 1 + Math.sin(t * 3) * 0.05;
        ctx.scale(pulse, pulse);

        const orbitRadius = 32;
        
        let orbiting = [];
        for (let i = 0; i < 3; i++) {
            // Spin like a centrifuge
            const theta = t * 2.5 + (i * Math.PI * 2 / 3);
            const px = Math.cos(theta) * orbitRadius;
            const depth = Math.sin(theta);
            // Orbit around the middle of the tall crystal (approx y = -50)
            const py = -50 + depth * orbitRadius * 0.35; 
            
            orbiting.push({px, py, depth});
        }
        
        orbiting.sort((a, b) => a.depth - b.depth);
        
        // Draw crystals behind the center
        for (let orb of orbiting) {
            if (orb.depth < 0) {
                drawCrystalShard(orb.px, orb.py, 22, 75, 0, fillSapphire, 'rgba(100, 150, 255, 0.3)');
            }
        }
        
        // Draw the central, slightly larger ice crystal
        drawCrystalShard(0, 0, 35, 140, 0, fillSapphire, 'rgba(100, 150, 255, 0.4)');
        
        // Draw crystals in front of the center
        for (let orb of orbiting) {
            if (orb.depth >= 0) {
                drawCrystalShard(orb.px, orb.py, 22, 75, 0, fillSapphire, 'rgba(100, 150, 255, 0.3)');
            }
        }
        
        ctx.restore();
    }
    
    ctx.restore();
  }

  // Tier 6: Perimeter Windmill Generators (Moved here to draw on top of everything)
  if (t6 > 0) {
    ctx.save();
    ctx.globalAlpha = t6;
    
    // Cache the aerodynamic, pointy blade path
    const bladePath = new Path2D();
    bladePath.moveTo(-4, 18); // Starts slightly inside the core radius (20) to look attached
    bladePath.lineTo(4, 18);
    bladePath.quadraticCurveTo(8, 60, 0, 95); // Sleek, swept point
    bladePath.quadraticCurveTo(-6, 60, -4, 18);
    bladePath.closePath();
    
    // Draw 2 massive windmill generators pushed away from the building
    for (let dir of [-1, 1]) {
        const tx = dir * 350; // Pushed out past the foundation
        const tyBase = 0; // Resting perfectly flat on the y=0 ground line
        const tyTop = -210; // Taller tower
        
        ctx.save();
        ctx.translate(tx, -1); // Moved up just slightly to prevent ground clipping, but not float
        
        // --- Tower Structure ---
        // Base plate (sleek, faceted to match Tier 0 main foundation style)
        ctx.fillStyle = '#051020'; 
        ctx.strokeStyle = fillSapphire; 
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        ctx.moveTo(-35, tyBase);
        ctx.lineTo(35, tyBase);
        ctx.lineTo(25, tyBase - 10);
        ctx.lineTo(18, tyBase - 25);
        ctx.lineTo(-18, tyBase - 25);
        ctx.lineTo(-25, tyBase - 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Tower Shaft
        ctx.beginPath();
        ctx.moveTo(-18, tyBase - 25);
        ctx.lineTo(-12, tyTop);
        ctx.lineTo(12, tyTop);
        ctx.lineTo(18, tyBase - 25);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Sapphire glowing core running up the tower shaft
        ctx.fillStyle = fillSapphire;
        ctx.beginPath();
        ctx.moveTo(-4, tyBase - 25);
        ctx.lineTo(-2, tyTop);
        ctx.lineTo(2, tyTop);
        ctx.lineTo(4, tyBase - 25);
        ctx.closePath();
        ctx.fill();
        
        // --- The Windmill Turbine ---
        ctx.save();
        ctx.translate(0, tyTop);
        
        // Sleek Motor Nacelle (Octagonal housing, drawn behind blades)
        ctx.fillStyle = '#051020';
        ctx.strokeStyle = fillSapphire;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-12, -20);
        ctx.lineTo(12, -20);
        ctx.lineTo(20, -5);
        ctx.lineTo(20, 5);
        ctx.lineTo(12, 20);
        ctx.lineTo(-12, 20);
        ctx.lineTo(-20, 5);
        ctx.lineTo(-20, -5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Spin both in the same direction, matching the tier 3/4 cores
        ctx.rotate(t * 0.5); 
        
        // 4 Sleek Blades
        for (let j = 0; j < 4; j++) {
            ctx.save();
            ctx.rotate((Math.PI / 2) * j);
            
            // Blade fill
            ctx.fillStyle = '#051020'; 
            ctx.strokeStyle = fillSapphire; 
            ctx.lineWidth = 2;
            ctx.fill(bladePath);
            ctx.stroke(bladePath);
            
            // Thin sapphire texture strip along the center of the blade
            ctx.fillStyle = fillSapphire;
            ctx.beginPath();
            ctx.moveTo(-2.5, 20);
            ctx.lineTo(2.5, 20);
            ctx.lineTo(0, 88); // Tapers to a point just shy of the blade tip
            ctx.closePath();
            ctx.fill();
            
            ctx.restore();
        }
        
        ctx.restore(); // Restore turbine rotation (back to just tyTop translation)
        
        // --- Miniature Centrifuge Spinner Core ---
        ctx.save();
        ctx.translate(0, tyTop);
        drawSpinningCore(0, 0, 0.25, 0.5); 
        ctx.restore(); // Restore core translation
        
        // --- Single Thin High-Arc Energy Beams ---
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        
        for (let i = 0; i < 4; i++) {
            const angle = t * 0.5 + (Math.PI / 2) * i;
            const tipX = -95 * Math.sin(angle);
            const tipY = tyTop + 95 * Math.cos(angle);
            
            // Glowing energy dot at tip (highly performant, dark blue)
            ctx.beginPath();
            ctx.arc(tipX, tipY, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#2244ff';
            ctx.fill();
            
            // Arc slightly higher than the centrifuge wheel (wheel apex is ~ -290)
            const cp1X = tipX + (-tx * 0.2); 
            const cp1Y = -400; // Reduced height
            
            const cp2X = -tx * 0.6; 
            const cp2Y = -400; // Reduced height
            
            const bolts = [
              {x: 140, y: -70},
              {x: 147, y: -100},
              {x: 132, y: -165},
              {x: 88,  y: -202}
            ];
            const endX = (dir * bolts[i].x) - tx; // Track to each bolt of tier 2
            const endY = bolts[i].y + 1;
            
            ctx.beginPath();
            ctx.moveTo(tipX, tipY);
            ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
            
            ctx.lineCap = 'square'; // Forces the angled line ends to perfectly overlap without a V-gap
            
            // Way thinner, dark blue beams
            ctx.strokeStyle = '#2244ff'; 
            ctx.lineWidth = 2.5;
            ctx.stroke();
        }
        
        ctx.restore(); // Restore screen modede
        
        ctx.restore(); // Restore tower translation
    }
    
    ctx.restore();
  }

  // --- Post-Pass: Draw Tier 4 Aura ON TOP of all other effects ---
  if (t4 > 0) {
      // Main Spinner Aura
      const mainSpinnerCy = -120;
      drawTier4Aura(0, mainSpinnerCy, 1.0, 0.5);
      
      // Mini Centrifuge Auras (Tier 3)
      if (t3 > 0) {
          drawTier4Aura(-98, -31, 0.30, 0.5);
          drawTier4Aura(-168, -31, 0.30, 0.5);
          drawTier4Aura(98, -31, 0.30, 0.5);
          drawTier4Aura(168, -31, 0.30, 0.5);
      }
      
      // Windmill Miniature Core Auras (Tier 6)
      if (t6 > 0) {
          for (let dir of [-1, 1]) {
              const tx = dir * 350;
              const tyTop = -210;
              
              ctx.save();
              ctx.translate(tx, -1);
              drawTier4Aura(0, tyTop, 0.25, 0.5);
              ctx.restore();
          }
      }
  }

  ctx.restore();
}
function drawBeacon(ctx, t, tier, prevTier, animProgress) {
  const getProg = (targetTier) => tier >= targetTier && prevTier < targetTier ? animProgress : (tier >= targetTier ? 1 : 0);
  
  const t0 = getProg(0), t1 = getProg(1), t2 = getProg(2), t3 = getProg(3);
  const t4 = getProg(4), t5 = getProg(5), t6 = getProg(6), t7 = getProg(7), t8 = getProg(8);

  if (!unobtainiumPattern) initUnobtainiumPattern(ctx);
  const fillMat = unobtainiumPattern || '#4c1e7a';

  // -------------------------
  // BEACON: Strictly 2D
  // -------------------------

  // Layer 5: Massive Background Magic Circle (T5)
  if (t5 > 0) {
    ctx.save();
    ctx.globalAlpha = t5 * 0.4; // Subtle background element
    ctx.translate(0, -80);
    ctx.rotate(-t * 0.2); // Slow rotation
    
    ctx.strokeStyle = '#d98cff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 150, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.arc(0, 0, 130, 0, Math.PI * 2);
    ctx.stroke();
    
    // Inner star
    for(let i=0; i<6; i++) {
       ctx.beginPath();
       ctx.moveTo(0, 0);
       ctx.lineTo(Math.cos(i*Math.PI/3)*150, Math.sin(i*Math.PI/3)*150);
       ctx.stroke();
    }
    ctx.restore();
  }

  // T7: Secondary Base Structures (Side pylons)
  if (t7 > 0) {
    ctx.save();
    ctx.globalAlpha = t7;
    ctx.fillStyle = fillMat;
    ctx.strokeStyle = '#1a0630';
    ctx.lineWidth = 3;
    
    // Left pylon
    ctx.beginPath();
    ctx.moveTo(-100, 0);
    ctx.lineTo(-70, -80);
    ctx.lineTo(-50, -80);
    ctx.lineTo(-30, 0);
    ctx.fill(); ctx.stroke();
    
    // Right pylon
    ctx.beginPath();
    ctx.moveTo(100, 0);
    ctx.lineTo(70, -80);
    ctx.lineTo(50, -80);
    ctx.lineTo(30, 0);
    ctx.fill(); ctx.stroke();
    
    ctx.restore();
  }

  // Endgame Environmental FX: Anti-Gravity Debris


  const drawState = (stateTier, alphaMult) => {
    if (alphaMult <= 0) return;
    
    const hasT0 = stateTier >= 0;
    const hasT1 = stateTier >= 1;
    const hasT2 = stateTier >= 2;
    const hasT3 = stateTier >= 3;
    const hasT4 = stateTier >= 4;
    const hasT6 = stateTier >= 6;
    const hasT8 = stateTier >= 8;

    const blockSize = 50;
    let lCount = 0;
    if (hasT0) lCount += 1;
    if (hasT1) lCount += 1;
    if (hasT2) lCount += 1;
    if (hasT3) lCount += 1;
    
    const pyramidTopY = -lCount * blockSize;
    const beaconPieceY = pyramidTopY - blockSize;
        const crystalY = beaconPieceY + 3 * (blockSize / 16); // Top of the core
    const crystalX = 0;

    ctx.save();
    ctx.globalAlpha = alphaMult;
    
    // 1. Pyramid
    ctx.save();
    ctx.beginPath();
    ctx.rect(-99999, -99999, 199998, 99999); // Clip to ground but allow infinite vertical reach
    ctx.clip();
    
    const drawLayer = (widthBlocks, yPos) => {
      ctx.save();
      ctx.strokeStyle = '#1a0630';
      ctx.lineWidth = 2;
      const totalW = widthBlocks * blockSize;
      const startX = -totalW / 2;
      
      for (let i = 0; i < widthBlocks; i++) {
        const bx = startX + i * blockSize;
        ctx.fillStyle = fillMat; // Reset to Unobtainium texture for each block
        ctx.fillRect(bx, yPos, blockSize, blockSize);
        ctx.strokeRect(bx, yPos, blockSize, blockSize);
        
        // Top bevel (always bright)
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(bx, yPos, blockSize, blockSize * 0.15);
        
        // Bottom shadow (always dark)
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(bx, yPos + blockSize * 0.85, blockSize, blockSize * 0.15);

        // Dynamic side bevels based on relative position to the center (x=0)
        const blockCenterX = bx + blockSize / 2;
        if (blockCenterX < -1) {
            // Block is on the left; its right side faces the central beacon light
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; // Left edge is dark
            ctx.fillRect(bx, yPos + blockSize * 0.15, blockSize * 0.15, blockSize * 0.7);
            ctx.fillStyle = 'rgba(255,255,255,0.15)'; // Right edge is bright
            ctx.fillRect(bx + blockSize * 0.85, yPos + blockSize * 0.15, blockSize * 0.15, blockSize * 0.7);
        } else if (blockCenterX > 1) {
            // Block is on the right; its left side faces the central beacon light
            ctx.fillStyle = 'rgba(255,255,255,0.15)'; // Left edge is bright
            ctx.fillRect(bx, yPos + blockSize * 0.15, blockSize * 0.15, blockSize * 0.7);
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; // Right edge is dark
            ctx.fillRect(bx + blockSize * 0.85, yPos + blockSize * 0.15, blockSize * 0.15, blockSize * 0.7);
        } else {
            // Center block directly under beacon; sides are neutral/dark
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fillRect(bx, yPos + blockSize * 0.15, blockSize * 0.15, blockSize * 0.7);
            ctx.fillRect(bx + blockSize * 0.85, yPos + blockSize * 0.15, blockSize * 0.15, blockSize * 0.7);
        }
      }
      ctx.restore();
    };

    if (hasT0) drawLayer(3, pyramidTopY + blockSize * 0);
    if (hasT1) drawLayer(5, pyramidTopY + blockSize * 1);
    if (hasT2) drawLayer(7, pyramidTopY + blockSize * 2);
    if (hasT3) drawLayer(9, pyramidTopY + blockSize * 3);
    
    ctx.restore();


    // 3. Beam & Particle FX (Minecraft 3D rotating square)
    if (hasT0) {
      ctx.save();
      
      const R = 8.5; // Adjusted so max diagonal width is ~24px (fits perfectly inside the 31px core width)re
      const angle = (t * Math.PI * 2) / 10; // 360 degrees in 10 seconds
      
      // Calculate 3D projected corners
      const corners = [];
      for(let i=0; i<4; i++) {
         const a = angle + i * (Math.PI / 2);
         corners.push({
             x: Math.sin(a) * R,
             z: Math.cos(a) * R
         });
      }
      
      // Dynamically calculate the exact top edge of the visible screen!
      let topY = -2000;
      try {
          const transform = ctx.getTransform();
          if (transform && transform.d) {
              // Inverse map screen Y=0 to world Y, minus 100px padding
              topY = Math.min(crystalY, (-transform.f / transform.d) - 100);
          }
      } catch (e) {}

      // Draw visible faces
      for(let i=0; i<4; i++) {
         const p1 = corners[i];
         const p2 = corners[(i+1)%4];
         if (p1.x < p2.x) { // Face is pointing towards camera
             const leftX = p1.x;
             const rightX = p2.x;
             const faceWidth = rightX - leftX;
             const faceHeight = crystalY - topY;
             
             // Base face color (Dark purple)
             ctx.fillStyle = "rgba(75, 20, 120, 0.8)";
             ctx.fillRect(leftX, topY, faceWidth, faceHeight);
             
             // 8x8 Minecraft beacon texture simulation (Scrolling pixel streaks)
             // OPTIMIZATION: Generate an offscreen repeating pattern ONCE to eliminate the thousands of lineDash calls per frame.
             if (!window.beaconBeamPatternCache) {
                  const pCanvas = document.createElement('canvas');
                  pCanvas.width = 16; // 8 columns, 2px each
                  pCanvas.height = 1024; // Tall enough to prevent strobing at high speeds!
                  const pCtx = pCanvas.getContext('2d');
                  
                  // Fill the entire texture with dense, low-contrast noise (streaks everywhere)
                  for (let c = 0; c < 8; c++) {
                      let y = 0;
                      while (y < 1024) {
                          // Deterministic pseudo-random noise based on coordinates
                          const seed = c * 12.9898 + y * 78.233;
                          const pseudoRandom = Math.abs(Math.sin(seed) * 43758.5453);
                          const noise = pseudoRandom - Math.floor(pseudoRandom);
                          
                          // Base dark purple is roughly 75, 20, 120
                          // Generate streaks that are only slightly lighter/darker (low contrast)
                          const r = 70 + noise * 30; // 70 to 100
                          const g = 15 + noise * 15; // 15 to 30
                          const b = 110 + noise * 35; // 110 to 145
                          pCtx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.95)`;
                          
                          // Streaks are very short vertically (2 to 6 pixels)
                          const h = 2 + Math.floor((pseudoRandom * 17) % 3) * 2; 
                          pCtx.fillRect(c * 2, y, 2, h);
                          y += h; // No gaps! The pixels are literally everywhere.
                      }
                  }
                  window.beaconBeamPatternCache = pCanvas;
                  // Cache pattern
                  window.beaconBeamPattern = pCanvas.getContext('2d').createPattern(pCanvas, 'repeat');
             }
             
             ctx.save();
             ctx.beginPath();
             ctx.rect(leftX, topY, faceWidth, faceHeight);
             ctx.clip(); // Restrict drawing strictly to this face
             
             // Minecraft beacon scrolls VERY fast. 
             // With a 1024px tall pattern, we can safely scroll at 8000px/s without aliasing!
             const scrollY = -((t * 8000) % 1024); 
             ctx.translate(leftX, scrollY);
             
             // Scale the 16px wide pattern to dynamically fit the current 3D-projected face width!
             ctx.scale(faceWidth / 16, 1); 
             
             ctx.fillStyle = ctx.createPattern(window.beaconBeamPatternCache, 'repeat');
             // Adjust fill rect for the scroll and transform
             // We need to fill enough height to cover the face + scroll + pattern height
             ctx.fillRect(0, topY - scrollY, 16, faceHeight + 1024);
             ctx.restore();
             
             // Edges (Darker outside lines)
             ctx.strokeStyle = "rgba(45, 10, 80, 1.0)";
             ctx.lineWidth = 2;
             ctx.beginPath();
             ctx.moveTo(leftX, topY);
             ctx.lineTo(leftX, crystalY);
             ctx.moveTo(rightX, topY);
             ctx.lineTo(rightX, crystalY);
             ctx.stroke();
         }
      }

      if (hasT4) {
         let wideBeamW = 100;
         let wideGrad = ctx.createLinearGradient(-wideBeamW/2, 0, wideBeamW/2, 0);
         const pulse = 0.5 + Math.sin(t * 6) * 0.3;
         wideGrad.addColorStop(0, `rgba(150, 50, 255, 0.0)`);
         wideGrad.addColorStop(0.3, `rgba(180, 80, 255, ${0.5 * pulse})`);
         wideGrad.addColorStop(0.5, `rgba(255, 200, 255, ${0.9 * pulse})`);
         wideGrad.addColorStop(0.7, `rgba(180, 80, 255, ${0.5 * pulse})`);
         wideGrad.addColorStop(1, `rgba(150, 50, 255, 0.0)`);
         ctx.fillStyle = wideGrad;
         ctx.fillRect(-wideBeamW/2, topY, wideBeamW, crystalY - topY);
      }
      


      ctx.restore(); 
    }

    if (hasT8) {
      for(let i=0; i<4; i++) {
          const cycle = ((t * 3 + i) % 4) / 4; 
          const yPos = crystalY - cycle * 1000;
          ctx.strokeStyle = `rgba(255, 255, 255, ${1.0 - cycle})`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(-60, yPos + 20);
          ctx.quadraticCurveTo(0, yPos - 20, 60, yPos + 20);
          ctx.stroke();
          ctx.strokeStyle = `rgba(180, 80, 255, ${0.5 - cycle*0.5})`;
          ctx.lineWidth = 8;
          ctx.stroke();
      }
    }
    
    if (hasT6) {
      for(let i=0; i<15; i++) {
         const cycle = ((t * 1.5 + i * 0.1) % 1.5) / 1.5;
         const yPos = 0 - cycle * 800;
         const xOffset = Math.sin(t * 3 + i * 45) * 40;
         ctx.fillStyle = `rgba(255, 150, 255, ${1.0 - cycle})`;
         ctx.beginPath();
         ctx.arc(xOffset, yPos, 2 + Math.random()*2, 0, Math.PI*2);
         ctx.fill();
      }
    }

    if (hasT0) {
      ctx.save();
      const splashY = -800;
      const splashGrad = ctx.createRadialGradient(0, splashY, 20, 0, splashY, 300);
      splashGrad.addColorStop(0, "rgba(210, 100, 255, 0.4)");
      splashGrad.addColorStop(0.5, "rgba(150, 50, 255, 0.15)");
      splashGrad.addColorStop(1, "rgba(0, 0, 0, 0.0)");
      ctx.fillStyle = splashGrad;
      ctx.translate(0, splashY);
      ctx.scale(2.5, 0.6);
      ctx.beginPath();
      ctx.arc(0, 0, 300, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 4. Runes
    if (hasT2) {
      ctx.save();
      ctx.fillStyle = `rgba(200, 100, 255, ${0.5 + Math.sin(t*4)*0.5})`;
      ctx.font = "20px Arial";
      ctx.textAlign = "center";
      ctx.fillText("✧", -blockSize*2, pyramidTopY + blockSize*1.5);
      ctx.fillText("✧", blockSize*2, pyramidTopY + blockSize*1.5);
      ctx.fillText("✦", 0, pyramidTopY - 20);
      ctx.restore();
    }

    // 5. Cohesive Beacon Block (Perfect 16x16 Minecraft replica)
    if (hasT0) {
      ctx.save();
      const scale = blockSize / 16; 
      
      // Move to top-left of the beacon block
      ctx.translate(-blockSize/2, beaconPieceY);
      
      // 1. Obsidian Base (x=2..13, y=13..15)
      ctx.fillStyle = fillMat; // Use the unobtainium texture!
      ctx.fillRect(2 * scale, 13 * scale, 12 * scale, 3 * scale);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'; // 20% black overlay
      ctx.fillRect(2 * scale, 13 * scale, 12 * scale, 3 * scale);
      
      // 2. Core (x=3..12, y=3..12)
      // Generate stylized 10x10 core texture ONCE to avoid flickering noise
      if (!window.beaconCorePatternCache2) {
          const cCanvas = document.createElement('canvas');
          cCanvas.width = 10;
          cCanvas.height = 10;
          const cCtx = cCanvas.getContext('2d');
          
          for (let cy = 0; cy < 10; cy++) {
              for (let cx = 0; cx < 10; cx++) {
                  const dx = cx - 4.5;
                  const dy = cy - 4.5;
                  // Use Math.pow(..., 1.5) to keep the dark center area wider and more consistent
                  const distRatio = Math.pow(Math.min(1, Math.sqrt(dx*dx + dy*dy) / 6.36), 1.5);
                  
                  // Outside (distRatio 1) = Royal Purple (120, 81, 169)
                  // Inside (distRatio 0) = Darker Purple (30, 0, 50) - slightly darker now
                  let rBase = 30 + distRatio * (120 - 30);
                  let gBase = 0 + distRatio * (81 - 0);
                  let bBase = 50 + distRatio * (169 - 50);
                  
                  // Deterministic pseudo-random noise based on coordinates
                  const seed = cx * 12.9898 + cy * 78.233;
                  const pseudoRandom = Math.abs(Math.sin(seed) * 43758.5453);
                  // Scale noise by distance so the center remains perfectly solid and undisturbed
                  const noise = ((pseudoRandom - Math.floor(pseudoRandom)) - 0.5) * 40 * distRatio;
                  
                  rBase = Math.max(0, Math.min(255, rBase + noise));
                  gBase = Math.max(0, Math.min(255, gBase + noise));
                  bBase = Math.max(0, Math.min(255, bBase + noise));
                  
                  cCtx.fillStyle = `rgb(${Math.floor(rBase)}, ${Math.floor(gBase)}, ${Math.floor(bBase)})`;
                  cCtx.fillRect(cx, cy, 1, 1);
              }
          }
          
          window.beaconCorePatternCache2 = cCanvas;
      }
      
      // Draw the stylized 10x10 core pixel-perfectly
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(window.beaconCorePatternCache2, 3 * scale, 3 * scale, 10 * scale, 10 * scale);
      ctx.imageSmoothingEnabled = true;
      
      // 3. Glass Shell
      // Fill (Darker Purple Tint)
      ctx.fillStyle = 'rgba(100, 20, 160, 0.45)'; 
      ctx.fillRect(1 * scale, 1 * scale, 14 * scale, 14 * scale);
      
      // Glass border (Tinted purple)
      ctx.fillStyle = 'rgba(180, 80, 255, 0.5)';
      ctx.fillRect(0, 0, 16 * scale, 1 * scale); // Top
      ctx.fillRect(0, 15 * scale, 16 * scale, 1 * scale); // Bottom
      ctx.fillRect(0, 1 * scale, 1 * scale, 14 * scale); // Left
      ctx.fillRect(15 * scale, 1 * scale, 1 * scale, 14 * scale); // Right
      
      // Corner highlight (Tinted purple, both sides)
      ctx.fillStyle = 'rgba(220, 150, 255, 0.7)';
      // Top left
      ctx.fillRect(1 * scale, 1 * scale, 2 * scale, 1 * scale);
      ctx.fillRect(1 * scale, 2 * scale, 1 * scale, 1 * scale);
      // Bottom right
      ctx.fillRect(13 * scale, 14 * scale, 2 * scale, 1 * scale);
      ctx.fillRect(14 * scale, 13 * scale, 1 * scale, 1 * scale);
      
      ctx.restore();
    }

    // 6. Floating Rings
    if (hasT1) {
      ctx.save();
      ctx.translate(0, crystalY);
      ctx.strokeStyle = `rgba(200, 100, 255, ${0.6 + Math.sin(t*5)*0.2})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, 45, 15, Math.sin(t), 0, Math.PI*2);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, 60, 20, -Math.sin(t*0.8), 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();
    }

    // 7. Orbiting Crystals
    if (hasT3) {
      ctx.save();
      ctx.translate(0, crystalY);
      const numOrbits = 3;
      for(let i=0; i<numOrbits; i++) {
          const angle = t * 2 + i * (Math.PI*2 / numOrbits);
          const radius = 60;
          const cx = Math.cos(angle) * radius;
          const cy = Math.sin(angle) * radius * 0.3; 
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(t * 3);
          ctx.fillStyle = '#b366ff';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, -10);
          ctx.lineTo(8, 0);
          ctx.lineTo(0, 10);
          ctx.lineTo(-8, 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
      }
      ctx.restore();
    }

    ctx.restore(); // Restore globalAlpha state
  };

  if (tier !== prevTier && animProgress < 1.0) {
    drawState(prevTier, 1.0 - animProgress);
    drawState(tier, animProgress);
  } else {
    drawState(tier, 1.0);
  }

}
function drawTesseract(ctx, t, tier) {
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


function getMatchLength(str, target) {
  for (let len = str.length; len > 0; len--) {
    let suffix = str.slice(-len);
    if (target.startsWith(suffix)) {
      return len;
    }
  }
  return 0;
}

function handleVaultCanvasPointerMove(e) {
  if (!activeCanvas) return;
  if (settingsManager.get('only_show_building')) return;
  const rect = activeCanvas.getBoundingClientRect();
  const clientX = e.clientX - rect.left;
  const clientY = e.clientY - rect.top;
  const scaleX = activeCanvas.width / rect.width;
  const scaleY = activeCanvas.height / rect.height;
  canvasMouseX = clientX * scaleX;
  canvasMouseY = clientY * scaleY;
}

if (typeof window !== 'undefined') {
  window.isMutedByVault = () => {
    return isVaultOpening || isVaultOpen;
  };
  window.isVaultCoinCollected = () => {
    return vaultCoinCollectedLocal;
  };
}

function handleVaultCanvasKeyDown(e) {
  if (settingsManager.get('only_show_building')) return;
  if (!keypadZoomedIn || isVaultOpening || isVaultOpen) return;
  const key = e.key;
  if (key >= '1' && key <= '9') {
    const btnNum = parseInt(key, 10);
    lastHotkeyNum = btnNum;
    
    // Simulate button click/press
    const seq = getVaultSequence();
    const newSeq = (seq + btnNum).slice(-16);
    const target = "7887773346665553";
    const oldLen = getMatchLength(seq, target);
    const newLen = getMatchLength(newSeq, target);

    setVaultSequence(newSeq);

    if (newSeq === target) {
      playAudio("sounds/correct.ogg", { volume: 0.67 });
      isVaultOpening = true;
      vaultOpeningTime = 5.0;
      keypadZoomedIn = false;
      vaultCoinCollectedLocal = false;
      setVaultCoinCollected(false);
      playAudio("sounds/opening.ogg");
      window.dispatchEvent(new CustomEvent('audio:stopMusic'));
      
      setVaultSequence("0000000000000000");
      if (typeof window !== 'undefined' && window.resetSystem && window.resetSystem.updateBuildingsOverlayUi) {
        window.resetSystem.updateBuildingsOverlayUi();
      }
    } else if (newLen === oldLen + 1) {
      playAudio("sounds/correct.ogg", { volume: 0.67 });
    } else {
      playAudio("sounds/incorrect.ogg", { volume: 0.33 });
      setVaultSequence("0000000000000000");
    }
  }
}

function handleVaultCanvasClick(e) {
  if (!activeCanvas) return;
  if (settingsManager.get('only_show_building')) return;
  const rect = activeCanvas.getBoundingClientRect();
  const clientX = e.clientX - rect.left;
  const clientY = e.clientY - rect.top;
  const scaleX = activeCanvas.width / rect.width;
  const scaleY = activeCanvas.height / rect.height;
  const cx = clientX * scaleX;
  const cy = clientY * scaleY;

  const w = activeCanvas.width;
  const h = activeCanvas.height;
  const floorY = h - 260;
  const centerX = w / 2;

  if (isVaultOpen) return;
  if (isVaultOpening) return;

  if (keypadZoomedIn) {
    const zoomFactor = 8;
    const kx = (cx - w / 2) / zoomFactor;
    const ky = (cy - h / 2) / zoomFactor;

    if (kx < -12.5 || kx > 12.5 || ky < -18 || ky > 18) {
      keypadZoomedIn = false;
      activeCanvas.style.cursor = 'default';
      return;
    }

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const bx = -9.5 + c * 7;
        const by = -3 + r * 7;
        if (kx >= bx && kx <= bx + 5 && ky >= by && ky <= by + 5) {
          const btnNum = r * 3 + c + 1;
          
          lastHotkeyNum = btnNum;

          const seq = getVaultSequence();
          const newSeq = (seq + btnNum).slice(-16);
          const target = "7887773346665553";
          const oldLen = getMatchLength(seq, target);
          const newLen = getMatchLength(newSeq, target);

          setVaultSequence(newSeq);

          if (newSeq === target) {
            playAudio("sounds/correct.ogg", { volume: 0.67 });
            isVaultOpening = true;
            vaultOpeningTime = 5.0;
            keypadZoomedIn = false;
            vaultCoinCollectedLocal = false;
            setVaultCoinCollected(false);
            playAudio("sounds/opening.ogg");
            window.dispatchEvent(new CustomEvent('audio:stopMusic'));
            
            setVaultSequence("0000000000000000");
            if (typeof window !== 'undefined' && window.resetSystem && window.resetSystem.updateBuildingsOverlayUi) {
              window.resetSystem.updateBuildingsOverlayUi();
            }
          } else if (newLen === oldLen + 1) {
            playAudio("sounds/correct.ogg", { volume: 0.67 });
          } else {
            playAudio("sounds/incorrect.ogg", { volume: 0.33 });
            setVaultSequence("0000000000000000");
          }
          return;
        }
      }
    }
  } else {
    const scale = 1.0 + getTier() * 0.1;
    const dy = 15;
    const left = centerX - 48 * scale;
    const right = centerX - 23 * scale;
    const top = floorY - (88 + dy) * scale;
    const bottom = floorY - (52 + dy) * scale;

    if (cx >= left && cx <= right && cy >= top && cy <= bottom) {
      if (getTier() >= 2) {
        keypadZoomedIn = true;
      }
    }
  }
}
