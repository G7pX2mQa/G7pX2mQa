import { getActiveSlot } from '../../../util/storage.js';
import { formatNumber } from '../../../util/numFormat.js';
import { BigNum } from '../../../util/bigNum.js';
import { formatTimeCompact } from '../../../game/offlinePanel.js';
import { setHtmlOrText } from '../../../util/uiHelpers.js';

export function initMiscStatsTab(panel) {
    if (!panel || panel.__msInit) return;
    panel.__msInit = true;
    panel.innerHTML = `
        <div class="misc-stats-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; gap: 12px; font-size: 1.1em; color: #fff; user-select: text; -webkit-user-select: text;">
            <!-- content will be built here -->
        </div>
    `;

    setInterval(() => {
        const overlay = document.getElementById('achievement-extras-overlay');
        if (!overlay || !overlay.classList.contains('is-open')) return;
        
        const currentPanel = document.getElementById('ae-panel-misc');
        if (!currentPanel || !currentPanel.classList.contains('is-active')) return;
        
        updateMiscStatsTab();
    }, 200);
}

export function updateMiscStatsTab() {
    const panel = document.getElementById('ae-panel-misc');
    if (!panel) return;
    const container = panel.querySelector('.misc-stats-container');
    if (!container) return;

    const slot = getActiveSlot();
    
    let html = `<div>Active playtime: ${formatTimeCompact((window.activePlaytime || 0) * 1000)}</div>`;
    
    const formattedCoins = formatNumber(BigNum.fromAny(window.coinsCollected || 0));
    html += `<div>Coins collected: ${formattedCoins}</div>`;

    let list = [];
    try {
        const listRaw = localStorage.getItem(`ccc:stats:performedResets:${slot}`);
        if (listRaw) list = JSON.parse(listRaw);
    } catch {}

    const getStat = (name) => {
        try {
            const val = localStorage.getItem(`ccc:stats:${name}Resets:${slot}`);
            if (val) return BigNum.fromAny(val);
        } catch {}
        return BigNum.fromInt(0);
    };

    for (const resetName of list) {
        const val = getStat(resetName);
        if (val.cmp(0) > 0) {
            html += `<div>${resetName} resets performed: ${formatNumber(val)}</div>`;
        }
    }

    setHtmlOrText(container, html);
}
