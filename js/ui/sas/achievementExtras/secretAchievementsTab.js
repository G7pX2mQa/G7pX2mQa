import { SECRET_ACHIEVEMENTS, SECRET_ACHIEVEMENT_STATES, getSecretAchievementState, setSecretAchievementState, getLifetimeSizeCoinsCollected } from '../../../game/secretAchievements.js';
import { bank, getActiveSlot } from '../../../util/storage.js';
import { playPurchaseSfx } from '../../shopOverlay.js';
import { formatNumber } from '../../../util/numFormat.js';

let currentGrid = null;

const MAXED_BASE_OVERLAY_SRC = 'img/misc/maxed.webp';

function renderSecretAchievements(gridEl) {
    gridEl.innerHTML = '';
    const slot = getActiveSlot();

    let achievedCount = 0;
    const totalCount = SECRET_ACHIEVEMENTS.length;

    SECRET_ACHIEVEMENTS.forEach(achievement => {
        const state = getSecretAchievementState(achievement.id, slot);
        if (state === SECRET_ACHIEVEMENT_STATES.ACHIEVED) {
            achievedCount++;
        }

        const btn = document.createElement('button');
        btn.className = 'achievement-btn';
        btn.type = 'button';
        btn.dataset.id = achievement.id;

        const tile = document.createElement('div');
        tile.className = 'shop-tile';

        const iconImg = document.createElement('img');
        iconImg.className = 'icon';
        iconImg.alt = '';
        iconImg.src = achievement.icon;

        tile.appendChild(iconImg);

        if (state === SECRET_ACHIEVEMENT_STATES.ACHIEVED) {
            const maxedOverlay = document.createElement('img');
            maxedOverlay.className = 'maxed-overlay';
            maxedOverlay.alt = '';
            maxedOverlay.src = MAXED_BASE_OVERLAY_SRC;
            tile.insertBefore(maxedOverlay, iconImg);
        }

        const badge = document.createElement('span');
        badge.className = 'level-badge text-badge';
        
        let appendBadge = true;

        if (state === SECRET_ACHIEVEMENT_STATES.NOT_OWNED) {
            btn.classList.add('is-locked');
            iconImg.style.filter = 'brightness(0.05)';
            appendBadge = false;
            btn.title = '???';
        } else if (state === SECRET_ACHIEVEMENT_STATES.PENDING_CLAIM) {
            btn.classList.add('is-pending');
            badge.textContent = 'Pending Claim';
            badge.classList.add('can-buy');
            btn.title = achievement.title;
        } else if (state === SECRET_ACHIEVEMENT_STATES.ACHIEVED) {
            btn.classList.add('is-claimed');
            badge.textContent = 'Achieved';
            badge.classList.add('is-maxed');
            btn.title = achievement.title;
        }

        if (appendBadge) {
            tile.appendChild(badge);
        }
        btn.appendChild(tile);
        gridEl.appendChild(btn);

        btn.addEventListener('click', (e) => {
            if (e.shiftKey || e.ctrlKey) return;
            if (state === SECRET_ACHIEVEMENT_STATES.NOT_OWNED) return;
            openSecretAchievementDetails(achievement);
        });

        btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (state === SECRET_ACHIEVEMENT_STATES.PENDING_CLAIM) {
                if (achievement.rewardAmount && bank.voidGems) {
                    bank.voidGems.add(achievement.rewardAmount);
                }
                setSecretAchievementState(achievement.id, SECRET_ACHIEVEMENT_STATES.ACHIEVED, slot);
                playPurchaseSfx();
                renderSecretAchievements(gridEl);
                updateProgressRow(gridEl);
            }
        });
    });
}

function updateProgressRow(gridEl) {
    const overlayEl = gridEl.closest('#ae-panel-secret');
    if (!overlayEl) return;
    const progressRow = overlayEl.querySelector('.achievements-progress-row');
    if (!progressRow) return;

    const slot = getActiveSlot();
    let achievedCount = 0;
    const totalCount = SECRET_ACHIEVEMENTS.length;
    SECRET_ACHIEVEMENTS.forEach(achievement => {
        const state = getSecretAchievementState(achievement.id, slot);
        if (state === SECRET_ACHIEVEMENT_STATES.ACHIEVED) {
            achievedCount++;
        }
    });

    progressRow.innerHTML = `<span class="stats-label">Secret Achievements:</span> <span class="stats-val">${achievedCount}/${totalCount}</span>`;
    if (achievedCount === totalCount && totalCount > 0) {
        progressRow.style.color = '#02e815';
    } else {
        progressRow.style.color = '#fff';
    }
}

export function initSecretAchievementsTab(panel) {
    if (!panel || panel.__saInit) return;
    panel.__saInit = true;

    panel.innerHTML = `
        <div class="achievements-progress-row" style="margin: 10px 0; text-align: center; font-size: 1.1em;"></div>
        <div class="achievements-grid"></div>
    `;

    const grid = panel.querySelector('.achievements-grid');
    currentGrid = grid;
    
    renderSecretAchievements(grid);
    updateProgressRow(grid);
}

export function updateSecretAchievementsTab() {
    if (currentGrid) {
        renderSecretAchievements(currentGrid);
        updateProgressRow(currentGrid);
    }
}

function ensureSecretAchievementOverlay() {
    if (document.getElementById('secret-achievement-details-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'secret-achievement-details-overlay';
    overlay.className = 'upg-overlay';
    
    const sheet = document.createElement('div');
    sheet.className = 'upg-sheet';
    
    const grabber = document.createElement('div');
    grabber.className = 'upg-grabber';
    grabber.innerHTML = `<div class="grab-handle"></div>`;
    
    const header = document.createElement('header');
    header.className = 'upg-header';
    
    const content = document.createElement('div');
    content.className = 'upg-content';
    
    const actions = document.createElement('div');
    actions.className = 'upg-actions';
    
    sheet.append(grabber, header, content, actions);
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    
    overlay.addEventListener('pointerdown', (e) => {
        if (e.target === overlay) {
            closeSecretAchievementDetails();
        }
    });
}

function openSecretAchievementDetails(achievement) {
    ensureSecretAchievementOverlay();
    const overlay = document.getElementById('secret-achievement-details-overlay');
    const sheet = overlay.querySelector('.upg-sheet');
    const header = overlay.querySelector('.upg-header');
    const content = overlay.querySelector('.upg-content');
    const actions = overlay.querySelector('.upg-actions');
    
    const slot = getActiveSlot();
    const state = getSecretAchievementState(achievement.id, slot);

    header.innerHTML = `
        <div class="upg-title">${achievement.title}</div>
        <div class="upg-level">${state === SECRET_ACHIEVEMENT_STATES.ACHIEVED ? 'Achieved' : state === SECRET_ACHIEVEMENT_STATES.PENDING_CLAIM ? 'Pending Claim' : 'Not Owned'}</div>
    `;

    // Process desc
    let desc = achievement.desc;
    if (desc.includes('{formatNumber}')) {
        desc = desc.replace('{formatNumber}1000000', formatNumber(1000000));
        desc = desc.replace('{formatNumber}100000', formatNumber(100000));
        desc = desc.replace('{formatNumber}10000', formatNumber(10000));
    }

    let lifetimeCountStr = '';
    if (achievement.trackedSize) {
        const lifetimeCount = getLifetimeSizeCoinsCollected(achievement.trackedSize, slot);
        lifetimeCountStr = `<div class="upg-line" style="margin-top: 8px; color: #aaa;">Total size ${achievement.trackedSize} Coins collected: ${lifetimeCount}</div>`;
    }

    let contentHtml = `
        <div class="upg-desc centered">${desc}${lifetimeCountStr}</div>
        <div class="upg-info">
            <div class="effect-wrapper">
                <div class="upg-line"><span class="bonus-line">Reward: <img src="img/currencies/void_gem.webp" class="currency-ico"> ${achievement.rewardAmount} Void Gem</span></div>
            </div>
        </div>
    `;
    content.innerHTML = contentHtml;

    actions.innerHTML = `
        <button type="button" class="shop-close">Close</button>
    `;
    
    const closeBtn = actions.querySelector('.shop-close');
    closeBtn.addEventListener('click', closeSecretAchievementDetails);

    if (state === SECRET_ACHIEVEMENT_STATES.PENDING_CLAIM) {
        const claimBtn = document.createElement('button');
        claimBtn.type = 'button';
        claimBtn.className = 'shop-delve';
        claimBtn.textContent = 'Claim';
        claimBtn.addEventListener('click', () => {
            if (achievement.rewardAmount && bank.voidGems) {
                bank.voidGems.add(achievement.rewardAmount);
            }
            setSecretAchievementState(achievement.id, SECRET_ACHIEVEMENT_STATES.ACHIEVED, slot);
            playPurchaseSfx();
            if (currentGrid) {
                renderSecretAchievements(currentGrid);
                updateProgressRow(currentGrid);
            }
            // Also update the header level to 'Achieved' so it visually reflects the change
            const headerLevel = overlay.querySelector('.upg-level');
            if (headerLevel) {
                headerLevel.textContent = 'Achieved';
            }
            // Remove the claim button from the DOM since it's now claimed
            claimBtn.remove();
        });
        actions.appendChild(claimBtn);
    }

    overlay.classList.add('is-open');
    sheet.style.transform = 'translateY(100%)';
    void sheet.offsetHeight;
    sheet.style.transform = 'translateY(0)';
}

function closeSecretAchievementDetails() {
    const overlay = document.getElementById('secret-achievement-details-overlay');
    if (!overlay) return;
    const sheet = overlay.querySelector('.upg-sheet');
    sheet.style.transform = 'translateY(100%)';
    setTimeout(() => {
        overlay.classList.remove('is-open');
    }, 180);
}

if (typeof window !== 'undefined') {
    window.addEventListener('secretAchievements:updated', () => {
        if (currentGrid) {
            renderSecretAchievements(currentGrid);
            updateProgressRow(currentGrid);
        }
    });
}
