
import { getLastSaveTime } from '../util/storage.js';
import { getGearsProductionRate } from '../ui/merchantTabs/workshopTab.js';
import { hasDoneInfuseReset } from '../ui/merchantTabs/resetTab.js';
import { pauseGameLoop, resumeGameLoop } from './gameLoop.js';
import { bank } from '../util/storage.js';
import { BigNum } from '../util/bigNum.js';
import { formatNumber } from '../util/numFormat.js';

let initialized = false;

function formatTimeCompact(ms) {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rs = s % 60;
    if (m < 60) return `${m}m ${rs}s`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    if (h < 24) return `${h}h ${rm}m`;
    const d = Math.floor(h / 24);
    const rh = h % 24;
    if (d < 365) return `${d}d ${rh}h`;
    const y = Math.floor(d / 365);
    const rd = d % 365;
    return `${y}y ${rd}d`;
}

function createOfflinePanel(rewards, offlineMs) {
    // Styles are now in css/game/offlinePanel.css, imported via main bundle
    
    const panel = document.createElement('div');
    panel.className = 'offline-panel';
    
    const card = document.createElement('div');
    card.className = 'offline-card';
    
    const header = document.createElement('div');
    header.className = 'offline-header';
    header.textContent = 'Offline Progress';
    
    const content = document.createElement('div');
    content.className = 'offline-content';
    
    const timeRow = document.createElement('div');
    timeRow.className = 'offline-time-row';
    timeRow.textContent = `You were away for ${formatTimeCompact(offlineMs)}`;
    content.appendChild(timeRow);

    if (rewards.gears && !rewards.gears.isZero()) {
        const row = document.createElement('div');
        row.className = 'offline-reward-row reward-gears';
        row.innerHTML = `+<img src="img/currencies/gear/gear.webp" class="offline-reward-icon"> ${formatNumber(rewards.gears)}`;
        content.appendChild(row);
    }
    // Future rewards (Coins, XP, etc) can be added here
    
    const actions = document.createElement('div');
    actions.className = 'offline-actions';
    
    const btn = document.createElement('button');
    btn.className = 'offline-close-btn';
    btn.textContent = 'Close';
    
    // Claim logic
    btn.addEventListener('click', () => {
        if (rewards.gears) {
            if (bank.gears) bank.gears.add(rewards.gears);
        }
        panel.remove();
        resumeGameLoop();
    });

    actions.appendChild(btn);
    card.appendChild(header);
    card.appendChild(content);
    card.appendChild(actions);
    panel.appendChild(card);
    
    return panel;
}

export function processOfflineProgress() {
    const lastSave = getLastSaveTime();
    const now = Date.now();
    
    // Threshold: User requested "few seconds".
    // Let's use 1000ms (1s) to be responsive.
    if (lastSave <= 0) return;
    
    const diff = now - lastSave;
    if (diff < 1000) return; // Ignore gaps < 1s
    
    // Only process if player has unlocked the relevant system
    if (!hasDoneInfuseReset()) return;

    const seconds = diff / 1000;
    
    // Calculate Rewards
    const gearRate = getGearsProductionRate ? getGearsProductionRate() : BigNum.fromInt(0);
    const gearsEarned = gearRate.mulDecimal(String(seconds)).floorToInteger();
    
    const rewards = {};
    let hasRewards = false;
    
    if (!gearsEarned.isZero()) {
        rewards.gears = gearsEarned;
        hasRewards = true;
    }
    
    if (hasRewards) {
        pauseGameLoop();
        const panel = createOfflinePanel(rewards, diff);
        document.body.appendChild(panel);
    }
}

export function initOfflineTracker() {
    if (initialized) return;
    initialized = true;
    
    // Initial check on boot
    // We delay slightly to ensure other systems (upgrades, etc) are fully loaded
    setTimeout(() => {
        processOfflineProgress();
    }, 500);
    
    // Check again when tab becomes visible
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            processOfflineProgress();
        }
    });
}
