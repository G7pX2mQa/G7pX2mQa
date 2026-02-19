import { BigNum } from '../util/bigNum.js';
import { bank, getActiveSlot, isStorageKeyLocked } from '../util/storage.js';
import { 
  addExternalCoinMultiplierProvider, 
  addExternalXpGainMultiplierProvider,
  getXpState,
  setExternalBookRewardProvider,
  refreshCoinMultiplierFromXpLevel
} from './xpSystem.js';
import { syncCurrencyMultipliersFromUpgrades } from './upgradeEffects.js';
import { addExternalMutationGainMultiplierProvider, getTotalCumulativeMp } from './mutationSystem.js';
import { getCurrentSurgeLevel, computeForgeGoldFromInputs, computeInfuseMagicFromInputs } from '../ui/merchantTabs/resetTab.js';
import { registerTick, RateAccumulator } from './gameLoop.js';
import { bigNumFromLog10, approxLog10BigNum } from '../util/bigNum.js';
import { getTsunamiResearchBonus, getLabGoldMultiplier } from './labNodes.js';
import { getComboRestorationFactor, updateCombo, initComboSystem } from './comboSystem.js';
import { formatMultForUi } from '../util/numFormat.js';

const BN = BigNum;
const MULTIPLIER = 10;
const LOG10_EXP_0_2 = 0.08685889638; // log10(e^0.2)
const TSUNAMI_NERF_KEY = (slot) => `ccc:surge:tsunamiNerf:${slot}`;
const TSUNAMI_SEEN_KEY = (slot) => `ccc:unlock:tsunami:${slot}`;

export function getTsunamiNerfKey(slot) {
  return TSUNAMI_NERF_KEY(slot);
}

export function getTsunamiSequenceSeen() {
  const slot = getActiveSlot();
  if (slot == null) return false;
  try {
    return localStorage.getItem(TSUNAMI_SEEN_KEY(slot)) === '1';
  } catch {
    return false;
  }
}

export function setTsunamiSequenceSeen(value) {
  const slot = getActiveSlot();
  if (slot == null) return;
  const normalized = !!value;
  try {
    localStorage.setItem(TSUNAMI_SEEN_KEY(slot), normalized ? '1' : '0');
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('unlock:change', { detail: { key: 'tsunami', slot } }));
    }
  } catch {}
}

let currentMultiplier = BigNum.fromInt(1);
let cachedSurgeLevel = 0n;
let bookRateAccumulator = null;
let tsunamiNerfExponent = 0.00;

export function getTsunamiNerf() {
  return tsunamiNerfExponent;
}

export function getEffectiveTsunamiNerf() {
  const nerf = getTsunamiNerf();
  let effective = nerf + getTsunamiResearchBonus();
  if (effective > 1) effective = 1;

  return effective;
}

export function getEffectiveTsunamiNerfWithCombo() {
  let effective = getEffectiveTsunamiNerf();

  if (isSurgeActive(14)) {
      const factor = getComboRestorationFactor();
      const diff = 1.0 - effective;
      effective += diff * factor;
  }
  
  return effective;
}

export function getComboUiString() {
    if (!isSurgeActive(14)) return '';
    
    const nerf = getTsunamiNerf();
    let baseEffective = nerf + getTsunamiResearchBonus();
    if (baseEffective > 1) baseEffective = 1;
    
    const factor = getComboRestorationFactor();
    const diff = 1.0 - baseEffective;
    const added = diff * factor;
    
    // Show if combo is active (non-zero factor), even if added value is very small
    if (factor <= 0) return '';
    
    let str = formatMultForUi(added);
    if (str === '0') str = '0.000';
    
    let finalStr = ` (+^${str})`;
    if (factor >= 1.0) {
        finalStr = `<span style="color: #02e815">${finalStr}</span>`;
    }
    
    return finalStr;
}

export function setTsunamiNerf(value) {
  let val = Number(value);
  if (Number.isNaN(val)) val = 0;
  
  // Treat Infinity or > 1 as 1.00 (nerf restored)
  if (!Number.isFinite(val) || val > 1) {
    val = 1;
  }
  if (val < 0) val = 0;
  
  const slot = getActiveSlot();
  if (slot != null) {
      const key = TSUNAMI_NERF_KEY(slot);
      if (isStorageKeyLocked(key)) return;
      
      try {
        localStorage.setItem(key, val.toFixed(2));
      } catch {}
  }
  
  tsunamiNerfExponent = val;
  
  updateMultiplier();
  try { window.dispatchEvent(new CustomEvent('surge:nerf:change', { detail: { value: val } })); } catch {}
}

export function isSurgeActive(n) {
  if (cachedSurgeLevel === Infinity || (typeof cachedSurgeLevel === 'string' && cachedSurgeLevel === 'Infinity')) return true;
  if (cachedSurgeLevel === Number.POSITIVE_INFINITY) return true;

  if (typeof cachedSurgeLevel === 'bigint') {
    return cachedSurgeLevel >= BigInt(n);
  }
  if (typeof cachedSurgeLevel === 'number') {
    return cachedSurgeLevel >= n;
  }
  return false;
}

function applyTsunamiNerf(bn) {
  if (!isSurgeActive(8)) return bn;
  const log10 = approxLog10BigNum(bn);
  if (!Number.isFinite(log10)) return bn;
  
  const effective = getEffectiveTsunamiNerf();

  return bigNumFromLog10(log10 * effective);
}

function updateMultiplier() {
  const level = getCurrentSurgeLevel();
  cachedSurgeLevel = level;
  let isReached = false;
  
  if (level === Infinity) {
    isReached = true;
  } else if (typeof level === 'bigint') {
    isReached = level >= 1n;
  }

  if (isReached) {
    if (isSurgeActive(8)) {
      const effective = getEffectiveTsunamiNerf();

      const log10 = Math.log10(MULTIPLIER);
      currentMultiplier = bigNumFromLog10(log10 * effective);
    } else {
      currentMultiplier = BigNum.fromInt(MULTIPLIER);
    }
  } else {
    currentMultiplier = BigNum.fromInt(1);
  }
}

export function getSurge15Multiplier(preview = false) {
  if (!preview && !isSurgeActive(15)) return BigNum.fromInt(1);
  
  const dna = bank.dna?.value;
  if (!dna) return BigNum.fromInt(1);

  const calc = (amount) => {
    if (!amount) return BigNum.fromInt(1);
    if (amount.isInfinite?.()) return BigNum.fromAny('Infinity');
    
    const log10Bn = approxLog10BigNum(amount);
    if (!Number.isFinite(log10Bn) || log10Bn <= 0) return BigNum.fromInt(1);

    // Formula: 2 ^ (log10(amount))
    const power = log10Bn;
    if (power <= 0) return BigNum.fromInt(1);

    const log10Result = power * Math.log10(2);
    return bigNumFromLog10(log10Result);
  };

  const mult = calc(dna);

  if (isSurgeActive(8)) {
     return applyTsunamiNerf(mult);
  }

  return mult;
}

export function getSurge15Divisor(preview = false) {
  if (!preview && !isSurgeActive(15)) return BigNum.fromInt(1);
  
  const dna = bank.dna?.value;
  if (!dna) return BigNum.fromInt(1);

  const calc = (amount) => {
    if (!amount) return BigNum.fromInt(1);
    if (amount.isInfinite?.()) return BigNum.fromAny('Infinity');
    
    const log10Bn = approxLog10BigNum(amount);
    if (!Number.isFinite(log10Bn) || log10Bn <= 0) return BigNum.fromInt(1);

    // Formula: 2 ^ (log10(amount) / 2)
    const power = log10Bn / 2;
    if (power <= 0) return BigNum.fromInt(1);

    const log10Result = power * Math.log10(2);
    return bigNumFromLog10(log10Result);
  };

  const div = calc(dna);

  if (isSurgeActive(8)) {
     return applyTsunamiNerf(div);
  }

  return div;
}

export function getSurge6WealthMultipliers() {
  if (!isSurgeActive(6)) {
      return {
          coins: BigNum.fromInt(1),
          books: BigNum.fromInt(1),
          gold: BigNum.fromInt(1),
          magic: BigNum.fromInt(1),
          total: BigNum.fromInt(1)
      };
  }

  const calc = (amount, residue = 0) => {
      if (!amount) {
        if (residue <= 0) return BigNum.fromInt(1);
        const log10 = Math.log10(residue);
        const power = log10 / 3;
        if (power <= 0) return BigNum.fromInt(1);
        const log10Result = power * Math.log10(2);
        return bigNumFromLog10(log10Result);
      }

      if (amount.isInfinite?.()) return BigNum.fromAny('Infinity');

      const log10Bn = approxLog10BigNum(amount);
      let finalLog10 = log10Bn;

      if (!Number.isFinite(log10Bn)) {
         if (residue > 0) {
            finalLog10 = Math.log10(residue);
         } else {
            return BigNum.fromInt(1);
         }
      } else if (log10Bn < 15 && residue > 0) {
         try {
             const val = Number(amount.toPlainIntegerString());
             if (Number.isFinite(val)) {
                 const total = val + residue;
                 if (total > 0) {
                     finalLog10 = Math.log10(total);
                 }
             }
         } catch {}
      }
      
      // Formula: 2 ^ (log10(amount) / 6)
      const power = finalLog10 / 6;
      if (power <= 0) return BigNum.fromInt(1);
      
      // 2^power = 10^(power * log10(2))
      const log10Result = power * Math.log10(2);
      return bigNumFromLog10(log10Result);
  };

  const c = calc(bank.coins?.value);
  
  let bookVal = bank.books?.value;
  let bookResidue = 0;
  if (typeof window !== 'undefined' && typeof window.__bookResidue === 'number') {
      bookResidue = window.__bookResidue;
  }
  const b = calc(bookVal, bookResidue);
  
  const g = calc(bank.gold?.value);
  const m = calc(bank.magic?.value);
  
  let cOut = c, bOut = b, gOut = g, mOut = m;

  if (isSurgeActive(8)) {
    cOut = applyTsunamiNerf(c);
    bOut = applyTsunamiNerf(b);
    gOut = applyTsunamiNerf(g);
    mOut = applyTsunamiNerf(m);
  }

  let total = cOut.mulBigNumInteger ? cOut.mulBigNumInteger(bOut) : cOut; 
  total = total.mulBigNumInteger ? total.mulBigNumInteger(gOut) : total;
  total = total.mulBigNumInteger ? total.mulBigNumInteger(mOut) : total;
  
  return {
      coins: cOut,
      books: bOut,
      gold: gOut,
      magic: mOut,
      total
  };
}

export function getBookProductionRate() {
  if (!isSurgeActive(3)) return BigNum.fromInt(0);
  
  // Formula: max(1, floor(1 * exp(0.20 * xp_level)))
  const xpState = getXpState();
  const xpLevelBn = xpState.xpLevel;
  
  let baseRate;
  if (xpLevelBn.isInfinite?.()) {
     baseRate = BigNum.fromAny('Infinity');
  } else {
     // BigNum-safe logic for 10^(0.086... * xpLevel)
     if (xpLevelBn.cmp(1e16) > 0) {
         // Exponent E = floor(xpLevel * 0.086858...)
         // We can calculate this using BigNum math.
         const logValBn = xpLevelBn.mulDecimal(String(LOG10_EXP_0_2), 18);
         
         // Extract E from logValBn
         // logValBn is roughly the exponent of 10. 
         if (logValBn.cmp(Number.MAX_VALUE) >= 0) {
             baseRate = BigNum.fromAny('Infinity');
         } else {
             try {
                // If logValBn is finite and within Number range, use it for bigNumFromLog10
                const logValNum = Number(logValBn.toScientific());
                if (logValNum === Infinity || !Number.isFinite(logValNum)) {
                    baseRate = BigNum.fromAny('Infinity');
                } else {
                    baseRate = bigNumFromLog10(logValNum);
                }
             } catch {
                 baseRate = BigNum.fromAny('Infinity');
             }
         }
     } else {
         const lvlNum = Number(xpLevelBn.toPlainIntegerString());
         const logVal = lvlNum * LOG10_EXP_0_2;
         baseRate = bigNumFromLog10(logVal);
     }
  }

  // Ensure min 1
  if (baseRate.cmp(1) < 0) baseRate = BigNum.fromInt(1);

  // Apply multipliers
  if (bank.books?.mult) {
    const mult = bank.books.mult.get();
    baseRate = baseRate.mulBigNumInteger(mult);
  }

  if (isSurgeActive(8)) {
    baseRate = applyTsunamiNerf(baseRate);
  }

  return baseRate;
}

function onTick(dt) {
  if (isSurgeActive(14)) {
      updateCombo(dt);
  }

  if (isSurgeActive(3)) {
      if (!bookRateAccumulator) {
        bookRateAccumulator = new RateAccumulator('books', bank);
      }

      const baseRate = getBookProductionRate();

      // Accumulate
      if (baseRate.cmp(1e9) > 0 || baseRate.isInfinite?.()) {
          // Direct add per tick for large numbers, using dt
          // dt might be > 0.05 if lag occurs, but usually 0.05
          const perTick = baseRate.mulDecimal(String(dt), 18);
          if (bank.books) bank.books.add(perTick);
      } else {
          // Use accumulator for small numbers to handle fractional accumulation
          const rateNum = Number(baseRate.toScientific());
          // RateAccumulator expects amount per second
          // We manually update it with variable dt support by bypassing addRate 
          // if RateAccumulator isn't dt-aware, but here we can just do manual accumulation for consistency
          // or assume addRate is fixed step.
          // Ideally we should modify RateAccumulator to take dt, or manually implement it here.
          // Let's implement manual accumulation here for safety and precision.
          
          if (!window.__bookResidue) window.__bookResidue = 0;
          window.__bookResidue += rateNum * dt;

          if (window.__bookResidue > 0) {
            try { window.dispatchEvent(new CustomEvent('surge:bookResidue')); } catch {}
          }

          if (window.__bookResidue >= 1) {
              const whole = Math.floor(window.__bookResidue);
              window.__bookResidue -= whole;
              if (bank.books) bank.books.add(BigNum.fromInt(whole));
          }
      }
  }

  if (isSurgeActive(13)) {
      const effectiveNerf = getEffectiveTsunamiNerf();
      const mapped = effectiveNerf * 1.5 - 0.5;
      
      const log10Rate = 2 * mapped - 2;
      const rateMultiplier = bigNumFromLog10(log10Rate);
      
      const coins = bank.coins?.value;
      const xpState = getXpState();
      
      // Calculate pending Gold (base)
      const basePending = computeForgeGoldFromInputs(coins, xpState.xpLevel);
      
      // Apply multipliers
      // 1. Bank Gold multiplier
      let pending = bank.gold?.mult?.applyTo?.(basePending) ?? basePending;
      
      // 2. Lab Gold multiplier
      const labMult = getLabGoldMultiplier();
      pending = pending.mulDecimal(labMult.toScientific());
      
      // Multiply by rate and dt
      const perSec = pending.mulDecimal(rateMultiplier.toScientific());
      const amountToAdd = perSec.mulDecimal(String(dt), 18);
      
      if (bank.gold) bank.gold.add(amountToAdd);
  }

  if (isSurgeActive(16)) {
      const effectiveNerf = getEffectiveTsunamiNerf();
      const mapped = effectiveNerf * 1.5 - 0.5;
      
      const log10Rate = 2 * mapped - 2;
      const rateMultiplier = bigNumFromLog10(log10Rate);
      
      const coins = bank.coins?.value;
      const cumulativeMp = getTotalCumulativeMp();
      
      const pending = computeInfuseMagicFromInputs(coins, cumulativeMp);
      
      // Multiply by rate and dt
      const perSec = pending.mulDecimal(rateMultiplier.toScientific());
      const amountToAdd = perSec.mulDecimal(String(dt), 18);
      
      if (bank.magic) bank.magic.add(amountToAdd);
  }
}

function loadTsunamiNerf(slot) {
  if (slot == null) return;
  const stored = localStorage.getItem(TSUNAMI_NERF_KEY(slot));
  if (stored !== null) {
      tsunamiNerfExponent = Number(stored);
      // Ensure validity on load
      if (Number.isNaN(tsunamiNerfExponent) || !Number.isFinite(tsunamiNerfExponent)) {
          tsunamiNerfExponent = isSurgeActive(8) ? 0.00 : 1.00;
      }
  } else {
      // Default behavior if not stored
      if (isSurgeActive(8)) {
          tsunamiNerfExponent = 0.00;
      } else {
          tsunamiNerfExponent = 1.00;
      }
  }
}

function compareSurgeLevels(prev, curr) {
  const isInfPrev = prev === Infinity || (typeof prev === 'string' && prev === 'Infinity') || prev === Number.POSITIVE_INFINITY;
  const isInfCurr = curr === Infinity || (typeof curr === 'string' && curr === 'Infinity') || curr === Number.POSITIVE_INFINITY;
  
  if (isInfPrev && isInfCurr) return 0;
  if (isInfCurr) return 1;
  if (isInfPrev) return -1;
  
  let p = BigInt(0);
  let c = BigInt(0);
  try { p = typeof prev === 'bigint' ? prev : BigInt(prev); } catch {}
  try { c = typeof curr === 'bigint' ? curr : BigInt(curr); } catch {}
  
  if (c > p) return 1;
  if (c < p) return -1;
  return 0;
}

export function initSurgeEffects() {
  initComboSystem(() => isSurgeActive(14) && (getTsunamiNerf() + getTsunamiResearchBonus() < 1.0));

  const slot = getActiveSlot();
  // Update multiplier first to ensure cachedSurgeLevel is set,
  // allowing isSurgeActive(8) to return the correct state for loadTsunamiNerf default logic.
  updateMultiplier();
  loadTsunamiNerf(slot);
  // Update multiplier again to apply the loaded nerf value.
  updateMultiplier();

  if (typeof window !== 'undefined') {
    window.addEventListener('surge:level:change', () => {
      const prevLevel = cachedSurgeLevel;
      const wasActive = isSurgeActive(8);
      
      updateMultiplier();
      
      const currLevel = cachedSurgeLevel;
      const isActive = isSurgeActive(8);

      if (!wasActive && isActive) {
          setTsunamiNerf(0.00);
          if (!getTsunamiSequenceSeen()) {
              setTsunamiSequenceSeen(true);
          }
      } else if (isActive) {
          // If already active, check if level increased
          if (compareSurgeLevels(prevLevel, currLevel) > 0) {
              setTsunamiNerf(0.00);
              if (!getTsunamiSequenceSeen()) {
                  setTsunamiSequenceSeen(true);
              }
          }
      } else if (wasActive && !isActive) {
          setTsunamiNerf(1.00);
      }
    });

    window.addEventListener('lab:node:change', () => {
        updateMultiplier();
    });

    window.addEventListener('saveSlot:change', () => {
      loadTsunamiNerf(getActiveSlot());
      updateMultiplier();
    });
    
    // Listen for DNA changes to update dynamic multipliers
    window.addEventListener('currency:change', (e) => {
        if (e.detail?.key === 'dna') {
            try { refreshCoinMultiplierFromXpLevel(); } catch {}
            try { syncCurrencyMultipliersFromUpgrades(); } catch {}
        }
    });
  }

  addExternalCoinMultiplierProvider(({ baseMultiplier }) => {
    if (currentMultiplier.cmp(BigNum.fromInt(1)) === 0) return baseMultiplier;
    return baseMultiplier.mulBigNumInteger(currentMultiplier);
  });

  addExternalXpGainMultiplierProvider(({ baseGain }) => {
    if (currentMultiplier.cmp(BigNum.fromInt(1)) === 0) return baseGain;
    return baseGain.mulBigNumInteger(currentMultiplier);
  });

  addExternalMutationGainMultiplierProvider(({ baseGain }) => {
    if (currentMultiplier.cmp(BigNum.fromInt(1)) === 0) return baseGain;
    return baseGain.mulBigNumInteger(currentMultiplier);
  });

  addExternalMutationGainMultiplierProvider(({ baseGain }) => {
    if (!isSurgeActive(4)) return baseGain;
    let mult = BigNum.fromInt(4.444e12);
    if (isSurgeActive(8)) {
        const effective = getEffectiveTsunamiNerf();

        const logVal = Math.log10(4.444e12);
        mult = bigNumFromLog10(logVal * effective);
    }
    return baseGain.mulBigNumInteger(mult);
  });

  addExternalCoinMultiplierProvider(({ baseMultiplier }) => {
    if (!isSurgeActive(6)) return baseMultiplier;
    const wealth = getSurge6WealthMultipliers();
    if (wealth.total.cmp(1) <= 0) return baseMultiplier;
    return baseMultiplier.mulBigNumInteger(wealth.total);
  });

  addExternalCoinMultiplierProvider(({ baseMultiplier }) => {
    if (!isSurgeActive(15)) return baseMultiplier;
    
    let result = baseMultiplier;
    
    const mult = getSurge15Multiplier();
    if (mult.cmp(1) > 0) {
        result = result.mulBigNumInteger(mult);
    }
    
    const div = getSurge15Divisor();
    if (div.cmp(1) > 0) {
        result = result.div(div);
    }
    
    return result;
  });
  
  // Surge 17 (Div 1e5) and Surge 18 (Mul 1e15) for Coins
  addExternalCoinMultiplierProvider(({ baseMultiplier }) => {
    let log10Total = 0;
    
    // Surge 17: Divide by 1e5 -> -5
    if (isSurgeActive(17)) {
        log10Total -= 5;
    }
    
    // Surge 18: Multiply by 1e15 -> +15
    if (isSurgeActive(18)) {
        log10Total += 15;
    }
    
    if (log10Total === 0) return baseMultiplier;
    
    if (isSurgeActive(8)) {
        const effective = getEffectiveTsunamiNerf();
        log10Total *= effective;
    }
    
    const mult = bigNumFromLog10(log10Total);
    return baseMultiplier.mulBigNumInteger(mult);
  });
  
  // Surge 3: Disable flat Book reward
  setExternalBookRewardProvider(({ baseReward }) => {
     if (isSurgeActive(3)) {
         return BigNum.fromInt(0);
     }
     return baseReward;
  });

  registerTick(onTick);
}

export function getSurgeMagicMultiplier() {
    let log10Total = 0;
    
    if (isSurgeActive(17)) {
        log10Total += 15;
    }
    
    if (isSurgeActive(18)) {
        log10Total -= 5;
    }
    
    if (isSurgeActive(8)) {
        const effective = getEffectiveTsunamiNerf();
        log10Total *= effective;
    }
    
    let result = BigNum.fromInt(1);
    if (log10Total !== 0) {
        result = bigNumFromLog10(log10Total);
    }

    if (isSurgeActive(15)) {
        const div = getSurge15Divisor();
        if (div.cmp(1) > 0) {
            result = result.div(div);
        }
    }
    
    return result;
}
