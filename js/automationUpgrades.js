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
    have
  };
}

export function getAllAutomationUiModels() {
  return REGISTRY.map(u => getAutomationUiModel(u.id));
}

export function buyAutomationUpgrade(id) {
  const upg = getUpgrade(id);
  if (!upg) return false;
  
  const level = upgradesState[id] || 0;
  if (level >= upg.lvlCap) return false;
  
  const cost = getCost(upg, level);
  const wallet = bank[upg.costType];
  
  if (wallet.value.cmp(cost) < 0) return false;
  
  wallet.sub(cost);
  upgradesState[id] = level + 1;
  saveState();
  notifyChanged();
  return true;
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
  listeners.forEach(cb => cb());
}