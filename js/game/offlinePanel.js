
import { getLastSaveTime } from '../util/storage.js';
import { getGearsProductionRate } from '../ui/merchantTabs/workshopTab.js';
import { hasDoneInfuseReset } from '../ui/merchantTabs/resetTab.js';
import { pauseGameLoop, resumeGameLoop } from './gameLoop.js';
import { bank } from '../util/storage.js';
import { BigNum } from '../util/bigNum.js';
import { formatNumber } from '../util/numFormat.js';
import { ensureCustomScrollbar } from '../ui/shopOverlay.js';
import { IS_MOBILE } from '../main.js';

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
    const overlay = document.createElement('div');
    overlay.className = 'offline-overlay';
    
    const panel = document.createElement('div');
    panel.className = 'offline-panel';
    
    const header = document.createElement('div');
    header.className = 'offline-header';
    header.textContent = 'Offline Progress';
    
    const subHeader = document.createElement('div');
    subHeader.className = 'offline-subheader';
    subHeader.textContent = `You were gone for ${formatTimeCompact(offlineMs)}`;

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'offline-content-wrapper';
    
    const list = document.createElement('div');
    list.className = 'offline-list';
    
    if (rewards.gears && !rewards.gears.isZero()) {
        const row = document.createElement('div');
        row.className = 'offline-row';
        
        // Format: + <icon> <amount>
        const plus = document.createElement('span');
        plus.textContent = '+ ';
        
        const icon = document.createElement('img');
        icon.className = 'offline-icon';
        icon.src = 'img/currencies/gear/gear.webp';
        icon.alt = '';
        
        const text = document.createElement('span');
        text.className = 'offline-text';
        text.innerHTML = formatNumber(rewards.gears);
        
        row.appendChild(plus);
        row.appendChild(icon);
        row.appendChild(text);
        list.appendChild(row);
    }
    
    contentWrapper.appendChild(list);
    
    const actions = document.createElement('div');
    actions.className = 'offline-actions';
    
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'offline-close-btn'; // Updated class in CSS
    closeBtn.textContent = 'Close';
    
    const closePanel = () => {
        overlay.remove();
        resumeGameLoop();
    };

    closeBtn.addEventListener('click', closePanel);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePanel();
    });

    // Global 'Escape' handler (in globalOverlayEsc.js) will handle keydown
    
    actions.appendChild(closeBtn);
    
    panel.appendChild(header);
    panel.appendChild(subHeader);
    panel.appendChild(contentWrapper);
    panel.appendChild(actions);
    
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    
    // Initialize custom scrollbar if needed
    requestAnimationFrame(() => {
        ensureCustomScrollbar(panel, panel, '.offline-content-wrapper');
    });
    
    return overlay;
}

export function processOfflineProgress() {
    const lastSave = getLastSaveTime();
    const now = Date.now();
    
    const resumeIfApplicable = () => {
        resumeGameLoop();
    };
    
    if (lastSave <= 0) {
        resumeIfApplicable();
        return;
    }
    
    const diff = now - lastSave;
    if (diff < 1000) {
        resumeIfApplicable();
        return; // Ignore gaps < 1s
    }
    
    if (!hasDoneInfuseReset()) {
        resumeIfApplicable();
        return;
    }

    const seconds = diff / 1000;
    
    // Calculate Rewards
    const gearRate = getGearsProductionRate ? getGearsProductionRate() : BigNum.fromInt(0);
    const gearsEarned = gearRate.mulDecimal(String(seconds)).floorToInteger();
    
    const rewards = {};
    let hasRewards = false;
    
    if (!gearsEarned.isZero()) {
        rewards.gears = gearsEarned;
        hasRewards = true;
        
        // Award immediately
        if (bank.gears) bank.gears.add(rewards.gears);
    }
    
    if (hasRewards) {
        // Singleton: Remove existing panel if any
        const existing = document.querySelector('.offline-overlay');
        if (existing) {
            existing.remove();
        }

        pauseGameLoop();
        createOfflinePanel(rewards, diff);
    } else {
        resumeIfApplicable();
    }
}

export function initOfflineTracker() {
    if (initialized) return;
    initialized = true;
    
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            pauseGameLoop();
        } else {
            processOfflineProgress();
        }
    });
}
