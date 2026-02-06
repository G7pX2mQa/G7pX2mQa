import { BigNum } from '../util/bigNum.js';
import { getActiveSlot, isStorageKeyLocked } from '../util/storage.js';
import { getLabLevel, getRpMult } from '../ui/merchantTabs/labTab.js';

// --- Storage Keys ---
const NODE_LEVEL_KEY = (slot, id) => `ccc:lab:node:level:${slot}:${id}`;
const NODE_RP_KEY = (slot, id) => `ccc:lab:node:rp:${slot}:${id}`;
const NODE_ACTIVE_KEY = (slot, id) => `ccc:lab:node:active:${slot}:${id}`;

// --- Constants ---
export const RESEARCH_NODES = [
    {
        id: 0,
        title: "Tsunami Exponent Restoration",
        desc: "Increases the Tsunami exponent by +0.01 per level.",
        baseRpReq: 10,
        scale: 2.0,
        maxLevel: 10,
        x: 0,
        y: 0,
        icon: 'img/lab_icons/tsunami_exponent_buff.webp',
        effectPerLevel: 0.01
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
            active: false
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
    } catch {
        s.level = 0;
        s.rp = BigNum.fromInt(0);
        s.active = false;
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
}

export function isResearchNodeActive(id) {
    const s = ensureNodeState(id);
    return s.active;
}

export function setResearchNodeActive(id, active) {
    const slot = getActiveSlot();
    if (slot == null) return;
    
    const s = ensureNodeState(id);
    s.active = !!active;
    
    try {
        localStorage.setItem(NODE_ACTIVE_KEY(slot, id), s.active ? '1' : '0');
        window.dispatchEvent(new CustomEvent('lab:node:active', { detail: { id, active: s.active } }));
    } catch {}
}

// --- Logic ---

export function getResearchNodeRequirement(id) {
    const node = RESEARCH_NODES[id];
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
    const node = RESEARCH_NODES[0];
    const level = getResearchNodeLevel(0);
    return level * node.effectPerLevel;
}

export function tickResearch(dt) {
    const mult = getRpMult();
    if (mult.isZero?.()) return;

    // RP per second = 1 * Multiplier
    const rpPerSec = mult; 
    const rpPerTick = rpPerSec.mulDecimal(dt.toString(), 18);

    RESEARCH_NODES.forEach(node => {
        if (isResearchNodeActive(node.id)) {
            const currentRp = getResearchNodeRp(node.id);
            const req = getResearchNodeRequirement(node.id);
            
            if (getResearchNodeLevel(node.id) >= node.maxLevel) return;
            
            let nextRp = currentRp.add(rpPerTick);
            
            if (nextRp.cmp(req) >= 0) {
                nextRp = nextRp.sub(req);
                const oldLevel = getResearchNodeLevel(node.id);
                setResearchNodeLevel(node.id, oldLevel + 1);
            }
            
            setResearchNodeRp(node.id, nextRp);
        }
    });
}