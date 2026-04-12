import { bank, getActiveSlot } from '../../../util/storage.js';
import { ACHIEVEMENTS, ACHIEVEMENT_STATES, getAchievementState } from '../../../game/achievements.js';
import { playPurchaseSfx } from '../../shopOverlay.js';
import { formatNumber } from '../../../util/numFormat.js';
import { BigNum, bigNumFromLog10 } from '../../../util/bigNum.js';

const VOID_LEVEL_KEY = 'ccc:voidLevel';

export function getVoidLevel(slot = getActiveSlot()) {
    const slotKey = String(slot ?? 'default');
    try {
        const valStr = localStorage.getItem(`${VOID_LEVEL_KEY}:${slotKey}`);
        if (valStr !== null && valStr !== 'undefined') {
            try {
                return BigNum.fromAny(valStr);
            } catch {
                return BigNum.fromInt(0);
            }
        }
    } catch {}
    return BigNum.fromInt(0);
}

export function setVoidLevel(level, slot = getActiveSlot()) {
    const slotKey = String(slot ?? 'default');
    let valBn;
    try {
        valBn = level instanceof BigNum ? level : BigNum.fromAny(level);
        if (valBn.isNegative && valBn.isNegative()) valBn = BigNum.fromInt(0);
    } catch {
        valBn = BigNum.fromInt(0);
    }
    try {
        localStorage.setItem(`${VOID_LEVEL_KEY}:${slotKey}`, valBn.toString());
    } catch {}
}

export function getRainbowGemMultiplier() {
    const level = getVoidLevel();
    const levelNum = Number(level.toString());
    if (levelNum < 300) {
        return BigNum.fromAny(Math.pow(1.1, levelNum));
    }
    const multLog10 = Math.log10(1.1) * levelNum;
    return bigNumFromLog10(multLog10);
}

export function feedVoidGem() {
    if (!bank.voidGems || bank.voidGems.value.cmp(1) < 0) return false;

    const slot = getActiveSlot();
    const oldMultiplier = getRainbowGemMultiplier();

    let sumBaseRewards = 0;
    for (const achievement of ACHIEVEMENTS) {
        if (getAchievementState(achievement.id, slot) === ACHIEVEMENT_STATES.ACHIEVED) {
            sumBaseRewards += achievement.rewardAmount;
        }
    }

    const oldTotal = oldMultiplier.mulScaledIntFloor(BigInt(Math.round(sumBaseRewards)), 0);

    bank.voidGems.add(-1);
    const currentLevel = getVoidLevel(slot);
    setVoidLevel(currentLevel + 1, slot);

    const newMultiplier = getRainbowGemMultiplier();
    const newTotal = newMultiplier.mulScaledIntFloor(BigInt(Math.round(sumBaseRewards)), 0);
    const diff = newTotal.sub(oldTotal);

    if (diff.cmp(0) > 0 && bank.rainbowGems) {
        bank.rainbowGems.add(diff);
    }

    return true;
}

let altarTabPanel = null;

export function initVoidGemAltarTab(panel) {
    if (!panel || panel.__vgInit) return;
    panel.__vgInit = true;
    altarTabPanel = panel;

    panel.innerHTML = `
        <div class="warp-tab">
            <h3 class="warp-title">Void Gem Altar</h3>
            <div class="warp-desc">
                <p>Feed your Void Gems to the ??? to power your Void Level<br>For every Void Level after 0, multiply Rainbow Gem value by 1.1 compounding<br>You will also gain the updated Rainbow Gem amount from achievements that have already been claimed</p>
            </div>
            <div class="warp-status">
                <div class="warp-timer void-gem-counter" style="visibility: visible;">Void Gems: <span class="text-cyan">0</span></div>
                <div class="warp-counter void-level-indicator">Void Level: <span class="text-cyan">0</span></div>
            </div>
            <button type="button" class="void-feed-btn warp-btn" style="background-color: black; color: white;">Feed</button>
        </div>
    `;

    const feedBtn = panel.querySelector('.void-feed-btn');
    feedBtn.addEventListener('click', (e) => {
        if (feedVoidGem()) {
            playPurchaseSfx();
            updateVoidGemAltarTab();
        }
    });

    updateVoidGemAltarTab();

    // Listen for debug panel changes
    if (!panel.__debugListenerAdded) {
        panel.__debugListenerAdded = true;
        document.addEventListener('ccc:voidLevel:changed', updateVoidGemAltarTab);
        window.addEventListener('currency:change', (e) => {
            if (e.detail && e.detail.key === 'voidGems') {
                updateVoidGemAltarTab();
            }
        });
    }
}

export function updateVoidGemAltarTab() {
    if (!altarTabPanel) return;

    const gemCounterEl = altarTabPanel.querySelector('.void-gem-counter span');
    const levelIndicatorEl = altarTabPanel.querySelector('.void-level-indicator span');
    const feedBtn = altarTabPanel.querySelector('.void-feed-btn');

    const voidGemsAmount = bank.voidGems ? bank.voidGems.value : BigNum.fromInt(0);
    const currentVoidLevel = getVoidLevel();

    if (gemCounterEl) {
        gemCounterEl.textContent = typeof formatNumber === 'function' ? formatNumber(voidGemsAmount) : voidGemsAmount.toString();
    }

    if (levelIndicatorEl) {
        levelIndicatorEl.textContent = typeof formatNumber === 'function' ? formatNumber(currentVoidLevel) : currentVoidLevel.toString();
    }

    if (feedBtn) {
        if (bank.voidGems && bank.voidGems.value.cmp(1) >= 0) {
            feedBtn.disabled = false;
        } else {
            feedBtn.disabled = true;
        }
    }
}
