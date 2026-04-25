import { IS_MOBILE } from '../main.js';
import { blockInteraction, ensureCustomScrollbar, setupDragToClose } from './shopOverlay.js';
import { suppressNextGhostTap, shouldSkipGhostTap } from '../util/ghostTapGuard.js';
import { getResearchNodeLevel } from '../game/labNodes.js';
import { getFlowUnlockState } from './merchantTabs/flowTab.js';
import { getTsunamiSequenceSeen, isSurgeActive } from '../game/surgeEffects.js';
import { getActiveSlot } from '../util/storage.js';
import { settingsManager } from '../game/settingsManager.js';

const HELP_PERMA_UNLOCK_KEY_BASE = 'ccc:help:permaUnlocks';
const helpPermaUnlockStateCache = new Map();

function ensureHelpPermaUnlockState(slot = getActiveSlot()) {
  const slotKey = String(slot ?? 'default');
  if (helpPermaUnlockStateCache.has(slotKey)) {
    return helpPermaUnlockStateCache.get(slotKey);
  }

  let parsed = { entries: {} };
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(`${HELP_PERMA_UNLOCK_KEY_BASE}:${slotKey}`);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') {
          const entries = (obj.entries && typeof obj.entries === 'object') ? obj.entries : {};
          parsed = { entries };
        }
      }
    } catch {}
  }

  if (!parsed || typeof parsed !== 'object') parsed = { entries: {} };
  if (!parsed.entries || typeof parsed.entries !== 'object') parsed.entries = {};

  helpPermaUnlockStateCache.set(slotKey, parsed);
  return parsed;
}

function saveHelpPermaUnlockState(state, slot = getActiveSlot()) {
  const slotKey = String(slot ?? 'default');
  if (!state || typeof state !== 'object') {
    state = { entries: {} };
  }
  if (!state.entries || typeof state.entries !== 'object') {
    state.entries = {};
  }
  helpPermaUnlockStateCache.set(slotKey, state);
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(`${HELP_PERMA_UNLOCK_KEY_BASE}:${slotKey}`, JSON.stringify(state));
  } catch {}
}

function isHelpEntryPermanentlyUnlocked(id, slot = getActiveSlot()) {
  const state = ensureHelpPermaUnlockState(slot);
  return !!state.entries[id];
}

function markHelpEntryPermanentlyUnlocked(id, slot = getActiveSlot()) {
  const state = ensureHelpPermaUnlockState(slot);
  if (state.entries[id]) return;
  state.entries[id] = true;
  saveHelpPermaUnlockState(state, slot);
}

const HELP_ENTRIES = [
  {
    id: 1,
    title: "Intro",
    icon: "img/currencies/coin/coin.webp",
    tldr: "Collect Coins; Buy upgrades; Make numbers go up",
    progressionGoal: "Unlock the XP system, then reach XP Level 31 and unlock a certain upgrade",
    text: "As you may have already figured out, the core gameplay mechanic of this game is collecting Coins, which you can do by hovering over the Coins with your cursor. Your native cursor is hidden while on the playfield (the area the Coins settle into), and instead a particle trail is constantly drawn where your cursor is on the playfield. Moving past that, the main way you will progress through the game is through buying Shop upgrades and interacting with the Merchant when necessary. You'll need to left-click on an upgrade's icon in the Shop to access the upgrade's overlay, from which you can spend currency on that upgrade to make numbers go up faster. There are also a few shortcuts you can perform on upgrades like right-click to buy max and more; you can find more information in the Shortcuts section of the Stats & Settings menu. You should follow along the progress bar at the bottom of the screen if you're ever lost on what to aim for next.",
    hasMobileVariant: true,
    mobileText: "As you may have already figured out, the core gameplay mechanic of this game is collecting Coins, which you can do by swiping over the Coins with your finger. While your finger is held on the screen, a particle trail is constantly drawn where your finger is on the playfield. Moving past that, the main way you will progress through the game is through buying Shop upgrades and interacting with the Merchant when necessary. You'll need to tap on an upgrade's icon in the Shop to access the upgrade's overlay, from which you can spend currency on that upgrade to make numbers go up faster.",
    nerdModeText: `<div style="margin-bottom:12px;"><strong>Normal Upgrade Level Cost</strong><br><code>Cost = BaseCost * (1.2 ^ UpgLevel)</code>.</div><div style="margin-bottom:12px;"><strong>XP Requirement</strong><br><code>Requirement = 10 * (1.1 ^ XPLevel) * (2.5 ^ Floor(XPLevel / 10))</code><br>After XPLevel 1e12: <code>Requirement = 10 * (1.1 ^ XPLevel) * (2.5 ^ Floor(XPLevel / 10)) * 5 * e^(2.36e-10 * (XPLevel - 1e12))</code>.</div><div style="margin-bottom:12px;"><strong>XP Level Coin Multiplier</strong><br><code>Total Multiplier = (1.1 ^ XPLevel) + XPLevel</code>.<br></div><div><strong>Buy Next / Buy Max / Buy Cheap Logic</strong><br><strong>Buy Max:</strong> Buys the maximum possible amount of UpgLevels within the current wallet constraint.<br><strong>Buy Cheap:</strong> Buys as many UpgLevels as possible such that the cost of the <em>last purchased UpgLevel</em> does not exceed 10% of the <em>remaining wallet balance</em> after the previous UpgLevels are purchased.<br><strong>Buy Next:</strong> Only applies to milestone-type upgrades; calculates the exact amount of UpgLevels to buy to reach the next milestone or falls back to Buy Max if not enough in wallet.</div>`,
    themeClass: "is-intro",
    isVisible: () => true // Always unlocked
  },
  {
    id: 2,
    title: "Forge",
    icon: "img/misc/forge.webp",
    tldr: "Reset immediately; Spend Gold wisely; Reset more when progress is slow",
    progressionGoal: "Reach XP Level 101 and unlock a certain upgrade",
    text: "Forge is this game's first reset layer of many. If you're unfamiliar with the concept, a reset layer is when you reset all of your progress before this point but exchange it for a reward. You'll never have to worry about waiting extra time to perform your first reset. You will quickly recover from it and obtain game-changing new multipliers as a result (pro tip: after your first Forge reset, speak with the Merchant for free Gold!). The Forge reset gives Gold when performed, based on your Coins and XP Level at the time of performing it. The first Forge reset unlocks new upgrades where this Gold currency can be spent, and it also unlocks a new Mutation system where you can mutate Coins and double the value of Coins and XP each time your Mutation increases. The core loop of this section of the game (Forge) is to reach a high XP Level, then when progress is slow, perform a Forge reset for tons of Gold. The first Forge reset also unlocked a new type of Shop upgrade: the Milestone-type upgrade. The upgrade does a good job of explaining what it does, you can find more information in the upgrade overlay for the upgrade Endless XP. Enjoy discovering all of the unique mutated Coin sprites.",
    nerdModeText: `<div style="margin-bottom:12px;"><strong>Milestone-type Upgrade Level Cost Ratio</strong><br><code>CostRatio = (1.5 + 0.1 * Evolutions) * Harshness</code><br>Where <code>Evolutions = Floor(UpgLevel / 1000)</code> and <code>Harshness</code> is an optional value to make scaling harsher for any given upgrade, defaulting to 1.<br>After 1e6 Evolutions (UpgLevel 1e9): <code>CostRatio = (1.5 + 0.1 * Evolutions) * Harshness * 10 ^ (5 * e^(1.698e-7 * (Evolutions - 1e6)))</code>.</div><div style="margin-bottom:12px;"><strong>Forge Base Gold Gain</strong><br><code>Base Gold = Floor(10 * 2 ^ Max(0, log10(Coins) - 5) * 1.4 ^ Max(0, (XPLevel - 30) / 5) * 1.15 ^ Floor(Max(0, log10(Coins) - 5)))</code>.</div><div style="margin-bottom:12px;"><strong>MP Requirement</strong><br>Mutations 0-9 follow this formula: <code>log10(Requirement) = -0.0022 * (Mutation + 1)^2 + 0.2045 * (Mutation + 1) + 2.0168</code>.<br>Mutations 10-49 follow a harsher formula: <code>log10(Requirement) = 3.83 * (1.3444 ^ (Mutation - 9))</code>.<br>Mutations 50-99 follow an even harsher formula: <code>log10(Requirement) = 10 ^ (A * x^2 + B)</code><br>Where <code>x = Mutation - 49</code>, <code>A = 297/2499</code>, and <code>B = 6 - A</code>.<br>There are also breakpoints at Mutation 50 and Mutation 100 where I explicitly set the MP requirement to a flat number.<br>Also note that I may slightly change the Mutation formula whenever I feel like it for various reasons.</div><div><strong>Mutation MP Multiplier Reward</strong><br><code>Total Coins & XP Boost = 2 ^ Mutation</code>.</div>`,
    themeClass: "is-forge",
    isVisible: () => {
        if (isHelpEntryPermanentlyUnlocked(2)) return true;
        let isVis = false;
        try {
            const override = window.resetSystem?.getForgeDebugOverrideState?.();
            if (override != null) isVis = override;
            else isVis = !!window.resetSystem?.isForgeUnlocked?.();
        } catch {}
        if (isVis) markHelpEntryPermanentlyUnlocked(2);
        return isVis;
    }
  },
  {
    id: 3,
    title: "Infuse",
    icon: "img/misc/infuse.webp",
    tldr: "Reset immediately; Spend Magic wisely; Reset more when progress is slow",
    progressionGoal: "Reach XP Level 201 and unlock a certain upgrade",
    text: "Similar to Forge, except now you get Magic on reset instead of Gold. Speak with the Merchant after your first Infuse reset to get some extra Magic for free, and also check out the Workshop tab to get some very generous automation, but there's nothing much else to say; just perform your first Infuse reset right away. There is one slight difference, which is that Infuse scales based on Coins and MP (collective MP gained throughout all Mutations), so just know that to get more Magic, you'll want to maximize your MP value as much as possible. You should know how this works though: just perform more Forge resets for Gold and perform Infuse resets when you've done a satisfactory amount of Forge resets.",
    nerdModeText: `<div style="margin-bottom:12px;"><strong>Infuse Base Magic Gain</strong><br><code>Base Magic = Floor(10 ^ (0.811 + Max(0, log10(Coins) - 12) * log10(1.5) + Floor(Max(0, log10(Coins) - 12)) * log10(1.03) + Max(0, log10(CumulativeMP) - 4) * log10(2)))</code>.</div><div><strong>Workshop Level Cost</strong><br>WSLevel 1 to WSLevel 1e6: <code>Cost = 10 ^ (12 + WSLevel)</code>.<br>WSLevel 1e6 to WSLevel 1e9: <code>Cost = 10 ^ (1.000012e6 + (WSLevel - 1e6) + Integral((WSLevel - 1e6), 0.001))</code><br>Where <code>Integral(WSLevel - 1e6, 0.001) = ((1 + 0.001*(WSLevel - 1e6)) * ln(1 + 0.001*(WSLevel - 1e6)) - 0.001*(WSLevel - 1e6)) / (0.001 * ln(10))</code>.<br>WSLevel 1e9 to WSLevel 1e12: <code>Cost = 10 ^ (6.5597e9 + (WSLevel - 1e9) + (Integral((WSLevel - 1e6), 0.001) - Integral(9.99e8, 0.001)) + 0.5 * (log10(1.00001) / 1000) * (WSLevel - 1e9)^2)</code>.<br>Beyond WSLevel 1e12: <code>Cost = 10 ^ (2.1767e15 * e^(2.3e-10 * (WSLevel - 1T)))</code>.</div>`,
    themeClass: "is-infuse",
    isVisible: () => {
        if (isHelpEntryPermanentlyUnlocked(3)) return true;
        let isVis = false;
        try {
            const override = window.resetSystem?.getInfuseDebugOverrideState?.();
            if (override != null) isVis = override;
            else isVis = !!window.resetSystem?.isInfuseUnlocked?.();
        } catch {}
        if (isVis) markHelpEntryPermanentlyUnlocked(3);
        return isVis;
    }
  },
  {
    id: 4,
    title: "Surge",
    icon: "img/misc/surge.webp",
    tldr: "Perform even more resets; Waves do not function like a normal currency; Reach new milestones when possible",
    progressionGoal: "Reach Surge Milestone 8",
    text: "Past this point is when the game starts to get real. Surge is a milestone-based reset layer, meaning instead of resetting for a currency to spend that currency on upgrades, you instead reset to activate powerful milestones. The descriptive text on the Surge reset card does a good job of explaining how Surge works, but what should you be trying to do to progress further in the game now? Well, the only way to progress now is to keep activating new Surge Milestones. To do this, you'll need to keep performing Surge resets when you have enough pending Waves to reach the next milestone. Waves earned from the Surge reset are based on a lot of things, but the most important thing to focus on is XP Level, because that is the most significant factor in earning many Waves. You can activate multiple milestones from one Surge reset due to how it works, but you don't really need to be doing that in these early Surge Milestones; just reach the next milestone when possible. The first Surge reset also unlocks the Warp tab, which is useful if you ever want to skip any sort of timewall, but there aren't any massive timewalls in this game anyway, so you can use Warps at your convenience. So keep activating new Surge Milestones and your Coins will reach numbers they never have before.",
    nerdModeText: () => {
        let text = `<div style="margin-bottom:12px;"><strong>Base Wave Gain</strong><br><code>Base Waves = Floor(10 ^ (1 + Max(0, log10(Coins) - 24) * log10(1.1) + Max(0, log10(Gold) - 13) * log10(1.1) + Max(0, log10(Magic) - 5) * log10(1.1) + Max(0, log10(CumulativeMP) - 12) * log10(1.1) + (XPLevel - 201) / 35))</code>.</div><div><strong>Wave Requirement</strong><br><code>Requirement = 10 ^ Surge</code>.<br>After Surge 1e12: <code>Requirement = 10 ^ (SurgeLevel + 5 * e^(2.36e-10 * (SurgeLevel - 1e12)))</code>.</div>`;
		let isTsunamiActive = false;
        try { isTsunamiActive = isHelpEntryPermanentlyUnlocked(5); } catch {}
        if (isTsunamiActive) {
            text += `<div style="margin-bottom:12px;"><strong>Surge 3 Book Generation</strong><br><code>Base Books/sec = Max(1, Floor(e ^ (0.20 * XPLevel))) ^ TsunamiExponent</code>.</div>`;
        } else {
            text += `<div style="margin-bottom:12px;"><strong>Surge 3 Book Generation</strong><br><code>Base Books/sec = Max(1, Floor(e ^ (0.20 * XPLevel)))</code>.</div>`;
        }
        return text;
    },
    themeClass: "is-surge",
    isVisible: () => {
        if (isHelpEntryPermanentlyUnlocked(4)) return true;
        let isVis = false;
        try {
            const override = window.resetSystem?.getSurgeDebugOverrideState?.();
            if (override != null) isVis = override;
            else isVis = !!window.resetSystem?.isSurgeUnlocked?.();
        } catch {}
        if (isVis) markHelpEntryPermanentlyUnlocked(4);
        return isVis;
    }
  },
  {
    id: 5,
    title: "Lab",
    icon: "img/stats/rp/rp.webp",
    tldr: "Research Lab Nodes; Get more Coins to research Lab Nodes faster; Work to restore the Tsunami Exponent which nerfs all your Surge Milestones",
    progressionGoal: "Research Lab Node 4",
    text: "You must have a lot of questions about the Lab tab and everything inside it if you're reading this now. The Merchant explained briefly what to do but wouldn't elaborate further when you say things like 'I don't understand', 'Tsunami sacrifice?', or '???', and this help text will elaborate on all three of those confusions. Let's start by explaining what the Lab is. First of all, if you don't know the controls, look in the bottom left corner to see what you need to do to interact with the large grid containing the Lab Nodes. Focusing on gameplay, you will need to research various Lab Nodes which will provide huge multipliers to all sorts of things. Coin value, XP value, Gold value, Magic value, you name it, there's probably a Lab Node for it. Researching these Lab Nodes takes time, and the time it takes for any given level of a Lab Node to finish is dependent on how fast you can reach the required RP (Research Progress) for that level. Each Lab Node needs to be actively being researched or not, toggled ON or OFF, and only one node can be researched at a time; sometimes you will be required to research multiple nodes alongside each other to progress quickly. The main way to increase how quickly you can research Lab Nodes is by increasing your Lab Level, which scales based on your highest reached amount of Coins. Research speed increases exponentially for each Lab Level, but the cost to increase this Lab Level increases tenfold each time. The Merchant also vaguely mentioned that your Surge Milestones were temporarily sacrificed to the Tsunami, but this isn't very clear. And you might've seen a thing called Tsunami Exponent near the top of the Lab tab also, so what's that? Basically, the Surge Milestones are so powerful that they had to be stopped. Invoking the Tsunami has applied a ^0.00 exponent to all Surge Milestones that involve multipliers of any kind, and you can view this effect on the Surge Milestones right now if you want to. This means that a milestone that used to boost your Coins, XP, and MP value by 10x now boosts those things by 10^0.00=1.00x, resulting in no boost from the milestone. The good news is you can restore this Tsunami Exponent from 0.00 all the way back to 1.00 through researching certain Lab Nodes, but it will be a long time until you reach that point. Immediately following the activation of the eighth Surge Milestone, you'll be unable to gather any new Surge Milestones right away, but you'll need to perform the other resets in order to get as many Coins as possible and increase your Lab Level as high as possible. You'll unlock something new after researching Lab Node 4.",
    nerdModeText: `<div style="margin-bottom:12px;"><strong>RP Multiplier From Lab Level</strong><br><code>Multiplier = 2 ^ LabLevel</code><br>But when Surge 12 is active: <code>Multiplier = 10^(5 * TsunamiExponent) * (2 + TsunamiExponent / 2) ^ LabLevel</code>.</div><div style="margin-bottom:12px;"><strong>Lab Level Coin Requirement</strong><br><code>Requirement = 10 ^ (20 + LabLevel)</code>.<br>Note: Lab Level does not include a softcap that prevents it from surpassing <code>Number.MAX_SAFE_INTEGER</code> because the game never performs addition on it.</div>`,
    themeClass: "is-lab",
    isVisible: () => {
        if (isHelpEntryPermanentlyUnlocked(5)) return true;
        let isVis = false;
        try { isVis = !!getTsunamiSequenceSeen(); }
        catch { isVis = false; }
        if (isVis) markHelpEntryPermanentlyUnlocked(5);
        return isVis;
    }
  },
  {
    id: 6,
    title: "Experiment",
    icon: "img/misc/experiment.webp",
    tldr: "Combine all four currently unlocked resets to progress further; Keep unlocking more Surge Milestones",
    progressionGoal: "Reach Surge Milestone 20",
    text: "Now that you have a solid understanding of how the Lab works, it's time to introduce another reset layer. Well, sort of. It would be really evil if this new reset were to reset Surge Milestones, but it doesn't. Instead, it only resets everything Surge does and also the entire Lab. The currency gained from this reset is called DNA and it can be used to buy some powerful Milestone-type upgrades that boost Coins, XP, and other stuff locked behind certain Surge Milestones. The reset itself resets Lab Nodes and Lab Level, so you're starting from square one again, but this time you'll have stronger multipliers and also access to Lab Nodes past the fourth one. In order to keep progressing further, you'll need to combine Forge resets with Infuse resets with Surge resets with Experiment resets with researching Lab Nodes and collecting Coins and all of this stuff. It's so exciting. You'll keep repeating this loop for a while and unlock new fun Surge Milestones along the way until you unlock the next major feature.",
    nerdModeText: `<div style="margin-bottom:12px;"><strong>Base DNA Gain</strong><br><code>Gain = floor(2 ^ (LabLevel + XPLevel / 20))</code><br>But when Surge 9 is active: <code>Gain = floor(10^(30 * TsunamiExponent) * (2 + TsunamiExponent / 2) ^ (LabLevel + XPLevel / 20))</code></div>`,
    themeClass: "is-experiment",
    isVisible: () => {
        if (isHelpEntryPermanentlyUnlocked(6)) return true;
        let isVis = false;
        try { isVis = getResearchNodeLevel(4) >= 1; }
        catch { isVis = false; }
        if (isVis) markHelpEntryPermanentlyUnlocked(6);
        return isVis;
    }
  },
  {
    id: 7,
    title: "Flow",
    icon: "img/stats/fp/fp.webp",
    tldr: "NGU Idle but better; Toggle Flow States of Waterwheels to passively gain multipliers for things; Levels of Waterwheels don't scale in requirement",
    progressionGoal: "Reach Surge Milestone 125",
    text: "Are you familiar with NGU Idle? The whole Flow tab is basically the early game of NGU Idle but nothing is capped and the numbers get a lot crazier. If you couldn't decipher the poem at the top of the Flow tab that was supposed to explain what it is about, don't worry; it's very vague in some parts. Basically, you must activate the Flow State of various Waterwheels and this will earn you more multipliers for the thing that the Waterwheel boosts. Pretend that each of these Waterwheels initially sits idle in a channel of water and needs you to make the water in the channels flow. But to add some strategy, you can only have one Waterwheel actively leveling up (Flow State toggled ON) at a time. As you unlock more Waterwheels, you will have to make decisions between which Waterwheels you want to flow and when. Each level of a Waterwheel boosts the value of its respective currency or stat by +100%, so level 5 of a Waterwheel would boost the thing by +500%. Waterwheels that have their Flow State toggled ON passively gain a certain amount of FP (Flow Progress) each second, and every Waterwheel has a different amount of FP required to level it up. But, the FP required to level up any Waterwheel is constant (it never scales as the level grows), leading to the potential for very high levels on the Waterwheels. You can unlock new Waterwheels by completing whatever requirement is listed as the unlock requirement on each Waterwheel; some may just require a certain amount of levels of the previous Waterwheel while some may require something else. This feature was intentionally designed to not be too active-focused, as you still have Lab Nodes and Surge Milestones and everything else to worry about, but you will need to be mindful of the fact that you will need to juggle the various Waterwheels as you unlock more of them. The poem isn't lying when it says the Waterwheels will wake the strongest multipliers that The Cove has ever seen.",
	nerdModeText: `<div>Nothing to really put here. Both the effect from Waterwheels (+100% per level) and the requirements of each Waterwheel are constant.<br>Btw, the Endless FP upgrade has a Harshness value of 5.</div>`,
    themeClass: "is-flow",
    isVisible: () => {
        if (isHelpEntryPermanentlyUnlocked(7)) return true;
        let isVis = false;
        try { isVis = !!getFlowUnlockState(); }
        catch { isVis = false; }
        if (isVis) markHelpEntryPermanentlyUnlocked(7);
        return isVis;
    }
  }
];


let currentEntryId = HELP_ENTRIES[0].id;

let overlayEl = null;
let sheetEl = null;
let isOpen = false;
let closeTimer = null;
let postOpenPointer = false;

function buildOverlay() {
  if (overlayEl) return;

  overlayEl = document.createElement('div');
  overlayEl.className = 'sas-overlay';
  overlayEl.id = 'help-overlay';
  overlayEl.style.zIndex = '4015';

  sheetEl = document.createElement('div');
  sheetEl.className = 'sas-sheet';
  sheetEl.setAttribute('role', 'dialog');

  const grabber = document.createElement('div');
  grabber.className = 'sas-grabber';
  grabber.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;

  const content = document.createElement('div');
  content.className = 'sas-content';

  const header = document.createElement('header');
  header.className = 'sas-header';
  header.innerHTML = `<div class="sas-title">Help</div><div class="sas-line" aria-hidden="true"></div>`;

  const container = document.createElement('div');
  container.className = 'help-container';

  const scroller = document.createElement('div');
  scroller.className = 'help-scroller';
  scroller.appendChild(container);

  content.append(header, scroller);

  const actions = document.createElement('div');
  actions.className = 'sas-actions';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'sas-close';
  closeBtn.textContent = 'Close';
  actions.appendChild(closeBtn);

  sheetEl.append(grabber, content, actions);
  overlayEl.appendChild(sheetEl);
  document.body.appendChild(overlayEl);

  ensureCustomScrollbar(overlayEl, sheetEl, '.help-scroller');

  // Listeners
  overlayEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    postOpenPointer = true;
  }, { capture: true, passive: true });

  overlayEl.addEventListener('touchstart', (e) => {
    postOpenPointer = true;
  }, { capture: true, passive: true });

  overlayEl.addEventListener('click', (e) => {
    if (!IS_MOBILE) return;
    if (!postOpenPointer) {
      e.preventDefault(); e.stopImmediatePropagation();
      return;
    }
  }, { capture: true });

  closeBtn.addEventListener('click', () => {
    if (IS_MOBILE) blockInteraction(80);
    closeHelpOverlay();
  }, { passive: true });

  setupDragToClose(grabber, sheetEl, () => isOpen, () => {
    isOpen = false;
    closeTimer = setTimeout(() => {
      closeTimer = null;
      closeHelpOverlay(true);
    }, 150);
  });
}

function renderHelpContent() {
  if (!overlayEl) return;
  const container = overlayEl.querySelector('.help-container');
  if (!container) return;

  // Filter entries to only show visible ones
  const visibleEntries = HELP_ENTRIES.filter(e => e.isVisible());
  
  // If current entry is no longer visible, reset to Intro (which is always visible)
  if (!visibleEntries.find(e => e.id === currentEntryId)) {
    currentEntryId = 1;
  }

  const currentEntry = HELP_ENTRIES.find(e => e.id === currentEntryId) || HELP_ENTRIES[0];

  // Build Sidebar
  let sidebarHtml = '<aside class="help-sidebar">';
  visibleEntries.forEach(entry => {
    const isActive = entry.id === currentEntryId ? 'is-active' : '';
    // map id to class string
    const classMap = {1: 'is-intro', 2: 'is-forge', 3: 'is-infuse', 4: 'is-surge', 5: 'is-lab', 6: 'is-experiment', 7: 'is-flow'};
    const themeClass = classMap[entry.id];
    sidebarHtml += `<button type="button" class="help-layer ${isActive} ${themeClass}" data-help-id="${entry.id}">
      <img src="${entry.icon}" alt="">
      <span>${entry.title}</span>
    </button>`;
  });
  sidebarHtml += '</aside>';

  // Build Content
  const classMap = {1: 'is-intro', 2: 'is-forge', 3: 'is-infuse', 4: 'is-surge', 5: 'is-lab', 6: 'is-experiment', 7: 'is-flow'};
  let currentThemeClass = classMap[currentEntry.id];
  
  let entryText = currentEntry.text;
  if (IS_MOBILE && currentEntry.hasMobileVariant && currentEntry.mobileText) {
    entryText = currentEntry.mobileText;
  }

  let paragraphContent = '';
  const isNerdMode = settingsManager.get('nerd_mode');
  if (isNerdMode && currentEntry.nerdModeText) {
    currentThemeClass += " is-nerd-mode";
  }
  
  if (isNerdMode && currentEntry.nerdModeText) {
    if (typeof currentEntry.nerdModeText === 'function') {
      paragraphContent = currentEntry.nerdModeText();
    } else {
      paragraphContent = currentEntry.nerdModeText;
    }
  } else {
    if (currentEntry.tldr) {
      paragraphContent = `<strong style="display: block; margin-bottom: 12px;">TLDR: ${currentEntry.tldr}</strong>${entryText}`;
    } else {
      paragraphContent = entryText;
    }
  }
  
  if (currentEntry.progressionGoal && !(isNerdMode && currentEntry.nerdModeText)) {
    paragraphContent += `<strong style="display: block; margin-top: 12px;">Progression goal: ${currentEntry.progressionGoal}</strong>`;
  }
  
  const contentHtml = `
    <div class="help-content-area">
      <div class="help-card ${currentThemeClass}">
        <h3>${currentEntry.title}</h3>
        <p>${paragraphContent}</p>
        <h3 style="visibility:hidden">${currentEntry.title}</h3>
      </div>
    </div>
  `;

  // Build Spacer (Right side empty column)
  const spacerHtml = '<div class="help-spacer"></div>';

  const existingSidebar = container.querySelector(".help-sidebar");
  const savedScrollLeft = existingSidebar ? existingSidebar.scrollLeft : 0;
  container.innerHTML = sidebarHtml + contentHtml + spacerHtml;
  const newSidebar = container.querySelector(".help-sidebar");
  if (newSidebar) {
    newSidebar.scrollLeft = savedScrollLeft;
  }

  // Add event listeners to sidebar buttons
  const buttons = container.querySelectorAll('.help-layer');
  buttons.forEach(btn => {
    // The colors are defined in CSS. Reading getComputedStyle is flaky here.
    // Instead we map the known theme classes to their base RGB values to 
    // guarantee the dynamic brightness works correctly on every browser instantly.
    let r = 255, g = 255, b = 255; // Default white fallback
    if (btn.classList.contains('is-intro')) { r = 247; g = 214; b = 75; }
    else if (btn.classList.contains('is-forge')) { r = 255; g = 169; b = 0; }
    else if (btn.classList.contains('is-infuse')) { r = 160; g = 32; b = 240; }
    else if (btn.classList.contains('is-surge')) { r = 0; g = 198; b = 255; }
    else if (btn.classList.contains('is-lab')) { r = 47; g = 68; b = 110; }
    else if (btn.classList.contains('is-experiment')) { r = 42; g = 82; b = 152; }
    else if (btn.classList.contains('is-flow')) { r = 0; g = 230; b = 200; }

    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    
    // Mapped and scaled down by 2 (as requested)
    const opacity = 0.01 + (brightness / 255) * 0.19;
    btn.style.setProperty('--help-overlay-opacity', opacity.toFixed(3));

    btn.addEventListener('click', (e) => {
      if (e && e.isTrusted && shouldSkipGhostTap(btn)) return;
      const id = parseInt(btn.getAttribute('data-help-id'), 10);
      if (id && id !== currentEntryId) {
        currentEntryId = id;
        renderHelpContent(); // Re-render content
		
		 // Reset scroll and update scrollbar instantly
        const scroller = overlayEl.querySelector('.help-scroller');
        if (scroller) {
          scroller.scrollTop = 0;
          if (scroller.__customScroll && typeof scroller.__customScroll.update === 'function') {
            scroller.__customScroll.update();
          }
        }
      }
    });
  });
}

export function updateHelpOverlay() {
  if (isOpen) {
    renderHelpContent();
  }
}

if (typeof window !== 'undefined') {
  window.helpSystem = window.helpSystem || {};
  window.helpSystem.updateHelpOverlay = updateHelpOverlay;
  
  window.addEventListener('lab:node:change', () => {
    updateHelpOverlay();
  });
  window.addEventListener('unlock:change', () => {
    updateHelpOverlay();
  });
  window.addEventListener('setting:changed', (e) => {
    if (e.detail && e.detail.key === 'nerd_mode') {
      updateHelpOverlay();
    }
  });
}

export function openHelpOverlay() {
  buildOverlay();

  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }

  renderHelpContent();

  if (isOpen) return;
  isOpen = true;

  sheetEl.style.transition = 'none';
  sheetEl.style.transform = 'translateY(100%)';
  overlayEl.style.pointerEvents = 'auto';

  void sheetEl.offsetHeight;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      sheetEl.style.transition = '';
      sheetEl.style.transform = '';
      overlayEl.classList.add('is-open');
      postOpenPointer = false;

      if (IS_MOBILE) {
        try { setTimeout(() => suppressNextGhostTap(240), 120); } catch {}
      }

      blockInteraction(10);
      ensureCustomScrollbar(overlayEl, sheetEl, '.help-scroller');
    });
  });
}

export function closeHelpOverlay(force = false) {
  const forceClose = force === true;
  const overlayOpen = overlayEl?.classList?.contains('is-open');

  if (!forceClose && !isOpen && !overlayOpen) {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    return;
  }

  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }

  isOpen = false;
  if (sheetEl) {
    sheetEl.style.transition = '';
    sheetEl.style.transform = '';
  }
  if (overlayEl) {
    overlayEl.classList.remove('is-open');
    overlayEl.style.pointerEvents = 'none';
  }
  postOpenPointer = false;
}
