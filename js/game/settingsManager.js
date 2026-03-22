// js/game/settingsManager.js

import { getActiveSlot } from '../util/storage.js';

const SETTINGS_KEY_PREFIX = 'ccc_setting_';

// Define the available settings and their defaults
export const SETTING_DEFINITIONS = {
  placeholder_setting: {
    id: 'placeholder_setting',
    label: 'I do nothing! Placeholder here!',
    default: false,
  }
};

class SettingsManager {
  constructor() {
    this.settings = {};
    this.listeners = {};
    this.loadAll();

    if (typeof window !== 'undefined') {
      window.addEventListener('saveSlot:change', () => {
        this.loadAll();
      });
    }
  }

  _getKey(key) {
    const slot = getActiveSlot();
    if (slot != null) {
      return `${SETTINGS_KEY_PREFIX}${key}:${slot}`;
    }
    // Fallback if no slot is active (though we usually shouldn't hit this when in-game)
    return `${SETTINGS_KEY_PREFIX}${key}`;
  }

  loadAll() {
    for (const [key, def] of Object.entries(SETTING_DEFINITIONS)) {
      const storageKey = this._getKey(key);
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        this.settings[key] = stored === 'true';
      } else {
        this.settings[key] = def.default;
      }
      this.notify(key, this.settings[key]);
    }
  }

  get(key) {
    if (!(key in SETTING_DEFINITIONS)) return false;
    if (this.settings[key] === undefined) {
      this.settings[key] = SETTING_DEFINITIONS[key].default;
    }
    return this.settings[key];
  }

  set(key, value) {
    if (!(key in SETTING_DEFINITIONS)) return;
    this.settings[key] = value;
    const storageKey = this._getKey(key);
    localStorage.setItem(storageKey, value.toString());
    this.notify(key, value);
  }

  toggle(key) {
    const newVal = !this.get(key);
    this.set(key, newVal);
    return newVal;
  }

  subscribe(key, callback) {
    if (!this.listeners[key]) {
      this.listeners[key] = [];
    }
    this.listeners[key].push(callback);
    // Return unsubscribe function
    return () => {
      this.listeners[key] = this.listeners[key].filter(cb => cb !== callback);
    };
  }

  notify(key, value) {
    if (this.listeners[key]) {
      this.listeners[key].forEach(cb => cb(value));
    }
  }
}

export const settingsManager = new SettingsManager();