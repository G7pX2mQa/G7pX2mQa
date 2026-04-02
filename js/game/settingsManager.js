// js/game/settingsManager.js

import { getActiveSlot } from '../util/storage.js';
import { getTsunamiSequenceSeen } from './surgeEffects.js';
import { getHighestMutationLevel } from './mutationSystem.js';
import { setNumberNotation } from '../util/numFormat.js';
import { IS_MOBILE } from '../main.js';
import { getMagnetLevel, getLevelNumber } from './upgrades.js';
import { AUTOMATION_AREA_KEY, EFFECTIVE_AUTO_COLLECT_ID } from './automationUpgrades.js';
import {
  hasDoneForgeReset,
  hasDoneInfuseReset,
  hasDoneSurgeReset,
  hasDoneExperimentReset
} from '../ui/merchantTabs/resetTab.js';
import { maxRefreshRate } from '../util/refreshRate.js';

const SETTINGS_KEY_PREFIX = 'ccc:setting:';

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
  cursor_trail: {
    id: 'cursor_trail',
    type: 'toggle',
    label: () => IS_MOBILE ? 'Finger Trail' : 'Cursor Trail',
    hasExtraInfo: false,
    default: true,
    unlockCondition: () => true,
  },
  show_cursor: {
    id: 'show_cursor',
    type: 'toggle',
    label: 'Show Cursor',
    hasExtraInfo: true,
	info: 'Specifically on the playfield, the area the collectibles finalize their positions.',
    default: false,
    unlockCondition: () => !IS_MOBILE,
  },
  spawn_vessels: {
    id: 'spawn_vessels',
    type: 'toggle',
    label: 'Spawn Vessels',
    hasExtraInfo: true,
    info: 'For example, the waves that spawn in The Cove; turning this setting OFF would hide these.',
    default: true,
    unlockCondition: () => true,
  },
  warp_vfx: {
    id: 'warp_vfx',
    type: 'toggle',
    label: 'Warp VFX',
    hasExtraInfo: false,
    default: true,
    unlockCondition: () => {
      try {
        return hasDoneSurgeReset();
      } catch {
        return false;
      }
    },
  },
  lab_node_insta_toggle: {
    id: 'lab_node_insta_toggle',
    type: 'toggle',
    label: 'Lab Node Insta-Toggle',
    hasExtraInfo: true,
    info: 'Do you hate having to click a lab node overlay, press Toggle, close the overlay, then when it completes, move onto the next, repeating this process forever? Toggle this setting ON to instantly toggle a node just by tapping on the node.',
    default: false,
    unlockCondition: () => {
      try {
        const slot = getActiveSlot();
        if (slot == null) return false;
        let isLabUnlocked = false;
        if (typeof getTsunamiSequenceSeen === 'function' && getTsunamiSequenceSeen()) {
            isLabUnlocked = true;
        } else {
            isLabUnlocked = localStorage.getItem(`labUnlock:${slot}`) === '1';
        }
        return isLabUnlocked && IS_MOBILE;
      } catch {
        return false;
      }
    },
  },
  music_volume: {
    id: 'music_volume',
    type: 'slider',
    label: 'Music Volume',
    hasExtraInfo: false,
    min: 0,
    max: 100,
    step: 1,
    default: 100,
    unlockCondition: () => true,
  },
  show_fps: {
    id: 'show_fps',
    type: 'toggle',
    label: 'Show FPS',
    overlay: 'performance',
    hasExtraInfo: false,
    default: false,
    unlockCondition: () => true,
  },
  pickup_animation: {
    id: 'pickup_animation',
    type: 'toggle',
    label: 'Pickup Animation',
    overlay: 'performance',
    hasExtraInfo: true,
    info: 'Applies to all collectibles that spawn on the playfield. Turning this setting OFF would disable the pickup animations for all collectibles.',
    default: true,
    unlockCondition: () => !IS_MOBILE,
  },
  insta_teleport: {
    id: 'insta_teleport',
    type: 'toggle',
    label: 'Collectible Insta-Teleport',
    overlay: 'performance',
    hasExtraInfo: true,
    info: 'Turning this setting ON will make it so that recently spawned collectibles will not calculate physics every frame as they approach their intended destination, and instead they will teleport to their intended destination instantly. These physics calculations are generally the most computationally expensive thing the game does constantly so you may want to turn this setting ON you use a lower-end device.',
    default: false,
    unlockCondition: () => true,
  },
  graphics_quality: {
    id: 'graphics_quality',
    type: 'slider',
    label: 'Graphics Quality',
    overlay: 'performance',
    hasExtraInfo: false,
    min: 0,
    max: 10,
    step: 1,
    default: 10,
    unlockCondition: () => true,
  },


  magnet_radius: {
    id: 'magnet_radius',
    type: 'slider',
    label: 'Magnet Radius',
    hasExtraInfo: false,
    min: 0,
    max: () => getMagnetLevel(),
    step: 0.1,
    default: () => getMagnetLevel(),
    unlockCondition: () => getMagnetLevel() >= 1,
  },
  eac_efficiency: {
    id: 'eac_efficiency',
    type: 'slider',
    label: 'EAC Efficiency',
    hasExtraInfo: true,
    info: 'This slider represents the efficiency at which your Effective Auto-Collect will generate things in any given area. Leave the slider at 100 for normal gameplay, or adjust it to a different number to have EAC run at n% efficiency. Set this slider value to 0 to completely disable EAC earnings.',
    min: 0,
    max: 100,
    step: 1,
    default: 100,
    unlockCondition: () => getLevelNumber(AUTOMATION_AREA_KEY, EFFECTIVE_AUTO_COLLECT_ID) >= 1,
  },
  number_notation: {
    id: 'number_notation',
    type: 'dropdown',
    label: 'Number Notation',
    hasExtraInfo: false,
    default: 'Standard',
    options: [
      { value: 'Standard', label: 'Standard' },
      { value: 'Scientific (1e6+)', label: 'Scientific (1e6+)' },
      { value: 'Scientific (1e33+)', label: 'Scientific (1e33+)' },
      { value: 'Engineering (1e6+)', label: 'Engineering (1e6+)' },
      { value: 'Engineering (1e33+)', label: 'Engineering (1e33+)' },
      { value: 'Extended Suffixes', label: 'Extended Suffixes (hell)' }
    ],
    unlockCondition: () => true
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
  },
  forge_confirmation: {
    id: 'forge_confirmation',
    type: 'toggle',
    label: 'Forge Confirmation',
    overlay: 'confirmations',
    hasExtraInfo: false,
    default: false,
    unlockCondition: () => {
      try { return hasDoneForgeReset(); } catch { return false; }
    },
  },
  infuse_confirmation: {
    id: 'infuse_confirmation',
    type: 'toggle',
    label: 'Infuse Confirmation',
    overlay: 'confirmations',
    hasExtraInfo: false,
    default: false,
    unlockCondition: () => {
      try { return hasDoneInfuseReset(); } catch { return false; }
    },
  },
  surge_confirmation: {
    id: 'surge_confirmation',
    type: 'toggle',
    label: 'Surge Confirmation',
    overlay: 'confirmations',
    hasExtraInfo: false,
    default: false,
    unlockCondition: () => {
      try { return hasDoneSurgeReset(); } catch { return false; }
    },
  },
  insufficient_waves_confirmation: {
    id: 'insufficient_waves_confirmation',
    type: 'toggle',
    label: 'Insufficient Waves Confirmation',
    overlay: 'confirmations',
    hasExtraInfo: true,
    info: 'For the Surge reset, if you have insufficient Waves such that performing a Surge reset would not increase your Surge, this confirmation ensures that you are aware that performing a Surge reset would not benefit you immediately.',
    default: true,
    unlockCondition: () => {
      try { return hasDoneSurgeReset(); } catch { return false; }
    },
  },
  experiment_confirmation: {
    id: 'experiment_confirmation',
    type: 'toggle',
    label: 'Experiment Confirmation',
    overlay: 'confirmations',
    hasExtraInfo: false,
    default: false,
    unlockCondition: () => {
      try { return hasDoneExperimentReset(); } catch { return false; }
    },
  }
};

class SettingsManager {
  constructor() {
    this.settings = {};
    this.listeners = {};
    this._isDefault = {};
    this._lastMax = {};
    this.loadAll();

    if (typeof window !== 'undefined') {
      window.addEventListener('saveSlot:change', () => {
        this.loadAll();
      });
      document.addEventListener('ccc:upgrades:changed', () => {
        const def = SETTING_DEFINITIONS['magnet_radius'];
        const currentVal = this.settings['magnet_radius'];
        const oldMax = this._lastMax['magnet_radius'];
        const newMax = typeof def.max === 'function' ? def.max() : def.max;
        
        if (this._isDefault['magnet_radius'] || currentVal >= oldMax) {
          // User was at the maximum or using defaults, keep them at the new max
          this.settings['magnet_radius'] = newMax;
          if (!this._isDefault['magnet_radius']) {
            this.set('magnet_radius', newMax); // Persist if it wasn't default
          } else {
            this.notify('magnet_radius', newMax);
          }
        } else {
          // Cap the value if it exceeds the new max (e.g., if somehow newMax went down)
          if (currentVal > newMax) {
            this.settings['magnet_radius'] = newMax;
            this.set('magnet_radius', newMax);
          }
        }
        this._lastMax['magnet_radius'] = newMax;
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
    this._isDefault = {};
    this._lastMax = {};
    for (const [key, def] of Object.entries(SETTING_DEFINITIONS)) {
      if (def.max !== undefined) {
        this._lastMax[key] = typeof def.max === 'function' ? def.max() : def.max;
      }
      const storageKey = this._getKey(key);
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        this.settings[key] = JSON.parse(stored);
        this._isDefault[key] = false;
      } else {
        this.settings[key] = typeof def.default === 'function' ? def.default() : def.default;
        this._isDefault[key] = true;
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

    // Clear old dynamic currency settings from memory to prevent bleed between slots
    for (const k in this.settings) {
      if (k.startsWith("currency_")) {
        delete this.settings[k];
        delete this._isDefault[k];
      }
    }

    // Load dynamic currency settings
    const slot = getActiveSlot();
    const suffix = slot != null ? `:${slot}` : "";
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i);
      if (storageKey && (storageKey.startsWith(SETTINGS_KEY_PREFIX + "currency_") || storageKey.startsWith(SETTINGS_KEY_PREFIX + "level_")) && storageKey.endsWith(suffix)) {
        const key = storageKey.substring(SETTINGS_KEY_PREFIX.length, storageKey.length - suffix.length);
        try {
          this.settings[key] = JSON.parse(localStorage.getItem(storageKey));
          this._isDefault[key] = false;
          this.notify(key, this.settings[key]);
        } catch (e) {
          console.error("Failed to parse currency setting", key, e);
        }
      }
    }

    setNumberNotation(this.settings['number_notation'] || 'Standard');
  }

  refresh(key) {
    if (this.settings[key] !== undefined) {
      this.notify(key, this.settings[key]);
    }
  }

  get(key) {
    if (!(key in SETTING_DEFINITIONS) && !(key.startsWith("currency_") || key.startsWith("level_"))) return false;
    
    // Support dynamic currency toggles
    if (key.startsWith("currency_") || key.startsWith("level_")) {
      return this.settings[key];
    }

    const def = SETTING_DEFINITIONS[key];
    if (this._isDefault[key]) {
      this.settings[key] = typeof def.default === 'function' ? def.default() : def.default;
    } else if (this.settings[key] === undefined) {
      this.settings[key] = typeof def.default === 'function' ? def.default() : def.default;
      this._isDefault[key] = true;
    }
    // For magnet_radius, we must ensure the saved value isn't greater than current max level.
    if (key === 'magnet_radius') {
      const maxLvl = typeof def.max === 'function' ? def.max() : def.max;
      if (this.settings[key] > maxLvl) {
         this.settings[key] = maxLvl;
      }
    }
    return this.settings[key];
  }

  set(key, value) {
    if (!(key in SETTING_DEFINITIONS) && !(key.startsWith("currency_") || key.startsWith("level_"))) return;
    this.settings[key] = value;
    this._isDefault[key] = false;
    const storageKey = this._getKey(key);
    localStorage.setItem(storageKey, JSON.stringify(value));
    
    if (key === 'number_notation') {
      setNumberNotation(value);
    }
    
    this.notify(key, value);
  }

  toggle(key) {
    const newVal = !this.get(key);
    this.set(key, newVal);
    return newVal;
  }
  
  delete(key) {
    if (this.settings[key] !== undefined) {
      delete this.settings[key];
      delete this._isDefault[key];
      const storageKey = this._getKey(key);
      localStorage.removeItem(storageKey);
      this.notify(key, undefined);
    }
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
