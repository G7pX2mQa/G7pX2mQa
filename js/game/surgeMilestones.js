import { formatNumber } from '../util/numFormat.js';
import { BigNum } from '../util/bigNum.js';
import { bigNumFromLog10, approxLog10BigNum } from './upgrades.js';
import { getTsunamiNerf } from './surgeEffects.js';
import { getTsunamiResearchBonus } from './labNodes.js';

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
      "Unlocks a new Magic upgrade"
    ]
  },
  {
    id: 8,
    surgeLevel: 8,
    description: [
      "Invokes the Tsunami"
    ]
  }
];

export const NERFED_SURGE_MILESTONE_IDS = SURGE_MILESTONES
    .filter(m => m.affectedByTsunami)
    .map(m => m.id);

export function getVisibleMilestones(currentSurgeLevel) {
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
        let valStr = formatNumber(BigNum.fromAny(val));
        // Ensure decimal formatting for small numbers if formatNumber defaults to integer
        if (Math.abs(val - Math.round(val)) > 0.001) {
             valStr = val.toFixed(2);
             if (valStr.endsWith('.00')) valStr = valStr.slice(0, -3);
        } else if (val < 1000) {
             valStr = String(Math.round(val));
        }
        
        milestone.description[0] = milestone.description[0].replace(
            /<span style="color:#00e5ff">.*?x<\/span>/, 
            `<span style="color:#00e5ff">${valStr}x</span>`
        );
      } else if (m.id === 2) {
        // Auto-collect 10x -> 10^nerf x
        const val = Math.pow(10, nerf);
        let valStr = formatNumber(BigNum.fromAny(val));
        if (Math.abs(val - Math.round(val)) > 0.001) {
             valStr = val.toFixed(2);
             if (valStr.endsWith('.00')) valStr = valStr.slice(0, -3);
        } else if (val < 1000) {
             valStr = String(Math.round(val));
        }

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

    if (m.surgeLevel <= currentLevel) {
      reached.push(milestone);
    } else {
      future.push(milestone);
    }
  }
  
  // Return all reached + up to 2 future
  return [...reached, ...future.slice(0, 2)];
}
