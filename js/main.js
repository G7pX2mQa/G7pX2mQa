import { getActiveSlot, bank } from '../util/storage.js';
import { showNotification } from '../ui/notifications.js';

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

const _rawSecretAchievements = [
    {
        id: 1,
        title: 'A Large One',
        desc: 'Collect a Coin of size 4 (1/{formatNumber}10000 chance to spawn)',
        icon: 'img/currencies/coin/coin_plus_base.webp',
        checkCondition: (slot) => getLifetimeSizeCoinsCollected(4, slot) > 0,
        trackedSize: 4
    },
    {
        id: 2,
        title: 'A Larger One',
        desc: 'Collect a Coin of size 5 (1/{formatNumber}100000 chance to spawn)',
        icon: 'img/currencies/coin/coin.webp',
        checkCondition: (slot) => getLifetimeSizeCoinsCollected(5, slot) > 0,
        trackedSize: 5
    },
    {
        id: 3,
        title: 'The Largest One',
        desc: 'Collect a Coin of size 6 (1/{formatNumber}1000000 chance to spawn)',
        icon: 'img/misc/largest_coin_plus_base.webp',
        checkCondition: (slot) => getLifetimeSizeCoinsCollected(6, slot) > 0,
        trackedSize: 6
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
                        showNotification(`Secret Achievement: "${achievement.title}" Completed<br><span class="ach-claim-subtext">Claim your reward in the Achievements menu</span>`, achievement.icon);
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
            showNotification(`Secret Achievement: "${notif.title}" Completed<br><span class="ach-claim-subtext">Claim your reward in the Achievements menu</span>`, notif.icon);
        }
        window.__delayedSecretAchievementNotifications = [];
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('saveSlot:change', () => checkSecretAchievements());
    window.addEventListener('forge:completed', () => checkSecretAchievements());
    window.addEventListener('unlock:change', () => checkSecretAchievements());
}
