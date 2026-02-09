import { BigNum } from '../util/bigNum.js';
import { getActiveSlot, isStorageKeyLocked } from '../util/storage.js';
import { getLabLevel, setLabLevel, getRpMult } from '../ui/merchantTabs/labTab.js';
import { 
    addExternalCoinMultiplierProvider, 
    addExternalXpGainMultiplierProvider,
    refreshCoinMultiplierFromXpLevel
} from './xpSystem.js';

// --- Storage Keys ---
export const NODE_LEVEL_KEY = (slot, id) => `ccc:lab:node:level:${id}:${slot}`;
export const NODE_RP_KEY = (slot, id) => `ccc:lab:node:rp:${id}:${slot}`;
const NODE_ACTIVE_KEY = (slot, id) => `ccc:lab:node:active:${id}:${slot}`;
const NODE_DISCOVERED_KEY = (slot, id) => `ccc:lab:node:discovered:${id}:${slot}`;
const EXPERIMENT_COMPLETED_KEY = (slot) => `ccc:reset:experiment:completed:${slot}`;

// --- Constants ---
export const RESEARCH_NODES = [
    {
        id: 1,
        title: "Node 1: Tsunami Exponent Buff",
        desc: "Increases the Tsunami exponent by +0.01 per level",
        baseRpReq: 10,
        scale: 2.0,
        maxLevel: 10,
        x: 0,
        y: 0,
        icon: 'lab_icons/tsunami_exponent_buff.webp',
        parentIds: []
    },
    {
        id: 2,
        title: "Node 2: Experimental Coin Value",
        desc: "Multiplies Coin value by 1.5x per level",
        baseRpReq: 1000,
        scale: 2.0,
        maxLevel: 10,
        parentIds: [1],
        x: -1000,
        y: 1000,
        icon: 'lab_icons/coin_val0.webp'
    },
    {
        id: 3,
        title: "Node 3: Experimental XP Value",
        desc: "Multiplies XP value by 1.5x per level",
        baseRpReq: 1000,
        scale: 2.0,
        maxLevel: 10,
        parentIds: [1],
        x: 1000,
        y: 1000,
        icon: 'sc_upg_icons/xp_val1.webp'
    },
    {
        id: 4,
        title: "Node 4: Unlock Experiment",
        desc: "Unlocks the Experiment reset",
        baseRpReq: 1e6,
        scale: 1.0,
        maxLevel: 1,
        x: 0,
        y: -1000,
        icon: 'misc/experiment.webp',
        parentIds: [2, 3]
    },
    {
        id: 5,
        title: "Node 5: Experimental Gold Value",
        desc: "Multiplies Gold value by 1.5x per level",
        baseRpReq: 1e6,
        scale: 2.0,
        maxLevel: 10,
        x: -1000,
        y: -1000,
        icon: 'lab_icons/gold_val0.webp',
        parentIds: [4]
    },
    {
        id: 6,
        title: "Node 6: Experimental Magic Value",
        desc: "Multiplies Magic value by 1.5x per level",
        baseRpReq: 1e6,
        scale: 2.0,
        maxLevel: 10,
        x: 1000,
        y: -1000,
        icon: 'lab_icons/magic_val0.webp',
        parentIds: [4]
    }
];

// --- State Cache ---
const labState = {
    nodes: {}
};

function ensureNodeState(id) {
    if (!labState.nodes[id]) {
        labState.nodes[id] = {
            rp: BigNum.fromInt(0),
            level: 0,
            active: false,
            discovered: false
        };
    }
    return labState.nodes[id];
}

function loadNodeState(slot, id) {
    const s = ensureNodeState(id);
    try {
        const lvl = localStorage.getItem(NODE_LEVEL_KEY(slot, id));
        s.level = lvl ? parseInt(lvl, 10) : 0;
        
        const rp = localStorage.getItem(NODE_RP_KEY(slot, id));
        s.rp = rp ? BigNum.fromAny(rp) : BigNum.fromInt(0);
        
        const act = localStorage.getItem(NODE_ACTIVE_KEY(slot, id));
        s.active = act === '1';

        const disc = localStorage.getItem(NODE_DISCOVERED_KEY(slot, id));
        s.discovered = disc === '1';
    } catch {
        s.level = 0;
        s.rp = BigNum.fromInt(0);
        s.active = false;
        s.discovered = false;
    }
}

export function reloadLabNodes() {
    const slot = getActiveSlot();
    labState.nodes = {}; // Clear cache
    if (slot != null) {
        RESEARCH_NODES.forEach(n => loadNodeState(slot, n.id));
    }
}

function saveLabNodes() {
    const slot = getActiveSlot();
    if (slot == null) return;
    
    RESEARCH_NODES.forEach(n => {
        const s = labState.nodes[n.id];
        if (s) {
            try {
                // Save RP (High Frequency)
                localStorage.setItem(NODE_RP_KEY(slot, n.id), s.rp.toStorage());
                // Level and Active are saved immediately on change, so no need to save here
                // unless we want double safety.
            } catch {}
        }
    });
}

// Initialize
if (typeof window !== 'undefined') {
    window.addEventListener('saveSlot:change', reloadLabNodes);
    // Auto-save every second
    setInterval(saveLabNodes, 1000);
    // Save on unload
    window.addEventListener('beforeunload', saveLabNodes);
    
    // Initial load
    reloadLabNodes();
}

// --- Getters / Setters ---

export function getResearchNodeLevel(id) {
    const s = ensureNodeState(id);
    return s.level;
}

export function setResearchNodeLevel(id, level) {
    const slot = getActiveSlot();
    if (slot == null) return;
    
    const s = ensureNodeState(id);
    s.level = level;
    
    try {
        localStorage.setItem(NODE_LEVEL_KEY(slot, id), level.toString());
        window.dispatchEvent(new CustomEvent('lab:node:change', { detail: { id, level } }));
    } catch {}
}

export function getResearchNodeRp(id) {
    const s = ensureNodeState(id);
    return s.rp;
}

export function setResearchNodeRp(id, rp) {
    // In-memory update only. Persisted via saveLabNodes.
    const s = ensureNodeState(id);
    s.rp = BigNum.fromAny(rp);
    
    try {
        window.dispatchEvent(new CustomEvent('lab:node:rp', { detail: { id, rp: s.rp } }));
    } catch {}
}

export function isResearchNodeActive(id) {
    const s = ensureNodeState(id);
    return s.active;
}

export function setResearchNodeActive(id, active) {
    const slot = getActiveSlot();
    if (slot == null) return;
    
    if (active) {
        RESEARCH_NODES.forEach(n => {
            if (n.id !== id && isResearchNodeActive(n.id)) {
                setResearchNodeActive(n.id, false);
            }
        });
    }

    const s = ensureNodeState(id);
    s.active = !!active;
    
    try {
        localStorage.setItem(NODE_ACTIVE_KEY(slot, id), s.active ? '1' : '0');
        window.dispatchEvent(new CustomEvent('lab:node:active', { detail: { id, active: s.active } }));
    } catch {}
}

export function setResearchNodeDiscovered(id, discovered) {
    const slot = getActiveSlot();
    if (slot == null) return;
    
    const s = ensureNodeState(id);
    if (s.discovered === !!discovered) return;
    
    s.discovered = !!discovered;
    try {
        localStorage.setItem(NODE_DISCOVERED_KEY(slot, id), s.discovered ? '1' : '0');
    } catch {}
}

// --- Logic ---

export function isResearchNodeVisible(id) {
    const node = RESEARCH_NODES.find(n => n.id === id);
    if (!node) return false;
    
    // Check persistent discovery state
    const s = ensureNodeState(id);
    if (s.discovered) return true;
    
    // Root nodes always visible
    if (!node.parentIds || node.parentIds.length === 0) {
        setResearchNodeDiscovered(id, true);
        return true;
    }

    // Node 5 & 6 require Experiment Reset to be completed
    if (id === 5 || id === 6) {
        const slot = getActiveSlot();
        if (slot != null) {
            try {
                const completed = localStorage.getItem(EXPERIMENT_COMPLETED_KEY(slot)) === '1';
                if (!completed) return false;
            } catch {
                return false;
            }
        } else {
            return false;
        }
    }
    
    // Visible if ALL parents are maxed
    for (const parentId of node.parentIds) {
        const parent = RESEARCH_NODES.find(n => n.id === parentId);
        if (!parent) continue; // Should probably not happen, but safe to ignore
        
        const parentLevel = getResearchNodeLevel(parentId);
        if (parentLevel < parent.maxLevel) {
            return false;
        }
    }
    
    setResearchNodeDiscovered(id, true);
    return true;
}

export function getResearchNodeRequirement(id) {
    const node = RESEARCH_NODES.find(n => n.id === id);
    if (!node) return BigNum.fromAny('Infinity');
    
    const level = getResearchNodeLevel(id);
    if (level >= node.maxLevel) return BigNum.fromAny('Infinity');
    
    // Cost = Base * (Scale ^ Level)
    const log10Scale = Math.log10(node.scale); 
    
    const log10Base = Math.log10(node.baseRpReq);
    const totalLog10 = log10Base + (level * log10Scale);
    
    const intPart = Math.floor(totalLog10);
    const fracPart = totalLog10 - intPart;
    const mantissa = Math.pow(10, fracPart);
    
    // Constructor handles normalization
    return new BigNum(BigInt(Math.round(mantissa * 1e14)), { base: intPart, offset: -14n });
}

export function getTsunamiResearchBonus() {
    const level = getResearchNodeLevel(1);
    if (level <= 0) return 0;
    // Effect per level is 0.01 (hardcoded for node 1)
    return level * 0.01;
}

export function isExperimentUnlocked() {
    return getResearchNodeLevel(4) >= 1;
}

export function resetLab(exceptions = []) {
    const slot = getActiveSlot();
    if (slot == null) return;
    
    // Reset Lab Level
    try {
        setLabLevel(0);
    } catch {}

    // Reset Nodes
    RESEARCH_NODES.forEach(node => {
        if (exceptions.includes(node.id)) return;
        
        setResearchNodeLevel(node.id, 0);
        setResearchNodeRp(node.id, BigNum.fromInt(0));
        setResearchNodeActive(node.id, false);
    });
}

export function tickResearch(dt) {
    const mult = getRpMult();
    if (mult.isZero?.()) return;

    // RP per second = 1 * Multiplier
    const rpPerSec = mult; 
    const rpPerTick = rpPerSec.mulDecimal(dt.toString(), 18);

    RESEARCH_NODES.forEach(node => {
        if (!isResearchNodeVisible(node.id)) return;
        
        if (isResearchNodeActive(node.id)) {
            const currentRp = getResearchNodeRp(node.id);
            const req = getResearchNodeRequirement(node.id);
            
            if (getResearchNodeLevel(node.id) >= node.maxLevel) return;
            
            let nextRp = currentRp.add(rpPerTick);
            
            while (true) {
                const currentReq = getResearchNodeRequirement(node.id);
                if (nextRp.cmp(currentReq) < 0) break;
                
                if (getResearchNodeLevel(node.id) >= node.maxLevel) break;

                nextRp = nextRp.sub(currentReq);
                const oldLevel = getResearchNodeLevel(node.id);
                setResearchNodeLevel(node.id, oldLevel + 1);
            }
            
            setResearchNodeRp(node.id, nextRp);
        }
    });
}

// --- Multipliers ---

export function getLabCoinMultiplier() {
    const node = RESEARCH_NODES.find(n => n.id === 2);
    if (!node) return BigNum.fromInt(1);
    const level = getResearchNodeLevel(node.id);
    if (level <= 0) return BigNum.fromInt(1);
    
    const val = Math.pow(1.5, level);
    return BigNum.fromAny(val);
}

export function getLabXpMultiplier() {
    const node = RESEARCH_NODES.find(n => n.id === 3);
    if (!node) return BigNum.fromInt(1);
    const level = getResearchNodeLevel(node.id);
    if (level <= 0) return BigNum.fromInt(1);
    
    const val = Math.pow(1.5, level);
    return BigNum.fromAny(val);
}

export function getLabGoldMultiplier() {
    const node = RESEARCH_NODES.find(n => n.id === 5);
    if (!node) return BigNum.fromInt(1);
    const level = getResearchNodeLevel(node.id);
    if (level <= 0) return BigNum.fromInt(1);
    
    const val = Math.pow(1.5, level);
    return BigNum.fromAny(val);
}

export function getLabMagicMultiplier() {
    const node = RESEARCH_NODES.find(n => n.id === 6);
    if (!node) return BigNum.fromInt(1);
    const level = getResearchNodeLevel(node.id);
    if (level <= 0) return BigNum.fromInt(1);
    
    const val = Math.pow(1.5, level);
    return BigNum.fromAny(val);
}

export function initLabMultipliers() {
    addExternalCoinMultiplierProvider(({ baseMultiplier }) => {
        const labMult = getLabCoinMultiplier();
        return baseMultiplier.mulDecimal(labMult.toScientific());
    });
    
    addExternalXpGainMultiplierProvider(({ baseGain }) => {
        const labMult = getLabXpMultiplier();
        return baseGain.mulDecimal(labMult.toScientific());
    });

    if (typeof window !== 'undefined') {
        window.addEventListener('lab:node:change', ({ detail }) => {
            if (detail && detail.id === 2) {
                refreshCoinMultiplierFromXpLevel();
            }
        });
    }
}
window.RESEARCH_NODES = RESEARCH_NODES; window.isResearchNodeVisible = isResearchNodeVisible;
