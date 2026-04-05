import { getActiveSlot } from '../util/storage.js';
import { isForgeUnlocked, isInfuseUnlocked, isSurgeUnlocked } from '../ui/merchantTabs/resetTab.js';

export const ACHIEVEMENT_STATES = {
    NOT_OWNED: 0,
    PENDING_CLAIM: 1,
    CLAIMED: 2
};

export const ACHIEVEMENTS = [
    {
        id: 'unlock_mp',
        title: 'Unlock MP',
        desc: 'Perform a Forge reset for the first time.',
        rewardText: 'nothing',
        icon: 'img/misc/forge_plus_base.webp',
        checkCondition: () => isForgeUnlocked()
    },
    {
        id: 'unlock_workshop',
        title: 'Unlock Workshop',
        desc: 'Perform an Infuse reset for the first time.',
        rewardText: 'nothing',
        icon: 'img/misc/infuse_plus_base.webp',
        checkCondition: () => isInfuseUnlocked()
    },
    {
        id: 'unlock_warp',
        title: 'Unlock Warp',
        desc: 'Perform a Surge reset for the first time.',
        rewardText: 'nothing',
        icon: 'img/misc/surge_plus_base.webp',
        checkCondition: () => isSurgeUnlocked()
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
            }
        }
    }
    return changed;
}

if (typeof window !== 'undefined') {
    window.addEventListener('forge:completed', () => checkAchievements());
    window.addEventListener('unlock:change', () => checkAchievements());
    window.addEventListener('saveSlot:change', () => checkAchievements());
}