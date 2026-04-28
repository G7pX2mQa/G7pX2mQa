import { getActiveSlot, bank } from '../util/storage.js';
import { showNotification } from '../ui/notifications.js';
import { formatNumber } from '../util/numFormat.js';
import { BigNum } from '../util/bigNum.js';
import { getCollectiveAutobuyerState } from './automationEffects.js';
import { AREA_KEYS, getUpgradesForArea } from './upgrades.js';
import { settingsManager } from './settingsManager.js';

export const SECRET_ACHIEVEMENT_STATES = {
    NOT_OWNED: 0,
    PENDING_CLAIM: 1,
    ACHIEVED: 2
};

function getSizeCoinsCollectedKey(size, slot) {
    return `ccc:secretAchievements:size${size}CoinsCollected:${slot}`;
}

export function getLifetimeSizeCoinsCollected(size, slot = getActiveSlot()) {
    if (slot == null) return 0;
    try {
        const val = localStorage.getItem(getSizeCoinsCollectedKey(size, slot));
        if (val) {
            const num = parseInt(val, 10);
            return Number.isFinite(num) ? num : 0;
        }
    } catch {}
    return 0;
}

export function incrementLifetimeSizeCoinsCollected(size, slot = getActiveSlot()) {
    if (slot == null) return;
    const current = getLifetimeSizeCoinsCollected(size, slot);
    try {
        localStorage.setItem(getSizeCoinsCollectedKey(size, slot), String(current + 1));
    } catch {}
}

export function getLifetimeUselessExperiment(slot = getActiveSlot()) {
    if (slot == null) return false;
    try {
        const val = localStorage.getItem(`ccc:secretAchievements:uselessExperiment:${slot}`);
        return val === '1';
    } catch {}
    return false;
}

export function setLifetimeUselessExperiment(slot = getActiveSlot()) {
    if (slot == null) return;
    try {
        localStorage.setItem(`ccc:secretAchievements:uselessExperiment:${slot}`, '1');
    } catch {}
}

export function getLifetimeBossBeaten(slot = getActiveSlot()) {
    if (slot == null) return false;
    try {
        const val = localStorage.getItem(`ccc:secretAchievements:bossBeaten:${slot}`);
        return val === '1';
    } catch {}
    return false;
}

export function setLifetimeBossBeaten(slot = getActiveSlot()) {
    if (slot == null) return;
    try {
        localStorage.setItem(`ccc:secretAchievements:bossBeaten:${slot}`, '1');
    } catch {}
}

export function trackBinaryFlowSequence(waterwheelId, slot = getActiveSlot()) {
    if (slot == null) return;
    try {
        if (waterwheelId !== 'coin' && waterwheelId !== 'xp') return;
        
        const key = `ccc:secretAchievements:binaryFlowSequence:${slot}`;
        let seq = localStorage.getItem(key) || "";
        seq += (waterwheelId === 'xp') ? "1" : "0";
        if (seq.length > 32) {
            seq = seq.slice(-32);
        }
        localStorage.setItem(key, seq);
        checkSecretAchievements(slot);
    } catch {}
}

export function getBinaryFlowSequence(slot = getActiveSlot()) {
    if (slot == null) return "";
    try {
        return localStorage.getItem(`ccc:secretAchievements:binaryFlowSequence:${slot}`) || "";
    } catch {}
    return "";
}

const _rawSecretAchievements = [
    {
        id: 1,
        title: 'A Large One',
        get desc() { return `Collect a Coin of size 4 (1/${formatNumber(BigNum.fromAny(10000))} chance to spawn)`; },
        icon: 'img/currencies/coin/coin_plus_base.webp',
        checkCondition: (slot) => getLifetimeSizeCoinsCollected(4, slot) > 0,
        trackedSize: 4
    },
    {
        id: 2,
        title: 'A Larger One',
        get desc() { return `Collect a Coin of size 5 (1/${formatNumber(BigNum.fromAny(100000))} chance to spawn)`; },
        icon: 'img/currencies/coin/coin.webp',
        checkCondition: (slot) => getLifetimeSizeCoinsCollected(5, slot) > 0,
        trackedSize: 5
    },
    {
        id: 3,
        title: 'The Largest One',
        get desc() { return `Collect a Coin of size 6 (1/${formatNumber(BigNum.fromAny(1000000))} chance to spawn)`; },
        icon: 'img/misc/largest_coin_plus_base.webp',
        checkCondition: (slot) => getLifetimeSizeCoinsCollected(6, slot) > 0,
        trackedSize: 6
    },
    {
        id: 4,
        title: 'That Was Unexpected',
        get desc() { return 'Defeat the Merchant\'s secret boss fight'; },
        icon: 'img/misc/that_was_unexpected.webp',
        extraHint: 'Extra hint: Maybe the Merchant can help you obtain this secret achievement…',
        checkCondition: (slot) => getLifetimeBossBeaten(slot)
    },
    {
        id: 5,
        title: 'Safety First',
        get desc() { return 'Toggle the reset confirmations for Forge, Infuse, Surge, and Experiment to ON'; },
        icon: 'img/misc/safety_first.webp',
        checkCondition: (slot) => {
            return settingsManager.get('forge_confirmation') &&
                   settingsManager.get('infuse_confirmation') &&
                   settingsManager.get('surge_confirmation') &&
                   settingsManager.get('experiment_confirmation');
        }
    },
    {
        id: 6,
        title: 'A Useless Experiment',
        get desc() { return 'Perform an Experiment reset while having XP Level 0'; },
        icon: 'img/misc/a_useless_experiment.webp',
        checkCondition: (slot) => getLifetimeUselessExperiment(slot)
    },
    {
        id: 7,
        title: 'Semi-Automatic',
        get desc() { return 'Configure the automation of five different currencies to a "Sort of ON" state'; },
        icon: 'img/misc/semi_automatic.webp',
        checkCondition: (slot) => {
            const costTypes = new Set();
            Object.values(AREA_KEYS).forEach(areaKey => {
                const upgrades = getUpgradesForArea(areaKey);
                upgrades.forEach(upg => {
                    if (upg.costType && upg.costType !== 'gears') {
                        costTypes.add(upg.costType);
                    }
                });
            });
            let mixedCount = 0;
            for (const type of costTypes) {
                if (getCollectiveAutobuyerState(type) === 0.5) {
                    mixedCount++;
                }
            }
            return mixedCount >= 5;
        }
    },
    {
        id: 8,
        title: 'Binary Flow',
        get desc() { return 'In the Flow tab, construct the word "Flow" in binary where toggling the Coin Waterwheel\'s Flow State represents 0, and toggling the XP Waterwheel\'s Flow State represents 1. Toggles must be consecutive.'; },
        icon: 'img/misc/binary_flow.webp',
		extraHint: 'Extra hint: 01000110011011000110111101110111',
        checkCondition: (slot) => {
            const seq = getBinaryFlowSequence(slot);
            const validSequences = new Set([
                "01100110011011000110111101110111", // flow
                "01100110011011000110111101010111", // floW
                "01100110011011000100111101110111", // flOw
                "01100110011011000100111101010111", // flOW
                "01100110010011000110111101110111", // fLow
                "01100110010011000110111101010111", // fLoW
                "01100110010011000100111101110111", // fLOw
                "01100110010011000100111101010111", // fLOW
                "01000110011011000110111101110111',", // Flow
                "01000110011011000110111101010111", // FloW
                "01000110011011000100111101110111", // FlOw
                "01000110011011000100111101010111", // FlOW
                "01000110010011000110111101110111", // FLow
                "01000110010011000110111101010111", // FLoW
                "01000110010011000100111101110111", // FLOw
                "01000110010011000100111101010111"  // FLOW
            ]);
            return validSequences.has(seq);
        }
    }
];

export const SECRET_ACHIEVEMENTS = _rawSecretAchievements.map(ach => ({
    ...ach,
    rewardAmount: 1
}));

const SECRET_ACHIEVEMENT_STATE_KEY_BASE = 'ccc:secretAchievements:state';

const secretAchievementStateCache = new Map();

function ensureSecretAchievementState(slot = getActiveSlot()) {
    const slotKey = String(slot ?? 'default');
    if (secretAchievementStateCache.has(slotKey)) {
        return secretAchievementStateCache.get(slotKey);
    }

    let parsed = {};
    if (typeof localStorage !== 'undefined') {
        try {
            const raw = localStorage.getItem(`${SECRET_ACHIEVEMENT_STATE_KEY_BASE}:${slotKey}`);
            if (raw) {
                const obj = JSON.parse(raw);
                if (obj && typeof obj === 'object') {
                    parsed = obj;
                }
            }
        } catch {}
    }

    secretAchievementStateCache.set(slotKey, parsed);
    return parsed;
}

function saveSecretAchievementState(state, slot = getActiveSlot()) {
    const slotKey = String(slot ?? 'default');
    if (!state || typeof state !== 'object') {
        state = {};
    }
    secretAchievementStateCache.set(slotKey, state);
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(`${SECRET_ACHIEVEMENT_STATE_KEY_BASE}:${slotKey}`, JSON.stringify(state));
    } catch {}
}

export function getSecretAchievementState(id, slot = getActiveSlot()) {
    const state = ensureSecretAchievementState(slot);
    return state[id] ?? SECRET_ACHIEVEMENT_STATES.NOT_OWNED;
}

export function setSecretAchievementState(id, newState, slot = getActiveSlot()) {
    const state = ensureSecretAchievementState(slot);
    state[id] = newState;
    saveSecretAchievementState(state, slot);
    
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('secretAchievements:updated', { detail: { id, state: newState, slot } }));
    }
}

export function checkSecretAchievements(slot = getActiveSlot()) {
    let changed = false;
    for (const achievement of SECRET_ACHIEVEMENTS) {
        const currentState = getSecretAchievementState(achievement.id, slot);
        if (currentState === SECRET_ACHIEVEMENT_STATES.NOT_OWNED) {
            if (achievement.checkCondition(slot)) {
                setSecretAchievementState(achievement.id, SECRET_ACHIEVEMENT_STATES.PENDING_CLAIM, slot);
                changed = true;
                if (typeof window !== 'undefined' && !window.__debugSuppressAchievementNotifications) {
                    if (!achievement.notifyCondition || achievement.notifyCondition()) {
                        showNotification(`Secret Achievement: "${achievement.title}" Completed<br><span class="notification-subtext">Claim your reward in the Achievements menu</span>`, achievement.icon);
                    } else {
                        window.__delayedSecretAchievementNotifications = window.__delayedSecretAchievementNotifications || [];
                        window.__delayedSecretAchievementNotifications.push({ title: achievement.title, icon: achievement.icon });
                    }
                }
            }
        }
    }
    return changed;
}

export function showDelayedSecretAchievementNotifications() {
    if (typeof window === 'undefined') return;
    if (window.__delayedSecretAchievementNotifications && window.__delayedSecretAchievementNotifications.length > 0) {
        for (const notif of window.__delayedSecretAchievementNotifications) {
            showNotification(`Secret Achievement: "${notif.title}" Completed<br><span class="notification-subtext">Claim your reward in the Achievements menu</span>`, notif.icon);
        }
        window.__delayedSecretAchievementNotifications = [];
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('forge:completed', () => checkSecretAchievements());
    window.addEventListener('unlock:change', () => checkSecretAchievements());
    window.addEventListener('autobuyer:toggled', () => checkSecretAchievements());
    window.addEventListener("setting:changed", () => checkSecretAchievements());
}
