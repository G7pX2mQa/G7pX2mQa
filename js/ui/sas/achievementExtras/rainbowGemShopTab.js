import { getActiveSlot, bank } from '../../../util/storage.js';
import { IS_MOBILE } from '../../../main.js';

import { BigNum } from '../../../util/bigNum.js';
import { formatNumber } from '../../../util/numFormat.js';
import { getLevel, getLevelNumber, evaluateBulkPurchase, buyMax, getUpgradeLockState, AREA_KEYS } from '../../../game/upgrades.js';
import { openUpgradeOverlay, playPurchaseSfx, computeAffordableLevels } from '../../shopOverlay.js';
import { RAINBOW_GEM_UPGRADES, RAINBOW_GEM_AREA_KEY } from '../../../game/rainbowGemUpgrades.js';

import { blockInteraction } from '../../shopOverlay.js';
import { shouldSkipGhostTap, suppressNextGhostTap } from '../../../util/ghostTapGuard.js';
import { ensureCustomScrollbar } from '../../shopOverlay.js';
import { setupDragToClose } from '../../shopOverlay.js';

// Import tabs logic
import { initSecretAchievementsTab, updateSecretAchievementsTab } from './secretAchievementsTab.js';
import { initVoidGemAltarTab, updateVoidGemAltarTab } from './voidGemAltarTab.js';

const TAB_KEY_BASE = 'ccc:achievementExtrasTab';

const TABS_DEF = [
  { key: 'rainbow', label: 'Rainbow Gem Shop', unlocked: true },
  { key: 'secret', label: 'Secret Achievements', unlocked: true },
  { key: 'void', label: 'Void Gem Altar', unlocked: false, lockedLabel: '???' },
];

const tabUnlockState = new Map();

let overlayEl = null;
let sheetEl = null;
let closeBtn = null;
let isOpen = false;
let dragState = null;
let lastFocus = null;
let eventsBound = false;
let tabsState = { buttons: {}, panels: {}, tablist: null };

function sk(base) {
    return `${base}:${getActiveSlot()}`;
}

function setTabUnlocked(key, unlocked) {
  const def = TABS_DEF.find(t => t.key === key);
  if (!def) return;

  const lockedLabel = def.lockedLabel || '???';
  const normalized = !!unlocked;
  tabUnlockState.set(key, normalized);
  def.unlocked = normalized;

  const btn = tabsState.buttons[key];
  if (btn) {
    btn.disabled = !normalized;
    btn.classList.toggle('is-locked', !normalized);
    btn.textContent = normalized ? def.label : lockedLabel;
    btn.title = normalized ? (def.label || 'Tab') : '???';
  }

  if (!normalized && tabsState.buttons[key]?.classList.contains('is-active')) {
    selectTab('rainbow');
  }
}

function syncVoidTabUnlockState() {
    let unlocked = false;
    const slot = getActiveSlot();
    if (slot == null) return;
    const unlockKey = `ccc:unlock:voidGemAltar:${slot}`;
    
    try {
        if (localStorage.getItem(unlockKey) === '1') {
            unlocked = true;
        } else {
            if (bank.voidGems && bank.voidGems.value && bank.voidGems.value.cmp(0) > 0) {
                unlocked = true;
                localStorage.setItem(unlockKey, '1');
            }
        }
    } catch {}

    setTabUnlocked('void', unlocked);
}

function selectTab(key) {
  const def = TABS_DEF.find(t => t.key === key);
  const unlocked = tabUnlockState.get(key);
  if (!def || !unlocked) key = 'rainbow';

  for (const k in tabsState.buttons) {
    tabsState.buttons[k].classList.toggle('is-active', k === key);
  }
  for (const k in tabsState.panels) {
    tabsState.panels[k].classList.toggle('is-active', k === key);
  }

  if (key === 'rainbow') {
      try { updateRainbowGemShopTab(); } catch {}
  }
  if (key === 'secret') {
      try { updateSecretAchievementsTab(); } catch {}
  }
  if (key === 'void') {
      try { updateVoidGemAltarTab(); } catch {}
  }

  try { localStorage.setItem(sk(TAB_KEY_BASE), key); } catch {}

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const scroller = overlayEl?.querySelector(".merchant-content");
      if (scroller && scroller.__customScroll && typeof scroller.__customScroll.updateAll === "function") {
        scroller.__customScroll.updateAll();
      }
    });
  });
}


export function ensureOverlay() {
    if (overlayEl) return;

    overlayEl = document.createElement('div');
    overlayEl.className = 'merchant-overlay'; // Reusing merchant overlay classes for structural similarity
    overlayEl.id = 'achievement-extras-overlay';
    overlayEl.setAttribute('inert', '');

    sheetEl = document.createElement('div');
    sheetEl.className = 'merchant-sheet';
    sheetEl.setAttribute('role', 'dialog');
    sheetEl.setAttribute('aria-modal', 'false');
    sheetEl.setAttribute('aria-label', 'Achievement Extras');

    const grabber = document.createElement('div');
    grabber.className = 'merchant-grabber';
    grabber.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;

    const header = document.createElement('header');
    header.className = 'merchant-header';
    header.innerHTML = `
        <div class="merchant-title">Achievement Extras</div>
        <div class="merchant-line" aria-hidden="true"></div>
    `;

    const content = document.createElement('div');
    content.className = 'merchant-content';

    const tabs = document.createElement('div');
    tabs.className = 'merchant-tabs';
    tabs.setAttribute('role', 'tablist');

    const panelsWrap = document.createElement('div');
    panelsWrap.className = 'merchant-panels';

    const panelRainbow = document.createElement('section');
    panelRainbow.className = 'merchant-panel is-active';
    panelRainbow.id = 'ae-panel-rainbow';

    const panelSecret = document.createElement('section');
    panelSecret.className = 'merchant-panel';
    panelSecret.id = 'ae-panel-secret';

    const panelVoid = document.createElement('section');
    panelVoid.className = 'merchant-panel';
    panelVoid.id = 'ae-panel-void';

    syncVoidTabUnlockState();

    TABS_DEF.forEach(def => {
        const stored = tabUnlockState.get(def.key) ?? !!def.unlocked;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'merchant-tab';
        btn.dataset.tab = def.key;
        
        const lockedLabel = def.lockedLabel || '???';
        btn.textContent = stored ? def.label : lockedLabel;
        if (!stored) {
            btn.classList.add('is-locked');
            btn.disabled = true;
            btn.title = '???';
        } else {
            btn.title = def.label || 'Tab';
        }
        
        tabUnlockState.set(def.key, stored);

        btn.addEventListener('click', (event) => {
            if (btn.disabled) {
                event?.preventDefault?.();
                return;
            }
            if (shouldSkipGhostTap(btn)) {
                event?.preventDefault?.();
                return;
            }
            selectTab(def.key);
        });

        tabs.appendChild(btn);
        tabsState.buttons[def.key] = btn;
    });

    tabsState.panels['rainbow'] = panelRainbow;
    tabsState.panels['secret'] = panelSecret;
    tabsState.panels['void'] = panelVoid;
    tabsState.tablist = tabs;

    panelsWrap.append(panelRainbow, panelSecret, panelVoid);
    content.append(tabs, panelsWrap);

    try { initRainbowGemShopTab(panelRainbow); } catch {}
    try { initSecretAchievementsTab(panelSecret); } catch {}
    try { initVoidGemAltarTab(panelVoid); } catch {}

    const actions = document.createElement('div');
    actions.className = 'merchant-actions';
    
    closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'merchant-close';
    closeBtn.textContent = 'Close';
    actions.appendChild(closeBtn);

    sheetEl.append(grabber, header, content, actions);
    overlayEl.appendChild(sheetEl);
    document.body.appendChild(overlayEl);

    ensureCustomScrollbar(overlayEl, sheetEl, '.merchant-content');

    if (!eventsBound) {
        eventsBound = true;
        closeBtn.addEventListener('click', () => { closeOverlay(); });

        setupDragToClose(grabber, sheetEl, () => isOpen, () => {
            closeOverlay(true);
        });
        
        window.addEventListener('currency:change', (e) => {
            if (e.detail?.key === 'voidGems') {
                syncVoidTabUnlockState();
            }
        });
        
        document.addEventListener('ccc:upgrades:changed', () => {
             if (isOpen && tabsState.panels['rainbow']?.classList.contains('is-active')) {
                 updateRainbowGemShopTab();
             }
        });
    }
}

export function openAchievementExtras() {
    ensureOverlay();
    if (isOpen) return;

    syncVoidTabUnlockState();

    const activeEl = document.activeElement;
    if (activeEl instanceof HTMLElement && !overlayEl.contains(activeEl)) {
        lastFocus = activeEl;
    } else {
        lastFocus = null;
    }
    isOpen = true;

    let last = 'rainbow';
    try { last = localStorage.getItem(sk(TAB_KEY_BASE)) || 'rainbow'; } catch {}

    selectTab(last);

    sheetEl.style.transition = 'none';
    sheetEl.style.transform = 'translateY(100%)';
    overlayEl.removeAttribute('inert');

    void sheetEl.offsetHeight;

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            sheetEl.style.transition = '';
            sheetEl.style.transform = '';
            overlayEl.classList.add('is-open');
            blockInteraction(140);
            
            if (closeBtn && typeof closeBtn.focus === 'function') {
                try { closeBtn.focus({ preventScroll: true }); } catch {}
            }
        });
    });
}

export function closeOverlay(force = false) {
    if (!isOpen) return;
    
    if (IS_MOBILE) {
        try { suppressNextGhostTap(100); } catch {}
        try { blockInteraction(80); } catch {}
    }

    isOpen = false;
    sheetEl.style.transition = 'transform 140ms ease-out';
    sheetEl.style.transform = 'translateY(100%)';
    overlayEl.classList.remove('is-open');
    
    const activeEl = document.activeElement;
    if (activeEl && overlayEl.contains(activeEl)) {
        if (lastFocus && typeof lastFocus.focus === 'function') {
            try { lastFocus.focus({ preventScroll: true }); } catch {}
        }
    }

    overlayEl.setAttribute('inert', '');
    lastFocus = null;
    
    setTimeout(() => {
        if (!isOpen) {
             sheetEl.style.transition = '';
        }
    }, 150);
}


export function initRainbowGemShopTab(panel) {
    if (!panel || panel.__rgInit) return;
    panel.__rgInit = true;
    panel.innerHTML = `
        <div class="shop-scroller" style="height: 100%; position: relative;">
            <div class="shop-grid" role="grid" id="ae-rainbow-shop-grid"></div>
        </div>
    `;
    ensureCustomScrollbar(panel, panel, '.shop-scroller');
}



export function updateRainbowGemShopTab() {
    const grid = document.getElementById('ae-rainbow-shop-grid');
    if (!grid) return;

    let counts = { font: 0, trail: 0, magnet: 0 };
    for (const upg of RAINBOW_GEM_UPGRADES) {
        counts[upg.modType] = (counts[upg.modType] || 0) + 1;
        let upgradeLabel = "";
        if (upg.modType === 'font') upgradeLabel = "Font" + counts.font;
        else if (upg.modType === 'trail') upgradeLabel = "Trail" + counts.trail;
        else if (upg.modType === 'magnet') upgradeLabel = "Magnet" + counts.magnet;

        let btn = grid.querySelector(`.shop-upgrade[data-upgid="${upg.id}"]`);
        
        if (!btn) {
            btn = document.createElement('button');
            btn.className = 'shop-upgrade';
            btn.setAttribute('data-upgid', upg.id);
            btn.type = 'button';
            btn.setAttribute('role', 'gridcell');
            
            const tile = document.createElement('div');
            tile.className = 'shop-tile';
            
            const baseImg = document.createElement('img');
            baseImg.className = 'base';
            baseImg.alt = '';
            
            const iconImg = document.createElement('img');
            iconImg.className = 'icon';
            iconImg.src = upg.icon || 'img/currencies/rainbow_gem.webp';
            iconImg.alt = upg.title;
            iconImg.style.borderRadius = '50%';

            const maxedBorder = document.createElement('img');
            maxedBorder.className = 'maxed-overlay'; // Using base class to position it same as base icons
            maxedBorder.src = 'img/misc/maxed.webp';
            maxedBorder.alt = '';
            maxedBorder.style.display = 'none'; // Hidden by default
            
            const overlayText = document.createElement('div');
            overlayText.className = 'rainbow-upgrade-text';
            overlayText.textContent = upgradeLabel;

            tile.appendChild(baseImg);
            tile.appendChild(iconImg);
            tile.appendChild(maxedBorder);
            tile.appendChild(overlayText);
            
            const badge = document.createElement('div');
            badge.className = 'level-badge text-badge';
            badge.textContent = 'Not Owned';
            
            btn.appendChild(tile);
            tile.appendChild(badge);
            grid.appendChild(btn);

            btn.addEventListener('click', (event) => {
                if (btn.disabled) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    return;
                }
                if (shouldSkipGhostTap(btn)) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    return;
                }
                
                openUpgradeOverlay(upg, 'rainbow_gem_shop');
            });

            btn.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                event.stopImmediatePropagation();
                if (btn.disabled) return;

                const lockState = getUpgradeLockState(RAINBOW_GEM_AREA_KEY, upg.id);
                if (lockState.locked) return;

                const lvlNum = getLevelNumber(RAINBOW_GEM_AREA_KEY, upg.id);
                const lvl = getLevel(RAINBOW_GEM_AREA_KEY, upg.id);
                const isOwned = lvlNum > 0;
                if (isOwned) return;

                const canPlusBn = computeAffordableLevels(upg, lvlNum, lvl);
                const plusBn = canPlusBn instanceof BigNum ? canPlusBn : BigNum.fromAny(canPlusBn);
                if (!plusBn.isZero?.()) {
                    const purchase = buyMax(RAINBOW_GEM_AREA_KEY, upg.id, upg);
                    const boughtBn = purchase.bought instanceof BigNum ? purchase.bought : BigNum.fromAny(purchase.bought ?? 0);
                    if (!boughtBn.isZero?.()) {
                        if (upg.upgType === 'TM') {
                            import('../../../game/settingsManager.js').then(({ settingsManager }) => {
                                settingsManager.set('active_' + upg.modType + '_mod', upg.id);
                            });
                        }
                        playPurchaseSfx();
                    }
                }
            });
        }
        
        // Update state
        const lockState = getUpgradeLockState(RAINBOW_GEM_AREA_KEY, upg.id);
        const locked = !!lockState.locked;
        
        const lockIcon = lockState?.iconOverride;
        const hasMysteriousIcon = typeof lockIcon === 'string' && lockIcon.includes('mysterious');
        const isMysterious = locked && (lockState?.hidden || hasMysteriousIcon);

        const lvl = getLevel(RAINBOW_GEM_AREA_KEY, upg.id);
        const lvlNum = getLevelNumber(RAINBOW_GEM_AREA_KEY, upg.id);
        const isOwned = lvlNum > 0;
        
        btn.dataset.mysterious = isMysterious ? '1' : '0';
        if (locked) {
            btn.title = isMysterious ? 'Hidden Upgrade' : 'Locked Upgrade';
        } else if (isOwned) {
            btn.title = 'Owned';
        } else {
            btn.title = 'Left-click: Details • Right-click: Buy Max';
        }

        const baseImg = btn.querySelector('.base');
        const iconImg = btn.querySelector('.icon');
        
        if (baseImg) {
            if (isMysterious) {
                baseImg.src = 'img/misc/locked_base.webp';
                baseImg.style.display = '';
            } else if (locked || lockState?.useLockedBase) {
                baseImg.src = 'img/misc/locked_base.webp';
                baseImg.style.display = '';
            } else {
                baseImg.style.display = 'none';
            }
        }
        
        if (iconImg) {
            iconImg.src = lockState?.iconOverride || upg.icon || 'img/currencies/rainbow_gem.webp';
        }

        
        const badge = btn.querySelector('.level-badge');
        if (badge) {
            if (locked) {
                if (isMysterious) {
                    badge.style.display = 'none';
                } else {
                    badge.style.display = '';
                    badge.textContent = 'Locked';
                    badge.classList.remove('is-maxed', 'can-buy');
                }
            } else if (isOwned) {
                badge.style.display = '';
                badge.textContent = 'Owned';
                badge.classList.add('is-maxed');
                badge.classList.remove('can-buy');
            } else {
                badge.style.display = '';
                const canPlusBn = computeAffordableLevels(upg, lvlNum, lvl);
                const plusBn = canPlusBn instanceof BigNum ? canPlusBn : BigNum.fromAny(canPlusBn);
                const hasPlus = !plusBn.isZero?.();
                if (hasPlus) {
                    badge.textContent = 'Purchasable';
                    badge.classList.add('can-buy');
                } else {
                    badge.textContent = 'Not Owned';
                    badge.classList.remove('can-buy');
                }
                badge.classList.remove('is-maxed');
            }
        }
        
        const maxedBorder = btn.querySelector('.maxed-overlay');
        if (maxedBorder) {
            maxedBorder.style.display = isOwned ? 'block' : 'none';
        }

        if (locked) {
            btn.dataset.locked = '1';
            btn.classList.add('is-locked');
        } else {
            btn.dataset.locked = '0';
            btn.classList.remove('is-locked');
        }
    }
}
