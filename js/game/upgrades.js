// js/game/upgrades.js

import { bank, getActiveSlot } from '../util/storage.js';
import { BigNum } from '../util/bigNum.js';
import { formatNumber } from '../util/numFormat.js';
import { unlockXpSystem } from './xpSystem.js';

export const MAX_LEVEL_DELTA = BigNum.INF || BigNum.fromAny('1e100000000'); 

export function approxLog10BigNum(value) {
  if (!(value instanceof BigNum)) {
    try {
      value = BigNum.fromAny(value ?? 0);
    } catch {
      return Number.NEGATIVE_INFINITY;
    }
  }
  if (!value) return Number.NEGATIVE_INFINITY;
  if (value.isZero?.()) return Number.NEGATIVE_INFINITY;
  if (value.isInfinite?.()) return Number.POSITIVE_INFINITY;
  let storage;
  try {
    storage = value.toStorage();
  } catch {
    return Number.NEGATIVE_INFINITY;
  }
  const parts = storage.split(':');
  const sigStr = parts[2] ?? '0';
  let expPart = parts[3] ?? '0';
  let offsetStr = '0';
  const caret = expPart.indexOf('^');
  if (caret >= 0) {
    offsetStr = expPart.slice(caret + 1) || '0';
    expPart = expPart.slice(0, caret) || '0';
  }
  const baseExp = Number(expPart || '0');
  const offset = Number(offsetStr || '0');
  const sigNum = Number(sigStr || '0');
  if (!Number.isFinite(sigNum) || sigNum <= 0) return Number.NEGATIVE_INFINITY;
  const expSum = (Number.isFinite(baseExp) ? baseExp : 0) + (Number.isFinite(offset) ? offset : 0);
  return Math.log10(sigNum) + expSum;
}

export function bigNumFromLog10(log10Value) {
  if (!Number.isFinite(log10Value)) {
    return log10Value > 0 ? BigNum.fromAny('Infinity') : BigNum.fromInt(0);
  }
  if (log10Value <= -1e12) return BigNum.fromInt(0);
  const p = BigNum.DEFAULT_PRECISION;
  let intPart = Math.floor(log10Value);
  let frac = log10Value - intPart;
  if (frac < 0) {
    frac += 1;
    intPart -= 1;
  }
  const mantissa = Math.pow(10, frac + (p - 1));
  const sig = BigInt(Math.max(1, Math.round(mantissa)));
  const exp = intPart - (p - 1);
  return new BigNum(sig, exp, p);
}

function ensureLevelBigNum(value) {
  try {
    const bn = value instanceof BigNum ? value : BigNum.fromAny(value ?? 0);
    if (bn.isInfinite?.()) return bn.clone?.() ?? bn;
    const plain = bn.toPlainIntegerString?.();
    if (plain === 'Infinity') return BigNum.fromAny('Infinity');
    if (!plain) return BigNum.fromInt(0);
    const normalized = plain.replace(/^0+(?=\d)/, '');
    if (!normalized) return BigNum.fromInt(0);
    return BigNum.fromAny(normalized);
  } catch {
    const num = Math.max(0, Math.floor(Number(value) || 0));
    return BigNum.fromInt(num);
  }
}

function levelBigNumToNumber(value) {
  let bn;
  try {
    bn = value instanceof BigNum ? value : BigNum.fromAny(value ?? 0);
  } catch {
    return 0;
  }

  if (bn.isInfinite?.()) {
    return Number.POSITIVE_INFINITY;
  }

  try {
    const plain = bn.toPlainIntegerString?.();
    if (!plain || plain === 'Infinity') {
      return plain === 'Infinity' ? Number.MAX_VALUE : 0;
    }

    const digits = plain.replace(/^0+/, '');
    if (!digits) return 0;

    if (digits.length <= 15) {
      const num = Number(digits);
      return Number.isFinite(num) ? num : 0;
    }

    const lead = digits.slice(0, 15);
    const leadNum = Number(lead);
    const leadLen = lead.length;
    if (!Number.isFinite(leadNum) || leadNum <= 0) return 0;

    let mantissa = leadNum / Math.pow(10, leadLen - 1);
    let exponent = digits.length - 1;

    if (mantissa <= 0 || !Number.isFinite(mantissa)) return 0;

    if (mantissa >= 10) {
      const shift = Math.floor(Math.log10(mantissa));
      if (Number.isFinite(shift) && shift > 0) {
        mantissa /= Math.pow(10, shift);
        exponent += shift;
      }
    } else if (mantissa < 1) {
      const shift = Math.ceil(Math.log10(1 / mantissa));
      if (Number.isFinite(shift) && shift > 0) {
        mantissa *= Math.pow(10, shift);
        exponent -= shift;
      }
    }

    if (exponent > 308) {
      return Number.MAX_VALUE;
    }
    if (exponent < -324) {
      return 0;
    }

    const approx = mantissa * Math.pow(10, exponent);
    if (!Number.isFinite(approx)) {
      return exponent > 0 ? Number.MAX_VALUE : 0;
    }
    return approx;
  } catch {
    const approx = approxLog10BigNum(bn);
    if (!Number.isFinite(approx)) return Number.MAX_VALUE;
    if (approx > 308) return Number.MAX_VALUE;
    if (approx < -324) return 0;
    const value = Math.pow(10, approx);
    return Number.isFinite(value) ? value : Number.MAX_VALUE;
  }
}

const LN10 = Math.log(10);

function decimalMultiplierString(value) {
  if (!Number.isFinite(value) || value <= 0) return '1';
  let out = value.toFixed(12);
  out = out.replace(/0+$/, '');
  if (out.endsWith('.')) out += '0';
  return out;
}

const DEFAULT_SCALING_PRESETS = {
  STANDARD(upg) {
    const upgType = `${upg?.upgType ?? ''}`.toUpperCase();
    if (upgType === 'HM') {
      const evol = Number.isFinite(Number(upg?.numUpgEvolutions))
        ? Number(upg.numUpgEvolutions)
        : 0;
      return 1.25 + (0.05 * evol);
    }
    return 1.20;
  },
  HM(upg) {
    return DEFAULT_SCALING_PRESETS.STANDARD(upg);
  },
  NM() {
    return 1.20;
  },
};

function resolveDefaultScalingRatio(upg) {
  if (!upg) return null;

  const tryPreset = (name) => {
    const presetName = `${name ?? ''}`.toUpperCase();
    if (!presetName) return null;
    const presetFn = DEFAULT_SCALING_PRESETS[presetName];
    if (typeof presetFn !== 'function') return null;
    const ratio = presetFn(upg);
    if (!Number.isFinite(ratio) || ratio <= 0) return null;
    return { ratio, preset: presetName };
  };

  return (
    tryPreset(upg.scalingPreset)
    || tryPreset(upg.upgType)
    || tryPreset('STANDARD')
  );
}

function ensureUpgradeScaling(upg) {
  if (!upg) return null;
  if (upg.scaling && upg.scaling.baseBn) return upg.scaling;
  try {
    const baseBn = BigNum.fromAny(upg.baseCost ?? upg.baseCostBn ?? 0);

    const providedScaling = upg.scaling ?? {};
    let ratio = Number(providedScaling.ratio);
    if (!(ratio > 0) || !Number.isFinite(ratio)) ratio = null;

    let ratioStr = typeof providedScaling.ratioStr === 'string'
      ? providedScaling.ratioStr.trim()
      : '';
    if (!ratio && ratioStr) {
      const parsed = Number(ratioStr);
      if (Number.isFinite(parsed) && parsed > 0) {
        ratio = parsed;
      }
    }

    let ratioLog10 = Number(providedScaling.ratioLog10);
    if (!Number.isFinite(ratioLog10)) ratioLog10 = null;
    if (!ratio && ratioLog10 != null) {
      const pow = Math.pow(10, ratioLog10);
      if (Number.isFinite(pow) && pow > 0) ratio = pow;
    }

    let ratioLn = Number(providedScaling.ratioLn);
    if (!Number.isFinite(ratioLn)) ratioLn = null;
    if (!ratio && ratioLn != null) {
      const exp = Math.exp(ratioLn);
      if (Number.isFinite(exp) && exp > 0) ratio = exp;
    }

    if (!ratio) {
      const ratioMinus1 = Number(providedScaling.ratioMinus1);
      if (Number.isFinite(ratioMinus1) && ratioMinus1 > 0) {
        ratio = ratioMinus1 + 1;
      }
    }

    let defaultPreset = null;
    if (!ratio) {
      const resolved = resolveDefaultScalingRatio(upg);
      if (resolved) {
        ratio = resolved.ratio;
        defaultPreset = resolved.preset;
      }
    }

    ratio = Math.max(1.0001, Number.isFinite(ratio) ? ratio : 1.0001);
    ratioStr = decimalMultiplierString(ratio);
    ratioLog10 = Math.log10(ratio);
    ratioLn = Math.log(ratio);
    const ratioMinus1 = Math.max(1e-6, ratio - 1);
    const baseLog10 = approxLog10BigNum(baseBn);

    const scaling = Object.assign({}, providedScaling, {
      baseBn,
      baseLog10,
      ratio,
      ratioMinus1,
      ratioLog10,
      ratioLn,
      ratioStr,
      defaultPreset: defaultPreset ?? providedScaling.defaultPreset,
    });
    upg.scaling = scaling;
    return scaling;
  } catch {
    return null;
  }
}

// Replace your entire costAtLevelUsingScaling with this
function costAtLevelUsingScaling(upg, level) {
  const scaling = ensureUpgradeScaling(upg);
  if (!scaling) return BigNum.fromInt(0);
  const lvl = Math.max(0, Math.floor(Number(level) || 0));
  if (lvl === 0) return BigNum.fromAny(scaling.baseBn);

  // Approach A (robust & simple): multiply without flooring, floor once at end
  if (lvl <= 100) {
    let price = BigNum.fromAny(scaling.baseBn);
    for (let i = 0; i < lvl; i += 1) {
      // precise decimal multiply (no truncation each step)
      price = price.mulDecimal(scaling.ratioStr);
    }
    return price.floorToInteger();
  }

  // Existing mid-range anchor + tail (kept as-is)
  if (lvl < 10000) {
    const anchor = Math.max(0, lvl - 10);
    let price = bigNumFromLog10(scaling.baseLog10 + anchor * scaling.ratioLog10);
    for (let step = anchor; step < lvl; step += 1) {
      price = price.mulDecimal(scaling.ratioStr);
    }
    return price.floorToInteger();
  }

  // Very large levels: closed form via logs
  return bigNumFromLog10(scaling.baseLog10 + lvl * scaling.ratioLog10).floorToInteger();
}


function logExpMinus1(x) {
  if (!Number.isFinite(x)) return x;
  if (x < 1e-6) {
    return Math.log(Math.expm1(x));
  }
  if (x < 50) {
    return Math.log(Math.expm1(x));
  }
  const negExp = Math.exp(-x);
  return x + Math.log1p(-negExp);
}

function logSeriesTotal(upg, startLevel, count) {
  if (!(count > 0)) return Number.NEGATIVE_INFINITY;
  const scaling = ensureUpgradeScaling(upg);
  if (!scaling) return Number.NEGATIVE_INFINITY;
  if (!(scaling.ratioMinus1 > 0) || !Number.isFinite(scaling.ratioLn)) {
    return Number.POSITIVE_INFINITY;
  }

  const startLn = (scaling.baseLog10 * LN10) + (startLevel * scaling.ratioLn);
  const growth = scaling.ratioLn * count;
  const numerLn = logExpMinus1(growth);
  if (!Number.isFinite(numerLn)) return Number.POSITIVE_INFINITY;
  const denomLn = Math.log(scaling.ratioMinus1);
  const totalLn = startLn + numerLn - denomLn;
  return totalLn / LN10;
}

function totalCostBigNum(upg, startLevel, count) {
  if (!(count > 0)) return BigNum.fromInt(0);
  const scaling = ensureUpgradeScaling(upg);
  if (!scaling) return BigNum.fromInt(0);
  const targetLevel = startLevel + count;

  if (targetLevel <= 100) {
    let price = BigNum.fromAny(upg.costAtLevel(startLevel));
    let total = BigNum.fromInt(0);
    for (let i = 0; i < count; i += 1) {
      total = total.add(price);
      if (i + 1 < count) price = price.mulDecimalFloor(scaling.ratioStr);
    }
    return total;
  }

  if (targetLevel < 10000) {
    const tailCount = Math.min(10, count);
    const headCount = count - tailCount;
    let total = BigNum.fromInt(0);
    if (headCount > 0) {
      const headLog = logSeriesTotal(upg, startLevel, headCount);
      total = total.add(bigNumFromLog10(headLog));
    }
    if (tailCount > 0) {
      const tailStart = startLevel + headCount;
      let price = BigNum.fromAny(upg.costAtLevel(tailStart));
      for (let i = 0; i < tailCount; i += 1) {
        total = total.add(price);
        if (i + 1 < tailCount) price = price.mulDecimalFloor(scaling.ratioStr);
      }
    }
    return total;
  }

  const totalLog = logSeriesTotal(upg, startLevel, count);
  return bigNumFromLog10(totalLog);
}

function log10OnePlusPow10(exponent) {
  if (!Number.isFinite(exponent)) {
    if (exponent > 0) return exponent;
    if (exponent === 0) return Math.log10(2);
    return 0;
  }
  if (exponent > 308) return exponent;
  if (exponent < -20) {
    const pow = Math.pow(10, exponent);
    return pow / LN10;
  }
  const pow = Math.pow(10, exponent);
  if (!Number.isFinite(pow)) return exponent > 0 ? exponent : 0;
  return Math.log1p(pow) / LN10;
}

function calculateBulkPurchase(upg, startLevel, walletBn, maxLevels = MAX_LEVEL_DELTA, options = {}) {
  const scaling = ensureUpgradeScaling(upg);
  const zero = BigNum.fromInt(0);
  const opts = options || {};
  const fastOnly = !!opts.fastOnly;
  if (!scaling) {
    return { count: zero, spent: zero, nextPrice: zero, numericCount: 0 };
  }

  const startLevelNum = Math.max(0, Math.floor(levelBigNumToNumber(startLevel)));

  const cap = Number.isFinite(upg.lvlCap)
    ? Math.max(0, Math.floor(upg.lvlCap))
    : Infinity;
  const maxLevelsNum = typeof maxLevels === 'number'
    ? maxLevels
    : levelBigNumToNumber(maxLevels);
  const capRoom = Number.isFinite(cap) ? Math.max(0, cap - startLevelNum) : MAX_LEVEL_DELTA;
  let room = Number.isFinite(maxLevelsNum)
    ? Math.max(0, Math.floor(maxLevelsNum))
    : MAX_LEVEL_DELTA;
  room = Math.min(room, MAX_LEVEL_DELTA, capRoom);
  if (!(room > 0)) {
    const nextPrice = capRoom <= 0 ? zero : BigNum.fromAny(upg.costAtLevel(startLevelNum));
    return { count: zero, spent: zero, nextPrice, numericCount: 0 };
  }

  const walletLog = approxLog10BigNum(walletBn);
  if (!Number.isFinite(walletLog)) {
    const nextPrice = BigNum.fromAny(upg.costAtLevel(startLevelNum));
    return { count: zero, spent: zero, nextPrice, numericCount: 0 };
  }

  const firstPrice = BigNum.fromAny(upg.costAtLevel(startLevelNum));
  if (walletBn.cmp(firstPrice) < 0) {
    return { count: zero, spent: zero, nextPrice: firstPrice, numericCount: 0 };
  }

  const ratioLog10 = scaling.ratioLog10;
  const ratioMinus1 = scaling.ratioMinus1;
  if (!(ratioLog10 > 0) || !(ratioMinus1 > 0)) {
    return { count: zero, spent: zero, nextPrice: firstPrice, numericCount: 0 };
  }

  const ratioMinus1Log = Math.log10(ratioMinus1);
  if (!Number.isFinite(ratioMinus1Log)) {
    return { count: zero, spent: zero, nextPrice: firstPrice, numericCount: 0 };
  }

  const limit = Number.isFinite(room)
    ? Math.max(0, Math.floor(room))
    : Number.MAX_VALUE;

  const startPriceLog = scaling.baseLog10 + (startLevelNum * ratioLog10);
  const logTarget = log10OnePlusPow10(walletLog + ratioMinus1Log - startPriceLog);
  let approxCount = logTarget / ratioLog10;
  if (!Number.isFinite(approxCount) || approxCount < 0) approxCount = 0;

  let count = Math.floor(Math.min(limit, approxCount));
  if (!Number.isFinite(count)) count = limit;
  if (count <= 0) count = 1;

  const EPS = 1e-9;
  let spentLog = logSeriesTotal(upg, startLevelNum, count);
  let tuneSteps = 0;
  const MAX_TUNE_STEPS = 2048;

  while (count > 0 && (!Number.isFinite(spentLog) || spentLog > walletLog + EPS) && tuneSteps < MAX_TUNE_STEPS) {
    const overshoot = Number.isFinite(spentLog)
      ? Math.max(1, Math.ceil((spentLog - walletLog) / Math.max(ratioLog10, 1e-12)))
      : Math.max(1, Math.floor(count / 2));
    count = Math.max(0, count - overshoot);
    spentLog = count > 0 ? logSeriesTotal(upg, startLevelNum, count) : Number.NEGATIVE_INFINITY;
    tuneSteps += 1;
  }

  if (count <= 0 || !Number.isFinite(count)) {
    return { count: zero, spent: zero, nextPrice: firstPrice, numericCount: 0 };
  }

  if (count < limit) {
    let step = Math.max(1, Math.floor(Math.max(count, 1) * 0.5));
    while (count < limit && tuneSteps < MAX_TUNE_STEPS) {
      const candidate = Math.min(limit, count + step);
      if (candidate === count) break;
      const candidateLog = logSeriesTotal(upg, startLevelNum, candidate);
      if (Number.isFinite(candidateLog) && candidateLog <= walletLog + EPS) {
        count = candidate;
        spentLog = candidateLog;
        step = Math.min(Math.max(1, step * 2), Math.max(1, Math.floor(Math.max(count, 1) * 0.5)));
      } else {
        if (step === 1) break;
        step = Math.max(1, Math.floor(step / 2));
      }
      tuneSteps += 1;
      if (step === 1) break;
    }

    while (count < limit && tuneSteps < MAX_TUNE_STEPS) {
      const next = count + 1;
      if (next > limit) break;
      const nextLog = logSeriesTotal(upg, startLevelNum, next);
      if (Number.isFinite(nextLog) && nextLog <= walletLog + EPS) {
        count = next;
        spentLog = nextLog;
      } else {
        break;
      }
      tuneSteps += 1;
    }
  }

  let spent = null;
  if (!fastOnly) {
    spent = totalCostBigNum(upg, startLevelNum, count);
    while (spent.cmp(walletBn) > 0 && count > 0) {
      count -= 1;
      spent = totalCostBigNum(upg, startLevelNum, count);
    }
    if (count <= 0) {
      return { count: zero, spent: zero, nextPrice: firstPrice, numericCount: 0 };
    }
  }

  const finalLevel = startLevelNum + count;
  const atCap = Number.isFinite(cap) && finalLevel >= cap;
  const nextPrice = atCap || fastOnly
    ? zero
    : BigNum.fromAny(upg.costAtLevel(finalLevel));
  const countBn = BigNum.fromAny(count.toString());
  return {
    count: countBn,
    spent,
    nextPrice,
    numericCount: count,
  };
}

function computeBulkMeta(upg) {
  try {
    const basePrice = BigNum.fromAny(upg.costAtLevel(0));
    const nextPrice = BigNum.fromAny(
      typeof upg.nextCostAfter === 'function'
        ? upg.nextCostAfter(basePrice, 1)
        : upg.costAtLevel(1)
    );
    const logBase = approxLog10BigNum(basePrice);
    const logNext = approxLog10BigNum(nextPrice);
    if (!Number.isFinite(logBase) || !Number.isFinite(logNext)) return null;
    const ratioLog = logNext - logBase;
    if (!Number.isFinite(ratioLog) || ratioLog <= 0) return null;
    const ratio = Math.pow(10, ratioLog);
    if (!Number.isFinite(ratio) || ratio <= 1) return null;
    const denom = ratio - 1;
    if (!(denom > 0) || !Number.isFinite(denom)) return null;
    return {
      ratio,
      ratioLog,
      logDenom: Math.log10(denom),
    };
  } catch {
    return null;
  }
}

export function estimateGeometricBulk(priceBn, walletBn, meta, maxLevels) {
  if (!meta || maxLevels <= 0) return { count: 0 };
  const walletLog = approxLog10BigNum(walletBn);
  const priceLog = approxLog10BigNum(priceBn);
  if (!Number.isFinite(walletLog) || !Number.isFinite(priceLog)) return { count: 0 };
  if (walletLog < priceLog) return { count: 0 };

  const numerator = walletLog - priceLog + meta.logDenom;
  if (!Number.isFinite(numerator) || numerator <= 0) return { count: 0 };

  let hi = Math.floor(numerator / meta.ratioLog);
  if (!Number.isFinite(hi) || hi <= 0) return { count: 0 };
  hi = Math.min(hi, maxLevels);
  if (hi <= 0) return { count: 0 };

  let lo = 0;
  let hiBound = hi;
  for (let iter = 0; iter < 64 && lo < hiBound; iter += 1) {
    const mid = Math.max(0, Math.floor((lo + hiBound + 1) / 2));
    const spentLog = priceLog + mid * meta.ratioLog - meta.logDenom;
    if (spentLog <= walletLog) {
      lo = mid;
    } else {
      hiBound = mid - 1;
    }
  }

  const best = Math.min(lo, maxLevels);
  if (best <= 0) return { count: 0 };
  const spentLog = priceLog + best * meta.ratioLog - meta.logDenom;
  if (spentLog > walletLog) return { count: 0 };
  const nextPriceLog = priceLog + best * meta.ratioLog;
  const spent = bigNumFromLog10(spentLog);
  const nextPrice = bigNumFromLog10(nextPriceLog);
  return {
    count: best,
    spent,
    nextPrice,
    spentLog,
    nextPriceLog,
  };
}

function toUpgradeBigNum(value, fallback) {
  try {
    return BigNum.fromAny(value ?? fallback ?? 0);
  } catch {
    return BigNum.fromAny(fallback ?? 0);
  }
}

function levelCapToNumber(bn) {
  if (!(bn instanceof BigNum)) return Infinity;
  if (bn.isInfinite?.()) return Infinity;
  try {
    const plain = bn.toPlainIntegerString();
    if (plain === 'Infinity') return Infinity;
    if (!plain) return 0;
    if (plain.length > 15) return Number.MAX_SAFE_INTEGER;
    const num = Number(plain);
    if (!Number.isFinite(num)) return Number.MAX_SAFE_INTEGER;
    return Math.max(0, Math.floor(num));
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

function formatBigNumAsHtml(bn) {
  return formatNumber(bn instanceof BigNum ? bn : BigNum.fromAny(bn ?? 0));
}

function formatBigNumAsPlain(bn) {
  return formatBigNumAsHtml(bn).replace(/<[^>]*>/g, '');
}

function nmCostBN(upg, level) {
  return costAtLevelUsingScaling(upg, level);
}

export const AREA_KEYS = {
  STARTER_COVE: 'starter_cove',
};

/**
 * upgType:
 *  - "NM" = No Milestones (numUpgEvolutions = 0)
 *  - "HM" = Has Milestones
 *
 * Optional fields:
 *  - scalingPreset: string key referencing DEFAULT_SCALING_PRESETS for custom defaults
 */
const REGISTRY = [
  {
    area: AREA_KEYS.STARTER_COVE,
    id: 1,
    title: "Faster Coins",
    desc: "Increases coin spawn rate by +10% per level",
    lvlCap: 10,
    baseCost: 10,
    costType: "coins",
    upgType: "NM",
    icon: "faster_coins_id_1.png",
    costAtLevel(level) {
      return nmCostBN(this, level);
    },
    nextCostAfter(_, nextLevel) {
      return nmCostBN(this, nextLevel);
    },
    effectSummary(level) {
      const pct = level * 10;
      return `Coins/second: +${pct}%`;
    },
    effectMultiplier(level) {
      return 1 + (0.10 * level);
    }
  },
  {
    area: AREA_KEYS.STARTER_COVE,
    id: 2,
    title: "Unlock XP",
    desc: "Unlocks the XP system and a new merchant dialogue",
    lvlCap: 1,
    baseCost: 100,
    costType: "coins",
    upgType: "NM",
    icon: "unlock_xp_id_2.png",
    costAtLevel(level) {
      return nmCostBN(this, level);
    },
    nextCostAfter(_, nextLevel) {
      return nmCostBN(this, nextLevel);
    },
    effectSummary(level) {
      return level >= 1
        ? 'XP System unlocked'
        : 'Unlocks the XP HUD and XP levels';
    },
    onLevelChange({ newLevel, newLevelBn }) {
      const reached = Number.isFinite(newLevel)
        ? newLevel >= 1
        : (newLevelBn?.cmp?.(BigNum.fromInt(1)) ?? -1) >= 0;
      if (reached) {
        try { unlockXpSystem(); } catch {}
      }
    },
  },
];

for (const upg of REGISTRY) {
  upg.baseCost = toUpgradeBigNum(upg.baseCost ?? 0, 0);
  upg.baseCostBn = upg.baseCost;
  upg.numUpgEvolutions = Number.isFinite(Number(upg.numUpgEvolutions))
    ? Number(upg.numUpgEvolutions)
    : 0;
  upg.lvlCapBn = toUpgradeBigNum(upg.lvlCap ?? Infinity, Infinity);
  upg.lvlCap = levelCapToNumber(upg.lvlCapBn);
  upg.lvlCapFmtHtml = formatBigNumAsHtml(upg.lvlCapBn);
  upg.lvlCapFmtText = formatBigNumAsPlain(upg.lvlCapBn);
  upg.bulkMeta = computeBulkMeta(upg);
  ensureUpgradeScaling(upg);
}

/* ----------------------- Storage (per slot, per area) ---------------------- */

function keyForArea(areaKey) {
  const slot = getActiveSlot();
  if (slot == null) return null;
  return `ccc:upgrades:${areaKey}:${slot}`;
}

function loadAreaState(areaKey) {
  const k = keyForArea(areaKey);
  if (!k) return [];
  const raw = localStorage.getItem(k);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveAreaState(areaKey, stateArr) {
  const k = keyForArea(areaKey);
  if (!k) return;
  try {
    localStorage.setItem(k, JSON.stringify(stateArr));
  } catch {}
}

const upgradeStateCache = new Map(); // key → { areaKey, upgId, upg, rec, arr, lvl, nextCostBn }

function upgradeCacheKey(areaKey, upgId) {
  return `${areaKey}:${upgId}`;
}

function ensureUpgradeState(areaKey, upgId) {
  const key = upgradeCacheKey(areaKey, upgId);
  let state = upgradeStateCache.get(key);
  if (state) return state;

  const upg = getUpgrade(areaKey, upgId);
  const arr = loadAreaState(areaKey);
  let rec = arr.find(u => u && u.id === upgId);
  if (!rec) {
    rec = { id: upgId, lvl: BigNum.fromInt(0).toStorage() };
    if (upg) {
      try {
        rec.nextCost = BigNum.fromAny(upg.costAtLevel(0)).toStorage();
      } catch {
        rec.nextCost = BigNum.fromInt(0).toStorage();
      }
    }
    arr.push(rec);
    saveAreaState(areaKey, arr);
  }

  const lvlBn = ensureLevelBigNum(rec.lvl);
  let lvl = levelBigNumToNumber(lvlBn);
  let nextCostBn = null;
  if (rec.nextCost != null) {
    try { nextCostBn = BigNum.fromAny(rec.nextCost); }
    catch { nextCostBn = null; }
  }

  if (!nextCostBn) {
    if (upg) {
      try {
        nextCostBn = BigNum.fromAny(upg.costAtLevel(lvl));
      } catch {
        nextCostBn = BigNum.fromInt(0);
      }
    } else {
      nextCostBn = BigNum.fromInt(0);
    }
    try {
      rec.nextCost = nextCostBn.toStorage();
      rec.lvl = lvlBn.toStorage();
      saveAreaState(areaKey, arr);
    } catch {}
  }

  if (upg?.upgType === 'HM' && lvlBn?.isInfinite?.()) {
    if (!upg.lvlCapBn?.isInfinite?.()) {
      const infCap = BigNum.fromAny('Infinity');
      upg.lvlCapBn = infCap;
      upg.lvlCap = Number.POSITIVE_INFINITY;
      upg.lvlCapFmtHtml = formatBigNumAsHtml(infCap);
      upg.lvlCapFmtText = formatBigNumAsPlain(infCap);
    }
  }

  state = { areaKey, upgId, upg, rec, arr, lvl, lvlBn, nextCostBn };
  upgradeStateCache.set(key, state);
  return state;
}

function commitUpgradeState(state) {
  if (!state) return;
  const { areaKey, arr, rec } = state;
  try {
    rec.lvl = state.lvlBn?.toStorage?.() ?? ensureLevelBigNum(state.lvlBn ?? state.lvl).toStorage();
  } catch {
    rec.lvl = ensureLevelBigNum(state.lvl ?? 0).toStorage();
  }
  if (state.nextCostBn) {
    try {
      rec.nextCost = state.nextCostBn.toStorage();
    } catch {
      rec.nextCost = BigNum.fromAny(state.nextCostBn).toStorage();
    }
  }
  saveAreaState(areaKey, arr);
}

function invalidateUpgradeState(areaKey, upgId) {
  upgradeStateCache.delete(upgradeCacheKey(areaKey, upgId));
}

export function getLevelNumber(areaKey, upgId) {
  return ensureUpgradeState(areaKey, upgId).lvl;
}

export function getLevel(areaKey, upgId) {
  const state = ensureUpgradeState(areaKey, upgId);
  if (state.lvlBn?.clone) return state.lvlBn.clone();
  return ensureLevelBigNum(state.lvl ?? 0);
}

export function peekNextPrice(areaKey, upgId) {
  const state = ensureUpgradeState(areaKey, upgId);
  return state.nextCostBn?.clone?.() ?? BigNum.fromAny(state.nextCostBn ?? 0);
}

export function setLevel(areaKey, upgId, lvl, clampToCap = true) {
  const state = ensureUpgradeState(areaKey, upgId);
  const upg = state.upg;
  const prevLevelBn = state.lvlBn?.clone?.() ?? ensureLevelBigNum(state.lvl ?? 0);
  const prevLevelNum = state.lvl ?? levelBigNumToNumber(prevLevelBn);
  const cap = upg?.lvlCap ?? Infinity;
  let desiredBn = ensureLevelBigNum(lvl);
  if (desiredBn.isInfinite?.()) {
    desiredBn = BigNum.fromAny('Infinity');
  }
  let nextBn = desiredBn;
  if (clampToCap && Number.isFinite(cap)) {
    const capBn = ensureLevelBigNum(cap);
    if (nextBn.cmp(capBn) > 0) nextBn = capBn;
  }

  if (state.lvlBn?.cmp && state.lvlBn.cmp(nextBn) === 0) return state.lvl;
  const nextNum = levelBigNumToNumber(nextBn);

  if (!upg) {
    state.lvl = nextNum;
    state.lvlBn = nextBn;
    state.nextCostBn = BigNum.fromInt(0);
    commitUpgradeState(state);
    invalidateUpgradeState(areaKey, upgId);
    notifyChanged();
    return state.lvl;
  }

  state.lvl = nextNum;
  state.lvlBn = nextBn;
  try {
    state.nextCostBn = BigNum.fromAny(upg.costAtLevel(nextNum));
  } catch {
    state.nextCostBn = BigNum.fromInt(0);
  }

  commitUpgradeState(state);
  const deltaBn = nextBn.sub(prevLevelBn);
  if (!(deltaBn.isZero?.() || (typeof deltaBn.isZero === 'function' && deltaBn.isZero()))) {
    fireLevelChange(upg, {
      areaKey,
      upgId,
      upgrade: upg,
      state,
      previousLevel: prevLevelNum,
      previousLevelBn: prevLevelBn,
      newLevel: state.lvl,
      newLevelBn: nextBn.clone?.() ?? nextBn,
      levelsGained: levelBigNumToNumber(deltaBn),
      levelsGainedBn: deltaBn,
    });
  }
  invalidateUpgradeState(areaKey, upgId);
  notifyChanged();
  return state.lvl;
}

/* ---------------------------- Registry helpers ---------------------------- */

export function getUpgradesForArea(areaKey) {
  return REGISTRY.filter(u => u.area === areaKey);
}

export function getUpgrade(areaKey, upgId) {
  return REGISTRY.find(u => u.area === areaKey && u.id === upgId) || null;
}

export function getIconUrl(upg) {
  const dir = 'img/sc_upg_icons/';
  return dir + upg.icon;
}

function fireLevelChange(upg, context) {
  if (!upg || typeof upg.onLevelChange !== 'function') return;
  try {
    upg.onLevelChange(context);
  } catch (err) {
    console.warn('[upgrades] onLevelChange failed', err);
  }
}

/* ------------------------------ Cost helpers ------------------------------ */

function sumNextNLevelsCost(upg, currentLevel, n) {
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += upg.costAtLevel(currentLevel + i);
  }
  return total;
}

export function costToBuyOne(areaKey, upgId) {
  const upg = getUpgrade(areaKey, upgId);
  const lvlBn = getLevel(areaKey, upgId);
  const lvl = levelBigNumToNumber(lvlBn);
  if (!upg) return 0;
  if (lvl >= upg.lvlCap) return 0;
  return upg.costAtLevel(lvl);
}

export function buyOne(areaKey, upgId) {
  const state = ensureUpgradeState(areaKey, upgId);
  const upg = state.upg;
  if (!upg) return { bought: 0, spent: 0 };

  const lvlNum = state.lvl;
  const lvlBn = state.lvlBn ?? ensureLevelBigNum(lvlNum);
  if (lvlNum >= upg.lvlCap) return { bought: 0, spent: 0 };

  const price = state.nextCostBn ?? BigNum.fromAny(upg.costAtLevel(lvlNum));
  const haveRaw = bank[upg.costType]?.value;
  const have = haveRaw instanceof BigNum
    ? haveRaw
    : BigNum.fromAny(haveRaw ?? 0);

  if (have.cmp(BigNum.fromAny(price)) < 0) {
    return { bought: 0, spent: 0 };
  }
  const spent = BigNum.fromAny(price);
  bank[upg.costType].sub(spent);

  const nextLevelBn = lvlBn.add(BigNum.fromInt(1));
  state.lvlBn = nextLevelBn;
  state.lvl = levelBigNumToNumber(nextLevelBn);
  state.nextCostBn = BigNum.fromAny(
    typeof upg.nextCostAfter === 'function'
      ? upg.nextCostAfter(spent, state.lvl)
      : upg.costAtLevel(state.lvl)
  );
  commitUpgradeState(state);
  const deltaBn = nextLevelBn.sub(lvlBn);
  if (!(deltaBn.isZero?.() || (typeof deltaBn.isZero === 'function' && deltaBn.isZero()))) {
    fireLevelChange(upg, {
      areaKey,
      upgId,
      upgrade: upg,
      state,
      previousLevel: lvlNum,
      previousLevelBn: lvlBn.clone?.() ?? lvlBn,
      newLevel: state.lvl,
      newLevelBn: nextLevelBn.clone?.() ?? nextLevelBn,
      levelsGained: levelBigNumToNumber(deltaBn),
      levelsGainedBn: deltaBn,
    });
  }
  invalidateUpgradeState(areaKey, upgId);
  notifyChanged();
  return { bought: 1, spent };
}

export function buyMax(areaKey, upgId) {
  const state = ensureUpgradeState(areaKey, upgId);
  const upg = state.upg;
  if (!upg) return { bought: 0, spent: BigNum.fromInt(0) };
  
  const lvlNum = state.lvl;
  const lvlBn = state.lvlBn ?? ensureLevelBigNum(lvlNum);
  const cap = Number.isFinite(upg.lvlCap)
    ? Math.max(0, Math.floor(upg.lvlCap))
    : Infinity;
  if (Number.isFinite(cap) && lvlNum >= cap) return { bought: 0, spent: BigNum.fromInt(0) };

  const walletHandle = bank[upg.costType];
  const walletValue = walletHandle?.value;
  const wallet = walletValue instanceof BigNum
    ? walletValue.clone?.() ?? BigNum.fromAny(walletValue)
    : BigNum.fromAny(walletValue ?? 0);

  if (wallet.isZero?.()) return { bought: BigNum.fromInt(0), spent: BigNum.fromInt(0) };

  if (wallet.isInfinite?.()) {
    const prevLevel = lvlBn.clone?.() ?? ensureLevelBigNum(lvlBn);
    let targetLevelBn;

    if (upg.upgType === 'HM') {
      targetLevelBn = BigNum.fromAny('Infinity');

      if (!upg.lvlCapBn?.isInfinite?.()) {
        const infCap = BigNum.fromAny('Infinity');
        upg.lvlCapBn = infCap;
        upg.lvlCap = Number.POSITIVE_INFINITY;
        upg.lvlCapFmtHtml = formatBigNumAsHtml(infCap);
        upg.lvlCapFmtText = formatBigNumAsPlain(infCap);
      }
    } else {
      const capBn = upg.lvlCapBn?.clone?.() ?? toUpgradeBigNum(upg.lvlCap ?? Infinity, Infinity);
      targetLevelBn = capBn?.clone?.() ?? capBn;
    }

    const purchased = targetLevelBn.sub(prevLevel);
    state.lvlBn = targetLevelBn.clone?.() ?? targetLevelBn;
    if (upg.upgType === 'NM' && Number.isFinite(upg.lvlCap)) {
      state.lvl = upg.lvlCap;
    } else {
      state.lvl = levelBigNumToNumber(state.lvlBn);
    }
    state.nextCostBn = BigNum.fromAny('Infinity');

    bank[upg.costType].set(wallet);

    commitUpgradeState(state);
    invalidateUpgradeState(areaKey, upgId);
    notifyChanged();

    return { bought: purchased, spent: BigNum.fromInt(0) };
  }

  const nextCost = state.nextCostBn?.clone?.() ?? BigNum.fromAny(upg.costAtLevel(lvlNum));
  if (wallet.cmp(nextCost) < 0) {
    return { bought: BigNum.fromInt(0), spent: BigNum.fromInt(0) };
  }

  const room = Number.isFinite(cap) ? Math.max(0, cap - lvlNum) : MAX_LEVEL_DELTA;
  if (!(room > 0)) {
    return { bought: BigNum.fromInt(0), spent: BigNum.fromInt(0) };
  }

  const outcome = calculateBulkPurchase(upg, lvlNum, wallet, room);
  const countBn = outcome.count instanceof BigNum
    ? outcome.count
    : BigNum.fromAny(outcome.count ?? 0);
  if (countBn.isZero?.()) {
    return { bought: BigNum.fromInt(0), spent: BigNum.fromInt(0) };
  }

  const spent = outcome.spent ?? BigNum.fromInt(0);
  const remaining = wallet.sub(spent);
  bank[upg.costType].set(remaining);

  const nextLevelBn = lvlBn.add(countBn);
  state.lvlBn = nextLevelBn;
  state.lvl = levelBigNumToNumber(nextLevelBn);
  if (outcome.nextPrice) {
    state.nextCostBn = outcome.nextPrice;
  } else if (Number.isFinite(state.lvl)) {
    state.nextCostBn = BigNum.fromAny(upg.costAtLevel(state.lvl));
  } else {
    state.nextCostBn = BigNum.fromAny('Infinity');
  }
  commitUpgradeState(state);
  const deltaBn = countBn.clone?.() ?? countBn;
  if (!(deltaBn.isZero?.() || (typeof deltaBn.isZero === 'function' && deltaBn.isZero()))) {
    fireLevelChange(upg, {
      areaKey,
      upgId,
      upgrade: upg,
      state,
      previousLevel: lvlNum,
      previousLevelBn: lvlBn.clone?.() ?? lvlBn,
      newLevel: state.lvl,
      newLevelBn: nextLevelBn.clone?.() ?? nextLevelBn,
      levelsGained: levelBigNumToNumber(deltaBn),
      levelsGainedBn: deltaBn,
    });
  }
  invalidateUpgradeState(areaKey, upgId);
  notifyChanged();

  return { bought: countBn, spent };
}

export function evaluateBulkPurchase(upg, startLevel, walletBn, maxLevels = MAX_LEVEL_DELTA, options = {}) {
  const wallet = walletBn instanceof BigNum ? walletBn : BigNum.fromAny(walletBn ?? 0);
  const outcome = calculateBulkPurchase(upg, startLevel, wallet, maxLevels, options);
  return {
    count: outcome.count,
    spent: outcome.spent ?? BigNum.fromInt(0),
    nextPrice: outcome.nextPrice ?? BigNum.fromInt(0),
    numericCount: outcome.numericCount ?? 0,
  };
}

/* ------------------------------ Effects wiring ---------------------------- */

const BASE_CPS = 1;

export function computeUpgradeEffects(areaKey) {
  const ups = getUpgradesForArea(areaKey);
  let cpsMult = 1.0;

  for (const u of ups) {
    const lvlBn = getLevel(areaKey, u.id);
    const lvlNum = levelBigNumToNumber(lvlBn);
    if (u.id === 1) {
      // Faster Coins
      cpsMult *= u.effectMultiplier(lvlNum);
    }
    // future upgrades here...
  }

  return {
    coinsPerSecondMult: cpsMult,
    coinsPerSecondAbsolute: BASE_CPS * cpsMult,
  };
}

// tiny event system for “upgrades changed”
let listeners = [];
export function onUpgradesChanged(cb) {
  if (typeof cb === 'function') listeners.push(cb);
  return () => { listeners = listeners.filter(x => x !== cb); };
}
function notifyChanged() {
  try { listeners.forEach(cb => cb()); } catch {}
  // also fire a DOM event in case you want to hook somewhere else
  try { document.dispatchEvent(new CustomEvent('ccc:upgrades:changed')); } catch {}
}

/* ----------------------- Area detection (DOM mapping) ---------------------- */

export function getCurrentAreaKey() {
  // Map DOM class to registry key. Starter Cove DOM has ".area-cove".
  const gameRoot = document.getElementById('game-root');
  if (gameRoot?.classList?.contains('area-cove')) return AREA_KEYS.STARTER_COVE;
  // fallback: starter cove
  return AREA_KEYS.STARTER_COVE;
}

/* ------------------------------ UI helpers -------------------------------- */

export function upgradeUiModel(areaKey, upgId) {
  const upg = getUpgrade(areaKey, upgId);
  if (!upg) return null;
  const lvlBn = getLevel(areaKey, upgId);
  const lvl = levelBigNumToNumber(lvlBn);
  const lvlFmtHtml = formatBigNumAsHtml(lvlBn);
  const lvlFmtText = formatBigNumAsPlain(lvlBn);
  const lvlCapBn = upg.lvlCapBn ?? toUpgradeBigNum(upg.lvlCap ?? Infinity, Infinity);
  const lvlCapFmtHtml = upg.lvlCapFmtHtml ?? formatBigNumAsHtml(lvlCapBn);
  const lvlCapFmtText = upg.lvlCapFmtText ?? formatBigNumAsPlain(lvlCapBn);
  const nextPrice = lvl < upg.lvlCap ? peekNextPrice(areaKey, upgId) : BigNum.fromInt(0);
  const nextPriceFmt = formatBigNumAsHtml(nextPrice);
  const haveRaw = bank[upg.costType]?.value;
  const have = haveRaw instanceof BigNum
    ? haveRaw
    : BigNum.fromAny(haveRaw ?? 0);
  const effect = upg.effectSummary(lvl);
  return {
    upg,
    lvl,
    lvlBn,
    lvlFmtHtml,
    lvlFmtText,
    lvlCapBn,
    lvlCapFmtHtml,
    lvlCapFmtText,
    nextPrice,
    nextPriceFmt,
    have,
    haveFmt: bank[upg.costType]?.fmt(have) ?? String(have),
    effect,
    iconUrl: getIconUrl(upg),
  };
}

export function normalizeBigNum(value) {
  return bigNumFromLog10(approxLog10BigNum(value ?? 0));
}
