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

import { formatNumber, formatMultForUi } from '../util/numFormat.js';
import { BigNum } from '../util/bigNum.js';
import { bigNumFromLog10, approxLog10BigNum } from '../util/bigNum.js';
import { getTsunamiNerf, getEffectiveTsunamiNerf, getSurge15Multiplier } from './surgeEffects.js';
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
  },
  {
    id: 14,
    surgeLevel: 14,
    affectedByTsunami: true,
    description: [
      `Multiplies DNA value by <span style="color:#00e5ff">${formatNumber(BigNum.fromInt(14.14e6))}x</span>`
    ]
  },
  {
    id: 15,
    surgeLevel: 15,
    affectedByTsunami: true,
    description: [
      "Unspent DNA boosts Coins: <span style=\"color:#00e5ff\">1x</span>"
    ]
  },
  {
    id: 16,
    surgeLevel: 16,
    affectedByTsunami: true,
    description: [
      "Generates <span style=\"color:#00e5ff\">0.1%</span> of your pending Magic each second"
    ]
  },
  {
    id: 17,
    surgeLevel: 17,
    description: [
      "Unlocks a new DNA upgrade"
    ]
  }
];

export const NERFED_SURGE_MILESTONE_IDS = SURGE_MILESTONES
    .filter(m => m.affectedByTsunami)
    .map(m => m.id);

const SURGE_9_STATE_KEY = (slot) => `ccc:surge:milestone9:state:${slot}`;
const SURGE_10_STATE_KEY = (slot) => `ccc:surge:milestone10:state:${slot}`;
const SURGE_14_STATE_KEY = (slot) => `ccc:surge:milestone14:state:${slot}`;
const SURGE_15_STATE_KEY = (slot) => `ccc:surge:milestone15:state:${slot}`;

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

function getSurge14State(slot) {
    if (slot == null) return 0;
    try {
        const val = localStorage.getItem(SURGE_14_STATE_KEY(slot));
        return val ? parseInt(val, 10) : 0;
    } catch {
        return 0;
    }
}

function saveSurge14State(slot, state) {
    if (slot == null) return;
    try {
        localStorage.setItem(SURGE_14_STATE_KEY(slot), state.toString());
    } catch {}
}

function getSurge15State(slot) {
    if (slot == null) return 0;
    try {
        const val = localStorage.getItem(SURGE_15_STATE_KEY(slot));
        return val ? parseInt(val, 10) : 0;
    } catch {
        return 0;
    }
}

function saveSurge15State(slot, state) {
    if (slot == null) return;
    try {
        localStorage.setItem(SURGE_15_STATE_KEY(slot), state.toString());
    } catch {}
}

export function getVisibleMilestones(currentSurgeLevel) {
  let currentLevel = 0;
  let isSurge8 = false;
  
  if (typeof currentSurgeLevel === 'number') {
    currentLevel = currentSurgeLevel;
    if (currentLevel >= 8) isSurge8 = true;
  } else if (typeof currentSurgeLevel === 'bigint') {
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

  if (newState < 1) {
      if (isSurge8) newState = 1;
  }
  
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

  if (newS10State < 1) {
      const lab4Level = getResearchNodeLevel(4);
      if (lab4Level >= 1) newS10State = 1;
  }

  if (newS10State !== s10State) {
      s10State = newS10State;
      saveSurge10State(slot, s10State);
  }
  // -------------------------

  // --- Surge 14 Text Logic ---
  let s14State = getSurge14State(slot);
  let newS14State = s14State;

  if (newS14State < 1) {
      const lab4Level = getResearchNodeLevel(4);
      if (lab4Level >= 1) newS14State = 1;
  }

  if (newS14State !== s14State) {
      s14State = newS14State;
      saveSurge14State(slot, s14State);
  }
  // -------------------------

  // --- Surge 15 Text Logic ---
  let s15State = getSurge15State(slot);
  let newS15State = s15State;

  if (newS15State < 1) {
      const lab4Level = getResearchNodeLevel(4);
      if (lab4Level >= 1) newS15State = 1;
  }

  if (newS15State !== s15State) {
      s15State = newS15State;
      saveSurge15State(slot, s15State);
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
        const val = Math.pow(10, nerf);
        const valStr = formatMultForUi(val);
        
        milestone.description[0] = milestone.description[0].replace(
            /<span style="color:#00e5ff">.*?x<\/span>/, 
            `<span style="color:#00e5ff">${valStr}x</span>`
        );
      } else if (m.id === 2) {
        const val = Math.pow(10, nerf);
        const valStr = formatMultForUi(val);

        milestone.description[1] = milestone.description[1].replace(
            /<span style="color:#00e5ff">.*?x<\/span>/, 
            `<span style="color:#00e5ff">${valStr}x</span>`
        );
      } else if (m.id === 4) {
        const log10 = Math.log10(4.444e12);
        const newVal = bigNumFromLog10(log10 * nerf);
        const valStr = formatNumber(newVal);
        
        milestone.description[0] = milestone.description[0].replace(
            /<span style="color:#00e5ff">.*?x<\/span>/, 
            `<span style="color:#00e5ff">${valStr}x</span>`
        );
      } else if (m.id === 14) {
        const log10 = Math.log10(14.14e6);
        const newVal = bigNumFromLog10(log10 * nerf);
        const valStr = formatNumber(newVal);
        
        milestone.description[0] = milestone.description[0].replace(
            /<span style="color:#00e5ff">.*?x<\/span>/, 
            `<span style="color:#00e5ff">${valStr}x</span>`
        );
      }
    }

    if (m.id === 9) {
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
        if (milestone === m) {
            milestone = { ...m, description: [...m.description] };
        }
        
        if (s10State === 0) {
            milestone.description = ["This milestone is hidden until you research Lab Node 4"];
        }
    }

    if (m.id === 13) {
      if (milestone === m) {
          milestone = { ...m, description: [...m.description] };
      }
      
      const effectiveNerf = getEffectiveTsunamiNerf();
      const mapped = effectiveNerf * 1.5 - 0.5;
      const pct = Math.pow(100, mapped);
      const valStr = formatMultForUi(pct);

      milestone.description[0] = `Generates <span style="color:#00e5ff">${valStr}%</span> of your pending Gold each second`;
    }

    if (m.id === 14) {
        if (milestone === m) {
            milestone = { ...m, description: [...m.description] };
        }
        
        if (s14State === 0) {
            milestone.description = ["This milestone is hidden until you research Lab Node 4"];
        }
    }
    
    if (m.id === 15) {
        if (milestone === m) {
            milestone = { ...m, description: [...m.description] };
        }
        
        if (s15State === 0) {
            milestone.description = ["This milestone is hidden until you research Lab Node 4"];
        } else {
            const mult = getSurge15Multiplier(true);
            const valStr = formatMultForUi(mult);
            milestone.description[0] = `Unspent DNA boosts Coins: <span style="color:#00e5ff">${valStr}x</span>`;
        }
    }

    if (m.id === 16) {
      if (milestone === m) {
          milestone = { ...m, description: [...m.description] };
      }
      
      const effectiveNerf = getEffectiveTsunamiNerf();
      const mapped = effectiveNerf * 1.5 - 0.5;
      const pct = Math.pow(100, mapped);
      const valStr = formatMultForUi(pct);

      milestone.description[0] = `Generates <span style="color:#00e5ff">${valStr}%</span> of your pending Magic each second`;
    }

    if (m.surgeLevel <= currentLevel) {
      reached.push(milestone);
    } else {
      future.push(milestone);
    }
  }
  
  return [...reached, ...future.slice(0, 2)];
}
