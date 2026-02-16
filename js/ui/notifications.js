import { NODE_MAP } from '../game/labNodes.js';
import { playAudio } from '../util/audioManager.js';
import { isViewingLabTab } from './merchantTabs/dlgTab.js';

let container = null;

function ensureContainer() {
    if (container) return container;
    container = document.createElement('div');
    container.className = 'notification-container';
    document.body.appendChild(container);
    return container;
}

export function showNotification(text, iconSrc, duration = 4000) {
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
    
    // Animate in
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            el.classList.add('is-visible');
        });
    });
    
    playAudio('sounds/notif_ding.ogg', { volume: 0.5 });
    
    // Schedule removal
    setTimeout(() => {
        el.classList.remove('is-visible');
        el.classList.add('is-leaving');
        
        const remove = () => {
            el.remove();
        };
        
        el.addEventListener('transitionend', remove, { once: true });
        
        // Safety cleanup
        setTimeout(() => {
            if (el.isConnected) el.remove();
        }, 600);
    }, duration);
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