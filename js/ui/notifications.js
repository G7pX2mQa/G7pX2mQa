import { NODE_MAP } from '../game/labNodes.js';
import { playAudio } from '../util/audioManager.js';
import { isViewingLabTab } from './merchantTabs/dlgTab.js';
import { IS_MOBILE } from '../util/platformChecker.js';
import { getActiveSlot } from '../util/storage.js';

let container = null;
const queue = [];
let isProcessing = false;
let isPaused = true;

const activeNotifications = new Set();
const activeWelcomePopups = new Set();
const MIN_PLAYABLE_LANDSCAPE_HEIGHT = 500;
let landscapeWarningTracker = null;
let landscapeWarningShownForSession = false;

export function nukeNotifications(clearAll = true) {
    if (clearAll) {
        queue.length = 0;
    }
    
    for (const notif of activeNotifications) {
        if (notif.audio && typeof notif.audio.stop === 'function') {
            notif.audio.stop();
        }
        if (notif.element) {
            notif.element.remove();
        }
        if (typeof notif.resolve === 'function') {
            notif.resolve();
        }
        if (notif.timeoutId) clearTimeout(notif.timeoutId);
        if (notif.fallbackTimeoutId) clearTimeout(notif.fallbackTimeoutId);
    }
    activeNotifications.clear();

    for (const popup of activeWelcomePopups) {
        if (popup.audio && typeof popup.audio.stop === 'function') {
            popup.audio.stop();
        }
        if (popup.element) {
            popup.element.remove();
        }
        if (popup.timeoutId) clearTimeout(popup.timeoutId);
        if (popup.fallbackTimeoutId) clearTimeout(popup.fallbackTimeoutId);
    }
    activeWelcomePopups.clear();

    if (landscapeWarningTracker) {
        if (landscapeWarningTracker.audio && typeof landscapeWarningTracker.audio.stop === 'function') {
            landscapeWarningTracker.audio.stop();
        }
        if (landscapeWarningTracker.element) {
            landscapeWarningTracker.element.remove();
        }
        if (landscapeWarningTracker.timeoutId) clearTimeout(landscapeWarningTracker.timeoutId);
        if (landscapeWarningTracker.fallbackTimeoutId) clearTimeout(landscapeWarningTracker.fallbackTimeoutId);
        landscapeWarningTracker = null;
    }

    if (clearAll && container) {
        container.innerHTML = '';
    }

}

function ensureContainer() {
    if (container) return container;
    container = document.createElement('div');
    container.className = 'notification-container';
    document.body.appendChild(container);
    return container;
}

export function unpauseNotifications() {
    isPaused = false;
    processQueue();
}

async function processQueue() {
    if (isProcessing || isPaused || queue.length === 0) return;
    isProcessing = true;

    const { text, iconSrc, duration } = queue.shift();
    
    await displayNotification(text, iconSrc, duration);
    
    isProcessing = false;
    // Process next item if any
    if (queue.length > 0) {
        processQueue();
    }
}

function displayNotification(text, iconSrc, duration) {
    return new Promise((resolve) => {
        const parent = ensureContainer();
        
        const el = document.createElement('div');
        el.className = 'notification';
        
        if (iconSrc) {
            const icon = document.createElement('img');
            icon.src = iconSrc;
            icon.className = 'notification-icon';
            icon.alt = '';
            el.appendChild(icon);
        }
        
        const content = document.createElement('div');
        content.className = 'notification-text';
        content.innerHTML = text; 
        el.appendChild(content);
        
        parent.appendChild(el);
        
        const audio = playAudio('sounds/notif_ding.ogg', { volume: 0.5 });
        
        const notifTracker = {
            element: el,
            audio,
            resolve: null,
            timeoutId: null,
            fallbackTimeoutId: null
        };
        activeNotifications.add(notifTracker);
        
        const wrappedResolve = () => {
            activeNotifications.delete(notifTracker);
            resolve();
        };
        notifTracker.resolve = wrappedResolve;
        
        // Animate in
        // Use double RAF to ensure transition triggers
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                el.classList.add('is-visible');
            });
        });
        
        // Wait for duration
        notifTracker.timeoutId = setTimeout(() => {
            el.classList.remove('is-visible');
            el.classList.add('is-leaving');
            
            const cleanup = () => {
                el.remove();
                wrappedResolve();
            };
            
            el.addEventListener('transitionend', cleanup, { once: true });
            
            // Safety timeout in case transitionend doesn't fire
            notifTracker.fallbackTimeoutId = setTimeout(() => {
                if (el.isConnected) {
                    el.remove();
                    wrappedResolve();
                }
            }, 600);
        }, duration);
    });
}

export function showNotification(text, iconSrc, duration = 5000) {
    queue.push({ text, iconSrc, duration });
    processQueue();
}

export function initNotifications() {
    if (typeof window === 'undefined') return;
    
    if (IS_MOBILE) {
        const checkOrientation = () => {
            if (getActiveSlot() == null) {
                hideLandscapeWarningPopup();
                landscapeWarningShownForSession = false;
                return;
            }
            if (window.innerWidth > window.innerHeight && window.innerHeight < MIN_PLAYABLE_LANDSCAPE_HEIGHT) {
                if (!landscapeWarningShownForSession) {
                    showLandscapeWarningPopup();
                    landscapeWarningShownForSession = true;
                }
            } else {
                hideLandscapeWarningPopup();
                landscapeWarningShownForSession = false;
            }
        };
        window.addEventListener('resize', checkOrientation);
        window.addEventListener('orientationchange', checkOrientation);
        // Initial check deferred slightly to ensure layout is ready
        setTimeout(checkOrientation, 500);
    }
    
    window.addEventListener('lab:node:change', (e) => {
        const { id, level, suppressNotify } = e.detail || {};
        if (!id || level == null || suppressNotify) return;
        
        const node = NODE_MAP.get(id);
        if (!node) return;
        
        // Check max level
        const maxLevel = node.maxLevel;
        if (level < maxLevel) return;
        
        // Check if viewing lab
        if (isViewingLabTab()) return;
        
        // Show notification
        const title = node.title || 'Node';
        showNotification(`${title}<br>Maxed!`, node.icon);
    });
}

export function showWelcomePopup(isMobile) {
    const parent = document.createElement('div');
    parent.className = 'welcome-popup-container';
    
    const el = document.createElement('div');
    el.className = 'welcome-popup notification-text';
    
    const action = isMobile ? 'swiping your finger' : 'hovering your cursor';
    el.innerHTML = `Welcome to the game! Collect the Coins by ${action} over them.`;
    
    parent.appendChild(el);
    document.body.appendChild(parent);
    
    const audio = playAudio('sounds/notif_ding.ogg', { volume: 0.5 });
    
    const popupTracker = {
        element: parent,
        audio,
        timeoutId: null,
        fallbackTimeoutId: null
    };
    activeWelcomePopups.add(popupTracker);
    
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            el.classList.add('is-visible');
        });
    });
    
    popupTracker.timeoutId = setTimeout(() => {
        el.classList.remove('is-visible');
        el.classList.add('is-leaving');
        
        const cleanup = () => {
            parent.remove();
            activeWelcomePopups.delete(popupTracker);
        };
        
        el.addEventListener('transitionend', cleanup, { once: true });
        
        popupTracker.fallbackTimeoutId = setTimeout(() => {
            if (parent.isConnected) {
                parent.remove();
            }
            activeWelcomePopups.delete(popupTracker);
        }, 1200);
    }, 9000); // 1s enter + 8s wait = 9000ms
}

export function showLandscapeWarningPopup() {
    if (landscapeWarningTracker) return;
    
    const parent = document.createElement('div');
    parent.className = 'welcome-popup-container';
    
    const el = document.createElement('div');
    el.className = 'welcome-popup notification-text';
    
    el.innerHTML = `This game is intended to be played in Portrait mode. Landscape mode may be unplayable.`;
    
    parent.appendChild(el);
    document.body.appendChild(parent);
    
    const audio = playAudio('sounds/notif_ding.ogg', { volume: 0.5 });
    
    landscapeWarningTracker = {
        element: parent,
        el,
        audio,
        timeoutId: null,
        fallbackTimeoutId: null
    };
    
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            el.classList.add('is-visible');
        });
    });
    
    landscapeWarningTracker.timeoutId = setTimeout(() => {
        hideLandscapeWarningPopup();
    }, 18000); // 18000ms
}

export function hideLandscapeWarningPopup() {
    if (!landscapeWarningTracker) return;
    
    const tracker = landscapeWarningTracker;
    landscapeWarningTracker = null;
    
    const { element: parent, el, timeoutId, fallbackTimeoutId } = tracker;
    
    if (timeoutId) clearTimeout(timeoutId);
    if (fallbackTimeoutId) clearTimeout(fallbackTimeoutId);
    
    el.classList.remove('is-visible');
    el.classList.add('is-leaving');
    
    const cleanup = () => {
        if (parent.isConnected) {
            parent.remove();
        }
    };
    
    el.addEventListener('transitionend', cleanup, { once: true });
    
    tracker.fallbackTimeoutId = setTimeout(() => {
        if (parent.isConnected) {
            parent.remove();
        }
    }, 1200);
}

export function triggerInitialLandscapeCheck() {
    if (!IS_MOBILE) return;
    if (getActiveSlot() == null) return;
    landscapeWarningShownForSession = false;
    if (window.innerWidth > window.innerHeight && window.innerHeight < MIN_PLAYABLE_LANDSCAPE_HEIGHT) {
        showLandscapeWarningPopup();
        landscapeWarningShownForSession = true;
    }
}
