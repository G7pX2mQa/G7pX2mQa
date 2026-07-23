import { getActiveSlot } from '../../../util/storage.js';
import { formatNumber } from '../../../util/numFormat.js';
import { BigNum } from '../../../util/bigNum.js';
import { formatTimeCompact } from '../../../game/offlinePanel.js';
import { setHtmlOrText } from '../../../util/uiHelpers.js';

export function initMiscStatsTab(panel) {
    if (!panel || panel.__msInit) return;
    panel.__msInit = true;
    panel.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; box-sizing: border-box; user-select: text; -webkit-user-select: text;">
            <div class="misc-stats-container" style="display: flex; flex-direction: column; width: 90%; max-width: 550px; font-size: clamp(0.67em, 4vw, 1.1em); color: #fff; border: 2px dashed rgba(255, 255, 255, 0.4); padding: 12px 20px; border-radius: 8px; box-sizing: border-box; background: rgba(0, 0, 0, 0.2);">
                <!-- content will be built here -->
            </div>
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
    
    const statsData = [];

    statsData.push({
        label: 'Active playtime',
        value: formatTimeCompact((window.activePlaytime || 0) * 1000)
    });

    statsData.push({
        label: 'Coins collected',
        value: formatNumber(BigNum.fromAny(window.coinsCollected || 0))
    });

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
            const capitalizedResetName = resetName.charAt(0).toUpperCase() + resetName.slice(1);
            statsData.push({
                label: `${capitalizedResetName} resets performed`,
                value: formatNumber(val)
            });
        }
    }

    let html = '';
    for (let i = 0; i < statsData.length; i++) {
        const stat = statsData[i];
        const isLast = i === statsData.length - 1;
        
        const rowStyle = `display: flex; justify-content: space-between; align-items: center; padding: 10px 4px; ${!isLast ? 'border-bottom: 1px dashed rgba(255, 255, 255, 0.3);' : ''}`;
        
        html += `<div style="${rowStyle}">
            <span style="opacity: 0.9;">${stat.label}</span>
            <span style="font-weight: 500;">${stat.value}</span>
        </div>`;
    }

    if (container.dataset.lastHtml !== html) {
        container.dataset.lastHtml = html;
        container.innerHTML = html;
    }
}
