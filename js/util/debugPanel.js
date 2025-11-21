// js/util/debugPanel.js
// Using a debug panel is much faster and more convenient than
// Editing local storage every time I want to change something.
// I will remember to disable debug panel access for prod, don't worry.

import { BigNum } from './bigNum.js';
import { bank, CURRENCIES, getActiveSlot, markSaveSlotModified, primeStorageWatcherSnapshot } from './storage.js';
import { getMutationState, initMutationSystem, unlockMutationSystem } from '../game/mutationSystem.js';
import {
    AREA_KEYS,
    getLevel,
    getUpgradesForArea,
    setLevel,
} from '../game/upgrades.js';
import { getXpState, initXpSystem, unlockXpSystem } from '../game/xpSystem.js';

const DEBUG_PANEL_STYLE_ID = 'debug-panel-style';
const DEBUG_PANEL_ID = 'debug-panel';
const DEBUG_PANEL_TOGGLE_ID = 'debug-panel-toggle';
let debugPanelOpen = false;
let debugPanelAccess = true;
let debugPanelCleanups = [];
let debugPanelExpansionState = createEmptyExpansionState();
let sectionKeyCounter = 0;
let subsectionKeyCounter = 0;
const liveBindings = [];

function isOnMenu() {
    const menuRoot = document.querySelector('.menu-root');
    if (!menuRoot) return false;

    const style = window.getComputedStyle?.(menuRoot);
    if (!style) return menuRoot.style.display !== 'none';

    return style.display !== 'none' && style.visibility !== 'hidden' && !menuRoot.hidden;
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
    };
    window.addEventListener('mutation:change', mutationHandler, { passive: true });
    addDebugPanelCleanup(() => window.removeEventListener('mutation:change', mutationHandler));

    const upgradeHandler = () => {
        const targetSlot = getActiveSlot();
        refreshLiveBindings((binding) => binding.type === 'upgrade'
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

const AREAS = [
    {
        key: AREA_KEYS.STARTER_COVE,
        title: 'The Cove',
        currencies: [
            { key: CURRENCIES.COINS, label: 'Coins' },
            { key: CURRENCIES.BOOKS, label: 'Books' },
            { key: CURRENCIES.GOLD,  label: 'Gold'  },
        ],
        stats: [
            { key: 'xpLevel', label: 'XP Level' },
            { key: 'xpProgress', label: 'XP Progress' },
            { key: 'mpLevel', label: 'MP Level' },
            { key: 'mpProgress', label: 'MP Progress' },
        ],
    },
];

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

        .debug-panel-shortcuts {
            font-size: 0.95em;
            color: #ccc;
            white-space: pre-line;
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
        && !isOnMenu();
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
    try { markSaveSlotModified(getActiveSlot()); }
    catch {}
}

function createInputRow(labelText, initialValue, onCommit, { idLabel } = {}) {
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

    const setValue = (value) => {
        if (editing) {
            pendingValue = value;
            return;
        }
        pendingValue = null;
        input.value = formatBigNumForInput(value);
    };

    row.appendChild(input);

    const commitValue = () => {
        const parsed = parseBigNumInput(input.value);
        if (!parsed) {
            setInputValidity(input, false);
            return;
        }
        setInputValidity(input, true);
        onCommit(parsed, { input, setValue });
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

    return { row, input, setValue, isEditing: () => editing };
}

function applyXpState({ level, progress }) {
    const slot = getActiveSlot();
    if (slot == null) return;

    unlockXpSystem();
    const unlockKey = XP_KEYS.unlock(slot);
    try { localStorage.setItem(unlockKey, '1'); } catch {}
    primeStorageWatcherSnapshot(unlockKey, '1');

    if (level) {
        try {
            const raw = level.toStorage?.() ?? BigNum.fromAny(level).toStorage();
            const key = XP_KEYS.level(slot);
            localStorage.setItem(key, raw);
            primeStorageWatcherSnapshot(key, raw);
        } catch {}
    }

    if (progress) {
        try {
            const raw = progress.toStorage?.() ?? BigNum.fromAny(progress).toStorage();
            const key = XP_KEYS.progress(slot);
            localStorage.setItem(key, raw);
            primeStorageWatcherSnapshot(key, raw);
        } catch {}
    }

    initXpSystem({ forceReload: true });
}

function applyMutationState({ level, progress }) {
    const slot = getActiveSlot();
    if (slot == null) return;

    initMutationSystem();
    try { unlockMutationSystem(); } catch {}
    const unlockKey = MUTATION_KEYS.unlock(slot);
    try { localStorage.setItem(unlockKey, '1'); } catch {}
    primeStorageWatcherSnapshot(unlockKey, '1');

    if (level) {
        try {
            const raw = level.toStorage?.() ?? BigNum.fromAny(level).toStorage();
            const key = MUTATION_KEYS.level(slot);
            localStorage.setItem(key, raw);
            primeStorageWatcherSnapshot(key, raw);
        } catch {}
    }

    if (progress) {
        try {
            const raw = progress.toStorage?.() ?? BigNum.fromAny(progress).toStorage();
            const key = MUTATION_KEYS.progress(slot);
            localStorage.setItem(key, raw);
            primeStorageWatcherSnapshot(key, raw);
        } catch {}
    }

    initMutationSystem({ forceReload: true });
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

    area.currencies.forEach((currency) => {
        const handle = bank?.[currency.key];
        const current = handle?.value ?? BigNum.fromInt(0);
        const currencyRow = createInputRow(currency.label, current, (value, { setValue }) => {
            const latestSlot = getActiveSlot();
            if (latestSlot == null) return;
            const previous = handle?.value ?? BigNum.fromInt(0);
            try { handle?.set?.(value); } catch {}
            const refreshed = handle?.value ?? value;
            setValue(refreshed);
            if (!bigNumEquals(previous, refreshed)) {
                flagDebugUsage();
            }
        });
        registerLiveBinding({
            type: 'currency',
            key: currency.key,
            slot,
            refresh: () => {
                if (slot !== getActiveSlot()) return;
                const latest = handle?.value ?? BigNum.fromInt(0);
                currencyRow.setValue(latest);
            },
        });
        container.appendChild(currencyRow.row);
    });
}

function buildAreaStats(container) {
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

    const xpLevelRow = createInputRow('XP Level', xp.xpLevel, (value, { setValue }) => {
        const prev = getXpState().xpLevel;
        applyXpState({ level: value });
        const latest = getXpState();
        setValue(latest.xpLevel);
        if (!bigNumEquals(prev, latest.xpLevel)) {
            flagDebugUsage();
        }
    });
    registerLiveBinding({
        type: 'xp',
        slot,
        refresh: () => {
            if (slot !== getActiveSlot()) return;
            xpLevelRow.setValue(getXpState().xpLevel);
        },
    });
    container.appendChild(xpLevelRow.row);

    const xpProgressRow = createInputRow('XP Progress', xp.progress, (value, { setValue }) => {
        const prev = getXpState().progress;
        applyXpState({ progress: value });
        const latest = getXpState();
        setValue(latest.progress);
        if (!bigNumEquals(prev, latest.progress)) {
            flagDebugUsage();
        }
    });
    registerLiveBinding({
        type: 'xp',
        slot,
        refresh: () => {
            if (slot !== getActiveSlot()) return;
            xpProgressRow.setValue(getXpState().progress);
        },
    });
    container.appendChild(xpProgressRow.row);

    const mpLevelRow = createInputRow('MP Level', mutation.level, (value, { setValue }) => {
        const prev = getMutationState().level;
        applyMutationState({ level: value });
        const latest = getMutationState();
        setValue(latest.level);
        if (!bigNumEquals(prev, latest.level)) {
            flagDebugUsage();
        }
    });
    registerLiveBinding({
        type: 'mutation',
        slot,
        refresh: () => {
            if (slot !== getActiveSlot()) return;
            mpLevelRow.setValue(getMutationState().level);
        },
    });
    container.appendChild(mpLevelRow.row);

    const mpProgressRow = createInputRow('MP Progress', mutation.progress, (value, { setValue }) => {
        const prev = getMutationState().progress;
        applyMutationState({ progress: value });
        const latest = getMutationState();
        setValue(latest.progress);
        if (!bigNumEquals(prev, latest.progress)) {
            flagDebugUsage();
        }
    });
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

    AREAS.forEach((area) => {
        const areaContainer = createSubsection(area.title, (areaContent) => {
            const currencies = createSubsection('Currencies', (sub) => {
                buildAreaCurrencies(sub, area);
            });
            const stats = createSubsection('Stats', (sub) => {
                buildAreaStats(sub);
            });
            const upgrades = createSubsection('Upgrades', (sub) => {
                buildAreaUpgrades(sub, area);
            });

            areaContent.appendChild(currencies);
            areaContent.appendChild(stats);
            areaContent.appendChild(upgrades);
        });
        areaContainer.classList.add('debug-panel-area');

        content.appendChild(areaContainer);
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
    if (!IS_MOBILE) {
        const shortcuts = document.createElement('div');
        shortcuts.className = 'debug-panel-shortcuts';
        shortcuts.textContent = 'C: Close and preserve panels\nShift+C: Close and collapse panels\nInput fields can take a normal number (e.g., 1234) or a BN number\nInput value "inf" sets a value to infinity or an upgrade to its level cap';
        titleContainer.appendChild(shortcuts);
    }

    header.appendChild(titleContainer);
    header.appendChild(closeButton);
    panel.appendChild(header);

    panel.appendChild(createSection('Areas: currency/stat/upgrade management for each area', 'debug-areas', content => {
        buildAreasContent(content);
    }));

    panel.appendChild(createSection('Unlocks: modify specific unlock flags', 'debug-unlocks', content => {
        const placeholder = document.createElement('div');
        placeholder.className = 'debug-panel-empty';
        placeholder.textContent = 'Toggle unlock-type upgrades here.';
        content.appendChild(placeholder);
    }));

    panel.appendChild(createSection('Action Log: keep track of everything you do', 'debug-action-log', content => {
        const placeholder = document.createElement('div');
        placeholder.className = 'debug-panel-empty';
        placeholder.textContent = 'No actions logged yet.';
        content.appendChild(placeholder);
    }));
	
    panel.appendChild(createSection('Miscellaneous: helpful miscellaneous functions', 'debug-misc', content => {
        const placeholder = document.createElement('div');
        placeholder.className = 'debug-panel-empty';
        placeholder.textContent = 'Utility buttons will appear here.';
        content.appendChild(placeholder);
    }));

    applyDebugPanelExpansionState(panel);

    document.body.appendChild(panel);
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
    if (panel) panel.remove();
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

/*
THE FOLLOWING CODE IS FOR REFERENCE TO HOW IT WORKED IN MY OLD GAME, DO NOT REMOVE THIS REFERENCE.
let testModeEnabled = true;
let devMenuOpen = false;
let devMenuUpdateInterval = null;
let activeInputElement = null;
let pendingStatUpdates = {};
const maxLogEntries = 100;
function getCurrentActionLog() {
    const saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};
    return saveData.actionLog || [];
}

const devMenuCSS = `
.dev-menu {
    position: fixed;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(0,0,0,0.9);
    color: white;
    padding: 15px;
    font-family: Arial, sans-serif;
    width: 430px;
    max-height: 80vh;
    overflow-y: auto;
    z-index: 100000;
    border-radius: 5px 0 0 5px;
    box-shadow: -2px 0 10px rgba(0,0,0,0.7);
}
.dev-menu-title {
    font-size: 1.2em;
    font-weight: bold;
    text-align: center;
    padding: 10px;
    margin: -10px -10px 10px -10px;
    background: rgba(255,255,255,0.1);
    position: sticky;
    top: 0;
    backdrop-filter: blur(5px);
}
.dev-section {
    margin: 12px 0;
    border: 1px solid #444;
    padding: 8px;
    border-radius: 4px;
    background: rgba(0,0,0,0.3);
}
.dev-section-content {
    display: none;
    margin-top: 5px;
}
.dev-section-header {
    cursor: pointer;
    font-weight: bold;
    padding: 6px;
    background: rgba(255,255,255,0.1);
    border-radius: 3px;
    display: flex;
    align-items: center;
}
.dev-section-header::before {
    content: '▶';
    margin-right: 8px;
    font-size: 0.8em;
}
.dev-section-header.expanded::before {
    content: '▼';
}
.stat-item {
    margin: 8px 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.9em;
}
.stat-item span:first-child {
    flex: 1;
    margin-right: 15px;
}
.stat-item input {
    width: 120px;
    background: #333;
    color: white;
    border: 1px solid #555;
    padding: 4px 8px;
    border-radius: 4px;
}
.upgrade-id {
    font-size: 0.8em;
    color: #888;
    margin-left: 8px;
}
.flag-item {
    margin: 8px 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
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
.dev-misc-button {
    display: block;
    width: 100%;
    background: #444;
    color: white;
    border: 1px solid #666;
    border-radius: 4px;
    padding: 8px 12px;
    margin: 8px 0;
    cursor: pointer;
    transition: background 0.2s;
    text-align: center;
    font-size: 0.9em;
}
.dev-misc-button:hover {
    background: #555;
}
.dev-misc-button:active {
    background: #333;
}
.action-log-entry {
    font-size: 0.8em;
    padding: 5px;
    border-bottom: 1px solid #333;
    font-family: monospace;
    word-break: break-word;
}
.action-log-time {
    color: #aaa;
    margin-right: 8px;
}
.action-log-message {
    color: #ddd;
}
.action-log-empty {
    color: #aaa;
    font-style: italic;
    padding: 10px;
    text-align: center;
    font-size: 0.9em;
}
.action-log-number {
    color: #FFD700;
    font-weight: bold;
    text-shadow: 0 0 2px rgba(0,0,0,0.5);
    padding: 0 2px;
    border-radius: 3px;
    background: rgba(255, 215, 0, 0.1);
}
.action-log-number::after {
    content: "";
    color: #FFD700;
}
.dev-menu::-webkit-scrollbar {
    width: 8px;
}
.dev-menu::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 4px;
}
.dev-menu::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.1);
}
.dev-menu::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}
#action-log-entries::-webkit-scrollbar {
    width: 8px;
}
#action-log-entries::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 4px;
}
#action-log-entries::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.1);
}
#action-log-entries::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}
.action-log-level {
    color: #FFD700;
    font-weight: bold;
    text-shadow: 0 0 2px rgba(0,0,0,0.5);
    background: rgba(255, 215, 0, 0.1);
    border-radius: 3px;
    padding: 0 2px;
}
.action-log-level span {
    color: #FFD700;
}
.action-log-gold {
    color: #FFD700;
    font-weight: bold;
    text-shadow: 0 0 2px rgba(0,0,0,0.5);
    background: rgba(255, 215, 0, 0.1);
    border-radius: 3px;
    padding: 0 2px;
}
`;

function createDevMenu() {
    if (!testModeEnabled || devMenuOpen)
        return;

    // Remove existing menu if any
    const existingMenu = document.querySelector('.dev-menu');
    if (existingMenu)
        existingMenu.remove();

    // Create new menu
    const style = document.createElement('style');
    style.id = 'dev-menu-style';
    style.textContent = devMenuCSS;
    document.head.appendChild(style);

    const menu = document.createElement('div');
    menu.className = 'dev-menu';
    menu.innerHTML = `
        <div class="dev-menu-title">Dev Menu</div>
        <div class="dev-section">
            <div class="dev-section-header">Stats</div>
            <div class="dev-section-content" style="display:none" id="stats-section"></div>
        </div>
        <div class="dev-section">
            <div class="dev-section-header">Upgrades</div>
            <div class="dev-section-content" style="display:none" id="upgrades-section"></div>
        </div>
        <div class="dev-section">
            <div class="dev-section-header">Flags</div>
            <div class="dev-section-content" style="display:none" id="flags-section"></div>
        </div>
        <div class="dev-section">
            <div class="dev-section-header">Misc</div>
            <div class="dev-section-content" style="display:none" id="misc-section">
                <button class="dev-misc-button" id="spawn-boost-coin">Spawn Boost Coin</button>
                <button class="dev-misc-button" id="restore-dialogues">Restore Merchant Dialogues</button>
				<button class="dev-misc-button" id="instant-complete-merchant-dialogues">Instantly Complete All Merchant Dialogues</button>
				<button class="dev-misc-button" id="reset-all-stats">Reset All Stats to Nothing</button>
                <button class="dev-misc-button" id="reset-all-upgrades">Reset All Upgrades to Level 0</button>
				<button class="dev-misc-button" id="clear-active-coins">Clear All Active Coins</button>
				<button class="dev-misc-button" id="increment-all-upgrades">+1 Level to All Upgrades</button>
				<button class="dev-misc-button" id="hard-reset-game">Hard Reset All Progress</button>
				<button class="dev-misc-button" id="time-warp-button">OP Time Warp</button>
            </div>
        </div>
		<div class="dev-section">
            <div class="dev-section-header">Action Log</div>
            <div class="dev-section-content" style="display:none" id="action-log-section">
                <div id="action-log-entries" style="max-height: 200px; overflow-y: auto;"></div>
            </div>
        </div>
    `;

    document.body.appendChild(menu);
    devMenuOpen = true;

    document.getElementById('spawn-boost-coin').addEventListener('click', () => {
        logAction("Manually spawned boost coin");
        spawnBoostCoin();
    });
    document.getElementById('restore-dialogues').addEventListener('click', () => {
        logAction("Restored merchant dialogues");
        restoreMerchantDialogues();
    });
    document.getElementById('instant-complete-merchant-dialogues').addEventListener('click', () => {
        instantCompleteMerchantDialogues();
    });
    document.getElementById('reset-all-stats').addEventListener('click', () => {
        resetAllStats();
    });
    document.getElementById('reset-all-upgrades').addEventListener('click', () => {
        resetAllUpgradesToZero();
    });
    document.getElementById('clear-active-coins').addEventListener('click', () => {
        clearAllCoins();
    });
    document.getElementById('increment-all-upgrades').addEventListener('click', () => {
        incrementAllUpgradeLevels();
    });
    document.getElementById('hard-reset-game').addEventListener('click', () => {
        if (confirm("Are you sure you want to perform a hard reset? This will wipe all stats and upgrades!")) {
            resetGame();
            refreshAllDisplays();
        }
    });

    document.getElementById('time-warp-button').addEventListener('click', () => {
        let seconds = prompt("Enter seconds to warp forward:");
        if (!seconds || isNaN(seconds) || seconds <= 0)
            return;

        seconds = Number(seconds); // Ensure it's a number

        const saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};

        // Simulate elapsed time by setting the timestamp in the past
        saveData.timestamp = Date.now() - (seconds * 1000);

        // Calculate progress, destructuring the returned object
        const {
            generated,
            elapsedTime
        } = calculateOfflineProgress(saveData);

        // Update the localStorage with the new save data
        localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));

        // Show offline progress and log action if there are any generated resources.
        // Pass elapsedTime to the popup function.
        if (Object.keys(generated).length > 0) {
            showOfflineProgressPopup(generated, elapsedTime);
            logAction(`Time warp: +${seconds}s | Gained ${Object.entries(generated)
                .map(([k, v]) => `${formatNumber(v)} ${k}`)
                .join(', ')}`);
        }
    });

    // Initialize all sections as collapsed
    document.querySelectorAll('.dev-section-header').forEach(header => {
        header.addEventListener('click', function () {
            const wasExpanded = this.classList.contains('expanded');
            this.classList.toggle('expanded');
            const content = this.nextElementSibling;
            content.style.display = wasExpanded ? 'none' : 'block';
        });
    });

    if (localStorage.getItem('actionLog')) {
        const actionLog = getCurrentActionLog();
        try {
            const storedLogs = JSON.parse(localStorage.getItem('actionLog'));
            if (Array.isArray(storedLogs)) {
                actionLog.push(...storedLogs);
            }
        } catch (e) {
            console.error("Couldn't load action log", e);
        }
        updateActionLogDisplay(); // Update display with either logs or empty message
    }

    // Start real-time updates
    devMenuUpdateInterval = setInterval(updateDevMenu, 16);
    updateDevMenu();
    updateActionLogDisplay();
}

function handleStatChange(stat, value) {
    const oldValue = getCurrentStatValue(stat);
    const numValue = Number(value);
    if (isNaN(numValue))
        return;

    logAction(`Modified ${stat} from ${formatNumber(oldValue)} to ${formatNumber(numValue)}`);

    const saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};
    switch (stat) {
    case 'Coins':
        coinCount = numValue;
        break;
    case 'XP':
        saveData.xp = numValue;
        break;
    case 'Level':
        saveData.level = numValue;
        saveData.xpNeeded = 10 * Math.pow(1.1, numValue);
        break;
    case 'Special Coins':
        saveData.specialCoins = numValue;
        break;
    case 'Molten Coins':
        saveData.moltenCoins = numValue;
        break;
    case 'Platinum Coins':
        saveData.platinumCoins = numValue;
        break;
    case 'Infused Coins':
        saveData.infusedCoins = numValue;
        break;
    case 'Automation Cores':
        saveData.automationCores = numValue;
        break;
    }
    localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));
    refreshAllDisplays();
}

function getCurrentStatValue(stat) {
    const saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};
    switch (stat) {
    case 'Coins':
        return coinCount;
    case 'XP':
        return saveData.xp || 0;
    case 'Level':
        return saveData.level || 0;
    case 'Special Coins':
        return saveData.specialCoins || 0;
    case 'Molten Coins':
        return saveData.moltenCoins || 0;
    case 'Platinum Coins':
        return saveData.platinumCoins || 0;
    case 'Infused Coins':
        return saveData.infusedCoins || 0;
    case 'Automation Cores':
        return saveData.automationCores || 0;
    default:
        return '?';
    }
}

function handleUpgradeChange(id, category, value) {
    // Load the current saveData
    let saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};
    if (!saveData[category])
        saveData[category] = {};

    const oldLevel = saveData[category][id]?.level || 0;
    const newLevel = Number(value);

    const categoryName = Object.entries({
        'Coin Upgrades': 'upgrades',
        'Special Coin Upgrades': 'specialUpgrades',
        'Molten Coin Upgrades': 'forgeUpgrades',
        'Platinum Coin Upgrades': 'platinumUpgrades',
        'Infused Coin Upgrades': 'infusedUpgrades',
        'Automation Upgrades': 'automationUpgrades'
    }).find(([_, cat]) => cat === category)?.[0] || category;

    const upgradeName = {
        upgrades: upgrades[id]?.upgName,
        specialUpgrades: specialUpgrades[id]?.name,
        forgeUpgrades: forgeUpgrades[id]?.name,
        platinumUpgrades: platinumUpgrades[id]?.name,
        infusedUpgrades: infusedUpgrades[id]?.name,
        automationUpgrades: automationUpgrades[id]?.name,
    }
    [category] || `ID ${id}`;

    logAction(`Modified ${upgradeName} (${categoryName} - ID: ${id}) from Level ${formatNumber(oldLevel)} to Level ${formatNumber(newLevel)}`);

    // Reload saveData so we capture the updated actionLog
    saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};
    if (!saveData[category])
        saveData[category] = {};

    // Update the upgrade level
    saveData[category][id] = {
        level: newLevel
    };
    localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));

    applyUpgradeEffects();
    updateMerchantDisplay();
    updateDevMenu();
}

function updateDevMenu() {
    if (!devMenuOpen)
        return;

    // Update stats
    const statsSection = document.getElementById('stats-section');
    const currentStats = {
        'Coins': coinCount,
        'XP': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.xp || 0,
        'Level': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.level || 0,
        'Special Coins': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.specialCoins || 0,
        'Molten Coins': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.moltenCoins || 0,
        'Platinum Coins': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.platinumCoins || 0,
        'Infused Coins': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.infusedCoins || 0,
        'Automation Cores': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.automationCores || 0,
    };

    // Create a map of existing stat items
    const existingStats = {};
    statsSection.querySelectorAll('.stat-item').forEach(item => {
        const name = item.querySelector('span').textContent.replace(':', '').trim();
        existingStats[name] = item;
    });

    // Update or create stat items
    Object.entries(currentStats).forEach(([name, value]) => {
        if (existingStats[name]) {
            const input = existingStats[name].querySelector('input');
            // Only update if not currently being edited
            if (input && input !== activeInputElement && input.value !== String(value)) {
                input.value = value;
            }
        } else {
            const item = document.createElement('div');
            item.className = 'stat-item';
            const input = document.createElement('input');
            input.type = 'number';
            input.value = value;
            input.step = 'any'; // Allow decimals
            // Disable validation tooltip
            input.oninvalid = (e) => e.preventDefault();
            input.addEventListener('input', function () {
                handleStatChange(name, this.value);
            });
            input.addEventListener('focus', function () {
                activeInputElement = this;
            });
            input.addEventListener('blur', function () {
                activeInputElement = null;
                // Apply any queued updates
                Object.entries(pendingStatUpdates).forEach(([stat, value]) => {
                    handleStatChange(stat, value);
                });
                pendingStatUpdates = {};
            });

            item.innerHTML = `<span>${name}:</span>`;
            item.appendChild(input);
            statsSection.appendChild(item);
        }
    });

    // Update upgrades
    const upgradeCategories = {
        'Coin Upgrades': {
            object: upgrades,
            key: 'upgrades'
        },
        'Special Coin Upgrades': {
            object: specialUpgrades,
            key: 'specialUpgrades'
        },
        'Molten Coin Upgrades': {
            object: forgeUpgrades,
            key: 'forgeUpgrades'
        },
        'Platinum Coin Upgrades': {
            object: platinumUpgrades,
            key: 'platinumUpgrades'
        },
        'Infused Coin Upgrades': {
            object: infusedUpgrades,
            key: 'infusedUpgrades'
        },
        'Automation Upgrades': {
            object: automationUpgrades,
            key: 'automationUpgrades'
        }
    };

    Object.entries(upgradeCategories).forEach(([category, data]) => {
        const categoryId = category.replace(/\s+/g, '-');
        let contentDiv = document.getElementById(`${categoryId}-content`);

        if (!contentDiv) {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'dev-subsection';
            const header = document.createElement('div');
            header.className = 'dev-section-header';
            header.textContent = category;

            contentDiv = document.createElement('div');
            contentDiv.className = 'dev-section-content';
            contentDiv.id = `${categoryId}-content`;

            header.addEventListener('click', function () {
                this.classList.toggle('expanded');
                contentDiv.style.display =
                    this.classList.contains('expanded') ? 'block' : 'none';
            });

            categoryDiv.appendChild(header);
            categoryDiv.appendChild(contentDiv);
            document.getElementById('upgrades-section').appendChild(categoryDiv);
        }

        // Create a map of existing upgrade items
        const existingUpgrades = {};
        contentDiv.querySelectorAll('.stat-item').forEach(item => {
            const id = item.querySelector('input')?.dataset.upgradeId;
            if (id)
                existingUpgrades[id] = item;
        });

        Object.values(data.object).forEach(upg => {
            const saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};
            const currentLevel = saveData[data.key]?.[upg.id]?.level || 0;

            if (existingUpgrades[upg.id]) {
                const input = existingUpgrades[upg.id].querySelector('input');
                // Only update if not currently being edited
                if (input && input !== activeInputElement && input.value !== String(currentLevel)) {
                    input.value = currentLevel;
                }
            } else {
                const item = document.createElement('div');
                item.className = 'stat-item';
                const input = document.createElement('input');
                input.type = 'number';
                input.value = currentLevel;
                input.min = 0;
                input.max = upg.maxLevel || upg.levelCap || 999;
                input.step = 'any'; // Allow decimals
                // Disable validation tooltip
                input.oninvalid = (e) => e.preventDefault();
                input.dataset.upgradeId = upg.id;
                input.addEventListener('input', function () {
                    handleUpgradeChange(upg.id, data.key, this.value);
                });
                input.addEventListener('focus', function () {
                    activeInputElement = this;
                });
                input.addEventListener('blur', function () {
                    activeInputElement = null;
                });

                item.innerHTML = `
            <span>${upg.upgName || upg.name}
                <span class="upgrade-id">(ID: ${upg.id})</span>
            </span>
        `;
                item.appendChild(input);
                contentDiv.appendChild(item);
            }
        });
    });
    // Update flags
    const flagsSection = document.getElementById('flags-section');
    const currentFlags = {
        'Game Active': gameActive,
        'Disable Background Music': !musicManager.isMusicOn,
        'Disable Coin Pickup Animation': disableAnimation.checked,
        'Disable Coin Pickup Sound': disableSound.checked,
        'Enable Scientific Notation': useScientificNotation,
        'Disable Formatted Numbers': JSON.parse(localStorage.getItem('disableFormattedNumbers') || 'false'),
        'Disable Boost Coin Spawning': !boostCoinsUnlocked,
        'Has Done Forge Reset': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.hasDoneForgeReset || false,
        'Has Platinum Unlocked': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.hasPlatinumUnlocked || false,
        'Has Done Infuse Reset': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.hasDoneInfuseReset || false,
        'Disable Magnet': JSON.parse(localStorage.getItem('disableMagnet') || 'false')
    };

    // Create a map of existing flag items
    const existingFlags = {};
    flagsSection.querySelectorAll('.flag-item').forEach(item => {
        const name = item.querySelector('span').textContent;
        existingFlags[name] = item;
    });

    // Update or create flag items
    Object.entries(currentFlags).forEach(([name, value]) => {
        if (existingFlags[name]) {
            const input = existingFlags[name].querySelector('input');
            if (input && input.checked !== value) {
                input.checked = value;
            }
        } else {
            const item = document.createElement('div');
            item.className = 'flag-item';

            const label = document.createElement('label');
            label.className = 'flag-toggle';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = value;
            input.addEventListener('change', function () {
                handleFlagChange(name, this.checked);
            });

            const slider = document.createElement('span');
            slider.className = 'flag-slider';

            label.appendChild(input);
            label.appendChild(slider);

            item.innerHTML = `<span>${name}</span>`;
            item.appendChild(label);
            flagsSection.appendChild(item);
        }
    });
}

function handleFlagChange(name, value) {
    const currentFlags = {
        'Game Active': gameActive,
        'Disable Background Music': !musicManager.isMusicOn,
        'Disable Coin Pickup Animation': disableAnimation.checked,
        'Disable Coin Pickup Sound': disableSound.checked,
        'Enable Scientific Notation': useScientificNotation,
        'Disable Formatted Numbers': JSON.parse(localStorage.getItem('disableFormattedNumbers') || 'false'),
        'Disable Boost Coin Spawning': !boostCoinsUnlocked,
        'Has Done Forge Reset': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.hasDoneForgeReset || false,
        'Has Platinum Unlocked': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.hasPlatinumUnlocked || false,
        'Has Done Infuse Reset': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.hasDoneInfuseReset || false,
        'Disable Magnet': JSON.parse(localStorage.getItem('disableMagnet') || 'false')
    };

    const oldValue = currentFlags[name];
    logAction(`Toggled flag "${name}" from ${oldValue} to ${value}`);

    const saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};

    switch (name) {
    case 'Game Active':
        gameActive = value;
        if (!value)
            pauseGame();
        else
            startGame();
        break;

    case 'Disable Background Music':
        document.getElementById('music-toggle').checked = value;
        musicManager.toggleMusic();
        break;

    case 'Disable Coin Pickup Animation':
        disableAnimation.checked = value;
        localStorage.setItem('disableAnimation', value);
        break;

    case 'Disable Coin Pickup Sound':
        disableSound.checked = value;
        localStorage.setItem('disableSound', value);
        break;

    case 'Enable Scientific Notation':
        useScientificNotation = value;
        localStorage.setItem('useScientificNotation', value);
        document.getElementById('notation-toggle').checked = value;
        refreshAllDisplays();
        break;

    case 'Disable Formatted Numbers':
        localStorage.setItem('disableFormattedNumbers', value);
        refreshAllDisplays();
        break;

    case 'Disable Boost Coin Spawning':
        boostCoinsUnlocked = !value;
        if (value)
            clearInterval(boostSpawnInterval);
        else
            boostSpawnInterval = setInterval(spawnBoostCoin, 60000);
        break;

    case 'Has Done Forge Reset':
        saveData.hasDoneForgeReset = value;
        localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));
        break;

    case 'Has Platinum Unlocked':
        saveData.hasPlatinumUnlocked = value;
        localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));
        const platinumSection = document.querySelector('.platinum-section');
        if (platinumSection) {
            platinumSection.remove();
        }
        break;

    case 'Has Done Infuse Reset':
        saveData.hasDoneInfuseReset = value;
        localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));
        break;

    case 'Disable Magnet':
        saveData.forgeUpgrades = saveData.forgeUpgrades || {};

        if (value) {
            if (!localStorage.getItem('prevMagnetLevel')) {
                localStorage.setItem('prevMagnetLevel', saveData.forgeUpgrades[2]?.level || 0);
            }
            saveData.forgeUpgrades[2] = {
                level: 0
            };
        } else {
            const prevLevel = parseInt(localStorage.getItem('prevMagnetLevel')) || 0;
            saveData.forgeUpgrades[2] = {
                level: prevLevel
            };
            localStorage.removeItem('prevMagnetLevel');
        }

        localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));
        localStorage.setItem('disableMagnet', value);
        updateMagnetIndicator();
        updateMerchantDisplay();
        break;
    }

    refreshAllDisplays();
}

// Close menu and cleanup
function closeDevMenu() {
    const actionLog = getCurrentActionLog()
        const menu = document.querySelector('.dev-menu');
    if (menu)
        menu.remove();
    const style = document.getElementById('dev-menu-style');
    if (style)
        style.remove();
    devMenuOpen = false;
    if (devMenuUpdateInterval) {
        clearInterval(devMenuUpdateInterval);
        devMenuUpdateInterval = null;
    }
    localStorage.setItem('actionLog', JSON.stringify(actionLog.slice(0, maxLogEntries)));
}

function updateActionLog(newEntry) {
    const saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};
    const actionLog = saveData.actionLog || [];

    actionLog.unshift(newEntry);

    // Trim to max length
    if (actionLog.length > maxLogEntries) {
        actionLog.length = maxLogEntries;
    }

    saveData.actionLog = actionLog;
    localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));

    return actionLog;
}

function logAction(message) {
    const now = new Date();
    const timeString = now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });

    updateActionLog({
        time: timeString,
        message: message,
        timestamp: now.getTime()
    });

    if (devMenuOpen)
        updateActionLogDisplay();
}

function updateActionLogDisplay() {
    const logContainer = document.getElementById('action-log-entries');
    if (!logContainer)
        return;

    const actionLog = getCurrentActionLog();

    if (actionLog.length === 0) {
        logContainer.innerHTML = `
			<div class="action-log-empty">
                Actions you perform in the Dev Menu will be logged permanently in this action log.
            </div>
		`;
    } else {
        logContainer.innerHTML = actionLog.map(entry => {
            let formattedMessage = entry.message.replace(
                    /\[GOLD\](.*?)\[\/GOLD\]/g,
                    '<span class="action-log-gold">$1</span>');

            formattedMessage = formattedMessage.replace(
                    /\b(Level \d+)\b/g,
                    '<span class="action-log-level">$1</span>');

            formattedMessage = formattedMessage.replace(
                    /(\d[\d,.]*(?:e[+-]?\d+)*(?:[KMBTQa-zA-Z]*))/g,
                    (match) => /\d/.test(match) ? `<span class="action-log-number">${match}</span>` : match);

            return `
                <div class="action-log-entry">
                    <span class="action-log-time">${entry.time}:</span>
                    <span class="action-log-message">${formattedMessage}</span>
                </div>
            `;
        }).join('');
    }
}

function cleanUpLogs() {
    const actionLog = getCurrentActionLog();
    if (actionLog.length > maxLogEntries) {
        actionLog = actionLog.slice(0, maxLogEntries);
        localStorage.setItem('actionLog', JSON.stringify(actionLog));
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'c' && testModeEnabled) {
        e.preventDefault();
        if (devMenuOpen) {
            closeDevMenu();
        } else {
            createDevMenu();
        }
    }
});

function instantCompleteMerchantDialogues() {
    const saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};

    let completeCount = 0;

    // Iterate through the merchant dialogues and mark them as completed
    merchantDialogues.introduction.options.forEach(option => {
        if (!option.completed) {
            // Mark the dialogue as completed
            option.completed = true;

            // Give the reward for this dialogue
            if (option.reward) {
                if (option.reward.type === 'platinum') {
                    saveData.platinumCoins = (saveData.platinumCoins || 0) + option.reward.amount;
                } else if (option.reward.type === 'molten') {
                    saveData.moltenCoins = (saveData.moltenCoins || 0) + option.reward.amount;
                } else {
                    // Regular coins
                    coinCount += option.reward.amount || option.reward;
                }
            }

            completeCount++;
        }
    });

    // Save the updated save data
    saveData.dialogues = merchantDialogues.introduction.options.map(option => ({
                id: option.id,
                completed: option.completed
            }));
    localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));

    // Log the action in the action log
    logAction(`Instantly completed all merchant dialogues. Total dialogues completed: ${completeCount}`);

    updateDevMenu();
    refreshAllDisplays();
    showDialogue();
}

function resetAllStats() {
    // Load save data
    let saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};
    let resetCount = 0;

    // Reset the global coin count
    if (coinCount !== 0) {
        coinCount = 0;
        resetCount++;
    }

    // Define the correct keys and their default values
    const statProperties = [{
            key: 'moltenCoins',
        default:
            0
        }, {
            key: 'platinumCoins',
        default:
            0
        }, {
            key: 'specialCoins',
        default:
            0
        }, {
            key: 'level',
        default:
            0
        }, {
            key: 'xp',
        default:
            0
        }, {
            key: 'xpNeeded',
        default:
            10
        }
    ];

    // Reset each stat in the save data
    statProperties.forEach(stat => {
        // Only reset if the property exists and is different from its default value
        if (typeof saveData[stat.key] !== 'undefined' && saveData[stat.key] !== stat.default) {
            saveData[stat.key] = stat.default;
            resetCount++;
        }
    });

    // Save the updated data
    localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));

    // Log the action with the total reset count
    logAction(`Reset all stats to nothing. Total stats reset: ${resetCount}`);

    // Update the UI immediately
    updateDevMenu();
    refreshAllDisplays();
}

function resetAllUpgradesToZero() {
    let saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};
    const upgradeCategories = [
        'upgrades',
        'specialUpgrades',
        'forgeUpgrades',
        'platinumUpgrades',
        'infusedUpgrades',
        'automationUpgrades',
    ];

    let resetCount = 0;

    upgradeCategories.forEach(category => {
        if (saveData[category]) {
            Object.keys(saveData[category]).forEach(id => {
                const currentLevel = saveData[category][id].level;
                if (currentLevel !== 0) {
                    saveData[category][id].level = 0;
                    resetCount++;
                }
            });
        }
    });

    localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));

    logAction(`Reset all upgrades to Level 0. Total upgrades reset: ${resetCount}`);

    applyUpgradeEffects();
    updateDevMenu();
    updateMerchantDisplay();
}

function clearAllCoins() {
    // Remove all coin elements
    const coins = document.querySelectorAll('.coin, .special-coin, .boost-coin, .platinum-coin');
    coins.forEach(coin => coin.remove());

    // Clear pending spawns
    activeSpawns.forEach(timeoutId => clearTimeout(timeoutId));
    activeSpawns = [];
}

function incrementAllUpgradeLevels() {
    // Load current save data
    let saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};
    let incrementCount = 0;

    // Define the upgrade categories and their corresponding keys
    const upgradeCategories = [{
            key: 'upgrades',
            upgrades: upgrades
        }, {
            key: 'specialUpgrades',
            upgrades: specialUpgrades
        }, {
            key: 'forgeUpgrades',
            upgrades: forgeUpgrades
        }, {
            key: 'platinumUpgrades',
            upgrades: platinumUpgrades
        }, {
            key: 'infusedUpgrades',
            upgrades: infusedUpgrades
        }, {
            key: 'automationUpgrades',
            upgrades: automationUpgrades
        }

    ];

    // Ensure the upgrade categories exist in saveData
    upgradeCategories.forEach(category => {
        if (!saveData[category.key]) {
            saveData[category.key] = {};
        }
    });

    // Iterate over each category of upgrades and increment their levels
    upgradeCategories.forEach(category => {
        Object.entries(category.upgrades).forEach(([id, upgrade]) => {
            // Check if the upgrade exists in the save data
            const currentLevel = saveData[category.key][id]?.level || 0;

            // If it doesn't exist in the save data, initialize it with level 0
            if (saveData[category.key][id] === undefined) {
                saveData[category.key][id] = {
                    level: 0
                };
            }

            // Increment the level by 1
            saveData[category.key][id].level = currentLevel + 1;
            incrementCount++;
        });
    });

    // Save the updated data
    localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));

    // Log the action
    logAction(`Incremented all upgrade levels by 1. Total upgrades incremented: ${incrementCount}`);

    // Update the UI to reflect the changes
    updateDevMenu();
    applyUpgradeEffects();
    refreshAllDisplays();
}

function resetGame() {
    // Load current save data
    let saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};

    const upgradeCategories = [
        'upgrades', 'specialUpgrades', 'forgeUpgrades', 'platinumUpgrades', 'infusedUpgrades', 'automationUpgrades'
    ];

    if (coinCount !== 0) {
        coinCount = 0;
    }

    upgradeCategories.forEach(category => {
        saveData[category] = {};
    });

    const statsToReset = [
        'coins', 'moltenCoins', 'platinumCoins', 'specialCoins', 'level', 'xp', 'xpNeeded', 'infusedCoins', 'automationCores'
    ];

    statsToReset.forEach(stat => {
        if (stat === 'xpNeeded') {
            saveData[stat] = 10;
        } else {
            saveData[stat] = 0;
        }
    });

    // Set key flags to false
    const flagsToReset = [
        'hasReached10Coins', 'hasDoneForgeReset', 'hasPlatinumUnlocked', 'hasDoneInfuseReset'
    ];

    flagsToReset.forEach(flag => {
        saveData[flag] = false;
    });

    localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));

    updateDevMenu();
    updateActionLogDisplay();

    restoreMerchantDialogues();

    logAction('Performed a hard reset. All stats and upgrades have been wiped.');
    clearAllCoins();
    applyUpgradeEffects();
}
*/
