// js/main.js

import { playAudio, setAudioSuspended } from './util/audioManager.js';

export const DEBUG_PANEL_ACCESS = true; // I will change this to false for prod so the readme makes sense
export const IS_MOBILE = (() => {
  if (typeof window === 'undefined') return false;

  if (typeof window.IS_MOBILE !== 'undefined') {
    return !!window.IS_MOBILE;
  }

  const detected = window.matchMedia
    ? window.matchMedia('(pointer: coarse)').matches
    : 'ontouchstart' in window;
  window.IS_MOBILE = detected;
  return detected;
})();

let initSlots;
let createSpawner;
let initCoinPickup;
let initHudButtons;
let installGhostTapGuard;
let initGlobalGhostTap;
let initGlobalOverlayEsc;
let bank;
let getHasOpenedSaveSlot;
let setHasOpenedSaveSlot;
let ensureStorageDefaults;
let getUpgAreaKey;
let computeUpgradeEffects;
let initXpSystem;
let onUpgradesChanged;
let registerPreloadedAudio;
let initPopups;
let installSuspendSafeguards;
let restoreSuspendBackup;
let markProgressDirty;
let flushBackupSnapshot;
let initResetSystemGame;
let initMutationSystem;
let getMutationCoinSprite;
let onMutationChangeGame;
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
};

let currentArea = AREAS.MENU;
let currentMusic = null;
let spawner = null;
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

function finishAndHideLoader(loaderEl) {
  if (!loaderEl || loaderEl.__done) return;
  loaderEl.__done = true;

  const MIN_FINISHED_DWELL_MS = 500;
  if (loaderEl.__label) {
    loaderEl.__label.textContent = loaderEl.__skipped
      ? 'Loading Skipped'
      : 'Finished loading assets';
  }
  loaderEl.offsetHeight;

  setTimeout(() => {
    loaderEl.style.opacity = '0';
    const onEnd = () => {
      loaderEl.remove();
      document.documentElement.classList.remove('booting');
    };
    loaderEl.addEventListener('transitionend', onEnd, { once: true });
    setTimeout(onEnd, 450);
  }, MIN_FINISHED_DWELL_MS);
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
function enterArea(areaID) {
  if (currentArea === areaID) return;

  if (currentMusic) {
    currentMusic.stop();
    currentMusic = null;
  }

  currentArea = areaID;

  const menuRoot = document.querySelector('.menu-root');
  switch (areaID) {
    case AREAS.STARTER_COVE: {
      // Defer music to ensure the area is fully loaded/painted before playing.
      // Using setTimeout puts this in the next macrotask, after the rendering step.
      setTimeout(() => {
        if (currentArea === AREAS.STARTER_COVE) {
          currentMusic = playAudio('sounds/The_Cove.ogg', { loop: true });
        }
      }, 50);

      if (menuRoot) {
        menuRoot.style.display = 'none';
      }
      document.body.classList.remove('menu-bg');

      if (typeof ensureGameDom === 'function') {
        ensureGameDom();
      }

      // Initialize Water System
      if (waterSystem) {
        waterSystem.init('water-background', 'water-effects');
        
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
            waterFrameUnsub = registerFrame((totalTime) => waterSystem.render(totalTime));
        }
      }

      const gameRoot = document.getElementById('game-root');
      if (gameRoot) {
        gameRoot.hidden = false;
        if (waterSystem) {
            // Delay resize to ensure DOM layout is updated after unhiding
            requestAnimationFrame(() => waterSystem.resize());
        }
        initHudButtons();
      }

      if (typeof initResetSystemGame === 'function') {
        try { initResetSystemGame(); } catch {}
      }

      if (typeof initMutationSystem === 'function') {
        try { initMutationSystem(); } catch {}
      }

      if (!spawner) {
        spawner = createSpawner({
          coinSrc: 'img/currencies/coin/coin.webp',
          coinSize: 40,
          initialRate: 1,
          surgeLifetimeMs: 1800,
          surgeWidthVw: 22,
          initialBurst: 0,
        });
        window.spawner = spawner;
        const applyMutationSprite = () => {
          if (!spawner || typeof spawner.setCoinSprite !== 'function') return;
          try { spawner.setCoinSprite(getMutationCoinSprite?.()); } catch {}
        };
        applyMutationSprite();
        onMutationChangeGame?.(applyMutationSprite);
        const pickup = initCoinPickup({ spawner });
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
      if (typeof initXpSystem === 'function') {
        try { initXpSystem(); } catch {}
      }
      spawner.start();
      break;
    }

    case AREAS.MENU: {
      if (menuRoot) {
        menuRoot.style.display = '';
        menuRoot.removeAttribute('aria-hidden');
      }
      const gameRoot = document.getElementById('game-root');
      if (gameRoot) gameRoot.hidden = true;

      if (spawner) spawner.stop();
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
    import('./game/coinPickup.js'),
    import('./ui/hudButtons.js'),
    import('./util/storage.js'),
    import('./util/saveIntegrity.js'),
    import('./game/upgrades.js'),
    import('./util/audioCache.js'),
    import('./game/xpSystem.js'),
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
    import('./game/surgeEffects.js'),
    import('./game/webgl/waterSystem.js'),
  ]);

  const ASSET_MANIFEST = {
images: [
  // ==== img/currencies/book ====
  'img/currencies/book/book.webp',
  'img/currencies/book/book_base.webp',
  'img/currencies/book/book_plus_base.webp',

  // ==== img/currencies/coin ====
  'img/currencies/coin/coin.webp',
  'img/currencies/coin/coin_base.webp',
  'img/currencies/coin/coin_plus_base.webp',

  // ==== img/currencies/gear ====
  'img/currencies/gear/gear.webp',
  'img/currencies/gear/gear_base.webp',
  'img/currencies/gear/gear_plus_base.webp',

  // ==== img/currencies/gold ====
  'img/currencies/gold/gold.webp',
  'img/currencies/gold/gold_base.webp',
  'img/currencies/gold/gold_plus_base.webp',

  // ==== img/currencies/magic ====
  'img/currencies/magic/magic.webp',
  'img/currencies/magic/magic_base.webp',
  'img/currencies/magic/magic_plus_base.webp',
  
  // ==== img/currencies/wave ====
  'img/currencies/wave/wave.webp',
  'img/currencies/wave/wave_base.webp',
  'img/currencies/wave/wave_plus_base.webp',

  // ==== img/misc ====
  'img/misc/forge.webp',
  'img/misc/forge_plus_base.webp',
  'img/misc/infuse.webp',
  'img/misc/infuse_plus_base.webp',
  'img/misc/infuse_base.webp',
  'img/misc/surge.webp',
  'img/misc/surge_plus_base.webp',
  'img/misc/green_border.webp',
  'img/misc/locked.webp',
  'img/misc/locked_base.webp',
  'img/misc/maxed.webp',
  'img/misc/merchant.webp',
  'img/misc/mysterious.webp',

  // ==== img/mutations ====
  ...Array.from({ length: 25 }, (_, i) => `img/mutations/m${i + 1}.webp`),

  // ==== img/sc_upg_icons ====
  'img/sc_upg_icons/book_val1.webp',
  'img/sc_upg_icons/coin_val1.webp',
  'img/sc_upg_icons/coin_val2.webp',
  'img/sc_upg_icons/coin_val3.webp',
  'img/sc_upg_icons/faster_coins1.webp',
  'img/sc_upg_icons/faster_coins2.webp',
  'img/sc_upg_icons/faster_coins3.webp',
  'img/sc_upg_icons/magnet.webp',
  'img/sc_upg_icons/mp_val1.webp',
  'img/sc_upg_icons/mp_val2.webp',
  'img/sc_upg_icons/xp_val1.webp',
  'img/sc_upg_icons/xp_val2.webp',
  'img/sc_upg_icons/xp_val3.webp',
  'img/sc_upg_icons/xp_val_hm.webp',
  'img/sc_upg_icons/mp_val_hm.webp',
  'img/sc_upg_icons/effective_auto_collect.webp',
  'img/sc_upg_icons/coin_autobuy.webp',
  'img/sc_upg_icons/book_autobuy.webp',
  'img/sc_upg_icons/gold_autobuy.webp',
  'img/sc_upg_icons/magic_autobuy.webp',
  'img/sc_upg_icons/workshop_level_autobuy.webp',
  
  
  // ==== img/stats/mp ====
  'img/stats/mp/mp.webp',
  'img/stats/mp/mp_base.webp',
  'img/stats/mp/mp_plus_base.webp',

  // ==== img/stats/xp ====
  'img/stats/xp/xp.webp',
  'img/stats/xp/xp_base.webp',
  'img/stats/xp/xp_plus_base.webp',
],
    audio: [
      'sounds/coin_pickup.ogg',
      'sounds/wave_spawn.ogg',
      'sounds/merchant_typing.ogg',
      'sounds/purchase_upg.ogg',
	  'sounds/forge_reset.ogg',
	  'sounds/infuse_reset.ogg',
	  'sounds/surge_reset.ogg',
	  'sounds/evolve_upg.ogg',
	  'sounds/warp.ogg',
	  'sounds/coin_pickup_size1.ogg',
	  'sounds/coin_pickup_size2.ogg',
	  'sounds/coin_pickup_size3.ogg',
	  'sounds/coin_pickup_size4.ogg',
	  'sounds/coin_pickup_size5.ogg',
	  'sounds/coin_pickup_size6.ogg',
	  'sounds/lightning_strike.ogg',
	  'sounds/lightning_zap.ogg',
	  'sounds/The_Cove.ogg',
    ],
    fonts: true,
  };

  let progress = 0;
  const assetsPromise = preloadAssetsWithProgress(ASSET_MANIFEST, f => {
    progress = f;
    setLoaderProgress(loader, f);
  });

  const [
    slotsModule,
    spawnerModule,
    coinPickupModule,
    hudButtonsModule,
    storageModule,
    saveIntegrityModule,
    upgradesModule,
    audioCacheModule,
    xpModule,
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
    surgeEffectsModule,
    waterSystemModule,
  ] = await modulePromise;

  ({ initSlots } = slotsModule);
  ({ createSpawner } = spawnerModule);
  ({ initCoinPickup } = coinPickupModule);
  ({ initHudButtons } = hudButtonsModule);
  ({ bank, getHasOpenedSaveSlot, setHasOpenedSaveSlot, ensureStorageDefaults, notifyGameSessionStarted } = storageModule);
  void saveIntegrityModule;
  ({ getCurrentAreaKey: getUpgAreaKey, computeUpgradeEffects, onUpgradesChanged } = upgradesModule);
  ({ registerPreloadedAudio } = audioCacheModule);
  ({ initXpSystem } = xpModule);
  ({ initResetSystem: initResetSystemGame } = resetModule);
  ({ initMutationSystem, getMutationCoinSprite, onMutationChange: onMutationChangeGame } = mutationModule);
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
  const { initSurgeEffects } = surgeEffectsModule;
  ({ waterSystem } = waterSystemModule);

  window.bank = bank;

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

  await Promise.all([ // fixes some image preload issue on mobile
    warmImage('img/currencies/coin/coin_plus_base.webp'),
    warmImage('img/stats/xp/xp_plus_base.webp'),
	warmImage('img/stats/mp/mp_plus_base.webp'),
  ]);
  
  // Ensure we start with no active slot so game loops don't run for a lingering slot ID
  try {
    if (typeof storageModule.clearActiveSlot === 'function') {
      storageModule.clearActiveSlot();
    } else if (storageModule && storageModule.KEYS && storageModule.KEYS.SAVE_SLOT) {
      localStorage.removeItem(storageModule.KEYS.SAVE_SLOT);
    }
  } catch {}

  startGameLoop();
  initOfflineTracker(() => currentArea === AREAS.STARTER_COVE);

  try { initWorkshopSystem(); } catch(e) { console.error('Workshop init failed', e); }
  try { initAutomationEffects(); } catch(e) { console.error('Automation init failed', e); }
  try { initSurgeEffects(); } catch(e) { console.error('Surge effects init failed', e); }
  
  applyPendingSlotWipe();
  ensureStorageDefaults();
  markProgressDirty?.('ensure-defaults');
  initPopups();

  const titleEl = document.getElementById('panel-title');
  if (getHasOpenedSaveSlot()) {
    document.body.classList.add('has-opened');
    if (titleEl) titleEl.style.opacity = '0';
  } else {
    if (titleEl) titleEl.style.opacity = '1';
  }

  initSlots(() => {
    if (currentArea === AREAS.STARTER_COVE) return;
    setHasOpenedSaveSlot(true);
    document.body.classList.add('has-opened');
    if (titleEl) titleEl.style.opacity = '0';
    enterArea(AREAS.STARTER_COVE);
    processOfflineProgress();
    if (window.spawner && typeof window.spawner.playEntranceWave === 'function') {
      window.spawner.playEntranceWave();
    }
    notifyGameSessionStarted?.();
    markProgressDirty?.('slot-entered');
  });

  if (typeof window !== 'undefined' && flushBackupSnapshot) {
    try {
      window.cccRequestBackup = () => flushBackupSnapshot('manual', { immediate: true });
    } catch {}
  }
});
