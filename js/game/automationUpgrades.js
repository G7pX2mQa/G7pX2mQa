// js/game/automationUpgrades.js

import { BigNum } from '../util/bigNum.js';
import { bank, getActiveSlot } from '../util/storage.js';
import { triggerPassiveCollect } from './coinPickup.js';
import { formatNumber } from '../util/numFormat.js';
import { registerTick } from './gameLoop.js';

const EFFECTIVE_AUTO_COLLECT_ID = 1;
const STORAGE_PREFIX = 'ccc:automation:upgrades';

const REGISTRY = [
  {
    id: EFFECTIVE_AUTO_COLLECT_ID,
    title: 'Effective Auto-Collect',
    desc: 'Generates the equivalent of picking up a Coin on an interval\nEach level of this upgrade will reduce the generation interval\nAs a bonus, anything passively generated accumulates offline',
    icon: 'img/sc_upg_icons/effective_auto_collect.webp',
    lvlCap: 20,
    baseCost: 100, // Gears
    costType: 'gears',
    costAtLevel(level) { return getCost(this, level); },
    scaling: { ratio: 2 },
  }
];

let upgradesState = {}; // { [id]: level }
let accumulator = 0; // seconds
let listeners = [];

function getKey(slot) { return `${STORAGE_PREFIX}:${slot}`; }

function loadState() {
  const slot = getActiveSlot();
  if (!slot) return;
  try {
    const raw = localStorage.getItem(getKey(slot));
    if (raw) upgradesState = JSON.parse(raw);
    else upgradesState = {};
  } catch { upgradesState = {}; }
}

function saveState() {
  const slot = getActiveSlot();
  if (!slot) return;
  try {
    localStorage.setItem(getKey(slot), JSON.stringify(upgradesState));
  } catch {}
}

function getUpgrade(id) {
  return REGISTRY.find(u => u.id === id);
}

function getCost(upg, level) {
  // Cost = Base * 2^Level
  const base = BigInt(upg.baseCost);
  const pow = 2n ** BigInt(level);
  const cost = base * pow;
  return BigNum.fromAny(cost.toString());
}

export function getAutomationCoinRate() {
  const lvl = upgradesState[EFFECTIVE_AUTO_COLLECT_ID] || 0;
  return lvl; // Rate = level (coins/sec)
}

function onTick() {
  // Game loop runs at 20 ticks/sec (50ms).
  // dt is 1/20 sec = 0.05 sec.
  updateAutomation(0.05);
}

export function updateAutomation(dt) {
  const rate = getAutomationCoinRate();
  if (rate <= 0) {
    accumulator = 0;
    return;
  }
  
  accumulator += dt;
  const interval = 1 / rate;
  
  if (accumulator >= interval) {
     const count = Math.floor(accumulator / interval);
     if (count > 0) {
       triggerPassiveCollect(count);
       accumulator -= count * interval;
     }
  }
}

export function getAutomationUiModel(id) {
  const upg = getUpgrade(id);
  if (!upg) return null;
  
  const level = upgradesState[id] || 0;
  const nextCost = getCost(upg, level);
  const isMaxed = level >= upg.lvlCap;
  
  let effectText = '';
  if (level === 0) {
    effectText = 'Coin generation interval: None';
  } else {
    // interval = 1000 / level ms
    const intervalMs = Math.round(1000 / level);
    effectText = `Coin generation interval: ${intervalMs}ms`;
  }
  
  const have = bank[upg.costType] ? bank[upg.costType].value : BigNum.fromInt(0);
  const canAfford = !isMaxed && have.cmp(nextCost) >= 0;

  return {
    id: upg.id,
    title: upg.title,
    desc: upg.desc,
    icon: upg.icon,
    level,
    lvlCap: upg.lvlCap,
    cost: nextCost,
    costFmt: formatNumber(nextCost),
    costType: upg.costType,
    effect: effectText,
    isMaxed,
    canAfford,
    have,
    
    // Compatibility with shopOverlay.js
    lvlBn: BigNum.fromInt(level),
    lvlCapBn: BigNum.fromInt(upg.lvlCap),
    nextPrice: nextCost,
    upg: upg,
    displayTitle: upg.title,
    displayDesc: upg.desc,
    lvlFmtHtml: formatNumber(BigNum.fromInt(level)),
    lvlFmtText: String(level),
    lvlCapFmtHtml: formatNumber(BigNum.fromInt(upg.lvlCap)),
    lvlCapFmtText: String(upg.lvlCap),
  };
}

export function getAllAutomationUiModels() {
  return REGISTRY.map(u => getAutomationUiModel(u.id));
}

export function getAutomationUpgradesAdapterData() {
  const data = {};
  for (const upg of REGISTRY) {
    const model = getAutomationUiModel(upg.id);
    data[upg.id] = {
      id: upg.id,
      icon: upg.icon,
      title: upg.title,
      desc: upg.desc,
      level: model.lvlBn,
      levelNumeric: model.level,
      area: 'automation',
      meta: upg,
      locked: false,
      lockState: { locked: false },
      useLockedBase: false,
      baseIconOverride: null,
      hmReady: false,
      lvlCap: upg.lvlCap,
    };
  }
  return data;
}

export function buyAutomationUpgrade(id) {
  const upg = getUpgrade(id);
  if (!upg) return { bought: BigNum.fromInt(0) };
  
  const level = upgradesState[id] || 0;
  if (level >= upg.lvlCap) return { bought: BigNum.fromInt(0) };
  
  const cost = getCost(upg, level);
  const wallet = bank[upg.costType];
  
  if (wallet.value.cmp(cost) < 0) return { bought: BigNum.fromInt(0) };
  
  wallet.sub(cost);
  upgradesState[id] = level + 1;
  saveState();
  notifyChanged();
  return { bought: BigNum.fromInt(1) };
}

export function buyMaxAutomationUpgrade(id) {
  const upg = getUpgrade(id);
  if (!upg) return { bought: BigNum.fromInt(0) };
  
  const level = upgradesState[id] || 0;
  if (level >= upg.lvlCap) return { bought: BigNum.fromInt(0) };
  
  const wallet = bank[upg.costType].value;
  const currentCost = getCost(upg, level);
  
  if (wallet.cmp(currentCost) < 0) return { bought: BigNum.fromInt(0) };
  
  // Logic:
  // C_current = Base * 2^L
  // Max affordable K such that C_current * (2^K - 1) <= Wallet
  // 2^K <= (Wallet / C_current) + 1
  // K <= log2((Wallet / C_current) + 1)
  
  let count = 0;
  
  // Since caps are small (20), we can just iterate.
  // It's safer and less prone to precision errors than logs.
  
  let tempLevel = level;
  let tempWallet = wallet;
  let totalCost = BigNum.fromInt(0);
  
  while (tempLevel < upg.lvlCap) {
      const nextCost = getCost(upg, tempLevel);
      if (tempWallet.cmp(nextCost) >= 0) {
          tempWallet = tempWallet.sub(nextCost);
          totalCost = totalCost.add(nextCost);
          tempLevel++;
          count++;
      } else {
          break;
      }
  }
  
  if (count > 0) {
      bank[upg.costType].sub(totalCost);
      upgradesState[id] = tempLevel;
      saveState();
      notifyChanged();
  }
  
  return { bought: BigNum.fromInt(count) };
}

export function initAutomationUpgrades() {
   loadState();
   registerTick(onTick);
   if (typeof window !== 'undefined') {
       window.addEventListener('saveSlot:change', () => {
           loadState();
           accumulator = 0;
           notifyChanged();
       });
   }
}

export function onAutomationChanged(cb) {
  listeners.push(cb);
  return () => { listeners = listeners.filter(x => x !== cb); };
}

function notifyChanged() {
  const event = new CustomEvent('ccc:automation:changed');
  if (typeof window !== 'undefined') window.dispatchEvent(event);
  listeners.forEach(cb => cb());
}
