import { getActiveSlot } from '../util/storage.js';
import { hasDoneForgeReset, hasDoneInfuseReset, hasDoneSurgeReset } from '../ui/merchantTabs/resetTab.js';
import { getTsunamiSequenceSeen } from './surgeEffects.js';
import { hasDoneExperimentReset } from '../ui/merchantTabs/resetTab.js';
import { getFlowUnlockState } from '../ui/merchantTabs/flowTab.js';
import { hasEvolvedAnyUpgrade } from './upgrades.js';
import { showNotification } from '../ui/notifications.js';

export const ACHIEVEMENT_STATES = {
    NOT_OWNED: 0,
    PENDING_CLAIM: 1,
    CLAIMED: 2
};

export const ACHIEVEMENTS = [
    {
        id: 1,
        title: 'Forged',
        desc: 'Perform a Forge reset',
        rewardText: 'nothing',
        icon: 'img/misc/forge_plus_base.webp',
        checkCondition: () => hasDoneForgeReset()
    },
    {
        id: 2,
        title: 'Infused',
        desc: 'Perform an Infuse reset',
        rewardText: 'nothing',
        icon: 'img/misc/infuse_plus_base.webp',
        checkCondition: () => hasDoneInfuseReset()
    },
        {
        id: 3,
        title: 'Surged',
        desc: 'Perform a Surge reset',
        rewardText: 'nothing',
        icon: 'img/misc/surge_plus_base.webp',
        checkCondition: () => hasDoneSurgeReset()
    },
    {
        id: 4,
        title: 'What Once Was Lost',
        desc: 'Unlock the Lab tab',
        rewardText: 'nothing',
        icon: 'img/stats/rp/rp_plus_base.webp',
        checkCondition: () => {
            if (typeof getTsunamiSequenceSeen === 'function') {
                return getTsunamiSequenceSeen();
            }
            return false;
        },
        notifyCondition: () => {
            return typeof window !== 'undefined' && !window.__tsunamiActive;
        }
    },
    {
        id: 5,
        title: 'A Scientific Experiment',
        desc: 'Perform an Experiment reset',
        rewardText: 'nothing',
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
        rewardText: 'nothing',
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
        rewardText: 'nothing',
        icon: 'img/misc/evolve_achievement_icon.webp',
        checkCondition: () => {
            if (typeof hasEvolvedAnyUpgrade === 'function') {
                return hasEvolvedAnyUpgrade();
            }
            return false;
        }
    }
];

const ACHIEVEMENT_STATE_KEY_BASE = 'ccc:achievements:state';

const achievementStateCache = new Map();

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
                if (typeof window !== 'undefined') {
                    if (!achievement.notifyCondition || achievement.notifyCondition()) {
                        showNotification(`Achievement: "${achievement.title}" Completed<br><span class="ach-claim-subtext">Claim your reward in the Achievements menu</span>`, achievement.icon);
                    } else {
                        window.__delayedAchievementNotifications = window.__delayedAchievementNotifications || [];
                        window.__delayedAchievementNotifications.push({ title: achievement.title, icon: achievement.icon });
                    }
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
            showNotification(`Achievement: "${notif.title}" Completed<br><span class="ach-claim-subtext">Claim your reward in the Achievements menu</span>`, notif.icon);
        }
        window.__delayedAchievementNotifications = [];
    }
}

if (typeof window !== 'undefined') {
    window.addEventListener('forge:completed', () => checkAchievements());
    window.addEventListener('unlock:change', () => checkAchievements());
    window.addEventListener('saveSlot:change', () => checkAchievements());
}
