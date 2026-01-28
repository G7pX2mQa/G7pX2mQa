import { formatNumber } from '../util/numFormat.js';
import { BigNum } from '../util/bigNum.js';

export const SURGE_MILESTONES = [
  {
    id: 1,
    surgeLevel: 1,
    description: [
      "Multiplies Coin, XP, and MP value by <span style=\"color:#00e5ff\">10x</span>",
      "Unlocks the Warp tab"
    ]
  },
  {
    id: 2,
    surgeLevel: 2,
    description: [
      "Allows some Coins to spawn with a larger size, yielding collection multipliers; the largest Coins won't despawn even when others do",
      "Improves Effective Auto-Collect by <span style=\"color:#00e5ff\">10x</span>"
    ]
  },
  {
    id: 3,
    surgeLevel: 3,
    description: [
      "Generates Books based on XP Level instead of earning a flat amount of Books on level up",
      "Unlocks a new Book upgrade"
    ]
  },
  {
    id: 4,
    surgeLevel: 4,
    description: [
      `Multiplies MP value by <span style="color:#00e5ff">${formatNumber(BigNum.fromInt(1e14))}x</span>`
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
    description: [
      "Unspent Coins boost Coins",
      "Unspent Books boost Coins",
      "Unspent Gold boosts Coins",
      "Unspent Magic boosts Coins"
    ]
  }
];

export function getVisibleMilestones(currentSurgeLevel) {
  let currentLevel = 0;
  
  // Handle different number types safely
  if (typeof currentSurgeLevel === 'number') {
    currentLevel = currentSurgeLevel;
  } else if (typeof currentSurgeLevel === 'bigint') {
    // Safety clamp for very large BigInts to avoid Number conversion issues
    // though surge levels likely won't exceed Number.MAX_SAFE_INTEGER
    if (currentSurgeLevel > Number.MAX_SAFE_INTEGER) {
      currentLevel = Number.MAX_SAFE_INTEGER;
    } else {
      currentLevel = Number(currentSurgeLevel);
    }
  } else if (currentSurgeLevel && typeof currentSurgeLevel.toString === 'function') {
      try {
          const val = Number(currentSurgeLevel.toString());
          if (!isNaN(val)) currentLevel = val;
      } catch {}
  }
  
  const reached = [];
  const future = [];
  
  for (const m of SURGE_MILESTONES) {
    if (m.surgeLevel <= currentLevel) {
      reached.push(m);
    } else {
      future.push(m);
    }
  }
  
  // Return all reached + up to 2 future
  return [...reached, ...future.slice(0, 2)];
}
