// js/game/settingsManager.js

import { getActiveSlot } from '../util/storage.js';

const SETTINGS_KEY_PREFIX = 'ccc_setting_';

// Define the available settings and their defaults
export const SETTING_DEFINITIONS = {
  music_volume: {
    id: 'music_volume',
    type: 'slider',
    label: 'Music volume',
    hasExtraInfo: false,
    min: 0,
    max: 100,
    step: 1,
    default: 100,
    unlockCondition: () => true,
  },
  placeholder_setting: {
    id: 'placeholder_setting',
    type: 'toggle',
    label: 'I do nothing! Placeholder here!',
    hasExtraInfo: true,
    info: 'This is a placeholder setting and it does not do anything. This setting will be deleted in a future task.',
    default: false,
  },
  placeholder_slider: {
    id: 'placeholder_slider',
    type: 'slider',
    label: 'Placeholder slider',
    hasExtraInfo: false,
    min: 0,
    max: 10,
    step: 1,
    default: 500,
  },
  placeholder_dropdown: {
    id: 'placeholder_dropdown',
    type: 'dropdown',
    label: 'Placeholder dropdown',
    hasExtraInfo: false,
    options: ['Option 1', 'Option 2', 'Option 3'],
    default: 'Option 1',
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
        this.settings[key] = JSON.parse(stored);
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
    localStorage.setItem(storageKey, JSON.stringify(value));
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
