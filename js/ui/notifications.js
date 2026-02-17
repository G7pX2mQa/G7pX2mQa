import { NODE_MAP } from '../game/labNodes.js';
import { playAudio } from '../util/audioManager.js';
import { isViewingLabTab } from './merchantTabs/dlgTab.js';

let container = null;
const queue = [];
let isProcessing = false;
let isPaused = true;

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
        
        playAudio('sounds/notif_ding.ogg', { volume: 0.5 });
        
        // Animate in
        // Use double RAF to ensure transition triggers
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                el.classList.add('is-visible');
            });
        });
        
        // Wait for duration
        setTimeout(() => {
            el.classList.remove('is-visible');
            el.classList.add('is-leaving');
            
            const cleanup = () => {
                el.remove();
                resolve();
            };
            
            el.addEventListener('transitionend', cleanup, { once: true });
            
            // Safety timeout in case transitionend doesn't fire
            setTimeout(() => {
                if (el.isConnected) {
                    el.remove();
                    resolve();
                }
            }, 600);
        }, duration);
    });
}

export function showNotification(text, iconSrc, duration = 6767) {
    queue.push({ text, iconSrc, duration });
    processQueue();
}

export function initNotifications() {
    if (typeof window === 'undefined') return;
    
    window.addEventListener('lab:node:change', (e) => {
        const { id, level } = e.detail || {};
        if (!id || level == null) return;
        
        const node = NODE_MAP.get(id);
        if (!node) return;
        
        // Check max level
        const maxLevel = node.maxLevel;
        if (level < maxLevel) return;
        
        // Check if viewing lab
        if (isViewingLabTab()) return;
        
        // Show notification
        const title = node.title || 'Node';
        showNotification(`${title}<br>Maxed!`, 'img/' + node.icon);
    });
}
