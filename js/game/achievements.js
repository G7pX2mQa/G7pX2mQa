import { getActiveSlot } from '../util/storage.js';
import { hasDoneForgeReset, hasDoneInfuseReset, hasDoneSurgeReset } from '../ui/merchantTabs/resetTab.js';
import { isLabUnlocked, getMapSequenceSeen } from './surgeEffects.js';
import { hasDoneExperimentReset } from '../ui/merchantTabs/resetTab.js';
import { getFlowUnlockState } from '../ui/merchantTabs/flowTab.js';
import { hasEvolvedAnyUpgrade } from './upgrades.js';
import { showNotification } from '../ui/notifications.js';

export const ACHIEVEMENT_STATES = {
    NOT_OWNED: 0,
    PENDING_CLAIM: 1,
    ACHIEVED: 2
};

const _rawAchievements = [
    {
        id: 1,
        title: 'Forged',
        desc: 'Perform a Forge reset',
        icon: 'img/misc/forge_plus_base.webp',
        checkCondition: () => hasDoneForgeReset()
    },
    {
        id: 2,
        title: 'Infused',
        desc: 'Perform an Infuse reset',
        icon: 'img/misc/infuse_plus_base.webp',
        checkCondition: () => hasDoneInfuseReset()
    },
        {
        id: 3,
        title: 'Surged',
        desc: 'Perform a Surge reset',
        icon: 'img/misc/surge_plus_base.webp',
        checkCondition: () => hasDoneSurgeReset()
    },
    {
        id: 4,
        title: 'What Once Was Lost',
        desc: 'Unlock the Lab tab',
        icon: 'img/stats/rp/rp_plus_base.webp',
        checkCondition: () => {
            if (typeof isLabUnlocked === 'function') {
                return isLabUnlocked();
            }
            return false;
        },
        notifyCondition: () => {
            return typeof window !== 'undefined' && !window.__tsunamiActive;
        }
    },
    {
        id: 5,
        title: 'Experimental',
        desc: 'Perform an Experiment reset',
        icon: 'img/misc/experiment_plus_base.webp',
        checkCondition: () => {
            if (typeof hasDoneExperimentReset === 'function') {
                return hasDoneExperimentReset();
            }
            return false;
        }
    },
    {
        id: 6,
        title: 'Flowing',
        desc: 'Unlock the Flow tab',
        icon: 'img/stats/fp/fp_plus_base.webp',
        checkCondition: () => {
            if (typeof getFlowUnlockState === 'function') {
                return !!getFlowUnlockState();
            }
            return false;
        }
    },
    {
        id: 7,
        title: 'Evolutionary',
        desc: 'Evolve an upgrade',
        icon: 'img/misc/evolve_achievement_icon.webp',
        checkCondition: () => {
            if (typeof hasEvolvedAnyUpgrade === 'function') {
                return hasEvolvedAnyUpgrade();
            }
            return false;
        }
    },
    {
        id: 8,
        title: 'We Need to Go Deeper',
        desc: 'Unlock the Underwater Cavern area',
        icon: 'img/currencies/scrap/scrap_plus_base.webp',
        checkCondition: () => {
            const hasSeenUnlockSequence = typeof getMapSequenceSeen === 'function' && getMapSequenceSeen('cavern');
            return hasSeenUnlockSequence || isMapNodeUnlocked('cavern', true);
        },
        notifyCondition: () => {
            return typeof window !== 'undefined' && !window.__mapSequenceActive;
        }
    }
];

export const ACHIEVEMENTS = _rawAchievements.map((ach, index) => {
    return {
        ...ach,
        rewardAmount: Math.floor(100 * Math.pow(1.2, index))
    };
});

const ACHIEVEMENT_STATE_KEY_BASE = 'ccc:achievements:state';
const MAP_NODE_LOCKED_KEY = (id, slot) => `ccc:map:locked:${id}:${slot}`;

const achievementStateCache = new Map();

function isMapNodeUnlocked(id, defaultLocked = true, slot = getActiveSlot()) {
    if (slot == null || typeof localStorage === 'undefined') return !defaultLocked;
    try {
        const val = localStorage.getItem(MAP_NODE_LOCKED_KEY(id, slot));
        if (val != null) return val !== '1';
    } catch {}
    return !defaultLocked;
}

function ensureAchievementState(slot = getActiveSlot()) {
    const slotKey = String(slot ?? 'default');
    if (achievementStateCache.has(slotKey)) {
        return achievementStateCache.get(slotKey);
    }

    let parsed = {};
    if (typeof localStorage !== 'undefined') {
        try {
            const raw = localStorage.getItem(`${ACHIEVEMENT_STATE_KEY_BASE}:${slotKey}`);
            if (raw) {
                const obj = JSON.parse(raw);
                if (obj && typeof obj === 'object') {
                    parsed = obj;
                }
            }
        } catch {}
    }

    achievementStateCache.set(slotKey, parsed);
    return parsed;
}

function saveAchievementState(state, slot = getActiveSlot()) {
    const slotKey = String(slot ?? 'default');
    if (!state || typeof state !== 'object') {
        state = {};
    }
    achievementStateCache.set(slotKey, state);
    if (typeof localStorage === 'undefined') return;
    try {
        localStorage.setItem(`${ACHIEVEMENT_STATE_KEY_BASE}:${slotKey}`, JSON.stringify(state));
    } catch {}
}

export function getAchievementState(id, slot = getActiveSlot()) {
    const state = ensureAchievementState(slot);
    return state[id] ?? ACHIEVEMENT_STATES.NOT_OWNED;
}

export function setAchievementState(id, newState, slot = getActiveSlot()) {
    const state = ensureAchievementState(slot);
    state[id] = newState;
    saveAchievementState(state, slot);
    
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('achievements:updated', { detail: { id, state: newState, slot } }));
    }
}

export function checkAchievements(slot = getActiveSlot()) {
    let changed = false;
    for (const achievement of ACHIEVEMENTS) {
        const currentState = getAchievementState(achievement.id, slot);
        if (currentState === ACHIEVEMENT_STATES.NOT_OWNED) {
            if (achievement.checkCondition()) {
                setAchievementState(achievement.id, ACHIEVEMENT_STATES.PENDING_CLAIM, slot);
                changed = true;
                if (!achievement.notifyCondition || achievement.notifyCondition()) {
                    showNotification(`Achievement: "${achievement.title}" Completed<br><span class="notification-subtext">Claim your reward in the Achievements menu</span>`, achievement.icon);
                } else if (typeof window !== 'undefined') {
                    window.__delayedAchievementNotifications = window.__delayedAchievementNotifications || [];
                    window.__delayedAchievementNotifications.push({ title: achievement.title, icon: achievement.icon });
                }
            }
        }
    }
    return changed;
}

export function showDelayedAchievementNotifications() {
    if (typeof window === 'undefined') return;
    if (window.__delayedAchievementNotifications && window.__delayedAchievementNotifications.length > 0) {
        for (const notif of window.__delayedAchievementNotifications) {
            showNotification(`Achievement: "${notif.title}" Completed<br><span class="notification-subtext">Claim your reward in the Achievements menu</span>`, notif.icon);
        }
        window.__delayedAchievementNotifications = [];
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('forge:completed', () => checkAchievements());
    window.addEventListener('unlock:change', () => checkAchievements());
    window.addEventListener('saveSlot:change', () => checkAchievements());
    window.addEventListener('surge:level:change', () => checkAchievements());
}
