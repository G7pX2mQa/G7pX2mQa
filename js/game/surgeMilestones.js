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
      "Placeholder text",
      "Another one"
    ]
  },
  {
    id: 4,
    surgeLevel: 10,
    description: [
      "Future thing"
    ]
  },
  {
    id: 5,
    surgeLevel: 20,
    description: [
      "Big future thing"
    ]
  },
  {
    id: 6,
    surgeLevel: 50,
    description: [
      "Far future"
    ]
  },
  {
    id: 7,
    surgeLevel: 1000,
    description: [
      "Very far future"
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
