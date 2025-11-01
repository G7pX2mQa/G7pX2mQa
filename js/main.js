// js/main.js

let initSlots;
let createSpawner;
let initCoinPickup;
let initHudButtons;
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

const IS_TOUCH_DEVICE = (window.matchMedia?.('(any-pointer: coarse)')?.matches) || ('ontouchstart' in window);

function disableMobileZoomGestures() {
  if (!IS_TOUCH_DEVICE) return;

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
let spawner = null;

/* ---------------------------
   LOADER UI (immediate black + progress)
----------------------------*/
const nextFrame = () => new Promise(r => requestAnimationFrame(r));
const twoFrames = async () => { await nextFrame(); await nextFrame(); };
function showLoader(text = 'Loading assets...') {
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
  }, 15000);

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
  const f = Math.max(0, Math.min(1, fraction || 0));
  const pct = Math.round(f * 100);
  loaderEl.__fill.style.width = pct + '%';
  loaderEl.__pct.textContent = pct + '%';
}

function finishAndHideLoader(loaderEl) {
  if (!loaderEl || loaderEl.__done) return;
  loaderEl.__done = true;

  const MIN_FINISHED_DWELL_MS = 500;
  if (loaderEl.__label) loaderEl.__label.textContent = 'Finished loading assets';
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
  return sources.map(url => new Promise(resolve => {
    const a = new Audio();
    const done = () => { try { onEach?.(url); } catch {} resolve(url); };
    a.addEventListener('canplaythrough', () => {
      registerPreloadedAudio?.(url, a);
      done();
    }, { once: true });
    a.addEventListener('error', done, { once: true });
    a.preload = 'auto';
    a.src = url;
    a.load?.();
  }));
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
  currentArea = areaID;

  const menuRoot = document.querySelector('.menu-root');
  switch (areaID) {
    case AREAS.STARTER_COVE: {
      if (menuRoot) {
        menuRoot.style.display = 'none';
      }
      document.body.classList.remove('menu-bg');
      const gameRoot = document.getElementById('game-root');
      if (gameRoot) {
        gameRoot.hidden = false;
        initHudButtons();
      }

      if (!spawner) {
        spawner = createSpawner({
          coinSrc: 'img/currencies/coin/coin.png',
          coinSize: 40,
          initialRate: 1,
          surgeLifetimeMs: 1800,
          surgeWidthVw: 22,
        });
        initCoinPickup();
                const applyUpgradesToSpawner = () => {
                try {
                        const areaKey = getUpgAreaKey();
                        const eff = computeUpgradeEffects(areaKey);
                        if (spawner && eff?.coinsPerSecondMult) {
                          spawner.setRate(1 * eff.coinsPerSecondMult);
                        }
                  } catch {}
                };
                applyUpgradesToSpawner();
                onUpgradesChanged(applyUpgradesToSpawner);

      }
      if (typeof initXpSystem === 'function') {
        try { initXpSystem(); } catch {}
      }
      spawner.start();
      if (spawner && typeof spawner.playEntranceWave === 'function') {
        spawner.playEntranceWave();
      }
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
}

/* ---------------------------
   BOOT FLOW
----------------------------*/
document.addEventListener('DOMContentLoaded', async () => {
  const loader = showLoader('Loading assets...');

  if (window.__MAINTENANCE__) {
    const message = window.__MAINTENANCE_MESSAGE || 'Update in progress. Please wait a few minutes.';
    if (loader?.__label) {
      loader.__label.textContent = message;
    }
    if (loader?.__stuckTimeout) {
      clearTimeout(loader.__stuckTimeout);
      loader.__stuckTimeout = null;
    }
    if (loader?.__pct) {
      loader.__pct.remove();
      loader.__pct = null;
    }
    if (loader?.__bar) {
      loader.__bar.remove();
      loader.__bar = null;
    }
    if (loader?.__fill) {
      loader.__fill = null;
    }
    if (loader?.__stuckMsg) {
      loader.__stuckMsg.remove();
      loader.__stuckMsg = null;
    }
    if (loader?.__wrap) {
      loader.__wrap.style.display = 'grid';
      loader.__wrap.style.gap = '18px';
    }
    document.documentElement.classList.remove('booting');
    return;
  }

  const [
    slotsModule,
    spawnerModule,
    coinPickupModule,
    hudButtonsModule,
    storageModule,
    upgradesModule,
    audioCacheModule,
    xpModule,
    popupModule,
  ] = await Promise.all([
    import('./util/slots.js'),
    import('./game/spawner.js'),
    import('./game/coinPickup.js'),
    import('./ui/hudButtons.js'),
    import('./util/storage.js'),
    import('./game/upgrades.js'),
    import('./util/audioCache.js'),
    import('./game/xpSystem.js'),
    import('./ui/popups.js'),
  ]);

  ({ initSlots } = slotsModule);
  ({ createSpawner } = spawnerModule);
  ({ initCoinPickup } = coinPickupModule);
  ({ initHudButtons } = hudButtonsModule);
  ({ bank, getHasOpenedSaveSlot, setHasOpenedSaveSlot, ensureStorageDefaults } = storageModule);
  ({ getCurrentAreaKey: getUpgAreaKey, computeUpgradeEffects, onUpgradesChanged } = upgradesModule);
  ({ registerPreloadedAudio } = audioCacheModule);
  ({ initXpSystem } = xpModule);
  ({ initPopups } = popupModule);

  window.bank = bank;

  const ASSET_MANIFEST = {
    images: [
      'img/hot_dog_with_mustard.png',
      'img/currencies/coin/coin.png',
      'img/currencies/coin/coin_base.png',
      'img/currencies/coin/coin_plus_base.png',
	  'img/currencies/book/book.png',
	  'img/currencies/book/book_base.png',
      'img/currencies/book/book_plus_base.png',
      'img/sc_upg_icons/faster_coins.png',
	  'img/sc_upg_icons/book_val1.png',
	  'img/sc_upg_icons/coin_val1.png',
	  'img/sc_upg_icons/xp_val1.png',
	  'img/stats/xp/xp.png',
	  'img/stats/xp/xp_base.png',
      'img/stats/xp/xp_plus_base.png',
      'img/misc/merchant.png',
      'img/misc/locked.png',
      'img/misc/locked_base.png',
      'img/misc/mysterious.png',
    ],
    audio: [
      'sounds/coin_pickup.mp3',
      'sounds/wave_spawn.mp3',
      'sounds/merchant_typing.mp3',
      'sounds/purchase_upg.mp3',
    ],
    fonts: true,
  };

  let progress = 0;
  await preloadAssetsWithProgress(ASSET_MANIFEST, f => {
    progress = f;
    setLoaderProgress(loader, f);
  });

  await twoFrames(); 
  document.documentElement.classList.remove('booting');

  await nextFrame();

  finishAndHideLoader(loader);

  await Promise.all([
    warmImage('img/currencies/coin/coin_plus_base.png'),
    warmImage('img/stats/xp/xp_plus_base.png'),
  ]);

  ensureStorageDefaults();
  initPopups();

  const titleEl = document.getElementById('panel-title');
  if (getHasOpenedSaveSlot()) {
    document.body.classList.add('has-opened');
    if (titleEl) titleEl.style.opacity = '0';
  } else {
    if (titleEl) titleEl.style.opacity = '1';
  }

  initSlots(() => {
    setHasOpenedSaveSlot(true);
    document.body.classList.add('has-opened');
    if (titleEl) titleEl.style.opacity = '0';
    enterArea(AREAS.STARTER_COVE);
  });
});
