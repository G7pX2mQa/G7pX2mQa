// js/main.js

import { playAudio, setAudioSuspended } from './util/audioManager.js';
import { createCursorTrail } from './game/cursorTrail.js';
import { syncXpMpHudLayout } from './ui/hudLayout.js';
import { initUcPickup } from './game/materialPickup.js';

export const FONT_MAP = {
  1: 'font-tinos',
  4: 'font-arimo',
  7: 'font-cousine',
  10: 'font-nunito',
  13: 'font-open-sans',
  16: 'font-comic-neue',
  19: 'font-merriweather',
  22: 'font-anton',
  25: 'font-roboto',
  28: 'font-inconsolata',
  31: 'font-lora',
  34: 'font-noto-sans',
  37: 'font-pt-sans',
  40: 'font-ubuntu',
  43: 'font-source-sans-3',
  46: 'font-raleway',
  49: 'font-montserrat',
  52: 'font-oswald',
  55: 'font-playfair-display',
  58: 'font-poppins',
  61: 'font-mukta',
  64: 'font-quicksand',
  67: 'font-fira-sans',
  70: 'font-dosis',
  73: 'font-rajdhani'
};

export const ALL_FONT_CLASSES = Object.values(FONT_MAP);

export const DEBUG_PANEL_ACCESS = true; // I will change this to false for prod so the readme makes sense
export const IS_MOBILE = (() => {
  if (typeof window === 'undefined') return false;

  if (typeof window.IS_MOBILE !== 'undefined') {
    return !!window.IS_MOBILE;
  }

  const detected = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
    || ('ontouchstart' in window)
    || (window.navigator && window.navigator.maxTouchPoints > 0);
  window.IS_MOBILE = detected;
  return detected;
})();

if (IS_MOBILE) {
  document.documentElement.classList.add('is-mobile');
}

let initSlots;
let createSpawner;
let createUcSpawner;
let initCoinPickup;
let refreshCoinMultiplierCache;
let refreshMpValueMultiplierCache;
let updateMutationSnapshot;
let initHudButtons;
let refreshButtonVisibility;
let installGhostTapGuard;
let initGlobalGhostTap;
let initGlobalOverlayEsc;
let bank;
let getHasOpenedSaveSlot;
let setHasOpenedSaveSlot;
let ensureStorageDefaults;
let ensureMultiplierDefaults;
let getActiveSlot;
let setSavedArea;
let getSavedArea;
let initGameProgressBar;
let initSurgeEffects;
let refreshSurgeMultiplierCache;
let getUpgAreaKey;
let computeUpgradeEffects;
let syncCurrencyMultipliersFromUpgrades;
let registerXpUpgradeEffects;
let initXpSystem;
let initDpSystem;
let syncCoinMultiplierWithXpLevel;
let onUpgradesChanged;
let registerPreloadedAudio;
let initPopups;
let installSuspendSafeguards;
let restoreSuspendBackup;
let markProgressDirty;
let flushBackupSnapshot;

let scrapHudListenerBound = false;
function updateScrapHudCounter() {
  if (!bank) return;
  const amountEl = document.querySelector('.hud-top .scrap-amount');
  if (!amountEl) return;

  let formatted = '0';
  try {
    formatted = bank.scrap?.fmt?.(bank.scrap.value) ?? '0';
  } catch {}

  if (String(formatted).includes('<span')) {
    amountEl.innerHTML = formatted;
  } else {
    amountEl.textContent = formatted;
  }
}
function initScrapHudCounter() {
  updateScrapHudCounter();
  if (scrapHudListenerBound || typeof window === 'undefined') return;
  scrapHudListenerBound = true;
  window.addEventListener('currency:change', (event) => {
    if (event?.detail?.key !== 'scrap') return;
    updateScrapHudCounter();
  });
  window.addEventListener('saveSlot:change', updateScrapHudCounter);
}

let initResetSystemGame;
let initMutationSystem;
let getMutationCoinSprite;
let onMutationChangeGame;
let getMutationState;
let setDebugPanelAccess;
let applyStatMultiplierOverride;
let startGameLoop;
let registerTick;
let registerFrame;
let notifyGameSessionStarted;
let ensureGameDom;
let waterSystem;

// Store unsubscribe functions for water system to avoid duplicate listeners
let waterTickUnsub = null;
let waterFrameUnsub = null;

export let activePlaytime = 0;
export let coinsCollected = 0;
window.coinsCollected = coinsCollected;
let activePlaytimeUnsub = null;
let activePlaytimeStorageAccumulator = 0;

let unpauseNotifications = null;
const pendingPreloadedAudio = [];

function applyPendingSlotWipe() {
  let slotStr;
  try {
    slotStr = localStorage.getItem('ccc:pendingSlotWipe');
  } catch {
    slotStr = null;
  }
  if (!slotStr) return;

  const slot = Number(slotStr);
  const suffix = `:${slot}`;
  const toRemove = [];

  try {
    const storage = localStorage;
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && key.startsWith('ccc:') && key.endsWith(suffix)) {
        toRemove.push(key);
      }
    }

    toRemove.forEach(k => {
      try { localStorage.removeItem(k); } catch {}
    });

    // Remove the flag so it only executes once
    try { localStorage.removeItem('ccc:pendingSlotWipe'); } catch {}
  } catch {
    try { localStorage.removeItem('ccc:pendingSlotWipe'); } catch {}
  }
}

function disableMobileZoomGestures() {
  if (!IS_MOBILE) return;

  let lastTouchEnd = 0;
  const TOUCH_DELAY_MS = 350;

  document.addEventListener('touchend', (event) => {
    const now = performance.now();
    if (now - lastTouchEnd <= TOUCH_DELAY_MS) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });

  document.addEventListener('gesturestart', (event) => {
    event.preventDefault();
  }, { passive: false });

  document.addEventListener('dblclick', (event) => {
    event.preventDefault();
  }, { passive: false });
}

disableMobileZoomGestures();

export const AREAS = {
  MENU: 0,
  STARTER_COVE: 1,
  UNDERWATER_CAVERN: 2,
};

export let currentArea = AREAS.MENU;
window.currentArea = currentArea;
let globalCursorTrail = null;

let fpsUnlockerRaf = null;
let fpsUnlockerCanvas = null;
let fpsUnlockerCtx = null;
let fpsUnlockerIsActive = false;

export function setFpsUnlockerActive(active) {
    fpsUnlockerIsActive = active;
    if (active) {
        if (!fpsUnlockerCanvas) {
            fpsUnlockerCanvas = document.createElement('canvas');
            fpsUnlockerCanvas.width = 300;
            fpsUnlockerCanvas.height = 300;
            Object.assign(fpsUnlockerCanvas.style, {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '300px',
                height: '300px',
                pointerEvents: 'none',
                opacity: '0.01',
                zIndex: '999999',
            });
            fpsUnlockerCtx = fpsUnlockerCanvas.getContext('webgl', { alpha: true, desynchronized: false });
            if (fpsUnlockerCtx) {
                document.body.appendChild(fpsUnlockerCanvas);
            }
        }
        if (!fpsUnlockerRaf) {
            fpsUnlockerFrame();
        }
    } else {
        if (fpsUnlockerRaf) {
            cancelAnimationFrame(fpsUnlockerRaf);
            fpsUnlockerRaf = null;
        }
        if (fpsUnlockerCanvas && fpsUnlockerCanvas.parentNode) {
            fpsUnlockerCanvas.parentNode.removeChild(fpsUnlockerCanvas);
            fpsUnlockerCanvas = null;
            fpsUnlockerCtx = null;
        }
    }
}

function fpsUnlockerFrame() {
    if (!fpsUnlockerIsActive || !fpsUnlockerCtx) return;
    fpsUnlockerCtx.clearColor(0, 0, 0, Math.random() > 0.5 ? 0.01 : 0.02);
    fpsUnlockerCtx.clear(fpsUnlockerCtx.COLOR_BUFFER_BIT);
    fpsUnlockerRaf = requestAnimationFrame(fpsUnlockerFrame);
}


let currentMusic = null;
let spawner = null;
let ucSpawner = null;
let cleanupUpgradesListener = null;

/* ---------------------------
   LOADER UI (immediate black + progress)
----------------------------*/
const nextFrame = () => new Promise(r => requestAnimationFrame(r));
const twoFrames = async () => { await nextFrame(); await nextFrame(); };
function showLoader(text = 'Loading assets...', onSkip) {
  let root = document.getElementById('boot-loader');
  if (!root) {
    root = document.createElement('div');
    root.id = 'boot-loader';
    root.className = 'loading-screen';
    document.body.appendChild(root);
  }

  root.innerHTML = '';
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    background: '#000',
    color: '#fff',
    display: 'grid',
    placeItems: 'center',
    zIndex: '2147483647',
    opacity: '1', 
    transition: 'opacity 0.4s ease',
  });

  const wrap = document.createElement('div');
  wrap.style.textAlign = 'center';
  wrap.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';

  const label = document.createElement('div');
  label.textContent = text;
  Object.assign(label.style, {
    fontSize: 'clamp(16px, 2.4vw, 22px)',
    letterSpacing: '.04em',
    opacity: '.92',
  });

  const bar = document.createElement('div');
  Object.assign(bar.style, {
    width: 'min(420px, 70vw)',
    height: '10px',
    background: 'rgba(255,255,255,.15)',
    borderRadius: '999px',
    margin: '12px auto 6px',
    overflow: 'hidden',
  });

  const fill = document.createElement('div');
  Object.assign(fill.style, {
    width: '0%',
    height: '100%',
    background: '#fff',
    transform: 'translateZ(0)',
    transition: 'width .15s linear',
  });

  const pct = document.createElement('div');
  pct.textContent = '0%';
  Object.assign(pct.style, { fontSize: '12px', opacity: '.85' });

  bar.appendChild(fill);
  wrap.append(label, bar, pct);
  root.appendChild(wrap);

  const stuckMsg = document.createElement('div');
  stuckMsg.textContent = 'If progress bar is stuck, try reloading the page.';
  Object.assign(stuckMsg.style, {
    marginTop: '16px',
    fontSize: '14px',
    opacity: '0',
    transition: 'opacity 0.5s ease',
    color: 'rgba(255,255,255,0.65)',
  });
  wrap.appendChild(stuckMsg);

  const stuckTimeout = setTimeout(() => {
    if (!root.__done) stuckMsg.style.opacity = '1';
  }, 25000);

  if (typeof onSkip === 'function') {
    const skipBtn = document.createElement('div');
    skipBtn.textContent = IS_MOBILE
      ? 'Tap here to skip loading now and load assets during gameplay'
      : 'Click here to skip loading now and load assets during gameplay';
    Object.assign(skipBtn.style, {
      marginTop: '24px',
      fontSize: '14px',
      color: '#888',
      textDecoration: 'underline',
      cursor: 'pointer',
      opacity: '0.9',
    });
    skipBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (root.__skipped) return;
      root.__skipped = true;
      if (root.__pct) root.__pct.textContent = 'Loading skipped';
      if (root.__label) root.__label.textContent = 'Loading skipped';
      skipBtn.textContent = 'Loading skipped';
      skipBtn.style.textDecoration = 'none';
      skipBtn.style.cursor = 'default';
      onSkip();
    });
    wrap.appendChild(skipBtn);
  }

  root.__mountedAt = performance.now();
  root.__done = false;
  root.__wrap = wrap;
  root.__bar = bar;
  root.__fill = fill;
  root.__pct = pct;
  root.__label = label;
  root.__stuckMsg = stuckMsg;
  root.__stuckTimeout = stuckTimeout;
  return root;
}

function setLoaderProgress(loaderEl, fraction) {
  if (!loaderEl || !loaderEl.__fill || !loaderEl.__pct) return;
  if (loaderEl.__skipped) return;
  const f = Math.max(0, Math.min(1, fraction || 0));
  const pct = Math.round(f * 100);
  loaderEl.__fill.style.width = pct + '%';
  loaderEl.__pct.textContent = pct + '%';
}

function finishAndHideLoader(loaderEl, onFadeStart, finishedText, dwellMs = 500) {
  if (!loaderEl || loaderEl.__done) return;
  loaderEl.__done = true;

  if (loaderEl.__label) {
    if (finishedText) {
      loaderEl.__label.textContent = finishedText;
    } else {
      loaderEl.__label.textContent = loaderEl.__skipped
        ? 'Loading Skipped'
        : 'Finished loading assets';
    }
  }
  loaderEl.offsetHeight;

  setTimeout(async () => {
    if (typeof onFadeStart === 'function') {
      try { onFadeStart(); } catch (e) { console.error(e); }
    }
    await twoFrames();
    loaderEl.style.opacity = '0';
    const onEnd = () => {
      loaderEl.remove();
      document.documentElement.classList.remove('booting');
    };
    loaderEl.addEventListener('transitionend', onEnd, { once: true });
    setTimeout(onEnd, 450);
  }, dwellMs);
}

/* ---------------------------
   PRELOADERS
----------------------------*/
async function warmImage(url) {
  const img = new Image();
  img.src = url;

  try {
    if (img.decode) await img.decode();
  } catch (_) {
  }

  await new Promise((resolve) => {
    const ghost = document.createElement('img');
    ghost.src = url;
    ghost.alt = '';
    ghost.style.cssText =
      'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(ghost);
    requestAnimationFrame(() => { ghost.remove(); resolve(); });
  });
}

function preloadImages(sources, onEach) {
  return sources.map(src => new Promise(resolve => {
    const img = new Image();
    const done = () => { try { onEach?.(src); } catch {} resolve(src); };
    img.onload = done;
    img.onerror = done;
    img.src = src;
  }));
}

function preloadAudio(sources, onEach) {
  return sources.map(async url => {
    try {
        const { loadAudio } = await import('./util/audioManager.js');
        await loadAudio(url);
    } catch {}
    try { onEach?.(url); } catch {}
    return url;
  });
}

function preloadFonts(onEach) {
  if (document.fonts && document.fonts.ready) {
    return [document.fonts.ready.then(() => { try { onEach?.('fonts'); } catch {} })];
  }
  return [Promise.resolve().then(() => { try { onEach?.('fonts'); } catch {} })];
}

async function preloadAssetsWithProgress({ images = [], audio = [], fonts = true }, onProgress) {
  const total = images.length + audio.length + (fonts ? 1 : 0);
  if (total === 0) { onProgress?.(1); return; }
  let done = 0;
  const bump = () => { done++; onProgress?.(done / total); };

  const tasks = [
    ...preloadImages(images, bump),
    ...preloadAudio(audio, bump),
    ...(fonts ? preloadFonts(bump) : []),
  ];

  await Promise.all(tasks.map(p => p.catch(() => null)));
}

/* ---------------------------
   GAME AREA CONTROL
----------------------------*/
let delayAreaMusicForSaveSlotLoad = false;

function startAreaMusic(areaID, src, volume = 1.0) {
  const delay = delayAreaMusicForSaveSlotLoad;
  const startMusic = () => {
    if (currentArea !== areaID) return;
    currentMusic = playAudio(src, { loop: true, type: 'music', volume: volume });
    if (typeof unpauseNotifications === "function") unpauseNotifications();
  };

  if (!delay) {
    startMusic();
    return;
  }

  // Save-slot loads dismiss the "Loading game" screen immediately before entering
  // the saved area, so defer that area's music until the area has painted.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      setTimeout(startMusic, 200);
    });
  });
}

function enterAreaFromSaveSlot(areaID) {
  delayAreaMusicForSaveSlotLoad = true;
  try {
    enterArea(areaID);
  } finally {
    delayAreaMusicForSaveSlotLoad = false;
  }
}

export function enterArea(areaID) {
  if (currentArea === areaID) return;

  if (waterSystem && typeof waterSystem.clearSimulations === 'function') {
      waterSystem.clearSimulations();
  }

  if (globalCursorTrail) {
      try { globalCursorTrail.destroy(); } catch {}
      globalCursorTrail = null;
  }

  if (spawner && typeof spawner.stopAllWaveSounds === 'function') {
    spawner.stopAllWaveSounds();
    if (currentArea === AREAS.STARTER_COVE) {
      let cancelCount = 0;
      const spawnerToSilence = spawner;
      const cancelInterval = setInterval(() => {
        if (spawnerToSilence && typeof spawnerToSilence.stopAllWaveSounds === 'function') {
          spawnerToSilence.stopAllWaveSounds();
        }
        cancelCount++;
        if (cancelCount >= 10) {
          clearInterval(cancelInterval);
        }
      }, 50);
    }
  }

  if (currentMusic) {
    currentMusic.stop();
    currentMusic = null;
  }

  currentArea = areaID;
  window.currentArea = currentArea;
  if (typeof setSavedArea === 'function') {
    setSavedArea(areaID);
  }
  if (typeof refreshButtonVisibility === "function") {
    refreshButtonVisibility();
  }


  const menuRoot = document.querySelector('.menu-root');

  if (areaID !== AREAS.MENU) {
      if (menuRoot) {
        menuRoot.style.display = 'none';
      }
      document.body.classList.remove('menu-bg');

      // Config for game DOM
      const FG_LAYER_COUNT = 1;
      const FG_START_Z = 80;

      if (typeof ensureGameDom === 'function') {
        ensureGameDom(FG_LAYER_COUNT, FG_START_Z);
      }
      if (typeof initGameProgressBar === 'function') {
        initGameProgressBar();
      }

      const gameRoot = document.getElementById('game-root');
      if (gameRoot) {
        gameRoot.hidden = false;
        initHudButtons();
      }

      if (typeof initResetSystemGame === 'function') {
        try { initResetSystemGame(); } catch {}
      }

      if (typeof initMutationSystem === 'function') {
        try { initMutationSystem(); } catch {}
      }

      if (typeof initXpSystem === 'function') {
        try { initXpSystem(); } catch {}
      }
      if (typeof initDpSystem === 'function') {
        try { initDpSystem(); } catch {}
      }
      
      // Determine the correct playfield selector based on the active area
      let playfieldSelector = '.playfield';
      if (areaID === AREAS.STARTER_COVE) {
        //playfieldSelector = '.playfield';
      } else if (areaID === AREAS.UNDERWATER_CAVERN) {
        // Assuming cavern might have its own playfield class later, or we fallback
        // However we should probably just query the active area's playfield if we add wrapper classes later
      }
      // For now, let's keep it simple: 
      const playfield = document.querySelector('.playfield');
      if (playfield) {
          globalCursorTrail = createCursorTrail(playfield);
      }
  }

  if (!ucSpawner && typeof createUcSpawner === 'function') {
    ucSpawner = createUcSpawner({
      materialsHost: '.materials-layer',
      shouldAutoResume: () => currentArea === AREAS.UNDERWATER_CAVERN,
    });
    window.ucSpawner = ucSpawner;
    
    if (!window.ucPickupController) {
        const pickup = initUcPickup({ spawner: ucSpawner });
        window.ucPickupController = pickup;
        if (ucSpawner && typeof ucSpawner.setDependencies === 'function') {
            ucSpawner.setDependencies({
                collectBatch: pickup.collectBatch,
                getMagnetUnit: pickup.getMagnetUnitPx
            });
        }
    }
  }

    if (!spawner) {
      spawner = createSpawner({
        coinSrc: 'img/currencies/coin/coin.webp',
        coinSize: 40,
        initialRate: 1,
        surgeLifetimeMs: 1800,
        surgeWidthVw: 22,
        initialBurst: 0,
        shouldAutoResume: () => currentArea === AREAS.STARTER_COVE,
      });
      window.spawner = spawner;
      const applyMutationSprite = () => {
        if (!spawner || typeof spawner.setCoinSprite !== 'function') return;
        try { spawner.setCoinSprite(getMutationCoinSprite?.()); } catch {}
      };
      applyMutationSprite();
      onMutationChangeGame?.(applyMutationSprite);
      const pickup = initCoinPickup({ spawner }); // uses default playfield
      window.coinPickupController = pickup;
      if (spawner && typeof spawner.setDependencies === 'function') {
          spawner.setDependencies({
              collectBatch: pickup.collectBatch,
              getMagnetUnit: pickup.getMagnetUnitPx
          });
      }
              const applyUpgradesToSpawner = () => {
              try {
                      const areaKey = getUpgAreaKey();
                      const eff = computeUpgradeEffects(areaKey);
                      if (spawner && eff?.coinsPerSecondMult) {
                        let rate = 1 * eff.coinsPerSecondMult;
                        if (typeof applyStatMultiplierOverride === "function") {
                           const override = applyStatMultiplierOverride("spawnRate", rate);
                           try {
                               if (override && typeof override.toScientific === "function") {
                                   rate = Number(override.toScientific(6));
                               } else {
                                   rate = Number(override);
                               }
                           } catch {}
                        }
                        if (Number.isFinite(rate)) {
                            spawner.setRate(rate);
                        }
                      }
                      if (ucSpawner) {
                        let rate = 0.2;
                        if (typeof applyStatMultiplierOverride === "function") {
                           const override = applyStatMultiplierOverride("materialSpawnRate", rate);
                           try {
                               if (override && typeof override.toScientific === "function") {
                                   rate = Number(override.toScientific(6));
                               } else {
                                   rate = Number(override);
                               }
                           } catch {}
                        }
                        if (Number.isFinite(rate)) {
                            ucSpawner.setRate(rate);
                        }
                      }
                } catch {}
              };
              applyUpgradesToSpawner();
              if (typeof cleanupUpgradesListener === 'function') {
                  try { cleanupUpgradesListener(); } catch {}
              }
              cleanupUpgradesListener = onUpgradesChanged(applyUpgradesToSpawner);
              if (typeof window !== 'undefined') {
                 window.addEventListener('debug:change', applyUpgradesToSpawner);
              }

    }
  switch (areaID) {
    case AREAS.STARTER_COVE: {
      setFpsUnlockerActive(false);
      const materialsLayer = document.getElementById('materials-layer');
      if (materialsLayer) materialsLayer.style.display = 'none';
      const coinsLayer = document.getElementById('coins-layer');
      if (coinsLayer) coinsLayer.style.display = '';
      const scrapCounter = document.querySelector('.scrap-counter');
      if (scrapCounter) scrapCounter.style.display = 'none';
      const coinCounter = document.querySelector('.coin-counter');
      if (coinCounter) coinCounter.style.display = '';
      
      const gRoot = document.getElementById('game-root');
      if (gRoot) {
          gRoot.classList.remove('area-cavern');
          gRoot.classList.add('area-cove');
      }
	  
      syncXpMpHudLayout();
      if (typeof initMutationSystem === 'function') {
        try { initMutationSystem(); } catch {}
      }
      if (typeof initXpSystem === 'function') {
        try { initXpSystem(); } catch {}
      }
      if (typeof initDpSystem === 'function') {
        try { initDpSystem(); } catch {}
      }
	  
      startAreaMusic(AREAS.STARTER_COVE, 'sounds/The_Cove.ogg');

      // Config for water layers
      const FG_LAYER_COUNT = 1;

      // Initialize Water System
      if (waterSystem) {

         
        waterSystem.init('water-background', 'water-foreground', FG_LAYER_COUNT);
        
        // Unregister old listeners if they exist to prevent leaks
        if (waterTickUnsub) {
            try { waterTickUnsub(); } catch {}
            waterTickUnsub = null;
        }
        if (waterFrameUnsub) {
            try { waterFrameUnsub(); } catch {}
            waterFrameUnsub = null;
        }
        
        // Register update loop (simulation)
        if (typeof registerTick === 'function') {
            waterTickUnsub = registerTick((dt) => waterSystem.update(dt));
        }
        
        // Register render loop (visuals)
        if (typeof registerFrame === 'function') {
            waterFrameUnsub = registerFrame((totalTime, dt) => waterSystem.render(totalTime, dt));
        }
      }

      const gameRoot = document.getElementById('game-root');
      if (gameRoot) {
        const hudTop = gameRoot.querySelector('.hud-top');
        if (hudTop) hudTop.style.display = '';
        
        const goalProgressBar = gameRoot.querySelector('.goal-progress-bar');
        if (goalProgressBar) goalProgressBar.style.display = '';

        if (waterSystem) {
            // Delay resize to ensure DOM layout is updated after unhiding
            requestAnimationFrame(() => waterSystem.resize());
        }
      }



      const waterBg = document.getElementById('water-background');
      const waterFg = document.getElementById('water-foreground');
      if (waterBg) waterBg.style.display = '';
      if (waterFg) waterFg.style.display = '';

      document.body.style.backgroundColor = '';

      if (currentArea === AREAS.STARTER_COVE && spawner) {
          spawner.start();
      }
      if (ucSpawner) {
          ucSpawner.stop();
          if (typeof ucSpawner.clearPlayfield === "function") ucSpawner.clearPlayfield();
      }
      break;
    }

    case AREAS.UNDERWATER_CAVERN: {
      setFpsUnlockerActive(true);
      const materialsLayer = document.getElementById('materials-layer');
      if (materialsLayer) materialsLayer.style.display = '';
      const coinsLayer = document.getElementById('coins-layer');
      if (coinsLayer) coinsLayer.style.display = 'none';
      const scrapCounter = document.querySelector('.scrap-counter');
      if (scrapCounter) scrapCounter.style.display = '';
	  updateScrapHudCounter();
      const coinCounter = document.querySelector('.coin-counter');
      if (coinCounter) coinCounter.style.display = 'none';
      
      const gRoot = document.getElementById('game-root');
      if (gRoot) {
          gRoot.classList.remove('area-cove');
          gRoot.classList.add('area-cavern');
      }
	  syncXpMpHudLayout();
	  
      if (menuRoot) {
        menuRoot.style.display = 'none';
      }
      document.body.classList.remove('menu-bg');
      
      const gameRoot = document.getElementById('game-root');
      if (gameRoot) {
        gameRoot.hidden = false;
        
        const hudTop = gameRoot.querySelector('.hud-top');
        if (hudTop) hudTop.style.display = '';
        
      }
      
      const waterBg = document.getElementById('water-background');
      const waterFg = document.getElementById('water-foreground');
      if (waterBg) waterBg.style.display = 'none';
      if (waterFg) waterFg.style.display = 'none';

      if (waterTickUnsub) { try { waterTickUnsub(); } catch {} waterTickUnsub = null; }
      if (waterFrameUnsub) { try { waterFrameUnsub(); } catch {} waterFrameUnsub = null; }

      
      document.body.style.backgroundColor = '#000';
      
      startAreaMusic(AREAS.UNDERWATER_CAVERN, 'sounds/Underwater_Cavern.ogg', 0.75);
      
      if (spawner) { spawner.stop(); if (typeof spawner.clearPlayfield === "function") spawner.clearPlayfield(); }
      if (currentArea === AREAS.UNDERWATER_CAVERN && ucSpawner) {
          ucSpawner.start();
      }

      break;
    }

    case AREAS.MENU: {
      setFpsUnlockerActive(false);
      if (menuRoot) {
        menuRoot.style.display = '';
        menuRoot.removeAttribute('aria-hidden');
      }
      const gameRoot = document.getElementById('game-root');
      if (gameRoot) gameRoot.hidden = true;

      if (waterTickUnsub) { try { waterTickUnsub(); } catch {} waterTickUnsub = null; }
      if (waterFrameUnsub) { try { waterFrameUnsub(); } catch {} waterFrameUnsub = null; }

      if (spawner) { spawner.stop(); if (typeof spawner.clearPlayfield === "function") spawner.clearPlayfield(); }
      if (ucSpawner) { ucSpawner.stop(); if (typeof ucSpawner.clearPlayfield === "function") ucSpawner.clearPlayfield(); }
      break;
    }
  }

  try {
    window.dispatchEvent(new CustomEvent('menu:visibilitychange', {
      detail: { visible: areaID === AREAS.MENU },
    }));
  } catch {}
}

/* ---------------------------
   BOOT FLOW
----------------------------*/
document.addEventListener('DOMContentLoaded', async () => {
  let resolveSkip;
  const skipPromise = new Promise(resolve => { resolveSkip = resolve; });

  const loader = showLoader('Loading assets...', resolveSkip);

  await nextFrame();
  
  // Initialize audio early
  const { initAudio } = await import('./util/audioManager.js');
  initAudio();

  const modulePromise = Promise.all([
    import('./util/slots.js'),
    import('./game/spawner.js'),
    import('./game/ucSpawner.js'),
    import('./game/coinPickup.js'),
    import('./ui/hudButtons.js'),
    import('./util/storage.js'),
    import('./util/saveIntegrity.js'),
    import('./game/upgrades.js'),
    import('./game/upgradeEffects.js'),
    import('./util/audioCache.js'),
    import('./game/xpSystem.js'),
    import('./game/dpSystem.js'),
    import('./ui/merchantTabs/resetTab.js'),
    import('./game/mutationSystem.js'),
    import('./ui/popups.js'),
    import('./util/suspendSafeguard.js'),
    import('./util/ghostTapGuard.js'),
    import('./util/globalOverlayEsc.js'),
    import('./util/debugPanel.js'),
    import('./game/gameLoop.js'),
    import('./game/offlinePanel.js'),
    import('./ui/merchantTabs/workshopTab.js'),
    import('./game/automationEffects.js'),
    import('./game/domInit.js'),
    import('./ui/gameProgressBar.js'),
    import('./game/surgeEffects.js'),
    import('./game/webgl/waterSystem.js'),
    import('./ui/merchantTabs/labTab.js'),
    import('./util/fpsTracker.js'),
    import('./ui/notifications.js'),
    import('./ui/merchantTabs/flowTab.js'),
    import('./ui/sas/mainSettingsOverlay.js'),
    import('./ui/sas/performanceOverlay.js'),
    import('./ui/sas/multipliersOverlay.js'),
  ]);

  const ASSET_MANIFEST = {
  images: [
    'img/currencies/book/book.webp',
    'img/currencies/book/book_base.webp',
    'img/currencies/book/book_plus_base.webp',
    'img/currencies/coin/coin.webp',
    'img/currencies/coin/coin_base.webp',
    'img/currencies/coin/coin_plus_base.webp',
    'img/currencies/dna/dna.webp',
    'img/currencies/dna/dna_base.webp',
    'img/currencies/dna/dna_plus_base.webp',
    'img/currencies/gear/gear.webp',
    'img/currencies/gear/gear_base.webp',
    'img/currencies/gear/gear_plus_base.webp',
    'img/currencies/gold/gold.webp',
    'img/currencies/gold/gold_base.webp',
    'img/currencies/gold/gold_plus_base.webp',
    'img/currencies/magic/magic.webp',
    'img/currencies/magic/magic_base.webp',
    'img/currencies/magic/magic_plus_base.webp',
    'img/currencies/rainbow_gem.webp',
	'img/currencies/scrap/scrap.webp',
	'img/currencies/scrap/scrap_base.webp',
	'img/currencies/scrap/scrap_plus_base.webp',
    'img/currencies/void_gem.webp',
    'img/currencies/wave/wave.webp',
    'img/currencies/wave/wave_base.webp',
    'img/currencies/wave/wave_plus_base.webp',
    'img/lab_icons/coin_val0.webp',
    'img/lab_icons/dna_val0.webp',
    'img/lab_icons/fp_val0.webp',
    'img/lab_icons/gold_val0.webp',
    'img/lab_icons/magic_val0.webp',
    'img/lab_icons/tsunami_exponent_buff.webp',
    'img/lab_icons/wave_val0.webp',
	'img/materials/stone.webp',
	'img/materials/copper.webp',
	'img/materials/iron.webp',
	'img/materials/pure_gold.webp',
	'img/materials/diamond.webp',
	'img/materials/emerald.webp',
	'img/materials/ruby.webp',
	'img/materials/obsidian.webp',
	'img/materials/unobtainium.webp',
	'img/materials/prismatium.webp',
    'img/misc/a_useless_experiment.webp',
    'img/misc/arrow_left.webp',
    'img/misc/arrow_left_thin.webp',
    'img/misc/arrow_right.webp',
    'img/misc/arrow_right_thin.webp',
    'img/misc/binary_flow.webp',
    'img/misc/bomb.webp',
    'img/misc/evolve_achievement_icon.webp',
    'img/misc/evolve_ready.webp',
    'img/misc/experiment.webp',
    'img/misc/experiment_plus_base.webp',
    'img/misc/forge.webp',
    'img/misc/forge_plus_base.webp',
    'img/misc/green_border.webp',
    'img/misc/i.webp',
    'img/misc/infuse.webp',
    'img/misc/infuse_base.webp',
    'img/misc/infuse_plus_base.webp',
    'img/misc/largest_coin_plus_base.webp',
    'img/misc/life.webp',
    'img/misc/locked.webp',
    'img/misc/locked_base.webp',
	'img/misc/locked_plus_base.webp',
    'img/misc/maxed.webp',
    'img/misc/merchant.webp',
	'img/misc/miner.webp',
    'img/misc/mysterious.webp',
	'img/misc/mysterious_plus_base.webp',
	'img/misc/pickaxe.webp',
    'img/misc/safety_first.webp',
    'img/misc/semi_automatic.webp',
    'img/misc/surge.webp',
    'img/misc/surge_plus_base.webp',
    'img/misc/that_was_unexpected.webp',
    'img/sc_upg_icons/autobuy_book.webp',
    'img/sc_upg_icons/autobuy_coin.webp',
    'img/sc_upg_icons/autobuy_dna.webp',
    'img/sc_upg_icons/autobuy_evolve.webp',
    'img/sc_upg_icons/autobuy_gold.webp',
    'img/sc_upg_icons/autobuy_magic.webp',
    'img/sc_upg_icons/autobuy_workshop_level.webp',
    'img/sc_upg_icons/book_val1.webp',
    'img/sc_upg_icons/coin_val1.webp',
    'img/sc_upg_icons/coin_val2.webp',
    'img/sc_upg_icons/coin_val3.webp',
    'img/sc_upg_icons/coin_val_dna.webp',
    'img/sc_upg_icons/coin_val_hm1.webp',
    'img/sc_upg_icons/coin_val_hm2.webp',
    'img/sc_upg_icons/coin_val_hm3.webp',
    'img/sc_upg_icons/dna_val_dna.webp',
    'img/sc_upg_icons/effective_auto_collect.webp',
    'img/sc_upg_icons/faster_coins1.webp',
    'img/sc_upg_icons/faster_coins2.webp',
    'img/sc_upg_icons/faster_coins3.webp',
    'img/sc_upg_icons/fp_val_hm.webp',
    'img/sc_upg_icons/gold_val_dna.webp',
    'img/sc_upg_icons/magic_val_dna.webp',
    'img/sc_upg_icons/magnet.webp',
    'img/sc_upg_icons/mp_val1.webp',
    'img/sc_upg_icons/mp_val2.webp',
    'img/sc_upg_icons/mp_val_hm.webp',
    'img/sc_upg_icons/xp_val1.webp',
    'img/sc_upg_icons/xp_val2.webp',
    'img/sc_upg_icons/xp_val3.webp',
    'img/sc_upg_icons/xp_val_dna.webp',
    'img/sc_upg_icons/xp_val_hm.webp',
	'img/stats/dp/dp.webp',
	'img/stats/dp/dp_base.webp',
	'img/stats/dp/dp_plus_base.webp',
    'img/stats/fp/fp.webp',
    'img/stats/fp/fp_base.webp',
    'img/stats/fp/fp_plus_base.webp',
    'img/stats/mp/mp.webp',
    'img/stats/mp/mp_base.webp',
    'img/stats/mp/mp_plus_base.webp',
    'img/stats/rp/rp.webp',
    'img/stats/rp/rp_base.webp',
    'img/stats/rp/rp_plus_base.webp',
    'img/stats/xp/xp.webp',
    'img/stats/xp/xp_base.webp',
    'img/stats/xp/xp_plus_base.webp',
    'img/waterwheels/waterwheel_coin.webp',
    'img/waterwheels/waterwheel_gold.webp',
    'img/waterwheels/waterwheel_magic.webp',
    'img/waterwheels/waterwheel_xp.webp',
    ...Array.from({ length: 25 }, (_, i) => `img/mutations/m${i + 1}.webp`)
  ],
  audio: [
    'sounds/Secret_Boss_Fight.ogg',
    'sounds/The_Cove.ogg',
	'sounds/Underwater_Cavern.ogg',
	'sounds/area_connector.ogg',
    'sounds/bomb_column_construction.ogg',
    'sounds/boss_death.ogg',
    'sounds/coin_pickup.ogg',
    'sounds/coin_pickup_size1.ogg',
    'sounds/coin_pickup_size2.ogg',
    'sounds/coin_pickup_size3.ogg',
    'sounds/coin_pickup_size4.ogg',
    'sounds/coin_pickup_size5.ogg',
    'sounds/coin_pickup_size6.ogg',
    'sounds/evolve_upg.ogg',
    'sounds/experiment_reset.ogg',
    'sounds/explosion_long.ogg',
    'sounds/explosion_short.ogg',
    'sounds/forge_reset.ogg',
	'sounds/got_our_pickaxe_swinging_from_side_to_side.ogg',
    'sounds/heartbeat.ogg',
    'sounds/infuse_reset.ogg',
    'sounds/life_restored.ogg',
    'sounds/lightning_strike.ogg',
    'sounds/lightning_zap.ogg',
	'sounds/material_pickup.ogg',
    'sounds/merchant_typing.ogg',
    'sounds/notif_ding.ogg',
    'sounds/projectile_spawn.ogg',
    'sounds/purchase_upg.ogg',
    'sounds/ruby_coin_finished.ogg',
    'sounds/ruby_coin_number_punch.ogg',
    'sounds/ruby_coin_swipe.ogg',
    'sounds/stop_right_there.ogg',
    'sounds/surge_reset.ogg',
    'sounds/tsu_beacon_hum.ogg',
    'sounds/tsu_beacon_spawn.ogg',
    'sounds/tsu_explosion.ogg',
    'sounds/tsu_rumble.ogg',
    'sounds/tsu_storm_ambience.ogg',
    'sounds/void_buildup.ogg',
    'sounds/warp.ogg',
    'sounds/wave_spawn.ogg',
	'sounds/you_will_die_there_is_nowhere_to_run.ogg'
  ]
  };

  let progress = 0;
  const assetsPromise = preloadAssetsWithProgress(ASSET_MANIFEST, f => {
    progress = f;
    setLoaderProgress(loader, f);
  }).then(() => Promise.all([ // fixes some image preload issue on mobile
    warmImage('img/currencies/coin/coin_plus_base.webp'),
    warmImage('img/stats/xp/xp_plus_base.webp'),
    warmImage('img/stats/mp/mp_plus_base.webp'),
  ]));

  const [
    slotsModule,
    spawnerModule,
    ucSpawnerModule,
    coinPickupModule,
    hudButtonsModule,
    storageModule,
    saveIntegrityModule,
    upgradesModule,
    upgradeEffectsModule,
    audioCacheModule,
    xpModule,
    dpModule,
    resetModule,
    mutationModule,
    popupModule,
    safetyModule,
    guardModule,
    escModule,
    debugPanelModule,
    gameLoopModule,
    offlinePanelModule,
    workshopTabModule,
    automationEffectsModule,
    domInitModule,
    gameProgressBarModule,
    surgeEffectsModule,
    waterSystemModule,
    labTabModule,
    fpsTrackerModule,
    notificationModule,
    flowTabModule,
    mainSettingsOverlayModule,
  ] = await modulePromise;

  ({ initSlots } = slotsModule);
  ({ createSpawner } = spawnerModule);
  ({ createUcSpawner } = ucSpawnerModule);
  ({ initCoinPickup, refreshCoinMultiplierCache, refreshMpValueMultiplierCache, updateMutationSnapshot } = coinPickupModule);
  ({ initHudButtons, refreshButtonVisibility } = hudButtonsModule);
  ({ bank, getHasOpenedSaveSlot, setHasOpenedSaveSlot, ensureStorageDefaults, notifyGameSessionStarted, ensureMultiplierDefaults, getActiveSlot, setSavedArea, getSavedArea } = storageModule);
  initScrapHudCounter();
  void saveIntegrityModule;
  ({ getCurrentAreaKey: getUpgAreaKey, computeUpgradeEffects, onUpgradesChanged } = upgradesModule);
  ({ syncCurrencyMultipliersFromUpgrades, registerXpUpgradeEffects } = upgradeEffectsModule);
  ({ registerPreloadedAudio } = audioCacheModule);
  ({ initXpSystem, syncCoinMultiplierWithXpLevel } = xpModule);
  ({ initDpSystem } = dpModule);
  ({ initResetSystem: initResetSystemGame } = resetModule);
  ({ initMutationSystem, getMutationCoinSprite, onMutationChange: onMutationChangeGame, getMutationState } = mutationModule);
  ({ initPopups } = popupModule);
  ({ installSuspendSafeguards, restoreFromBackupIfNeeded: restoreSuspendBackup, markProgressDirty, flushBackupSnapshot } = safetyModule);
  ({ installGhostTapGuard, initGlobalGhostTap } = guardModule);
  ({ initGlobalOverlayEsc } = escModule);
  ({ setDebugPanelAccess, applyStatMultiplierOverride } = debugPanelModule);
  ({ startGameLoop, registerTick, registerFrame } = gameLoopModule);
  const { initOfflineTracker, processOfflineProgress } = offlinePanelModule;
  const { initWorkshopSystem } = workshopTabModule;
  const { initAutomationEffects } = automationEffectsModule;
  ({ ensureGameDom } = domInitModule);
  ({ initGameProgressBar } = gameProgressBarModule);
  ({ initSurgeEffects, refreshSurgeMultiplierCache } = surgeEffectsModule);
  ({ waterSystem } = waterSystemModule);
  const { initLabLogic } = labTabModule;
  const { initFpsTracker } = fpsTrackerModule;
  const { initNotifications, unpauseNotifications: _unpause, showNotification, showWelcomePopup } = notificationModule;
  const { initFlowSystem } = flowTabModule;
  unpauseNotifications = _unpause;

  window.bank = bank;
  window.unpauseNotifications = unpauseNotifications;
  window.showNotification = showNotification;

  // Global Audio Control for Events
  if (typeof window !== 'undefined') {
    window.addEventListener('audio:stopMusic', () => {
        if (currentMusic) {
            try { currentMusic.stop(); } catch {}
            currentMusic = null;
        }
    });

    window.addEventListener('audio:restartMusic', () => {
        if (currentMusic) {
            try { currentMusic.stop(); } catch {}
            currentMusic = null;
        }
        if (currentArea === AREAS.STARTER_COVE) {
            currentMusic = playAudio('sounds/The_Cove.ogg', { loop: true, type: 'music' });
        } else if (currentArea === AREAS.UNDERWATER_CAVERN) {
            currentMusic = playAudio('sounds/Underwater_Cavern.ogg', { loop: true, type: 'music', volume: 0.75 });
		}
    });
  }

  // No longer using pendingPreloadedAudio since audioManager handles buffering internally

  window.addEventListener('beforeunload', (e) => {
    if (window.spawner && typeof window.spawner.hasBigCoins === 'function' && window.spawner.hasBigCoins()) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
  });
  document.addEventListener('visibilitychange', () => {
    const hidden = document.hidden;
    setAudioSuspended(hidden);
    if (currentMusic && currentMusic.element) {
      if (hidden) {
        currentMusic.element.pause();
      } else {
        currentMusic.element.play().catch(() => {});
      }
    }

    if (!hidden && currentArea !== AREAS.MENU) {
      if (currentArea === AREAS.UNDERWATER_CAVERN) setFpsUnlockerActive(true);
    }
  });



  installGhostTapGuard?.();
  initGlobalGhostTap?.();
  initGlobalOverlayEsc?.();
  installSuspendSafeguards?.();
  if (typeof setDebugPanelAccess === 'function') {
    setDebugPanelAccess(DEBUG_PANEL_ACCESS);
    window.setDebugPanelAccess = setDebugPanelAccess;
  }

  try {
    await restoreSuspendBackup?.();
  } catch {}

  await Promise.race([assetsPromise, skipPromise]);

  await twoFrames();
  document.documentElement.classList.remove('booting');

  await nextFrame();

  finishAndHideLoader(loader);
  
  // Ensure we start with no active slot so game loops don't run for a lingering slot ID
  try {
    if (typeof storageModule.clearActiveSlot === 'function') {
      storageModule.clearActiveSlot();
    } else if (storageModule && storageModule.KEYS && storageModule.KEYS.SAVE_SLOT) {
      localStorage.removeItem(storageModule.KEYS.SAVE_SLOT);
    }
  } catch {}

  startGameLoop();
  initOfflineTracker(() => currentArea !== AREAS.MENU);

  try { initWorkshopSystem(); } catch(e) { console.error('Workshop init failed', e); }
  try { initAutomationEffects(); } catch(e) { console.error('Automation init failed', e); }
  try { initSurgeEffects(); } catch(e) { console.error('Surge effects init failed', e); }
  try { initLabLogic(); } catch(e) { console.error('Lab system init failed', e); }
  try { initFpsTracker(); } catch(e) { console.error('FPS tracker init failed', e); }
  try { initFlowSystem(); } catch(e) { console.error('Flow system init failed', e); }
  
  applyPendingSlotWipe();
  ensureStorageDefaults();
  markProgressDirty?.('ensure-defaults');
  initPopups();
  initNotifications();
  
  if (mainSettingsOverlayModule && mainSettingsOverlayModule.initUIHiding) {
    mainSettingsOverlayModule.initUIHiding();
  }

  registerXpUpgradeEffects();
  const titleEl = document.getElementById('panel-title');
  if (getHasOpenedSaveSlot()) {
    document.body.classList.add('has-opened');
    if (titleEl) titleEl.style.opacity = '0';
  } else {
    if (titleEl) titleEl.style.opacity = '1';
  }

  initSlots(async () => {
    const slot = getActiveSlot();
    try {
      const stored = localStorage.getItem(`ccc:activePlaytime:${slot}`);
      activePlaytime = stored ? Number(stored) : 0;
      window.activePlaytime = activePlaytime;
    } catch {
      activePlaytime = 0;
      window.activePlaytime = activePlaytime;
    }

    try {
      const storedCoins = localStorage.getItem(`ccc:coinsCollected:${slot}`);
      coinsCollected = storedCoins ? Number(storedCoins) : 0;
      window.coinsCollected = coinsCollected;
    } catch {
      coinsCollected = 0;
      window.coinsCollected = coinsCollected;
    }

    if (activePlaytimeUnsub) {
      activePlaytimeUnsub();
      activePlaytimeUnsub = null;
    }
    
    activePlaytimeStorageAccumulator = 0;
    if (typeof registerTick === 'function') {
      activePlaytimeUnsub = registerTick((dt) => {
        if (!document.hidden) {
          activePlaytimeStorageAccumulator += dt;
          if (activePlaytimeStorageAccumulator >= 1) {
            const wholeSeconds = Math.floor(activePlaytimeStorageAccumulator);
            activePlaytime += wholeSeconds;
            window.activePlaytime = activePlaytime;
            
            try {
              localStorage.setItem(`ccc:activePlaytime:${slot}`, String(activePlaytime));
            } catch {}
            activePlaytimeStorageAccumulator -= wholeSeconds;
          }
        }
      });
    }

    if (currentArea === AREAS.STARTER_COVE) return;
    setHasOpenedSaveSlot(true);
    document.body.classList.add('has-opened');
    if (titleEl) titleEl.style.opacity = '0';

    const loader = showLoader('Loading game...');
    setFpsUnlockerActive(true);
    const stepDelay = () => new Promise(r => setTimeout(r, 120));

    // Milestone 1: Multipliers
    setLoaderProgress(loader, 0.2);
    await stepDelay();
    ensureMultiplierDefaults();
    
    refreshSurgeMultiplierCache();
    syncCurrencyMultipliersFromUpgrades();
    syncCoinMultiplierWithXpLevel(true);
    refreshCoinMultiplierCache();
    refreshMpValueMultiplierCache();
    updateMutationSnapshot(getMutationState());

    // Milestone 2: Offline Progress
    setLoaderProgress(loader, 0.4);
    await stepDelay();
    processOfflineProgress();

    // Milestone 3: Session Start
    setLoaderProgress(loader, 0.65);
    await stepDelay();
    notifyGameSessionStarted?.();

    // Milestone 4: Finalizing
    setLoaderProgress(loader, 0.9);
    await stepDelay();
    markProgressDirty?.('slot-entered');

    console.log(`# Debug Panel Access
To enable the in-game debug panel, enter the following code into the console:

\`setDebugPanelAccess(true)\`

To open the debug panel, simply press C on your keyboard.

This will allow you to view and modify game values for testing.

⚠️ Note:
ANY modification of stats, currencies, upgrade levels, or other save data through the debug panel will permanently mark the save slot as modified. If the slot is marked as modified, its shop button will permanently turn from a fresh green to a poopy brown color, which I like to call the poop-shop of shame.

Normal gameplay is unaffected unless you choose to modify values.`);

    setLoaderProgress(loader, 1);

    finishAndHideLoader(loader, () => {
      let areaToLoad = AREAS.STARTER_COVE;
      if (typeof getSavedArea === 'function') {
        const saved = getSavedArea();
        if (saved != null) areaToLoad = saved;
      }
      setFpsUnlockerActive(areaToLoad === AREAS.UNDERWATER_CAVERN);

      enterAreaFromSaveSlot(areaToLoad);
      setTimeout(() => {
        if (areaToLoad === AREAS.STARTER_COVE && window.spawner && typeof window.spawner.playEntranceWave === 'function') {
          window.spawner.playEntranceWave();
        }
        
        const slot = getActiveSlot();
        if (slot != null) {
          const welcomeKey = `ccc:welcome_shown:${slot}`;
          if (!localStorage.getItem(welcomeKey)) {
            localStorage.setItem(welcomeKey, 'true');
            showWelcomePopup(IS_MOBILE);
          }
        }
      }, 300);
    }, 'Finished loading game', 200);
  });

  if (typeof window !== 'undefined' && flushBackupSnapshot) {
    try {
      window.cccRequestBackup = () => flushBackupSnapshot('manual', { immediate: true });
    } catch {}
  }
});
