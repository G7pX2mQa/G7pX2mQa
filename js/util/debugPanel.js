// js/util/debugPanel.js
// Using a debug panel is much faster and more convenient than
// Editing local storage every time I want to change something.
// I will remember to disable debug panel access for prod, don't worry.

import { BigNum } from './bigNum.js';
import { formatNumber } from './numFormat.js';
import {
    bank,
    CURRENCIES,
    KEYS,
    getActiveSlot,
    markSaveSlotModified,
    peekCurrency,
    primeStorageWatcherSnapshot,
    setCurrency,
    setCurrencyMultiplierBN,
} from './storage.js';
import { broadcastXpChange, computeCoinMultiplierForXpLevel, getXpRequirementForXpLevel, getXpState, initXpSystem, resetXpProgress, unlockXpSystem } from '../game/xpSystem.js';
import { broadcastMutationChange, computeMutationMultiplierForLevel, computeMutationRequirementForLevel, getMutationMultiplier, getMutationState, initMutationSystem, setMutationUnlockedForDebug, unlockMutationSystem } from '../game/mutationSystem.js';
import {
    AREA_KEYS,
    computeDefaultUpgradeCost,
    computeUpgradeEffects,
    getLevel,
    getMpValueMultiplierBn,
    getUpgradesForArea,
    markUpgradePermanentlyUnlocked,
    clearPermanentUpgradeUnlock,
    setLevel,
} from '../game/upgrades.js';
import { computeForgeGoldFromInputs, getForgeDebugOverrideState, hasDoneForgeReset, isForgeUnlocked, setForgeDebugOverride, setForgeResetCompleted, updateResetPanel } from '../ui/merchantDelve/resetTab.js';
import { isMapUnlocked, isShopUnlocked, lockMap, lockShop, unlockMap, unlockShop } from '../ui/hudButtons.js';
import { DLG_CATALOG, MERCHANT_DLG_STATE_KEY_BASE } from '../ui/merchantDelve/dlgTab.js';

const DEBUG_PANEL_STYLE_ID = 'debug-panel-style';
const DEBUG_PANEL_ID = 'debug-panel';
const DEBUG_PANEL_TOGGLE_ID = 'debug-panel-toggle';
let debugPanelOpen = false;
let debugPanelAccess = true;
let debugPanelCleanups = [];
let debugPanelExpansionState = createEmptyExpansionState();
let debugPanelScrollTop = 0;
let sectionKeyCounter = 0;
let subsectionKeyCounter = 0;
const liveBindings = [];
let actionLogContainer = null;

const currencyOverrides = new Map();
const currencyOverrideBaselines = new Map();
const currencyOverrideApplications = new Set();
const statOverrides = new Map();
const statOverrideBaselines = new Map();
const lockedStorageKeys = new Set();
if (typeof window !== 'undefined') {
    window.__cccLockedStorageKeys = lockedStorageKeys;
}
let storageLockPatched = false;
let originalSetItem = null;
let originalRemoveItem = null;

const STAT_MULTIPLIER_STORAGE_PREFIX = 'ccc:debug:stat-mult';
const ACTION_LOG_STORAGE_PREFIX = 'ccc:actionLog';
const MAX_ACTION_LOG_ENTRIES = 100;

function isOnMenu() {
    const menuRoot = document.querySelector('.menu-root');
    if (!menuRoot) return false;

    const style = window.getComputedStyle?.(menuRoot);
    if (!style) return menuRoot.style.display !== 'none';

    return style.display !== 'none' && style.visibility !== 'hidden' && !menuRoot.hidden;
}

function isGameVisible() {
    const gameRoot = document.getElementById('game-root');
    if (!gameRoot) return false;

    const style = window.getComputedStyle?.(gameRoot);
    if (!style) {
        return gameRoot.style.display !== 'none'
            && gameRoot.style.visibility !== 'hidden'
            && !gameRoot.hidden;
    }

    return style.display !== 'none' && style.visibility !== 'hidden' && !gameRoot.hidden;
}

function addDebugPanelCleanup(fn) {
    if (typeof fn === 'function') {
        debugPanelCleanups.push(fn);
    }
}

function createEmptyExpansionState() {
    return { sections: new Set(), subsections: new Set() };
}

function captureDebugPanelExpansionState() {
    const panel = document.getElementById(DEBUG_PANEL_ID);
    if (!panel) return createEmptyExpansionState();

    const sections = new Set();
    panel.querySelectorAll('.debug-panel-section-toggle').forEach((toggle) => {
        const key = toggle.dataset.sectionKey ?? toggle.textContent;
        if (toggle.classList.contains('expanded')) {
            sections.add(key);
        }
    });

    const subsections = new Set();
    panel.querySelectorAll('.debug-panel-subsection-toggle').forEach((toggle) => {
        const key = toggle.dataset.subsectionKey ?? toggle.textContent;
        if (toggle.classList.contains('expanded')) {
            subsections.add(key);
        }
    });

    return { sections, subsections };
}

function applyDebugPanelExpansionState(panel) {
    const { sections, subsections } = debugPanelExpansionState ?? createEmptyExpansionState();

    panel.querySelectorAll('.debug-panel-section-toggle').forEach((toggle) => {
        const key = toggle.dataset.sectionKey ?? toggle.textContent;
        if (!sections.has(key)) return;
        const content = toggle.nextElementSibling;
        toggle.classList.add('expanded');
        if (content) content.classList.add('active');
    });

    panel.querySelectorAll('.debug-panel-subsection-toggle').forEach((toggle) => {
        const key = toggle.dataset.subsectionKey ?? toggle.textContent;
        if (!subsections.has(key)) return;
        const content = toggle.nextElementSibling;
        toggle.classList.add('expanded');
        if (content) content.classList.add('active');
    });
}

function cleanupDebugPanelResources() {
    debugPanelCleanups.forEach((fn) => {
        try { fn?.(); } catch {}
    });
    debugPanelCleanups = [];
    liveBindings.length = 0;
}

function registerLiveBinding(binding) {
    if (!binding || typeof binding.refresh !== 'function') return;
    liveBindings.push(binding);
}

function refreshLiveBindings(predicate) {
    liveBindings.forEach((binding) => {
        if (typeof predicate === 'function' && !predicate(binding)) return;
        try { binding.refresh(); } catch {}
    });
}

function setupLiveBindingListeners() {
    if (typeof window === 'undefined') return;

    const currencyHandler = (event) => {
        const { key, slot } = event?.detail ?? {};
        const targetSlot = slot ?? getActiveSlot();
        refreshLiveBindings((binding) => binding.type === 'currency'
            && binding.key === key
            && binding.slot === targetSlot);
    };
    window.addEventListener('currency:change', currencyHandler, { passive: true });
    addDebugPanelCleanup(() => window.removeEventListener('currency:change', currencyHandler));

    const currencyMultiplierHandler = (event) => {
        const { key, slot } = event?.detail ?? {};
        const targetSlot = slot ?? getActiveSlot();
        refreshLiveBindings((binding) => binding.type === 'currency-mult'
            && binding.key === key
            && binding.slot === targetSlot);
    };
    window.addEventListener('currency:multiplier', currencyMultiplierHandler, { passive: true });
    addDebugPanelCleanup(() => window.removeEventListener('currency:multiplier', currencyMultiplierHandler));

    const xpHandler = (event) => {
        const { slot } = event?.detail ?? {};
        const targetSlot = slot ?? getActiveSlot();
        refreshLiveBindings((binding) => binding.type === 'xp'
            && binding.slot === targetSlot);
    };
    window.addEventListener('xp:change', xpHandler, { passive: true });
    addDebugPanelCleanup(() => window.removeEventListener('xp:change', xpHandler));

    const mutationHandler = () => {
        const targetSlot = getActiveSlot();
        refreshLiveBindings((binding) => binding.type === 'mutation'
            && binding.slot === targetSlot);
        refreshLiveBindings((binding) => binding.type === 'stat-mult'
            && binding.key === 'mutation'
            && binding.slot === targetSlot);
    };
    window.addEventListener('mutation:change', mutationHandler, { passive: true });
    addDebugPanelCleanup(() => window.removeEventListener('mutation:change', mutationHandler));

    const upgradeHandler = () => {
        const targetSlot = getActiveSlot();
        refreshLiveBindings((binding) => binding.type === 'upgrade'
            && binding.slot === targetSlot);
        refreshLiveBindings((binding) => binding.type === 'currency-mult'
            && binding.slot === targetSlot);
        refreshLiveBindings((binding) => binding.type === 'stat-mult'
            && binding.slot === targetSlot);
    };
    document.addEventListener('ccc:upgrades:changed', upgradeHandler, { passive: true });
    addDebugPanelCleanup(() => document.removeEventListener('ccc:upgrades:changed', upgradeHandler));

    const slotHandler = () => {
        const targetSlot = getActiveSlot();
        refreshLiveBindings((binding) => binding.slot === targetSlot);
    };
    window.addEventListener('saveSlot:change', slotHandler, { passive: true });
    addDebugPanelCleanup(() => window.removeEventListener('saveSlot:change', slotHandler));

    const unlockHandler = (event) => {
        const { slot, key } = event?.detail ?? {};
        const targetSlot = slot ?? getActiveSlot();
        refreshLiveBindings((binding) => binding.type === 'unlock'
            && (binding.slot == null || binding.slot === targetSlot)
            && (binding.key == null || binding.key === key));
    };
    window.addEventListener('unlock:change', unlockHandler, { passive: true });
    addDebugPanelCleanup(() => window.removeEventListener('unlock:change', unlockHandler));
}

const XP_KEY_PREFIX = 'ccc:xp';
const XP_KEYS = {
    unlock: (slot) => `${XP_KEY_PREFIX}:unlocked:${slot}`,
    level:  (slot) => `${XP_KEY_PREFIX}:level:${slot}`,
    progress: (slot) => `${XP_KEY_PREFIX}:progress:${slot}`,
};

const MUTATION_KEY_PREFIX = 'ccc:mutation';
const MUTATION_KEYS = {
    unlock: (slot) => `${MUTATION_KEY_PREFIX}:unlocked:${slot}`,
    level:  (slot) => `${MUTATION_KEY_PREFIX}:level:${slot}`,
    progress: (slot) => `${MUTATION_KEY_PREFIX}:progress:${slot}`,
};

const STAT_MULTIPLIERS = [
    { key: 'xp', label: 'XP' },
    { key: 'mutation', label: 'MP' },
];

function getAreas() {
    return [
        {
            key: AREA_KEYS.STARTER_COVE,
            title: 'The Cove',
            currencies: [
                { key: CURRENCIES.COINS, label: 'Coins' },
                { key: CURRENCIES.BOOKS, label: 'Books' },
                { key: CURRENCIES.GOLD,  label: 'Gold'  },
            ],
            stats: [
                { key: 'xp', label: 'XP' },
                { key: 'mutation', label: 'MP' },
            ],
        },
    ];
}

function ensureDebugPanelStyles() {
    let style = document.getElementById(DEBUG_PANEL_STYLE_ID);
    if (style) return;

    style = document.createElement('style');
    style.id = DEBUG_PANEL_STYLE_ID;
    style.textContent = `
        .debug-panel {
            position: fixed;
            top: 50%;
            right: 0;
            transform: translateY(-50%);
            width: 600px;
            max-height: 100vh;
            overflow-y: auto;
            background: rgb(0, 0, 0);
            color: #fff;
            font-family: Arial, sans-serif;
            padding: 12px;
            border-radius: 6px 0 0 6px;
            box-shadow: -2px 0 10px rgba(0, 0, 0, 0.6);
            z-index: 2147483646;
            scrollbar-width: thin;
            scrollbar-color: rgba(255, 255, 255, 0.22) rgba(0, 0, 0, 0.5);
			border: 1px solid white;
        }

        .debug-panel::-webkit-scrollbar,
        .debug-panel-section-content::-webkit-scrollbar,
        .debug-panel-subsection-content::-webkit-scrollbar {
            width: 10px;
        }

        .debug-panel::-webkit-scrollbar-track,
        .debug-panel-section-content::-webkit-scrollbar-track,
        .debug-panel-subsection-content::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.35);
            border-radius: 6px;
        }

        .debug-panel::-webkit-scrollbar-thumb,
        .debug-panel-section-content::-webkit-scrollbar-thumb,
        .debug-panel-subsection-content::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.22);
            border-radius: 10px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .debug-panel::-webkit-scrollbar-thumb:hover,
        .debug-panel-section-content::-webkit-scrollbar-thumb:hover,
        .debug-panel-subsection-content::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.3);
        }

        .debug-panel-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 10px;
        }

        .debug-panel-title {
            font-size: 1.2em;
            font-weight: bold;
        }

        .debug-panel-info {
            font-size: 0.95em;
            color: #ccc;
        }

        .debug-panel-info-line + .debug-panel-info-line {
            margin-top: 2px;
        }

        @media (pointer: coarse) {
            .debug-panel-info-mobile-hidden {
                display: none;
            }
        }

        @media (max-width: 600px) {
            .debug-panel {
                left: 0;
                right: 0;
                top: 0;
                transform: none;
                width: auto;
                max-width: none;
                max-height: calc(100vh - 12px);
                padding: 8px;
                margin: 6px;
                border-radius: 8px;
            }

            .debug-panel-header {
                flex-direction: column;
                align-items: flex-start;
                gap: 6px;
            }

            .debug-panel-title {
                font-size: 1.05em;
            }

            .debug-panel-info {
                font-size: 0.85em;
            }

            .debug-panel-section-toggle,
            .debug-panel-subsection-toggle {
                align-items: flex-start;
                gap: 6px;
            }

            .debug-panel-row {
                flex-direction: column;
                align-items: stretch;
            }

            .debug-panel-toggle,
            .debug-misc-button {
                width: 100%;
            }

            .debug-misc-button-list {
                justify-content: flex-start;
            }
        }

        .debug-panel-close {
            background: transparent;
            border: none;
            color: #fff;
            font-size: 1.2em;
            cursor: pointer;
        }

        .debug-panel-section {
            border: 1px solid #444;
            border-radius: 4px;
            margin-bottom: 10px;
            background: rgba(255, 255, 255, 0.05);
        }

        .debug-panel-section-toggle {
            width: 100%;
            text-align: left;
            background: rgba(255, 255, 255, 0.08);
            border: none;
            color: #fff;
            padding: 8px 10px;
            font-weight: bold;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .debug-panel-section-toggle::before {
            content: '▶';
            font-size: 1em;
            width: 1em;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }

        .debug-panel-section-toggle.expanded::before {
            content: '▼';
        }

        .debug-panel-section-content {
            padding: 8px 10px;
            border-top: 1px solid #444;
            display: none;
        }

        .debug-panel-section-content.active {
            display: block;
        }

        .debug-panel-empty {
            color: #aaa;
            font-style: italic;
        }

        .action-log-entry {
            display: flex;
            gap: 6px;
            padding: 4px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .action-log-entry:last-child {
            border-bottom: none;
        }

        .action-log-time {
            color: #7bc0ff;
            font-weight: bold;
            min-width: 60px;
        }

        .action-log-message {
            flex: 1;
        }

        .action-log-empty {
            color: #aaa;
            font-style: italic;
            padding: 6px 0;
        }

        .action-log-number {
            color: #ffd54f;
            font-weight: bold;
        }

        .action-log-number::after {
            content: attr(data-unit);
            color: #ffa726;
            font-weight: normal;
            margin-left: 2px;
        }

        .action-log-level {
            color: #ffd700;
            font-weight: bold;
            text-shadow: 0 0 2px rgba(0,0,0,0.5);
            border-radius: 3px;
            padding: 0 2px;
        }

        .action-log-level span {
            color: #ffd700;
        }

        .action-log-gold {
            color: #ffd700;
            font-weight: bold;
            text-shadow: 0 0 2px rgba(0,0,0,0.5);
            border-radius: 3px;
            padding: 0 2px;
        }

        .debug-panel-subsection {
            margin: 8px 0 12px;
            border: 1px solid #333;
            border-radius: 4px;
            background: rgba(255, 255, 255, 0.03);
        }

        .debug-panel-subsection-toggle {
            width: 100%;
            text-align: left;
            background: rgba(255, 255, 255, 0.06);
            border: none;
            color: #fff;
            padding: 6px 8px;
            font-weight: bold;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.95em;
        }

        .debug-panel-subsection-toggle::before {
            content: '▶';
            font-size: 1em;
            width: 1em;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        }

        .debug-panel-subsection-toggle.expanded::before {
            content: '▼';
        }

        .debug-panel-subsection-content {
            display: none;
            padding: 8px 10px;
            border-top: 1px solid #333;
        }

        .debug-panel-subsection-content.active {
            display: block;
        }

        .debug-panel-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 4px 0;
        }

        .debug-panel-toggle {
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid #555;
            color: #fff;
            padding: 8px 12px;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.12s ease, transform 0.12s ease;
        }

        .debug-panel-toggle:hover {
            background: rgba(255, 255, 255, 0.12);
            transform: translateY(-1px);
        }

        .debug-misc-button-list {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            justify-content: center;
        }

        .debug-misc-button {
            flex: 0 1 170px;
            min-width: 150px;
            max-width: 190px;
            padding: 6px 10px;
            text-align: center;
            font-weight: 600;
            font-size: 0.95em;
        }

        .debug-misc-button:hover {
            background: rgba(255, 255, 255, 0.14);
        }

        .debug-unlock-row {
            align-items: flex-start;
            justify-content: flex-start;
        }
		
		.debug-unlock-row,
		.debug-unlock-row * {
			user-select: none;
		}

        .debug-unlock-row .flag-toggle {
            flex: 0 0 auto;
        }

        .debug-unlock-text {
            flex: 1;
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            align-items: center;
        }

        .debug-unlock-title {
            font-weight: 600;
        }

        .debug-unlock-desc {
            color: #aaa;
            font-size: 0.9em;
        }

        .debug-calculator-inputs {
            display: flex;
            flex: 0 0 245px;
            gap: 8px;
            flex-wrap: wrap;
        }

        .debug-calculator-output {
            min-width: 120px;
            text-align: right;
            font-family: Consolas, 'Courier New', monospace;
        }

        .debug-panel .infinity-symbol {
            font-size: 1.5em;
            line-height: 1.05;
        }

        .debug-panel-row label {
            flex: 1;
            font-size: 0.95em;
        }

        .debug-panel-input {
            flex: 0 0 245px;
            max-width: 100%;
            background: #111;
            color: #fff;
            border: 1px solid #555;
            padding: 6px 8px;
            border-radius: 4px;
            font-family: Consolas, 'Courier New', monospace;
        }

        .debug-lock-button {
            flex: 0 0 50px;
            max-width: 60px;
            padding: 6px 8px;
            border-radius: 4px;
            border: 1px solid #555;
            background: #111;
            color: #fff;
            font-weight: bold;
            cursor: pointer;
        }

        .debug-lock-button.locked {
            background: #440000;
            border-color: #aa0000;
            color: #ff6666;
        }

        .debug-panel-input.debug-invalid {
            border-color: #e66;
            box-shadow: 0 0 0 1px #e66;
        }

        .debug-panel-id {
            font-size: 0.8em;
            color: #aaa;
            margin-left: 6px;
            position: relative;
            top: -2px;
        }

        .debug-panel-toggle-button {
            position: fixed;
            top: 10px;
            left: 10px;
            z-index: 2147483647;
            background: rgba(0, 0, 0, 0.85);
            color: #fff;
            border: 1px solid #666;
            border-radius: 4px;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 0.9em;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
        }

        .debug-panel-toggle-button:hover {
            background: rgba(0, 0, 0, 0.95);
        }

        .flag-toggle {
            position: relative;
            display: inline-block;
            width: 50px;
            height: 24px;
        }

        .flag-toggle input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .flag-slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #555;
            transition: .2s;
            border-radius: 12px;
        }

        .flag-slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: .2s;
            border-radius: 50%;
        }

        .flag-toggle input:checked + .flag-slider {
            background-color: #2196F3;
        }

        .flag-toggle input:checked + .flag-slider:before {
            transform: translateX(26px);
        }
		
		.debug-unlock-row:hover {
			cursor: pointer;
		}
    `;

    document.head.appendChild(style);
}

function removeDebugPanelToggleButton() {
    const existingButton = document.getElementById(DEBUG_PANEL_TOGGLE_ID);
    if (existingButton) existingButton.remove();
}

function shouldShowDebugPanelToggleButton() {
    return debugPanelAccess
        && IS_MOBILE
        && getActiveSlot() != null
        && !isOnMenu()
        && isGameVisible();
}

function onMenuVisibilityChange(event) {
    if (event?.detail?.visible) {
        closeDebugPanel();
    }
    createDebugPanelToggleButton();
}

function createSection(title, contentId, contentBuilder) {
    const section = document.createElement('div');
    section.className = 'debug-panel-section';

    const toggle = document.createElement('button');
    toggle.className = 'debug-panel-section-toggle';
    toggle.type = 'button';
    toggle.textContent = title;
    const stateKey = contentId || `${title}-${sectionKeyCounter++}`;
    toggle.dataset.sectionKey = stateKey;
    section.appendChild(toggle);

    const content = document.createElement('div');
    content.className = 'debug-panel-section-content';
    content.id = contentId;
    content.dataset.sectionKey = stateKey;
    contentBuilder(content);
    section.appendChild(content);

    toggle.addEventListener('click', () => {
        const expanded = toggle.classList.toggle('expanded');
        content.classList.toggle('active', expanded);
    });


    return section;
}

function createSubsection(title, contentBuilder, { defaultExpanded = false } = {}) {
    const container = document.createElement('div');
    container.className = 'debug-panel-subsection';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'debug-panel-subsection-toggle';
    toggle.textContent = title;
    const stateKey = `${title}-${subsectionKeyCounter++}`;
    toggle.dataset.subsectionKey = stateKey;
    container.appendChild(toggle);

    const content = document.createElement('div');
    content.className = 'debug-panel-subsection-content';
    content.dataset.subsectionKey = stateKey;
    contentBuilder(content);
    container.appendChild(content);

    toggle.addEventListener('click', () => {
        const expanded = toggle.classList.toggle('expanded');
        content.classList.toggle('active', expanded);
    });

    if (defaultExpanded) {
        toggle.classList.add('expanded');
        content.classList.add('active');
    }

    return container;
}

function bigNumEquals(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return a == null && b == null;
    if (typeof a?.cmp === 'function') {
        try { return a.cmp(b) === 0; } catch {}
    }
    if (typeof b?.cmp === 'function') {
        try { return b.cmp(a) === 0; } catch {}
    }
    try { return Object.is(String(a), String(b)); }
    catch { return false; }
}

function bigNumToFiniteNumber(value) {
    try {
        const fromScientific = value?.toScientific?.(18);
        const num = Number.parseFloat(fromScientific ?? value);
        return Number.isFinite(num) ? num : Number.NaN;
    } catch {
        return Number.NaN;
    }
}

function getCurrencyStorageKey(currencyKey, slot = getActiveSlot()) {
    const resolvedSlot = slot ?? getActiveSlot();
    if (resolvedSlot == null) return null;
    return `${KEYS.CURRENCY[currencyKey]}:${resolvedSlot}`;
}

function getCurrencyValueForSlot(currencyKey, slot = getActiveSlot()) {
    const resolvedSlot = slot ?? getActiveSlot();
    if (resolvedSlot == null) return BigNum.fromInt(0);

    const handle = bank?.[currencyKey];
    if (handle) {
        try { return handle.value ?? BigNum.fromInt(0); }
        catch {}
    }

    try { return peekCurrency(resolvedSlot, currencyKey); }
    catch { return BigNum.fromInt(0); }
}

function applyCurrencyState(currencyKey, value, slot = getActiveSlot()) {
    const resolvedSlot = slot ?? getActiveSlot();
    const previous = getCurrencyValueForSlot(currencyKey, resolvedSlot);
    if (resolvedSlot == null || resolvedSlot !== getActiveSlot()) {
        return { previous, next: previous };
    }

    const storageKey = getCurrencyStorageKey(currencyKey, resolvedSlot);
    const wasLocked = storageKey && isStorageKeyLocked(storageKey);

    if (wasLocked) unlockStorageKey(storageKey);

    let next = previous;
    try {
        markSaveSlotModified(resolvedSlot);
        const effective = setCurrency(currencyKey, value, { previous });
        next = effective ?? previous;
        if (storageKey) primeStorageWatcherSnapshot(storageKey);
    } catch {}
    finally {
        if (wasLocked) lockStorageKey(storageKey);
    }

    refreshLiveBindings((binding) => binding.type === 'currency'
        && binding.key === currencyKey
        && binding.slot === resolvedSlot);

    return { previous, next };
}

function buildOverrideKey(slot, key) {
    return `${slot ?? 'null'}::${key}`;
}

function getCurrencyOverride(slot, key) {
    return currencyOverrides.get(buildOverrideKey(slot, key)) ?? null;
}

function getCurrencyMultiplierStorageKey(currencyKey, slot = getActiveSlot()) {
    const resolvedSlot = slot ?? getActiveSlot();
    if (!currencyKey || resolvedSlot == null) return null;
    return `${KEYS.MULTIPLIER[currencyKey]}:${resolvedSlot}`;
}

function isCurrencyMultiplierLocked(currencyKey, slot = getActiveSlot()) {
    return isStorageKeyLocked(getCurrencyMultiplierStorageKey(currencyKey, slot));
}

function clearCurrencyMultiplierOverride(currencyKey, slot = getActiveSlot()) {
    const cacheKey = buildOverrideKey(slot, currencyKey);
    currencyOverrides.delete(cacheKey);
    currencyOverrideBaselines.delete(cacheKey);
    refreshLiveBindings((binding) => binding.type === 'currency-mult'
        && binding.key === currencyKey
        && binding.slot === slot);
}

function getStatOverride(slot, key) {
    const lockAwareRefresh = !isStatMultiplierLocked(key, slot);
    const cacheKey = buildOverrideKey(slot, key);
    const cached = statOverrides.get(cacheKey);
    if (!lockAwareRefresh && cached) return cached;

    const fromStorage = loadStatMultiplierOverrideFromStorage(key, slot);
    if (!fromStorage) {
        if (lockAwareRefresh) statOverrides.delete(cacheKey);
        return null;
    }

    statOverrides.set(cacheKey, fromStorage);
    return fromStorage;
}

function notifyStatMultiplierChange(statKey, slot) {
    refreshLiveBindings((binding) => binding.type === 'stat-mult'
        && binding.key === statKey
        && binding.slot === slot);
}

function clearStatMultiplierOverride(statKey, slot = getActiveSlot()) {
    const storageKey = getStatMultiplierStorageKey(statKey, slot);
    statOverrides.delete(buildOverrideKey(slot, statKey));
    statOverrideBaselines.delete(buildOverrideKey(slot, statKey));
    if (!storageKey || typeof localStorage === 'undefined') return;
    if (isStorageKeyLocked(storageKey)) return;
    try { localStorage.removeItem(storageKey); } catch {}
    notifyStatMultiplierChange(statKey, slot);
}

function isStatMultiplierLocked(statKey, slot = getActiveSlot()) {
    return isStorageKeyLocked(getStatMultiplierStorageKey(statKey, slot));
}

function getLockedStatOverride(slot, statKey) {
    if (!isStatMultiplierLocked(statKey, slot)) return null;
    return getStatOverride(slot, statKey);
}

function getStatMultiplierDisplayValue(statKey, slot = getActiveSlot()) {
    const gameValue = getGameStatMultiplier(statKey);
    const effectiveOverride = getEffectiveStatMultiplierOverride(statKey, slot, gameValue);
    return effectiveOverride ?? gameValue;
}

function getStatMultiplierStorageKey(statKey, slot = getActiveSlot()) {
    if (!statKey) return null;
    const resolvedSlot = slot ?? getActiveSlot();
    if (resolvedSlot == null) return null;
    return `${STAT_MULTIPLIER_STORAGE_PREFIX}:${statKey}:${resolvedSlot}`;
}

function getGameStatMultiplier(statKey) {
    try {
        if (statKey === 'xp') {
            const { xpGainMultiplier } = computeUpgradeEffects(AREA_KEYS.STARTER_COVE) ?? {};
            if (xpGainMultiplier) return xpGainMultiplier;
        } else if (statKey === 'mutation') {
            const valueMult = getMpValueMultiplierBn?.();
            if (valueMult) return valueMult;

            const mult = getMutationMultiplier();
            if (mult) return mult;
        }
    } catch {}

    return BigNum.fromInt(1);
}

function loadStatMultiplierOverrideFromStorage(statKey, slot = getActiveSlot()) {
    const storageKey = getStatMultiplierStorageKey(statKey, slot);
    if (!storageKey || typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    try { return BigNum.fromAny(raw); }
    catch { return null; }
}

function storeStatMultiplierOverride(statKey, slot, value) {
    const storageKey = getStatMultiplierStorageKey(statKey, slot);
    if (!storageKey || typeof localStorage === 'undefined') return;
    try {
        const bn = value instanceof BigNum ? value : BigNum.fromAny(value ?? 1);
        const locked = isStorageKeyLocked(storageKey);
        const setter = locked && originalSetItem ? originalSetItem : localStorage.setItem.bind(localStorage);
        if (locked && !originalSetItem) unlockStorageKey(storageKey);
        setter(storageKey, bn.toStorage?.() ?? String(bn));
        if (locked && !originalSetItem) lockStorageKey(storageKey);
    } catch {}
}

function applyCurrencyOverrideForSlot(currencyKey, slot = getActiveSlot()) {
    if (slot == null) return;
    const override = getCurrencyOverride(slot, currencyKey);
    if (!override) return;
    if (slot !== getActiveSlot()) return;

    const cacheKey = buildOverrideKey(slot, currencyKey);
    if (currencyOverrideApplications.has(cacheKey)) return;

    currencyOverrideApplications.add(cacheKey);
    try {
        const current = bank?.[currencyKey]?.mult?.get?.();
        if (!bigNumEquals(current, override)) {
            bank?.[currencyKey]?.mult?.set?.(override);
        }
    } catch {} finally {
        currencyOverrideApplications.delete(cacheKey);
    }
}

let currencyListenerAttached = false;
function ensureCurrencyOverrideListener() {
    if (currencyListenerAttached || typeof window === 'undefined') return;
    currencyListenerAttached = true;
    try {
        window.addEventListener('currency:multiplier', (event) => {
            const { key, slot, mult } = event?.detail ?? {};
            const targetSlot = slot ?? getActiveSlot();
            const cacheKey = buildOverrideKey(targetSlot, key);
            if (!targetSlot || !currencyOverrides.has(cacheKey)) return;
            if (currencyOverrideApplications.has(cacheKey)) return;

            const baseline = currencyOverrideBaselines.get(cacheKey);
            const override = getCurrencyOverride(targetSlot, key);

            if (baseline && override && mult) {
                const baselineNum = bigNumToFiniteNumber(baseline);
                const nextNum = bigNumToFiniteNumber(mult);

                if (
                    Number.isFinite(baselineNum)
                    && Number.isFinite(nextNum)
                    && baselineNum !== 0
                ) {
                    const ratio = nextNum / baselineNum;
                    if (ratio && ratio !== 1) {
                        try {
                            const scaledOverride = override.mulDecimal?.(ratio) ?? override;
                            currencyOverrides.set(cacheKey, scaledOverride);
                        } catch {}
                    }
                }

                currencyOverrideBaselines.set(cacheKey, mult);
            } else if (mult) {
                currencyOverrideBaselines.set(cacheKey, mult);
            }

            applyCurrencyOverrideForSlot(key, targetSlot);
        }, { passive: true });
        window.addEventListener('saveSlot:change', () => {
            applyAllCurrencyOverridesForActiveSlot();
        }, { passive: true });
    } catch {}
}

export function applyAllCurrencyOverridesForActiveSlot() {
    const slot = getActiveSlot();
    if (slot == null) return;
    Object.values(CURRENCIES).forEach((key) => {
        applyCurrencyOverrideForSlot(key, slot);
    });
}

export function setDebugCurrencyMultiplierOverride(currencyKey, value, slot = getActiveSlot()) {
    if (!currencyKey || slot == null) return null;
    ensureCurrencyOverrideListener();
    let bn;
    try { bn = value instanceof BigNum ? value.clone?.() ?? value : BigNum.fromAny(value ?? 1); }
    catch { bn = BigNum.fromInt(1); }
    const cacheKey = buildOverrideKey(slot, currencyKey);
    currencyOverrides.set(cacheKey, bn);
    const gameValue = bank?.[currencyKey]?.mult?.get?.();
    currencyOverrideBaselines.set(cacheKey, gameValue);
    applyCurrencyOverrideForSlot(currencyKey, slot);
    return bn;
}


export function getDebugCurrencyMultiplierOverride(currencyKey, slot = getActiveSlot()) {
    if (!currencyKey || slot == null) return null;
    return getCurrencyOverride(slot, currencyKey);
}

export function setDebugStatMultiplierOverride(statKey, value, slot = getActiveSlot()) {
    if (!statKey || slot == null) return null;
    let bn;
    try { bn = value instanceof BigNum ? value.clone?.() ?? value : BigNum.fromAny(value ?? 1); }
    catch { bn = BigNum.fromInt(1); }
    statOverrides.set(buildOverrideKey(slot, statKey), bn);
    statOverrideBaselines.set(buildOverrideKey(slot, statKey), getGameStatMultiplier(statKey));
    storeStatMultiplierOverride(statKey, slot, bn);
    notifyStatMultiplierChange(statKey, slot);
    return bn;
}

export function getDebugStatMultiplierOverride(statKey, slot = getActiveSlot()) {
    if (!statKey || slot == null) return null;
    return getStatOverride(slot, statKey);
}

export function applyStatMultiplierOverride(statKey, amount, slot = getActiveSlot()) {
    const gameValue = getGameStatMultiplier(statKey);
    const override = getEffectiveStatMultiplierOverride(statKey, slot, gameValue);
    if (!override) return amount;

    let base;
    try {
        base = amount instanceof BigNum ? amount.clone?.() ?? amount : BigNum.fromAny(amount ?? 0);
    } catch {
        return amount;
    }

    // If the caller is passing the raw in-game multiplier itself (e.g. XP Value,
    // MP Value, etc.), avoid ratio math and just return the override directly.
    // This prevents weird cases like 0.999... when we conceptually want 1.000...
    try {
        if (bigNumEquals(base, gameValue)) {
            return override;
        }
    } catch {
        // fall through and apply ratio logic below
    }

    try {
        if (base.isZero?.()) return base;
    } catch {
        return base;
    }

    const cacheKey = buildOverrideKey(slot, statKey);
    const baseline = statOverrideBaselines.get(cacheKey);
    const multiplierForRatio =
        (isStatMultiplierLocked(statKey, slot) && baseline) ? baseline : gameValue;

    const overrideNum = bigNumToFiniteNumber(override);
    const gameValueNum = bigNumToFiniteNumber(multiplierForRatio);
    const ratio =
        Number.isFinite(overrideNum) &&
        Number.isFinite(gameValueNum) &&
        gameValueNum !== 0
            ? overrideNum / gameValueNum
            : Number.NaN;

    if (Number.isFinite(ratio) && ratio !== 1) {
        try { return base.mulDecimal?.(ratio) ?? base; }
        catch {}
    }

    return base;
}

function getEffectiveStatMultiplierOverride(statKey, slot, gameValue) {
    const override = getStatOverride(slot, statKey);
    const cacheKey = buildOverrideKey(slot, statKey);
    if (!override) {
        statOverrideBaselines.delete(cacheKey);
        return null;
    }

    const baseline = statOverrideBaselines.get(cacheKey);
    const locked = isStatMultiplierLocked(statKey, slot);

    if (!baseline) {
        statOverrideBaselines.set(cacheKey, gameValue);
    } else if (!bigNumEquals(baseline, gameValue)) {
        statOverrideBaselines.set(cacheKey, gameValue);
        if (locked) {
            return override;
        }
        statOverrideBaselines.set(cacheKey, gameValue);
        clearStatMultiplierOverride(statKey, slot);
        return null;
    }

    return override;
}

function ensureStorageLockPatch() {
    if (storageLockPatched || typeof localStorage === 'undefined') return;
    storageLockPatched = true;
    try {
        originalSetItem = localStorage.setItem.bind(localStorage);
        originalRemoveItem = localStorage.removeItem.bind(localStorage);
        localStorage.setItem = (key, value) => {
            if (lockedStorageKeys.has(key)) return;
            return originalSetItem(key, value);
        };
        localStorage.removeItem = (key) => {
            if (lockedStorageKeys.has(key)) return;
            return originalRemoveItem(key);
        };
    } catch {}
}

function isStorageKeyLocked(key) {
    return key != null && lockedStorageKeys.has(key);
}

function lockStorageKey(key) {
    if (!key) return;
    ensureStorageLockPatch();
    lockedStorageKeys.add(key);
}

function unlockStorageKey(key) {
    if (!key) return;
    lockedStorageKeys.delete(key);
}

function toggleStorageLock(key) {
    if (!key) return false;
    if (isStorageKeyLocked(key)) {
        unlockStorageKey(key);
        return false;
    }
    lockStorageKey(key);
    return true;
}

function createLockToggle(storageKey, { onToggle } = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'debug-lock-button';

    const refresh = () => {
        const locked = isStorageKeyLocked(storageKey);
        button.textContent = locked ? 'L' : 'UL';
        button.classList.toggle('locked', locked);
    };

    button.addEventListener('click', () => {
        toggleStorageLock(storageKey);
        if (typeof onToggle === 'function') {
            try { onToggle(isStorageKeyLocked(storageKey)); }
            catch {}
        }
        refresh();
    });

    refresh();
    return { button, refresh };
}

applyAllCurrencyOverridesForActiveSlot();
ensureCurrencyOverrideListener();

function collapseAllDebugCategories() {
    const panel = document.getElementById(DEBUG_PANEL_ID);
    if (!panel) return;

    panel.querySelectorAll('.debug-panel-section-toggle').forEach((toggle) => {
        toggle.classList.remove('expanded');
        const content = toggle.nextElementSibling;
        if (content) content.classList.remove('active');
    });

    panel.querySelectorAll('.debug-panel-subsection-toggle').forEach((toggle) => {
        toggle.classList.remove('expanded');
        const content = toggle.nextElementSibling;
        if (content) content.classList.remove('active');
    });
}

function formatBigNumForInput(value) {
    try {
        const bn = value instanceof BigNum ? value : BigNum.fromAny(value ?? 0);
        if (bn.isInfinite?.()) {
            const precision = Number.parseInt(bn?.p, 10) || BigNum.DEFAULT_PRECISION;
            return `BN:${precision}:1:${BigNum.MAX_E}`;
        }
        const storage = bn.toStorage?.();
        const [, pStr = `${BigNum.DEFAULT_PRECISION}`, sigPart = '0', expPart = '0'] = (storage || '').split(':');
        const precision = Number.parseInt(pStr, 10) || BigNum.DEFAULT_PRECISION;
        if (bn.isZero?.()) {
            return `BN:${precision}:${'0'.repeat(precision)}:-17`;
        }
        const paddedSig = sigPart.padStart(precision, '0');
        return `BN:${precision}:${paddedSig}:${expPart}`;
    } catch {
        return String(value ?? '');
    }
}

function parseBigNumInput(raw) {
    const trimmed = String(raw ?? '').trim();
    if (!trimmed) return BigNum.fromInt(0);
    try {
        if (/^inf(?:inity)?$/i.test(trimmed)) {
            return BigNum.fromAny('Infinity');
        }
        return BigNum.fromAny(trimmed);
    } catch {
        return null;
    }
}

function setInputValidity(input, valid) {
    input.classList.toggle('debug-invalid', !valid);
}

function flagDebugUsage() {
    const slot = getActiveSlot();
    try { markSaveSlotModified(slot); }
    catch {}
    try { window.dispatchEvent(new CustomEvent('debug:change', { detail: { slot } })); }
    catch {}
}

function getActionLogKey(slot = getActiveSlot()) {
    if (slot == null) return null;
    return `${ACTION_LOG_STORAGE_PREFIX}:${slot}`;
}

function getCurrentActionLog(slot = getActiveSlot()) {
    const key = getActionLogKey(slot);
    if (!key) return [];

    let raw = null;
    try { raw = localStorage.getItem(key); }
    catch {}
    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function persistActionLog(entries, slot = getActiveSlot()) {
    const key = getActionLogKey(slot);
    if (!key || typeof localStorage === 'undefined') return;

    const trimmed = (Array.isArray(entries) ? entries : []).slice(0, MAX_ACTION_LOG_ENTRIES);
    try { localStorage.setItem(key, JSON.stringify(trimmed)); }
    catch {}
}

function appendActionLogEntry(entry, slot = getActiveSlot()) {
    const log = getCurrentActionLog(slot);
    log.unshift(entry);
    if (log.length > MAX_ACTION_LOG_ENTRIES) {
        log.length = MAX_ACTION_LOG_ENTRIES;
    }
    persistActionLog(log, slot);
    return log;
}

function logAction(message) {
    const slot = getActiveSlot();
    if (slot == null) return;

    const now = new Date();
    const entry = {
        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        message,
        timestamp: now.getTime(),
    };
    appendActionLogEntry(entry, slot);
    updateActionLogDisplay();
}

function updateActionLogDisplay() {
    if (!actionLogContainer) return;

    const actionLog = getCurrentActionLog();
    if (actionLog.length === 0) {
        actionLogContainer.innerHTML = '';
        const msg = document.createElement('div');
        msg.className = 'action-log-empty';
        msg.textContent = 'Actions you perform in the Debug Panel will be logged permanently in this action log.';
        actionLogContainer.appendChild(msg);
        return;
    }

    actionLogContainer.innerHTML = actionLog.map((entry) => {
        let formattedMessage = entry.message?.replace?.(/\[GOLD\](.*?)\[\/GOLD\]/g, '<span class="action-log-gold">$1</span>') ?? '';
		formattedMessage = formattedMessage.replace(/\b(?:Level|Lv)\s?(\d+)\b/g, '<span class="action-log-level">Lv$1</span>');
        formattedMessage = formattedMessage.replace(/(\d[\d,.]*(?:e[+-]?\d+)*(?:[KMBTQa-zA-Z]*))/g, (match) => /\d/.test(match) ? `<span class="action-log-number">${match}</span>` : match);
		formattedMessage = formattedMessage.replace(/<span[^>]*class="[^"]*infinity-symbol[^"]*"[^>]*>∞<\/span>/g, '<span class="action-log-number">inf</span>');
		formattedMessage = formattedMessage.replace(/∞/g,'<span class="action-log-number">inf</span>');


        return `
            <div class="action-log-entry">
                <span class="action-log-time">${entry.time}:</span>
                <span class="action-log-message">${formattedMessage}</span>
            </div>
        `;
    }).join('');
}

function dialogueStateStorageKey(slot = getActiveSlot()) {
    if (slot == null) return null;
    return `${MERCHANT_DLG_STATE_KEY_BASE}:${slot}`;
}

function persistDialogueState(state, slot = getActiveSlot()) {
    const key = dialogueStateStorageKey(slot);
    if (!key) return;
    try {
        const payload = JSON.stringify(state || {});
        localStorage.setItem(key, payload);
    } catch {}
}

function loadDialogueState(slot = getActiveSlot()) {
    const key = dialogueStateStorageKey(slot);
    if (!key) return {};
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : {};
    } catch {
        return {};
    }
}

function grantDialogueReward(reward) {
    if (!reward) return;
    if (reward.type === 'coins') {
        try { bank.coins.add(reward.amount); }
        catch (e) { console.warn('Failed to grant coin reward:', reward, e); }
        return;
    }
    if (reward.type === 'books') {
        try {
            bank.books.addWithMultiplier?.(reward.amount) ?? bank.books.add(reward.amount);
        } catch (e) {
            console.warn('Failed to grant book reward:', reward, e);
        }
        return;
    }
    try { window.dispatchEvent(new CustomEvent('merchantReward', { detail: reward })); }
    catch {}
}

function completeAllDialoguesForDebug() {
    const slot = getActiveSlot();
    if (slot == null) return { completed: 0 };

    const state = loadDialogueState(slot);
    let completed = 0;

    Object.entries(DLG_CATALOG).forEach(([id, meta]) => {
        const key = String(id);
        const prev = state[key] || {};
        const alreadyClaimed = !!prev.claimed;
        const next = Object.assign({}, prev, { status: 'unlocked', claimed: true });
        state[key] = next;
        if (!alreadyClaimed) {
            completed += 1;
            grantDialogueReward(meta.reward);
        }
    });

    persistDialogueState(state, slot);
    return { completed };
}

function restoreAllDialoguesForDebug() {
    const slot = getActiveSlot();
    if (slot == null) return { restored: 0 };

    const state = loadDialogueState(slot);
    let restored = 0;

    Object.entries(DLG_CATALOG).forEach(([id]) => {
        const key = String(id);
        const prev = state[key] || {};
        if (prev.claimed) restored += 1;
        state[key] = Object.assign({}, prev, { claimed: false });
    });

    persistDialogueState(state, slot);
    return { restored };
}

function createInputRow(labelText, initialValue, onCommit, { idLabel, storageKey, onLockChange } = {}) {
    const row = document.createElement('div');
    row.className = 'debug-panel-row';

    const label = document.createElement('label');
    label.textContent = labelText;
    if (idLabel != null) {
        label.append(' ');
        const idSpan = document.createElement('span');
        idSpan.className = 'debug-panel-id';
        idSpan.textContent = `(ID: ${idLabel})`;
        label.appendChild(idSpan);
    }
    row.appendChild(label);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'debug-panel-input';
    let editing = false;
    let pendingValue = null;
    let skipBlurCommit = false;
    const lockToggle = storageKey ? createLockToggle(storageKey, { onToggle: onLockChange }) : null;

    const setValue = (value) => {
        if (editing) {
            pendingValue = value;
            return;
        }
        pendingValue = null;
        input.value = formatBigNumForInput(value);
    };

    row.appendChild(input);
    if (lockToggle) {
        row.appendChild(lockToggle.button);
    }

    const commitValue = () => {
        const parsed = parseBigNumInput(input.value);
        if (!parsed) {
            setInputValidity(input, false);
            return;
        }
        setInputValidity(input, true);

        const wasLocked = storageKey && isStorageKeyLocked(storageKey);
        if (wasLocked) unlockStorageKey(storageKey);
        try {
            onCommit(parsed, { input, setValue });
        } finally {
            if (wasLocked) lockStorageKey(storageKey);
            if (lockToggle) lockToggle.refresh();
        }
    };

    input.addEventListener('focus', () => { editing = true; });
    input.addEventListener('change', commitValue);
    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            skipBlurCommit = true;
            commitValue();
            input.blur();
        }
    });
    input.addEventListener('blur', () => {
        editing = false;
        if (!skipBlurCommit) {
            commitValue();
        }
        skipBlurCommit = false;
        if (pendingValue != null) {
            const next = pendingValue;
            pendingValue = null;
            setValue(next);
        }
    });

    setValue(initialValue);
    if (lockToggle) lockToggle.refresh();

    return { row, input, setValue, isEditing: () => editing };
}

function createUnlockToggleRow({ labelText, description, isUnlocked, onEnable, onDisable, slot }) {
    const row = document.createElement('div');
    row.className = 'debug-panel-row debug-unlock-row';

    const toggle = document.createElement('label');
    toggle.className = 'flag-toggle';
    toggle.setAttribute('aria-label', labelText);

    const input = document.createElement('input');
    input.type = 'checkbox';

    const slider = document.createElement('span');
    slider.className = 'flag-slider';

    toggle.appendChild(input);
    toggle.appendChild(slider);

    const textContainer = document.createElement('div');
    textContainer.className = 'debug-unlock-text';

    const title = document.createElement('span');
    title.className = 'debug-unlock-title';
    title.textContent = labelText;
    textContainer.appendChild(title);

    if (description) {
        const desc = document.createElement('span');
        desc.className = 'debug-unlock-desc';
        desc.textContent = `- ${description}`;
        textContainer.appendChild(desc);
    }

    row.appendChild(toggle);
    row.appendChild(textContainer);

    const toggleRow = () => {
        input.checked = !input.checked;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    row.addEventListener('click', (event) => {
        if (toggle.contains(event.target)) return;
        toggleRow();
    });

    let lastKnown = false;

    const refresh = () => {
        let unlocked = false;
        try { unlocked = typeof isUnlocked === 'function' ? !!isUnlocked() : false; }
        catch {}
        input.checked = unlocked;
        lastKnown = unlocked;
        return unlocked;
    };

    input.addEventListener('change', () => {
        const previous = lastKnown;
        const unlocked = input.checked;
        try {
            if (unlocked) {
                onEnable?.();
            } else {
                onDisable?.();
            }
        } catch {}
        flagDebugUsage();
        const refreshed = refresh();
        if (previous !== refreshed) {
            logAction(`Toggled ${labelText} [GOLD]${previous ? 'True' : 'False'}[/GOLD] → [GOLD]${refreshed ? 'True' : 'False'}[/GOLD]`);
        }
    });

    refresh();
    registerLiveBinding({ type: 'unlock', slot, refresh });
    return row;
}

function formatCalculatorResult(value) {
    try {
        if (value instanceof BigNum || typeof value?.toScientific === 'function') {
            return formatNumber(value);
        }
        const num = Number(value);
        if (Number.isFinite(num)) {
            return formatNumber(num);
        }
        return String(value ?? '—');
    } catch {
        return '—';
    }
}

function createCalculatorRow({ labelText, inputs = [], compute }) {
    const row = document.createElement('div');
    row.className = 'debug-panel-row debug-calculator-row';

    const label = document.createElement('label');
    label.textContent = labelText;
    row.appendChild(label);

    const controls = document.createElement('div');
    controls.className = 'debug-calculator-inputs';
    row.appendChild(controls);

    const output = document.createElement('div');
    output.className = 'debug-calculator-output';
    output.textContent = '—';
    row.appendChild(output);

    const fieldEls = [];

    const recompute = () => {
        const values = {};
        let hasError = false;

        fieldEls.forEach(({ config, el }) => {
            if (config.type === 'select') {
                values[config.key] = el.value;
                return;
            }

            const parsed = parseBigNumInput(el.value);
            const valid = parsed instanceof BigNum;
            setInputValidity(el, valid);
            if (!valid) {
                hasError = true;
                return;
            }
            values[config.key] = parsed;
        });

        if (hasError || typeof compute !== 'function') {
            output.textContent = '—';
            return;
        }

        try {
            const result = compute(values);
            output.innerHTML = formatCalculatorResult(result);
        } catch {
            output.textContent = '—';
        }
    };

    inputs.forEach((inputConfig) => {
        const config = Object.assign({ type: 'text', defaultValue: '' }, inputConfig);
        if (!config.key) return;

        if (config.type === 'select') {
            const select = document.createElement('select');
            select.className = 'debug-panel-input';
            (config.options || []).forEach(({ value, label: optLabel }) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = optLabel ?? value;
                if (config.defaultValue != null && config.defaultValue === value) {
                    option.selected = true;
                }
                select.appendChild(option);
            });
            select.addEventListener('change', recompute);
            controls.appendChild(select);
            fieldEls.push({ config, el: select });
        } else {
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'debug-panel-input';
            input.placeholder = config.label || '';
            input.value = config.defaultValue ?? '';
            input.addEventListener('input', recompute);
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    recompute();
                }
            });
            controls.appendChild(input);
            fieldEls.push({ config, el: input });
        }
    });

    recompute();

    return row;
}

function applyXpState({ level, progress }) {
    const slot = getActiveSlot();
    if (slot == null) return;

    // If we're manually editing XP stats from the debug panel, the XP system
    // should be treated as unlocked.
    try { unlockXpSystem(); } catch {}

    const unlockKey = XP_KEYS.unlock(slot);
    try { localStorage.setItem(unlockKey, '1'); } catch {}
    primeStorageWatcherSnapshot(unlockKey, '1');

    if (level != null) {
        try {
            const raw = level.toStorage?.() ?? BigNum.fromAny(level).toStorage();
            const key = XP_KEYS.level(slot);
            localStorage.setItem(key, raw);
            primeStorageWatcherSnapshot(key, raw);
        } catch {}
    }

    if (progress != null) {
        try {
            const raw = progress.toStorage?.() ?? BigNum.fromAny(progress).toStorage();
            const key = XP_KEYS.progress(slot);
            localStorage.setItem(key, raw);
            primeStorageWatcherSnapshot(key, raw);
        } catch {}
    }

    try {
        initXpSystem({ forceReload: true });
    } catch {}

    // Let any XP listeners know we've made a manual change so dependent UI (like
    // the Forge reset panel) can refresh immediately without waiting for normal
    // gameplay hooks to fire.
    try {
        broadcastXpChange({ changeType: 'debug-panel', slot });
    } catch {}

    // Also keep ALL debug live bindings in sync (including the Unlocks tab
    // "Unlock XP" flag, which reads getXpState().unlocked).
    try {
        refreshLiveBindings();
    } catch {}
}

function applyMutationState({ level, progress }) {
    const slot = getActiveSlot();
    if (slot == null) return;

    // If the MP system isn't unlocked yet, setting its level/progress should
    // auto-enable the relevant unlock flags so the UI and systems stay in
    // sync.
    try {
        const forgeUnlocked = typeof isForgeUnlocked === 'function' ? isForgeUnlocked() : false;
        const forgeOverride = typeof getForgeDebugOverrideState === 'function'
            ? getForgeDebugOverrideState()
            : null;
        if (!forgeUnlocked && forgeOverride !== true) {
            setForgeDebugOverride?.(true);
        }
    } catch {}

    try {
        if (typeof hasDoneForgeReset === 'function' && !hasDoneForgeReset()) {
            setForgeResetCompleted?.(true);
        }
    } catch {}

    try { setMutationUnlockedForDebug(true); } catch {}

    try { updateResetPanel?.(); } catch {}

    // Make sure the mutation / MP system is treated as unlocked if we're
    // manually editing its stats from the debug panel.
    try { initMutationSystem(); } catch {}
    try { unlockMutationSystem(); } catch {}

    const unlockKey = MUTATION_KEYS.unlock(slot);
    try { localStorage.setItem(unlockKey, '1'); } catch {}
    primeStorageWatcherSnapshot(unlockKey, '1');

    if (level != null) {
        try {
            const raw = level.toStorage?.() ?? BigNum.fromAny(level).toStorage();
            const key = MUTATION_KEYS.level(slot);
            localStorage.setItem(key, raw);
            primeStorageWatcherSnapshot(key, raw);
        } catch {}
    }

    if (progress != null) {
        try {
            const raw = progress.toStorage?.() ?? BigNum.fromAny(progress).toStorage();
            const key = MUTATION_KEYS.progress(slot);
            localStorage.setItem(key, raw);
            primeStorageWatcherSnapshot(key, raw);
        } catch {}
    }

    try {
        initMutationSystem({ forceReload: true });
    } catch {}

    try {
        broadcastMutationChange({ changeType: 'debug-panel', slot });
    } catch {}

    // Keep all debug rows that depend on mutation / MP state in sync.
    try {
        refreshLiveBindings();
    } catch {}
}

function buildAreaCurrencies(container, area) {
    const slot = getActiveSlot();
    if (slot == null) {
        const msg = document.createElement('div');
        msg.className = 'debug-panel-empty';
        msg.textContent = 'Select a save slot to edit currency values.';
        container.appendChild(msg);
        return;
    }

    const areaLabel = area?.title ?? area?.key ?? 'Unknown Area';

    area.currencies.forEach((currency) => {
        const storageKey = getCurrencyStorageKey(currency.key, slot);
        const current = getCurrencyValueForSlot(currency.key, slot);
        const currencyRow = createInputRow(currency.label, current, (value, { setValue }) => {
            const latestSlot = getActiveSlot();
            if (latestSlot == null) return;
            if (latestSlot !== slot) return;

            const { previous, next } = applyCurrencyState(currency.key, value, latestSlot);
            setValue(next);
            if (!bigNumEquals(previous, next)) {
                flagDebugUsage();
                logAction(`Modified ${currency.label} (${areaLabel}) ${formatNumber(previous)} → ${formatNumber(next)}`);
            }
        }, {
            storageKey,
            onLockChange: () => currencyRow.setValue(getCurrencyValueForSlot(currency.key, getActiveSlot())),
        });
        registerLiveBinding({
            type: 'currency',
            key: currency.key,
            slot,
            refresh: () => {
                if (slot !== getActiveSlot()) return;
                const latest = getCurrencyValueForSlot(currency.key, slot);
                currencyRow.setValue(latest);
            },
        });
        container.appendChild(currencyRow.row);
    });
}

function buildAreaStats(container, area) {
    const slot = getActiveSlot();
    if (slot == null) {
        const msg = document.createElement('div');
        msg.className = 'debug-panel-empty';
        msg.textContent = 'Select a save slot to edit stats.';
        container.appendChild(msg);
        return;
    }

    const xp = getXpState();
    const mutation = getMutationState();
    const areaLabel = area?.title ?? area?.key ?? 'Unknown Area';

    const xpLevelKey = XP_KEYS.level(slot);
    const xpLevelRow = createInputRow('XP Level', xp.xpLevel, (value, { setValue }) => {
        const prev = getXpState().xpLevel;
        applyXpState({ level: value });
        const latest = getXpState();
        setValue(latest.xpLevel);
        if (!bigNumEquals(prev, latest.xpLevel)) {
            flagDebugUsage();
            logAction(`Modified XP Level (${areaLabel}) ${formatNumber(prev)} → ${formatNumber(latest.xpLevel)}`);
        }
    }, { storageKey: xpLevelKey });
    registerLiveBinding({
        type: 'xp',
        slot,
        refresh: () => {
            if (slot !== getActiveSlot()) return;
            xpLevelRow.setValue(getXpState().xpLevel);
        },
    });
    container.appendChild(xpLevelRow.row);

    const xpProgressKey = XP_KEYS.progress(slot);
    const xpProgressRow = createInputRow('XP Progress', xp.progress, (value, { setValue }) => {
        const prev = getXpState();
        const prevLevel = prev?.xpLevel?.clone?.() ?? prev?.xpLevel;
        const prevProgress = prev?.progress?.clone?.() ?? prev?.progress;
        applyXpState({ progress: value });
        const latest = getXpState();
        setValue(latest.progress);
        xpLevelRow.setValue(latest.xpLevel);
        if (!bigNumEquals(prevProgress, latest.progress) || !bigNumEquals(prevLevel, latest.xpLevel)) {
            flagDebugUsage();
            logAction(`Modified XP Progress (${areaLabel}) ${formatNumber(prevProgress)} → ${formatNumber(latest.progress)}`);
        }
    }, { storageKey: xpProgressKey });
    registerLiveBinding({
        type: 'xp',
        slot,
        refresh: () => {
            if (slot !== getActiveSlot()) return;
            xpProgressRow.setValue(getXpState().progress);
        },
    });
    container.appendChild(xpProgressRow.row);

    const mpLevelKey = MUTATION_KEYS.level(slot);
    const mpLevelRow = createInputRow('MP Level', mutation.level, (value, { setValue }) => {
        const prev = getMutationState().level;
        applyMutationState({ level: value });
        const latest = getMutationState();
        setValue(latest.level);
        if (!bigNumEquals(prev, latest.level)) {
            flagDebugUsage();
            logAction(`Modified MP Level (${areaLabel}) ${formatNumber(prev)} → ${formatNumber(latest.level)}`);
        }
    }, { storageKey: mpLevelKey });
    registerLiveBinding({
        type: 'mutation',
        slot,
        refresh: () => {
            if (slot !== getActiveSlot()) return;
            mpLevelRow.setValue(getMutationState().level);
        },
    });
    container.appendChild(mpLevelRow.row);

    const mpProgressKey = MUTATION_KEYS.progress(slot);
    const mpProgressRow = createInputRow('MP Progress', mutation.progress, (value, { setValue }) => {
        const prev = getMutationState();
        const prevLevel = prev?.level?.clone?.() ?? prev?.level;
        const prevProgress = prev?.progress?.clone?.() ?? prev?.progress;
        applyMutationState({ progress: value });
        const latest = getMutationState();
        setValue(latest.progress);
        mpLevelRow.setValue(latest.level);
        if (!bigNumEquals(prevProgress, latest.progress) || !bigNumEquals(prevLevel, latest.level)) {
            flagDebugUsage();
            logAction(`Modified MP Progress (${areaLabel}) ${formatNumber(prevProgress)} → ${formatNumber(latest.progress)}`);
        }
    }, { storageKey: mpProgressKey });
    registerLiveBinding({
        type: 'mutation',
        slot,
        refresh: () => {
            if (slot !== getActiveSlot()) return;
            mpProgressRow.setValue(getMutationState().progress);
        },
    });
    container.appendChild(mpProgressRow.row);
}

function buildAreaUpgrades(container, area) {
    const slot = getActiveSlot();
    if (slot == null) {
        const msg = document.createElement('div');
        msg.className = 'debug-panel-empty';
        msg.textContent = 'Select a save slot to edit upgrades.';
        container.appendChild(msg);
        return;
    }

    const upgrades = getUpgradesForArea(area.key);
    if (!upgrades || upgrades.length === 0) {
        const msg = document.createElement('div');
        msg.className = 'debug-panel-empty';
        msg.textContent = 'No upgrades found for this area yet.';
        container.appendChild(msg);
        return;
    }

    const areaLabel = area?.title ?? area?.key ?? 'Unknown Area';

    upgrades.forEach((upg) => {
        const idLabel = upg.id ?? upg.tie ?? upg.tieKey;
        const title = upg.title || `Upgrade ${idLabel ?? ''}`.trim();
        const current = getLevel(area.key, upg.id ?? upg.tie);
        const upgradeRow = createInputRow(title, current, (value, { setValue }) => {
            const latestSlot = getActiveSlot();
            if (latestSlot == null) return;
            const previous = getLevel(area.key, upg.id ?? upg.tie);
            try { setLevel(area.key, upg.id ?? upg.tie, value, false); } catch {}
            const refreshed = getLevel(area.key, upg.id ?? upg.tie);
            setValue(refreshed);
            if (!bigNumEquals(previous, refreshed)) {
                flagDebugUsage();
                logAction(`Modified ${title} (${areaLabel} - ID: ${idLabel ?? 'Unknown'}) Lv${formatNumber(previous)} → Lv${formatNumber(refreshed)}`);
            }
        }, { idLabel });
        registerLiveBinding({
            type: 'upgrade',
            slot,
            refresh: () => {
                if (slot !== getActiveSlot()) return;
                const refreshed = getLevel(area.key, upg.id ?? upg.tie);
                upgradeRow.setValue(refreshed);
            },
        });
        container.appendChild(upgradeRow.row);
    });
}

function buildAreaCurrencyMultipliers(container, area) {
    const slot = getActiveSlot();
    if (slot == null) {
        const msg = document.createElement('div');
        msg.className = 'debug-panel-empty';
        msg.textContent = 'Select a save slot to edit currency multipliers.';
        container.appendChild(msg);
        return;
    }

    const areaLabel = area?.title ?? area?.key ?? 'Unknown Area';

    area.currencies.forEach((currency) => {
        const handle = bank?.[currency.key]?.mult;
        const currentOverride = getDebugCurrencyMultiplierOverride(currency.key, slot);
        const current = currentOverride ?? handle?.get?.() ?? BigNum.fromInt(1);
        const storageKey = `${KEYS.MULTIPLIER[currency.key]}:${slot}`;
        const row = createInputRow(`${currency.label} Multiplier`, current, (value, { setValue }) => {
            const latestSlot = getActiveSlot();
            if (latestSlot == null) return;
            const previous = getDebugCurrencyMultiplierOverride(currency.key, latestSlot)
                ?? handle?.get?.()
                ?? BigNum.fromInt(1);
            try { setDebugCurrencyMultiplierOverride(currency.key, value, latestSlot); } catch {}
            applyAllCurrencyOverridesForActiveSlot();
            const refreshedOverride = getDebugCurrencyMultiplierOverride(currency.key, latestSlot);
            const refreshed = refreshedOverride ?? handle?.get?.() ?? BigNum.fromInt(1);
            setValue(refreshed);
            if (!bigNumEquals(previous, refreshed)) {
                flagDebugUsage();
                logAction(`Modified ${currency.label} Multiplier (${areaLabel}) ${formatNumber(previous)} → ${formatNumber(refreshed)}`);
            }
        }, { storageKey });
        registerLiveBinding({
            type: 'currency-mult',
            key: currency.key,
            slot,
            refresh: () => {
                if (slot !== getActiveSlot()) return;
                const latestOverride = getDebugCurrencyMultiplierOverride(currency.key, slot);
                const latest = latestOverride ?? handle?.get?.() ?? BigNum.fromInt(1);
                row.setValue(latest);
            },
        });
        container.appendChild(row.row);
    });
}

function setAllCurrenciesToInfinity() {
    const slot = getActiveSlot();
    if (slot == null) return 0;

    const inf = BigNum.fromAny('Infinity');
    let updated = 0;

    Object.values(CURRENCIES).forEach((key) => {
        const handle = bank?.[key];
        if (!handle) return;
        try {
            const current = handle.value ?? handle.get?.();
            const isAlreadyInf =
                current?.isInfinite?.() ||
                bigNumEquals(current, inf);

            if (isAlreadyInf) return;

            handle.set(inf);
            updated += 1;
        } catch {}
    });

    return updated;
}

function setAllStatsToInfinity() {
    const slot = getActiveSlot();
    if (slot == null) return 0;

    const inf = BigNum.fromAny('Infinity');
    let touched = 0;

    // XP: only touch if level/progress aren’t already infinite
    try {
        const xp = getXpState();
        const levelInf =
            xp?.xpLevel?.isInfinite?.() ||
            bigNumEquals(xp?.xpLevel, inf);
        const progInf =
            xp?.progress?.isInfinite?.() ||
            bigNumEquals(xp?.progress, inf);

        if (!levelInf || !progInf) {
            applyXpState({ level: inf, progress: inf });
            touched += 1; // count "XP" as one stat block
        }
    } catch {}

    // MP / Mutation: same idea
    try {
        const mutation = getMutationState();
        const levelInf =
            mutation?.level?.isInfinite?.() ||
            bigNumEquals(mutation?.level, inf);
        const progInf =
            mutation?.progress?.isInfinite?.() ||
            bigNumEquals(mutation?.progress, inf);

        if (!levelInf || !progInf) {
            applyMutationState({ level: inf, progress: inf });
            touched += 1; // count "MP" as one stat block
        }
    } catch {}

    // Stat multipliers (XP, MP, etc.)
    STAT_MULTIPLIERS.forEach(({ key }) => {
        try {
            const current = getStatMultiplierDisplayValue(key, slot);
            const isAlreadyInf =
                current?.isInfinite?.() ||
                bigNumEquals(current, inf);

            if (isAlreadyInf) return;

            setDebugStatMultiplierOverride(key, inf, slot);
            touched += 1;
        } catch {}
    });

    return touched;
}

function getUnlockRowDefinitions(slot) {
    return [
        {
            labelText: 'Unlock XP',
            description: 'If true, unlocks the XP system',
            isUnlocked: () => {
                try { return !!getXpState()?.unlocked; }
                catch { return false; }
            },
            onEnable: () => {
                try { unlockXpSystem(); }
                catch {}
                try { initXpSystem({ forceReload: true }); }
                catch {}
            },
            onDisable: () => {
                try { setForgeDebugOverride(false); }
                catch {}
                try { updateResetPanel(); }
                catch {}
            },
            slot,
        },
        {
            labelText: 'Unlock MP',
            description: 'If true, unlocks the MP system',
            isUnlocked: () => {
                try {
                    const override = getForgeDebugOverrideState();
                    if (override != null) return override;
                } catch {}
                try { return !!isForgeUnlocked(); }
                catch { return false; }
                return false;
            },
            onEnable: () => {
                try { setForgeDebugOverride(true); }
                catch {}
                try { updateResetPanel(); }
                catch {}
            },
            onDisable: () => {
                try { setForgeDebugOverride(false); }
                catch {}
                try { updateResetPanel(); }
                catch {}
            },
        },
        {
            labelText: 'Unlock MP',
            description: 'If true, unlocks the MP system',
            isUnlocked: () => {
                try { return hasDoneForgeReset(); }
                catch { return false; }
            },
            onEnable: () => {
                try { setForgeResetCompleted(true); }
                catch {}
                try { setMutationUnlockedForDebug(true); }
                catch {}
                try { updateResetPanel(); }
                catch {}
            },
            onDisable: () => {
                try { setForgeResetCompleted(false); }
                catch {}
                try { setMutationUnlockedForDebug(false); }
                catch {}
                try { updateResetPanel(); }
                catch {}
            },
            slot,
        },
        {
            labelText: 'Unlock Shop',
            description: 'If true, makes the Shop button visible',
            isUnlocked: () => {
                try { return isShopUnlocked(); }
                catch { return false; }
            },
            onEnable: () => {
                try { unlockShop(); }
                catch {}
            },
            onDisable: () => {
                try { lockShop(); }
                catch {}
            },
            slot,
        },
        {
            labelText: 'Unlock Map',
            description: 'If true, makes the Map button visible',
            isUnlocked: () => {
                try { return isMapUnlocked(); }
                catch { return false; }
            },
            onEnable: () => {
                try { unlockMap(); }
                catch {}
            },
            onDisable: () => {
                try { lockMap(); }
                catch {}
            },
            slot,
        },
    ];
}

function setAllUnlockToggles(targetState) {
    const slot = getActiveSlot();
    if (slot == null) return 0;

    let toggled = 0;
    getUnlockRowDefinitions(slot).forEach((rowDef) => {
        let unlocked = false;
        try { unlocked = typeof rowDef.isUnlocked === 'function' ? !!rowDef.isUnlocked() : false; }
        catch {}

        if (unlocked === targetState) return;

        try {
            if (targetState) {
                rowDef.onEnable?.();
            } else {
                rowDef.onDisable?.();
            }
            toggled += 1;
        } catch {}
    });

    try { refreshLiveBindings(); } catch {}

    return toggled;
}

function unlockAllUnlockUpgrades() {
    const slot = getActiveSlot();
    if (slot == null) return { unlocks: 0, toggles: 0 };
    let unlocked = 0;
    getAreas().forEach((area) => {
        getUpgradesForArea(area.key).forEach((upg) => {
            if (!upg?.unlockUpgrade) return;
            try { markUpgradePermanentlyUnlocked(area.key, upg, slot); unlocked += 1; }
            catch {}
        });
    });
    try { unlockShop(); } catch {}
    try { unlockMap(); } catch {}
    const toggled = setAllUnlockToggles(true);
    return { unlocks: unlocked, toggles: toggled };
}

function lockAllUnlockUpgrades() {
    const slot = getActiveSlot();
    if (slot == null) return { locks: 0, toggles: 0 };
    let locked = 0;
    getAreas().forEach((area) => {
        getUpgradesForArea(area.key).forEach((upg) => {
            if (!upg?.unlockUpgrade) return;
            try { clearPermanentUpgradeUnlock(area.key, upg, slot); locked += 1; }
            catch {}
        });
    });
    try { lockShop(); } catch {}
    try { lockMap(); } catch {}
    const toggled = setAllUnlockToggles(false);
    return { locks: locked, toggles: toggled };
}

function resetCurrencyAndMultiplier(currencyKey) {
    try {
        // Reset the banked amount
        bank?.[currencyKey]?.set?.(BigNum.fromInt(0));
    } catch {}

    try {
        // Clear any debug override for this currency
        clearCurrencyMultiplierOverride(currencyKey);
    } catch {}

    try {
        // Put the actual in-game multiplier back to 1x
        setCurrencyMultiplierBN(currencyKey, BigNum.fromInt(1));
    } catch {}
}

function resetStatsAndMultipliers(target) {
    if (target === 'all') {
        // All currencies + multipliers: clear overrides and put real multipliers back to 1x
        Object.values(CURRENCIES).forEach((key) => resetCurrencyAndMultiplier(key));

        const zero = BigNum.fromInt(0);

        // XP + MP (mutation) state → 0
        applyXpState({ level: zero, progress: zero });
        applyMutationState({ level: zero, progress: zero });

        // For stats, behave like the stat multiplier debug field:
        // create a temporary 1x override that will be auto-cleared on the next
        // normal game multiplier update (XP Value, MP Value, etc.).
        STAT_MULTIPLIERS.forEach(({ key }) => {
            try { setDebugStatMultiplierOverride(key, BigNum.fromInt(1)); } catch {}
        });

        return 'all currency/stat';
    }

    if (target === 'allUnlocked') {
        const zero = BigNum.fromInt(0);
        let resetCount = 0;

        try {
            if (getXpState()?.unlocked) {
                applyXpState({ level: zero, progress: zero });
                try { setDebugStatMultiplierOverride('xp', BigNum.fromInt(1)); } catch {}
                resetCount += 1;
            }
        } catch {}

        try {
            if (getMutationState()?.unlocked) {
                applyMutationState({ level: zero, progress: zero });
                try { setDebugStatMultiplierOverride('mutation', BigNum.fromInt(1)); } catch {}
                resetCount += 1;
            }
        } catch {}

        if (resetCount === 0) return '0 unlocked stats';
        if (resetCount === 1) return '1 unlocked stat';
        return `${resetCount} unlocked stats`;
    }

    if (target.startsWith('currency:')) {
        const currencyKey = target.slice('currency:'.length);
        resetCurrencyAndMultiplier(currencyKey);
        return `${currencyKey}`;
    }

    if (target.startsWith('statmult:')) {
        const statKey = target.slice('statmult:'.length);
        // "Reset this stat multiplier" = remove any debug override,
        // let the game recalculate the multiplier normally.
        try { clearStatMultiplierOverride(statKey); } catch {}
        return `${statKey} multiplier`;
    }

    if (!target.startsWith('stat:')) {
        return `unknown target ${target}`;
    }

    const statKey = target.slice('stat:'.length);
    const zero = BigNum.fromInt(0);

    // Treat any XP-related key as "XP": level + progress + multiplier.
    if (statKey === 'xp' || statKey === 'xpLevel' || statKey === 'xpProgress') {
        applyXpState({ level: zero, progress: zero });
        // Temporarily force XP multiplier to 1x (override cleared on next real update)
        try { setDebugStatMultiplierOverride('xp', BigNum.fromInt(1)); } catch {}
        return 'XP';
    }

    // Treat any MP / mutation key as "MP": level + progress + multiplier.
    if (
        statKey === 'mutation' ||
        statKey === 'mp' ||
        statKey === 'mpLevel' ||
        statKey === 'mpProgress'
    ) {
        applyMutationState({ level: zero, progress: zero });
        // Temporarily force MP multiplier to 1x, same semantics as XP
        try { setDebugStatMultiplierOverride('mutation', BigNum.fromInt(1)); } catch {}
        return 'MP';
    }

    // Fallback: generic stat multiplier reset -> same semantics as the debug stat input
    try { setDebugStatMultiplierOverride(statKey, BigNum.fromInt(1)); } catch {}
    return `stat ${statKey}`;
}

function buildAreaStatMultipliers(container, area) {
    const slot = getActiveSlot();
    if (slot == null) {
        const msg = document.createElement('div');
        msg.className = 'debug-panel-empty';
        msg.textContent = 'Select a save slot to edit stat multipliers.';
        container.appendChild(msg);
        return;
    }

    const areaLabel = area?.title ?? area?.key ?? 'Unknown Area';

    STAT_MULTIPLIERS.forEach((stat) => {
        const storageKey = getStatMultiplierStorageKey(stat.key, slot);
        const row = createInputRow(
            `${stat.label} Multiplier`,
            getStatMultiplierDisplayValue(stat.key, slot),
            (value, { setValue }) => {
                const latestSlot = getActiveSlot();
                if (latestSlot == null) return;
                const previous = getStatMultiplierDisplayValue(stat.key, latestSlot);
                try { setDebugStatMultiplierOverride(stat.key, value, latestSlot); } catch {}
                const refreshed = getStatMultiplierDisplayValue(stat.key, latestSlot);
                setValue(refreshed);
                if (!bigNumEquals(previous, refreshed)) {
                    flagDebugUsage();
                    logAction(
                        `Modified ${stat.label} Multiplier (${areaLabel}) ${formatNumber(previous)} → ${formatNumber(refreshed)}`
                    );
                }
            },
            {
                storageKey,
                onLockChange: (locked) => {
                    const latestSlot = getActiveSlot();
                    if (latestSlot == null) return;
                    if (locked) {
                        const existingOverride = getLockedStatOverride(latestSlot, stat.key);
                        if (existingOverride) return;
                        try {
                            setDebugStatMultiplierOverride(
                                stat.key,
                                getGameStatMultiplier(stat.key),
                                latestSlot
                            );
                        } catch {}
                    } else {
                        getEffectiveStatMultiplierOverride(
                            stat.key,
                            latestSlot,
                            getGameStatMultiplier(stat.key)
                        );
                    }
                    row.setValue(getStatMultiplierDisplayValue(stat.key, latestSlot));
                },
            }
        );

        registerLiveBinding({
            type: 'stat-mult',
            key: stat.key,
            slot,
            refresh: () => {
                if (slot !== getActiveSlot()) return;
                const latest = getStatMultiplierDisplayValue(stat.key, slot);
                row.setValue(latest);
            },
        });

        registerLiveBinding({
            type: 'upgrade',
            key: stat.key,
            slot,
            refresh: () => {
                if (slot !== getActiveSlot()) return;
                const latest = getStatMultiplierDisplayValue(stat.key, slot);
                row.setValue(latest);
            },
        });

        if (stat.key === 'mutation') {
            registerLiveBinding({
                type: 'mutation',
                key: stat.key,
                slot,
                refresh: () => {
                    if (slot !== getActiveSlot()) return;
                    const latest = getStatMultiplierDisplayValue(stat.key, slot);
                    row.setValue(latest);
                },
            });
        }

        container.appendChild(row.row);
    });
}

function buildAreaCalculators(container) {
    const calculators = [
        {
            title: 'Currencies',
            rows: [
                {
                    label: 'Pending Gold (Forge)',
                    inputs: [
                        { key: 'coins', label: 'Coins' },
                        { key: 'xpLevel', label: 'XP Level' },
                    ],
                    compute: ({ coins, xpLevel }) => computeForgeGoldFromInputs(coins, xpLevel),
                },
            ],
        },
        {
            title: 'Stats',
            rows: [
                {
                    label: 'XP Requirement',
                    inputs: [
                        { key: 'xpLevel', label: 'XP Level' },
                    ],
                    compute: ({ xpLevel }) => getXpRequirementForXpLevel(xpLevel),
                },
                {
                    label: 'XP Level Coin Multiplier',
                    inputs: [
                        { key: 'xpLevel', label: 'XP Level' },
                    ],
                    compute: ({ xpLevel }) => computeCoinMultiplierForXpLevel(xpLevel),
                },
                {
                    label: 'MP Requirement',
                    inputs: [
                        { key: 'mpLevel', label: 'MP Level' },
                    ],
                    compute: ({ mpLevel }) => computeMutationRequirementForLevel(mpLevel),
                },
                {
                    label: 'MP Level Coin/XP Multiplier',
                    inputs: [
                        { key: 'mpLevel', label: 'MP Level' },
                    ],
                    compute: ({ mpLevel }) => computeMutationMultiplierForLevel(mpLevel),
                },
            ],
        },
        {
            title: 'Other',
            rows: [
                {
                    label: 'Default Upgrade Level Cost',
                    inputs: [
                        { key: 'baseCost', label: 'Base Cost' },
                        { key: 'level', label: 'Current Upgrade Level' },
                        {
                            key: 'mode',
                            type: 'select',
                            defaultValue: 'NM',
                            options: [
                                { value: 'NM', label: 'No Milestones' },
                                { value: 'HM', label: 'Has Milestones' },
                            ],
                        },
                    ],
                    compute: ({ baseCost, level, mode }) => computeDefaultUpgradeCost(baseCost, level, mode),
                },
            ],
        },
    ];

    calculators.forEach((group) => {
        const subsection = createSubsection(group.title, (sub) => {
            if (!group.rows || group.rows.length === 0) {
                const msg = document.createElement('div');
                msg.className = 'debug-panel-empty';
                msg.textContent = 'No calculators available yet.';
                sub.appendChild(msg);
                return;
            }

            group.rows.forEach((row) => {
                const calculatorRow = createCalculatorRow({
                    labelText: row.label,
                    inputs: row.inputs,
                    compute: row.compute,
                });
                sub.appendChild(calculatorRow);
            });
        });

        container.appendChild(subsection);
    });
}

function buildAreasContent(content) {
    content.innerHTML = '';

    const slot = getActiveSlot();
    if (slot == null) {
        const placeholder = document.createElement('div');
        placeholder.className = 'debug-panel-empty';
        placeholder.textContent = 'Areas are available once a save slot is selected.';
        content.appendChild(placeholder);
        return;
    }

    applyAllCurrencyOverridesForActiveSlot();

    const areas = getAreas();

    areas.forEach((area) => {
        const areaContainer = createSubsection(area.title, (areaContent) => {
            const currencies = createSubsection('Currencies', (sub) => {
                buildAreaCurrencies(sub, area);
            });
            const stats = createSubsection('Stats', (sub) => {
                buildAreaStats(sub, area);
            });
            const multipliers = createSubsection('Multipliers', (sub) => {
                const currencyMultipliers = createSubsection('Currencies', (subsection) => {
                    buildAreaCurrencyMultipliers(subsection, area);
                });
                const statMultipliers = createSubsection('Stats', (subsection) => {
                    buildAreaStatMultipliers(subsection, area);
                });

                sub.appendChild(currencyMultipliers);
                sub.appendChild(statMultipliers);
            });
            const upgrades = createSubsection('Upgrades', (sub) => {
                buildAreaUpgrades(sub, area);
            });
            const calculators = createSubsection('Calculators', (sub) => {
                buildAreaCalculators(sub);
            });
			
            areaContent.appendChild(currencies);
            areaContent.appendChild(stats);
            areaContent.appendChild(multipliers);
            areaContent.appendChild(upgrades);
            areaContent.appendChild(calculators);
        });
        areaContainer.classList.add('debug-panel-area');

        content.appendChild(areaContainer);
    });
}

function buildMiscContent(content) {
    content.innerHTML = '';

    const slot = getActiveSlot();
    if (slot == null) {
        const placeholder = document.createElement('div');
        placeholder.className = 'debug-panel-empty';
        placeholder.textContent = 'Miscellaneous tools are available once a save slot is selected.';
        content.appendChild(placeholder);
        return;
    }

    const buttons = [
        {
            label: 'Complete Dialogues',
            onClick: () => {
                const { completed } = completeAllDialoguesForDebug();
                flagDebugUsage();
                logAction(`Completed all dialogues (${completed} newly claimed).`);
            },
        },
        {
            label: 'Restore Dialogues',
            onClick: () => {
                const { restored } = restoreAllDialoguesForDebug();
                flagDebugUsage();
                logAction(`Restored dialogues to unclaimed state (${restored} entries reset).`);
            },
        },
        {
            label: 'All Currencies Inf',
            onClick: () => {
                const touched = setAllCurrenciesToInfinity();
                flagDebugUsage();
                logAction(`Set all currencies to Infinity (${touched} currencies updated).`);
            },
        },
        {
            label: 'All Stats Inf',
            onClick: () => {
				const touched = setAllStatsToInfinity();
                flagDebugUsage();
                logAction(`Set all stats to Infinity (${touched} stats updated).`);
            },
        },
        {
            label: 'Unlock All Unlocks',
            onClick: () => {
                const { unlocks, toggles } = unlockAllUnlockUpgrades();
                flagDebugUsage();
                logAction(`Unlocked all unlock-type upgrades (${unlocks} entries), HUD buttons, and unlock flags (${toggles} toggled).`);
            },
        },
        {
            label: 'Lock All Unlocks',
            onClick: () => {
                const { locks, toggles } = lockAllUnlockUpgrades();
                flagDebugUsage();
                logAction(`Locked all unlock-type upgrades (${locks} entries), HUD buttons, and unlock flags (${toggles} toggled).`);
            },
        },
        {
            label: 'Wipe Action Log',
            onClick: () => {
                persistActionLog([], slot);
                updateActionLogDisplay();
                flagDebugUsage();
                logAction('Action log wiped and reset.');
            },
        },
    ];

    const buttonGrid = document.createElement('div');
    buttonGrid.className = 'debug-misc-button-list';
    buttons.forEach((cfg) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'debug-panel-toggle debug-misc-button';
        btn.textContent = cfg.label;
        btn.addEventListener('click', cfg.onClick);
        buttonGrid.appendChild(btn);
    });
    content.appendChild(buttonGrid);

    const resetRow = document.createElement('div');
    resetRow.className = 'debug-panel-row';
    const resetLabel = document.createElement('label');
    resetLabel.textContent = 'Reset Values & Multis For';
    resetRow.appendChild(resetLabel);

    const resetSelect = document.createElement('select');
    resetSelect.className = 'debug-panel-input';

    getAreas().forEach((area) => {
        const group = document.createElement('optgroup');
        group.label = area.title || area.key;
        area.currencies.forEach((currency) => {
            const opt = document.createElement('option');
            opt.value = `currency:${currency.key}`;
            opt.textContent = `${area.title || area.key} → ${currency.label}`;
            group.appendChild(opt);
        });
        area.stats.forEach((stat) => {
            const opt = document.createElement('option');
            opt.value = `stat:${stat.key}`;
            opt.textContent = `${area.title || area.key} → ${stat.label}`;
            group.appendChild(opt);
        });
        resetSelect.appendChild(group);
    });

    const allUnlockedOption = document.createElement('option');
    allUnlockedOption.value = 'allUnlocked';
    allUnlockedOption.textContent = 'All Unlocked';
    resetSelect.appendChild(allUnlockedOption);

    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All';

    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'All';
    resetSelect.appendChild(allOption);

    resetRow.appendChild(resetSelect);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'debug-panel-toggle';
    resetBtn.textContent = 'Reset';
    resetBtn.addEventListener('click', () => {
        const target = resetSelect.value || 'all';
        const label = resetStatsAndMultipliers(target);
        flagDebugUsage();
        logAction(`Reset ${label} values and multipliers to defaults.`);
    });
    resetRow.appendChild(resetBtn);
    content.appendChild(resetRow);

    const actionLogRow = document.createElement('div');
    actionLogRow.className = 'debug-panel-row';

    const wipeSlotBtn = document.createElement('button');
    wipeSlotBtn.type = 'button';
    wipeSlotBtn.className = 'debug-panel-toggle';
    wipeSlotBtn.textContent = 'Wipe Slot & Refresh';
    wipeSlotBtn.addEventListener('click', () => {
        const confirmWipe = window.confirm?.('Are you sure you want to wipe current slot data and refresh the page? This cannot be undone.');
        if (!confirmWipe) return;

        const suffix = `:${slot}`;
        const keysToRemove = [];
        try {
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = localStorage.key(i);
                if (key?.startsWith('ccc:') && key.endsWith(suffix)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach((key) => localStorage.removeItem(key));
        } catch {}

        flagDebugUsage();
        logAction(`Wiped ${keysToRemove.length} storage keys for slot ${slot} and refreshed.`);
        try { window.location.reload(); } catch {}
    });
    actionLogRow.appendChild(wipeSlotBtn);

    content.appendChild(actionLogRow);
}

function buildUnlocksContent(content) {
    content.innerHTML = '';

    const slot = getActiveSlot();
    if (slot == null) {
        const placeholder = document.createElement('div');
        placeholder.className = 'debug-panel-empty';
        placeholder.textContent = 'Unlocks are available once a save slot is selected.';
        content.appendChild(placeholder);
        return;
    }

    try { initXpSystem(); }
    catch {}

    const rows = getUnlockRowDefinitions(slot);

    rows.forEach((rowDef) => {
        content.appendChild(createUnlockToggleRow(rowDef));
    });
}

function buildDebugPanel() {
    if (!debugPanelAccess || isOnMenu()) return;
    cleanupDebugPanelResources();
    ensureDebugPanelStyles();
    sectionKeyCounter = 0;
    subsectionKeyCounter = 0;

    const existingPanel = document.getElementById(DEBUG_PANEL_ID);
    if (existingPanel) existingPanel.remove();

    const panel = document.createElement('div');
    panel.id = DEBUG_PANEL_ID;
    panel.className = 'debug-panel';

    const header = document.createElement('div');
    header.className = 'debug-panel-header';

    const titleContainer = document.createElement('div');

    const title = document.createElement('div');
    title.className = 'debug-panel-title';
    title.textContent = 'Debug Panel';

    const closeButton = document.createElement('button');
    closeButton.className = 'debug-panel-close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Close Debug Panel');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', () => closeDebugPanel({ preserveExpansionState: true }));

    titleContainer.appendChild(title);
    const info = document.createElement('div');
    info.className = 'debug-panel-info';

    const infoLines = [
        { text: 'C: Close and preserve panels', hideOnMobile: true },
        { text: 'Shift+C: Close and collapse panels', hideOnMobile: true },
        { text: 'Input fields can take a normal, scientific, or BN number as input' },
        { text: 'Input value "inf" sets a value to infinity or an upgrade to its level cap' },
        { text: 'Toggle UL/L (Unlocked/Locked) on a value to freeze it from accruing normally' },
    ];

    infoLines.forEach(({ text, hideOnMobile }) => {
        const infoLine = document.createElement('div');
        infoLine.className = 'debug-panel-info-line';
        if (hideOnMobile) infoLine.classList.add('debug-panel-info-mobile-hidden');
        infoLine.textContent = text;
        info.appendChild(infoLine);
    });

    titleContainer.appendChild(info);

    header.appendChild(titleContainer);
    header.appendChild(closeButton);
    panel.appendChild(header);

    panel.appendChild(createSection('Areas: main currency/stat/upgrade management for each area', 'debug-areas', content => {
        buildAreasContent(content);
    }));

    panel.appendChild(createSection('Unlocks: modify specific unlock flags', 'debug-unlocks', content => {
        buildUnlocksContent(content);
    }));

    panel.appendChild(createSection('Action Log: keep track of everything you do', 'debug-action-log', content => {
        const container = document.createElement('div');
        container.id = 'action-log-entries';
        container.className = 'debug-panel-action-log';
        container.style.maxHeight = '240px';
        container.style.overflowY = 'auto';
        content.appendChild(container);
        actionLogContainer = container;
        updateActionLogDisplay();
        addDebugPanelCleanup(() => { actionLogContainer = null; });
    }));
	
    panel.appendChild(createSection('Miscellaneous: helpful miscellaneous functions', 'debug-misc', content => {
        buildMiscContent(content);
    }));

    applyDebugPanelExpansionState(panel);

    document.body.appendChild(panel);

    if (debugPanelScrollTop > 0) {
        try { panel.scrollTop = debugPanelScrollTop; }
        catch {}
    }
    setupLiveBindingListeners();
    debugPanelOpen = true;
}

function openDebugPanel() {
    if (!debugPanelAccess || isOnMenu()) return;
    if (getActiveSlot() == null) {
        closeDebugPanel();
        return;
    }
    if (debugPanelOpen) return;
    buildDebugPanel();
}

function closeDebugPanel({ preserveExpansionState = false } = {}) {
    debugPanelExpansionState = preserveExpansionState
        ? captureDebugPanelExpansionState()
        : createEmptyExpansionState();
    const panel = document.getElementById(DEBUG_PANEL_ID);
    if (panel) {
        try { debugPanelScrollTop = panel.scrollTop ?? 0; }
        catch { debugPanelScrollTop = 0; }
        panel.remove();
    }
    cleanupDebugPanelResources();
    debugPanelOpen = false;
}

function toggleDebugPanel() {
    if (!debugPanelAccess || isOnMenu() || getActiveSlot() == null) {
        closeDebugPanel();
        return;
    }
    if (debugPanelOpen) {
        closeDebugPanel();
    } else {
        openDebugPanel();
    }
}

function teardownDebugPanel() {
    closeDebugPanel();
    removeDebugPanelToggleButton();
}

function createDebugPanelToggleButton() {
    if (!shouldShowDebugPanelToggleButton()) {
        removeDebugPanelToggleButton();
        closeDebugPanel();
        return;
    }
    ensureDebugPanelStyles();

    removeDebugPanelToggleButton();

    const button = document.createElement('button');
    button.id = DEBUG_PANEL_TOGGLE_ID;
    button.className = 'debug-panel-toggle-button';
    button.type = 'button';
    button.textContent = 'Debug Panel';
    button.addEventListener('click', toggleDebugPanel);

    document.body.appendChild(button);
}

function applyDebugPanelAccess(enabled) {
    debugPanelAccess = !!enabled;
    if (!debugPanelAccess) {
        teardownDebugPanel();
        return;
    }
    createDebugPanelToggleButton();
}

document.addEventListener('keydown', event => {
    if (!debugPanelAccess || isOnMenu()) return;
    if (event.key?.toLowerCase() !== 'c') return;
    if (event.ctrlKey) return;

    if (getActiveSlot() == null) return;

    if (event.shiftKey) {
        if (debugPanelOpen) {
            collapseAllDebugCategories();
            closeDebugPanel();
        } else {
            openDebugPanel();
        }
        event.preventDefault();
        return;
    }

    if (!debugPanelOpen) {
        openDebugPanel();
    } else {
        closeDebugPanel({ preserveExpansionState: true });
    }
	
    event.preventDefault();
});

document.addEventListener('DOMContentLoaded', () => {
    createDebugPanelToggleButton();
});

window.addEventListener('menu:visibilitychange', onMenuVisibilityChange);

window.addEventListener('saveSlot:change', () => {
    createDebugPanelToggleButton();
    if (debugPanelOpen) {
        buildDebugPanel();
    }
});

export function setDebugPanelAccess(enabled) {
    applyDebugPanelAccess(enabled);
}
