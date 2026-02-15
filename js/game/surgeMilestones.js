export const getSurge9Description = (slot) => {
  const state = getSurge9State(slot);
  if (state === 0) return "This milestone is hidden for now";
  if (state === 1) return "This milestone is hidden until you research Lab Node 4";
  return "Significantly boosts DNA gained from the Experiment reset";
};

export const getSurge10Description = (slot) => {
  const state = getSurge10State(slot);
  if (state === 0) return "This milestone is hidden until you research Lab Node 4";
  return "Unlocks new DNA upgrades";
};

export const getSurge11Description = (slot) => {
  const state = getSurge11State(slot);
  if (state === 0) return "This milestone is hidden until you research Lab Node 4";
  return "Unlocks a new automation upgrade";
};

export const getSurge12Description = (slot) => {
  const state = getSurge12State(slot);
  if (state === 0) return "This milestone is hidden until you research Lab Node 4";
  return "Significantly boosts the effect Lab Level has on RP multiplier";
};

import { formatNumber, formatMultForUi } from '../util/numFormat.js';
import { BigNum } from '../util/bigNum.js';
import { bigNumFromLog10, approxLog10BigNum } from '../util/bigNum.js';
import { getTsunamiNerf, getEffectiveTsunamiNerf } from './surgeEffects.js';
import { getTsunamiResearchBonus, getResearchNodeLevel } from './labNodes.js';
import { getActiveSlot } from '../util/storage.js';

export const SURGE_MILESTONES = [
  {
    id: 1,
    surgeLevel: 1,
    affectedByTsunami: true,
    description: [
      "Multiplies Coin, XP, and MP value by <span style=\"color:#00e5ff\">10x</span>",
      "Unlocks the Warp tab"
    ]
  },
  {
    id: 2,
    surgeLevel: 2,
    affectedByTsunami: true,
    description: [
      "Allows some Coins to spawn with a larger size, yielding collection multipliers; the largest Coins won't despawn even when others do",
      "Improves Effective Auto-Collect by <span style=\"color:#00e5ff\">10x</span>"
    ]
  },
  {
    id: 3,
    surgeLevel: 3,
    affectedByTsunami: true,
    description: [
      "Generates Books based on XP Level instead of earning a flat amount of Books on level up",
      "Unlocks a new Book upgrade"
    ]
  },
  {
    id: 4,
    surgeLevel: 4,
    affectedByTsunami: true,
    description: [
      `Multiplies MP value by <span style="color:#00e5ff">${formatNumber(BigNum.fromInt(4.444e12))}x</span>`
    ]
  },
    {
    id: 5,
    surgeLevel: 5,
    description: [
      "Unlocks a new Gold upgrade"
    ]
  },
  {
    id: 6,
    surgeLevel: 6,
    affectedByTsunami: true,
    description: [
      "Unspent Coins boost Coins",
      "Unspent Books boost Coins",
      "Unspent Gold boosts Coins",
      "Unspent Magic boosts Coins"
    ]
  },
  {
    id: 7,
    surgeLevel: 7,
    description: [
      "Unlocks a new Magic upgrade",
      "Makes each Workshop Level triple Gear production instead of doubling it"
    ]
  },
  {
    id: 8,
    surgeLevel: 8,
    description: [
      "Invokes the Tsunami"
    ]
  },
  {
    id: 9,
    surgeLevel: 9,
    affectedByTsunami: true,
    description: [
      "Significantly boosts DNA gained from the Experiment reset"
    ]
  },
  {
    id: 10,
    surgeLevel: 10,
    description: [
      "Unlocks new DNA upgrades"
    ]
  },
  {
    id: 11,
    surgeLevel: 11,
    description: [
      "Unlocks a new automation upgrade",
      "Makes each Workshop Level quadruple Gear production instead of tripling it"
    ]
  },
  {
    id: 12,
    surgeLevel: 12,
    affectedByTsunami: true,
    description: [
      "Significantly boosts the effect Lab Level has on RP multiplier"
    ]
  },
  {
    id: 13,
    surgeLevel: 13,
    affectedByTsunami: true,
    description: [
      "Generates <span style=\"color:#00e5ff\">0.1%</span> of your pending Gold each second"
    ]
  }
];

export const NERFED_SURGE_MILESTONE_IDS = SURGE_MILESTONES
    .filter(m => m.affectedByTsunami)
    .map(m => m.id);

const SURGE_9_STATE_KEY = (slot) => `ccc:surge:milestone9:state:${slot}`;
const SURGE_10_STATE_KEY = (slot) => `ccc:surge:milestone10:state:${slot}`;
const SURGE_11_STATE_KEY = (slot) => `ccc:surge:milestone11:state:${slot}`;

function getSurge9State(slot) {
    if (slot == null) return 0;
    try {
        const val = localStorage.getItem(SURGE_9_STATE_KEY(slot));
        return val ? parseInt(val, 10) : 0;
    } catch {
        return 0;
    }
}

function saveSurge9State(slot, state) {
    if (slot == null) return;
    try {
        localStorage.setItem(SURGE_9_STATE_KEY(slot), state.toString());
    } catch {}
}

function getSurge10State(slot) {
    if (slot == null) return 0;
    try {
        const val = localStorage.getItem(SURGE_10_STATE_KEY(slot));
        return val ? parseInt(val, 10) : 0;
    } catch {
        return 0;
    }
}

function saveSurge10State(slot, state) {
    if (slot == null) return;
    try {
        localStorage.setItem(SURGE_10_STATE_KEY(slot), state.toString());
    } catch {}
}

function getSurge11State(slot) {
    if (slot == null) return 0;
    try {
        const val = localStorage.getItem(SURGE_11_STATE_KEY(slot));
        return val ? parseInt(val, 10) : 0;
    } catch {
        return 0;
    }
}

function saveSurge11State(slot, state) {
    if (slot == null) return;
    try {
        localStorage.setItem(SURGE_11_STATE_KEY(slot), state.toString());
    } catch {}
}

function getSurge12State(slot) {
    if (slot == null) return 0;
    try {
        const val = localStorage.getItem(SURGE_12_STATE_KEY(slot));
        return val ? parseInt(val, 10) : 0;
    } catch {
        return 0;
    }
}

function saveSurge12State(slot, state) {
    if (slot == null) return;
    try {
        localStorage.setItem(SURGE_12_STATE_KEY(slot), state.toString());
    } catch {}
}

export function getVisibleMilestones(currentSurgeLevel) {
  console.log("getVisibleMilestones called with:", currentSurgeLevel);
  console.log("SURGE_MILESTONES length:", SURGE_MILESTONES.length);
  let currentLevel = 0;
  let isSurge8 = false;
  
  // Handle different number types safely
  if (typeof currentSurgeLevel === 'number') {
    currentLevel = currentSurgeLevel;
    if (currentLevel >= 8) isSurge8 = true;
  } else if (typeof currentSurgeLevel === 'bigint') {
    // Safety clamp for very large BigInts to avoid Number conversion issues
    // though surge levels likely won't exceed Number.MAX_SAFE_INTEGER
    if (currentSurgeLevel > Number.MAX_SAFE_INTEGER) {
      currentLevel = Number.MAX_SAFE_INTEGER;
    } else {
      currentLevel = Number(currentSurgeLevel);
    }
    if (currentSurgeLevel >= 8n) isSurge8 = true;
  } else if (currentSurgeLevel === Infinity) {
      currentLevel = Infinity;
      isSurge8 = true;
  } else if (currentSurgeLevel && typeof currentSurgeLevel.toString === 'function') {
      try {
          const val = Number(currentSurgeLevel.toString());
          if (!isNaN(val)) currentLevel = val;
          if (currentSurgeLevel === 'Infinity' || val === Infinity) {
              isSurge8 = true;
          }
      } catch {}
  }

  // --- Surge 9 Text Logic ---
  const slot = getActiveSlot();
  let s9State = getSurge9State(slot);
  let newState = s9State;

  // 0 -> 1: Reached Surge 8 (lifetime, triggered by monotonic one-way upgrade)
  // We use current isSurge8 check. If we are currently at Surge 8+, we can unlock state 1.
  if (newState < 1) {
      if (isSurge8) newState = 1;
  }
  
  // 1 -> 2: Lab Node 4 Researched
  if (newState < 2) {
      const lab4Level = getResearchNodeLevel(4);
      if (lab4Level >= 1) newState = 2;
  }
  
  if (newState !== s9State) {
      s9State = newState;
      saveSurge9State(slot, s9State);
  }
  // -------------------------

  // --- Surge 10 Text Logic ---
  let s10State = getSurge10State(slot);
  let newS10State = s10State;

  // 0 -> 1: Lab Node 4 Researched
  if (newS10State < 1) {
      const lab4Level = getResearchNodeLevel(4);
      if (lab4Level >= 1) newS10State = 1;
  }

  if (newS10State !== s10State) {
      s10State = newS10State;
      saveSurge10State(slot, s10State);
  }
  // -------------------------

  // --- Surge 11 Text Logic ---
  let s11State = getSurge11State(slot);
  let newS11State = s11State;

  // 0 -> 1: Lab Node 4 Researched
  if (newS11State < 1) {
      const lab4Level = getResearchNodeLevel(4);
      if (lab4Level >= 1) newS11State = 1;
  }

  if (newS11State !== s11State) {
      s11State = newS11State;
      saveSurge11State(slot, s11State);
  }
  // -------------------------

  // --- Surge 12 Text Logic ---
  let s12State = getSurge12State(slot);
  let newS12State = s12State;

  // 0 -> 1: Lab Node 4 Researched
  if (newS12State < 1) {
      const lab4Level = getResearchNodeLevel(4);
      if (lab4Level >= 1) newS12State = 1;
  }

  if (newS12State !== s12State) {
      s12State = newS12State;
      saveSurge12State(slot, s12State);
  }
  // -------------------------
  
  const reached = [];
  const future = [];
  
  for (const m of SURGE_MILESTONES) {
    let milestone = m;
    
    if (isSurge8) {
      // Clone milestone to avoid mutating the original
      milestone = { ...m, description: [...m.description] };
      
      const baseNerf = getTsunamiNerf();
      const bonus = getTsunamiResearchBonus();
      let nerf = baseNerf + bonus;
      if (nerf > 1) nerf = 1;
      
      if (m.id === 1) {
        // 10x -> 10^nerf x
        const val = Math.pow(10, nerf);
        const valStr = formatMultForUi(val);
        
        milestone.description[0] = milestone.description[0].replace(
            /<span style="color:#00e5ff">.*?x<\/span>/, 
            `<span style="color:#00e5ff">${valStr}x</span>`
        );
      } else if (m.id === 2) {
        // Auto-collect 10x -> 10^nerf x
        const val = Math.pow(10, nerf);
        const valStr = formatMultForUi(val);

        milestone.description[1] = milestone.description[1].replace(
            /<span style="color:#00e5ff">.*?x<\/span>/, 
            `<span style="color:#00e5ff">${valStr}x</span>`
        );
      } else if (m.id === 4) {
        // 4.444e12 -> (4.444e12)^nerf
        const log10 = Math.log10(4.444e12);
        const newVal = bigNumFromLog10(log10 * nerf);
        const valStr = formatNumber(newVal);
        
        milestone.description[0] = milestone.description[0].replace(
            /<span style="color:#00e5ff">.*?x<\/span>/, 
            `<span style="color:#00e5ff">${valStr}x</span>`
        );
      }
    }

    if (m.id === 9) {
        // Ensure clone if not already cloned
        if (milestone === m) {
            milestone = { ...m, description: [...m.description] };
        }
        
        if (s9State === 0) {
            milestone.description = ["This milestone is hidden for now"];
        } else if (s9State === 1) {
            milestone.description = ["This milestone is hidden until you research Lab Node 4"];
        }
    }

    if (m.id === 10) {
        // Ensure clone if not already cloned
        if (milestone === m) {
            milestone = { ...m, description: [...m.description] };
        }
        
        if (s10State === 0) {
            milestone.description = ["This milestone is hidden until you research Lab Node 4"];
        }
    }

    if (m.id === 11) {
        // Ensure clone if not already cloned
        if (milestone === m) {
            milestone = { ...m, description: [...m.description] };
        }
        
        if (s11State === 0) {
            milestone.description = ["This milestone is hidden until you research Lab Node 4"];
        }
    }

    if (m.id === 12) {
        // Ensure clone if not already cloned
        if (milestone === m) {
            milestone = { ...m, description: [...m.description] };
        }
        
        if (s12State === 0) {
            milestone.description = ["This milestone is hidden until you research Lab Node 4"];
        }
    }

    if (m.id === 13) {
      // Ensure clone if not already cloned
      if (milestone === m) {
          milestone = { ...m, description: [...m.description] };
      }
      
      const effectiveNerf = getEffectiveTsunamiNerf();
      const mapped = effectiveNerf * 1.5 - 0.5;
      const pct = Math.pow(100, mapped);
      const valStr = formatMultForUi(pct);

      milestone.description[0] = `Generates <span style="color:#00e5ff">${valStr}%</span> of your pending Gold each second`;
    }

    if (m.surgeLevel <= currentLevel) {
      reached.push(milestone);
    } else {
      future.push(milestone);
    }
  }
  
  // Return all reached + up to 2 future
  return [...reached, ...future.slice(0, 2)];
}
