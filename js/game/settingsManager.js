// js/game/settingsManager.js

import { getActiveSlot } from '../util/storage.js';
import { getHighestMutationLevel } from './mutationSystem.js';

const SETTINGS_KEY_PREFIX = 'ccc_setting_';

export const MUTATION_NAMES = [
  'Normal', 'Bronze', 'Silver', 'Gold', 'Sapphire', 'Emerald', 'Ruby', 'Amethyst',
  'Sunset', 'Void', 'Ethereal', 'Earth', 'Air', 'Fire', 'Water', 'Cookie',
  'Pancake', 'Watermelon', 'Pepperoni', 'Pizza', 'Donut', 'Glass',
  'Diamond', 'Opal', 'Cosmic', 'Prismatic'
];

// Define the available settings and their defaults
export const SETTING_DEFINITIONS = {
  hide_maxed_upgrades: {
    id: 'hide_maxed_upgrades',
    type: 'toggle',
    label: 'Hide Maxed Upgrades',
    hasExtraInfo: false,
    default: false,
    unlockCondition: () => true,
  },
  offline_progress: {
    id: 'offline_progress',
    type: 'toggle',
    label: 'Offline Progress',
    hasExtraInfo: false,
    default: true,
    unlockCondition: () => true,
  },
  user_interface: {
    id: 'user_interface',
    type: 'toggle',
    label: 'User Interface',
    hasExtraInfo: false,
    default: true,
    unlockCondition: () => true,
  },
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
  },
  coin_mutation_visual: {
    id: 'coin_mutation_visual',
    type: 'dropdown',
    label: 'Coin Mutation',
    overlay: 'visuals',
    hasExtraInfo: false,
    default: 'Default',
    getOptions: () => {
      let highest = 0;
      try {
        const hLevel = getHighestMutationLevel();
        if (hLevel && typeof hLevel.toPlainIntegerString === 'function') {
          const s = hLevel.toPlainIntegerString();
          if (s !== 'Infinity') highest = parseInt(s, 10);
        }
      } catch (e) {}
      
      const opts = [];
      opts.push({ value: 'Default', label: 'Default' });
      opts.push({ value: 'Random', label: 'Random' });
      for (let i = 0; i <= Math.min(highest, 25); i++) {
        const name = MUTATION_NAMES[i] || `Mutation ${i}`;
        const iconSrc = i === 0 ? 'img/currencies/coin/coin.webp' : `img/mutations/m${i}.webp`;
        opts.push({ value: `M${i}`, label: `M${i} (${name})`, icon: iconSrc });
      }
      return opts;
    }
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

      // Always force user_interface to be true on load 
      // so the popup doesn't appear when loading into a save slot.
      if (key === 'user_interface' && this.settings[key] === false) {
        this.settings[key] = true;
        try {
          localStorage.setItem(storageKey, JSON.stringify(true));
        } catch (e) {}
      }

      this.notify(key, this.settings[key]);
    }
  }

  refresh(key) {
    if (this.settings[key] !== undefined) {
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
