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
    
    const statsData = [];

    statsData.push({
        id: 'playtime',
        label: 'Active playtime:',
        value: formatTimeCompact((window.activePlaytime || 0) * 1000)
    });

    statsData.push({
        id: 'coins',
        label: 'Coins collected:',
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
            statsData.push({
                id: `reset-${resetName}`,
                label: `${resetName} resets performed:`,
                value: formatNumber(val)
            });
        }
    }

    const currentIds = new Set(statsData.map(s => s.id));
    
    Array.from(container.children).forEach(child => {
        const id = child.getAttribute('data-stat-id');
        if (!currentIds.has(id)) {
            child.remove();
        }
    });

    for (const stat of statsData) {
        let row = container.querySelector(`[data-stat-id="${stat.id}"]`);
        if (!row) {
            row = document.createElement('div');
            row.setAttribute('data-stat-id', stat.id);
            
            const labelSpan = document.createElement('span');
            labelSpan.className = 'misc-stat-label';
            labelSpan.textContent = stat.label + ' ';
            
            const valueSpan = document.createElement('span');
            valueSpan.className = 'misc-stat-value';
            
            row.appendChild(labelSpan);
            row.appendChild(valueSpan);
            container.appendChild(row);
        }
        
        const valueSpan = row.querySelector('.misc-stat-value');
        if (valueSpan) {
            setHtmlOrText(valueSpan, stat.value);
        }
    }
}
