import { getLastSaveTime } from '../util/storage.js';
import { getGearsProductionRate } from '../ui/merchantTabs/workshopTab.js';
import { pauseGameLoop, resumeGameLoop } from './gameLoop.js';
import { bank } from '../util/storage.js';
import { BigNum } from '../util/bigNum.js';
import { formatNumber } from '../util/numFormat.js';

let initialized = false;
let styleInjected = false;

function injectStyles() {
    if (styleInjected) return;
    const style = document.createElement('style');
    style.textContent = `
    .offline-panel {
        position: fixed;
        inset: 0;
        z-index: 2000;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.6);
        pointer-events: auto;
    }
    .offline-card {
        background: #003366; /* Blue background */
        border: 2px solid #0055aa;
        border-radius: 8px;
        padding: 2px;
        width: 90%;
        max-width: 480px;
        display: flex;
        flex-direction: column;
        box-shadow: 0 10px 25px rgba(0,0,0,0.8);
    }
    .offline-header {
        text-align: center;
        padding: 12px;
        font-family: monospace;
        font-weight: bold;
        font-size: 1.2rem;
        color: #00ffff; /* Light blue / cyan */
        text-shadow: 0 2px 4px rgba(0,0,0,0.5);
    }
    .offline-content {
        background: #000;
        color: #fff;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-height: 100px;
    }
    .offline-time-row {
        text-align: center;
        color: #fff;
        font-size: 1.1rem;
        margin-bottom: 8px;
    }
    .offline-reward-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 1.1rem;
        justify-content: center;
    }
    .offline-reward-icon {
        width: 24px;
        height: 24px;
    }
    .reward-gears { color: #a3a3a3; }
    .reward-coins { color: #ffd700; }
    .reward-xp { color: #6688ff; }
    .reward-mp { color: #ffaa00; }
    .reward-gold { color: #ffd700; }
    .reward-magic { color: #c68cff; }

    .offline-actions {
        padding: 12px;
        display: flex;
        justify-content: center;
    }
    .offline-close-btn {
        background: #cc3333;
        color: #fff;
        border: 2px solid #aa2222;
        border-radius: 4px;
        font-family: monospace;
        font-size: 1.2rem;
        padding: 12px 32px;
        cursor: pointer;
    }
    .offline-close-btn:active {
        transform: translateY(2px);
    }
    @media (max-width: 600px) {
        .offline-header { font-size: 1rem; }
        .offline-time-row { font-size: 0.95rem; }
        .offline-reward-row { font-size: 0.95rem; }
        .offline-close-btn { font-size: 1rem; padding: 10px 24px; }
    }
    `;
    document.head.appendChild(style);
    styleInjected = true;
}

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
    injectStyles();
    
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
    
    // Threshold: 60 seconds? Or maybe even 10s is enough to demo.
    // Let's use 60s as a reasonable "offline" check.
    // Actually, user said "few minutes" but didn't specify min threshold.
    // To be safe and testable, let's say 10 seconds.
    if (lastSave <= 0) return;
    
    const diff = now - lastSave;
    if (diff < 10000) return; // Ignore gaps < 10s
    
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
