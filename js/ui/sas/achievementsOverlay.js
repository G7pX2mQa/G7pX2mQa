import { createSASOverlay } from './sasOverlayBuilder.js';
import { ACHIEVEMENTS, ACHIEVEMENT_STATES, getAchievementState, setAchievementState } from '../../game/achievements.js';
import { getActiveSlot } from '../../util/storage.js';
import { playAudio } from "../../util/audioManager.js";
import { playPurchaseSfx } from '../shopOverlay.js';

const MAXED_BASE_OVERLAY_SRC = 'img/misc/maxed.webp';

let currentGrid = null;
let currentActions = null;

function renderAchievements(gridEl) {
    if (!gridEl) return;
    gridEl.innerHTML = '';
    const slot = getActiveSlot();

    ACHIEVEMENTS.forEach(achievement => {
        const state = getAchievementState(achievement.id, slot);

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

        if (state === ACHIEVEMENT_STATES.CLAIMED) {
            const maxedOverlay = document.createElement('img');
            maxedOverlay.className = 'maxed-overlay';
            maxedOverlay.alt = '';
            maxedOverlay.src = MAXED_BASE_OVERLAY_SRC;
            tile.insertBefore(maxedOverlay, iconImg);
        }

        const badge = document.createElement('span');
        badge.className = 'level-badge text-badge';
        
        let appendBadge = true;

        if (state === ACHIEVEMENT_STATES.NOT_OWNED) {
            btn.classList.add('is-locked');
            iconImg.style.filter = 'brightness(0.05)';
            appendBadge = false;
            btn.title = '???';
        } else if (state === ACHIEVEMENT_STATES.PENDING_CLAIM) {
            btn.classList.add('is-pending');
            badge.textContent = 'Pending Claim';
            badge.classList.add('can-buy');
            btn.title = achievement.title;
        } else if (state === ACHIEVEMENT_STATES.CLAIMED) {
            btn.classList.add('is-claimed');
            badge.textContent = 'Claimed';
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
            if (state === ACHIEVEMENT_STATES.NOT_OWNED) return;
            openAchievementDetails(achievement);
        });

        btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (state === ACHIEVEMENT_STATES.PENDING_CLAIM) {
                setAchievementState(achievement.id, ACHIEVEMENT_STATES.CLAIMED, slot);
                playPurchaseSfx();
                renderAchievements(gridEl);
            }
        });
    });
}

function updateDelveButton(delveBtn) {
    const slot = getActiveSlot();
    const flagKey = `ccc:achievements:delveClicked:${slot}`;
    const isClicked = localStorage.getItem(flagKey) === '1';
    
    if (isClicked) {
        delveBtn.classList.remove('is-new');
    } else {
        delveBtn.classList.add('is-new');
    }
}

const achievementsOverlay = createSASOverlay({
    id: 'achievements-overlay',
    title: 'Achievements',
    containerClass: 'achievements-grid',
    zIndex: '4010',
    onRender: (overlayEl) => {
        const grid = overlayEl.querySelector('.achievements-grid');
        if (grid) {
            currentGrid = grid;
            renderAchievements(grid);
        }

        // Check if there is an actions container, or fallback to sas-actions
        let actionsContainer = overlayEl.querySelector('.achievements-actions');
        if (!actionsContainer) {
            actionsContainer = overlayEl.querySelector('.sas-actions');
        }

        if (actionsContainer && !actionsContainer.querySelector('.achievements-delve')) {
            const delveBtn = document.createElement('button');
            delveBtn.type = 'button';
            delveBtn.className = 'achievements-delve shop-delve';
            delveBtn.textContent = 'Delve';
            
            updateDelveButton(delveBtn);

            delveBtn.addEventListener('click', () => {
                const slot = getActiveSlot();
                localStorage.setItem(`ccc:achievements:delveClicked:${slot}`, '1');
                updateDelveButton(delveBtn);
            });

            actionsContainer.appendChild(delveBtn);
        }
    }
});

export function openAchievementsOverlay() {
    achievementsOverlay.open();
    if (currentGrid) {
        renderAchievements(currentGrid);
    }
}

export function closeAchievementsOverlay(force = false) {
    achievementsOverlay.close(force);
}

if (typeof window !== 'undefined') {
    window.addEventListener('achievements:updated', () => {
        if (achievementsOverlay.isOpen && currentGrid) {
            renderAchievements(currentGrid);
        }
    });
}

// Ensure the achievement details overlay code is also set up
// We'll define openAchievementDetails below

function ensureAchievementOverlay() {
    if (document.getElementById('achievement-details-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'achievement-details-overlay';
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
            closeAchievementDetails();
        }
    });
}

function openAchievementDetails(achievement) {
    ensureAchievementOverlay();
    const overlay = document.getElementById('achievement-details-overlay');
    const sheet = overlay.querySelector('.upg-sheet');
    const header = overlay.querySelector('.upg-header');
    const content = overlay.querySelector('.upg-content');
    const actions = overlay.querySelector('.upg-actions');
    
    const slot = getActiveSlot();
    const state = getAchievementState(achievement.id, slot);

    header.innerHTML = `
        <div class="upg-title">${achievement.title}</div>
        <div class="upg-level">${state === ACHIEVEMENT_STATES.CLAIMED ? '(Claimed)' : state === ACHIEVEMENT_STATES.PENDING_CLAIM ? '(Pending Claim)' : '(Not Owned)'}</div>
    `;

    let contentHtml = `
        <div class="upg-desc centered">${achievement.desc}</div>
        <div class="upg-info">
            <div class="effect-wrapper">
                <div class="upg-line"><span class="bonus-line">Reward: ${achievement.rewardText}</span></div>
            </div>
        </div>
    `;
    content.innerHTML = contentHtml;

    actions.innerHTML = `
        <button type="button" class="shop-close">Close</button>
    `;
    
    const closeBtn = actions.querySelector('.shop-close');
    closeBtn.addEventListener('click', closeAchievementDetails);

    if (state === ACHIEVEMENT_STATES.PENDING_CLAIM) {
        const claimBtn = document.createElement('button');
        claimBtn.type = 'button';
        claimBtn.className = 'shop-delve';
        claimBtn.textContent = 'Claim';
        claimBtn.addEventListener('click', () => {
            setAchievementState(achievement.id, ACHIEVEMENT_STATES.CLAIMED, slot);
            playPurchaseSfx();
            if (currentGrid) renderAchievements(currentGrid);
            // Also update the header level to '(Claimed)' so it visually reflects the change
            const headerLevel = overlay.querySelector('.upg-level');
            if (headerLevel) {
                headerLevel.textContent = '(Claimed)';
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

function closeAchievementDetails() {
    const overlay = document.getElementById('achievement-details-overlay');
    if (!overlay) return;
    const sheet = overlay.querySelector('.upg-sheet');
    sheet.style.transform = 'translateY(100%)';
    setTimeout(() => {
        overlay.classList.remove('is-open');
    }, 180);
}
