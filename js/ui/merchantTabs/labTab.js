import { getActiveSlot, bank } from '../../util/storage.js';
import { IS_MOBILE } from '../../main.js';
import { BigNum } from '../../util/bigNum.js';
import { formatNumber } from '../../util/numFormat.js';
import { getTsunamiNerf, isSurgeActive, getEffectiveTsunamiNerf } from '../../game/surgeEffects.js';
import { registerTick } from '../../game/gameLoop.js';
import { applyStatMultiplierOverride } from '../../util/debugPanel.js';
import { 
    RESEARCH_NODES, 
    tickResearch,
    getResearchNodeLevel,
    getResearchNodeRp,
    isResearchNodeActive,
    setResearchNodeActive,
    getResearchNodeRequirement,
    getTsunamiResearchBonus,
    initLabMultipliers,
    isResearchNodeVisible,
    getLabCoinMultiplier,
    getLabXpMultiplier
} from '../../game/labNodes.js';
import { setupDragToClose } from '../shopOverlay.js';
import { formatMultForUi } from '../../game/upgrades.js';

const CAM_MAX_COORD = 1e308;
const CAM_MAX_ZOOM = 1e300;
const CAM_MIN_ZOOM = 1e-300;

const LAB_VISITED_KEY = (slot) => `ccc:lab:visited:${slot}`;
const LAB_LEVEL_KEY = (slot) => `ccc:lab:level:${slot}`;

// --- Caching ---
let _cachedLabLevel = null;
let _cachedLabVisited = null;
let _cachedSlot = null;

function reloadLabCache() {
    const slot = getActiveSlot();
    _cachedSlot = slot;
    
    if (slot == null) {
        _cachedLabLevel = BigNum.fromInt(0);
        _cachedLabVisited = false;
        return;
    }

    // Load Level
    try {
        const raw = localStorage.getItem(LAB_LEVEL_KEY(slot));
        if (!raw) _cachedLabLevel = BigNum.fromInt(0);
        else _cachedLabLevel = BigNum.fromAny(raw);
    } catch {
        _cachedLabLevel = BigNum.fromInt(0);
    }

    // Load Visited
    try {
        _cachedLabVisited = localStorage.getItem(LAB_VISITED_KEY(slot)) === '1';
    } catch {
        _cachedLabVisited = false;
    }
}

// --- Exported Getters/Setters ---

export function hasVisitedLab() {
  const slot = getActiveSlot();
  if (slot == null) return false;
  if (_cachedSlot !== slot || _cachedLabVisited === null) {
      reloadLabCache();
  }
  return _cachedLabVisited;
}

export function setLabVisited(value) {
  const slot = getActiveSlot();
  if (slot == null) return;
  const normalized = !!value;
  
  if (_cachedLabVisited === normalized && _cachedSlot === slot) return;
  _cachedLabVisited = normalized;

  try {
    localStorage.setItem(LAB_VISITED_KEY(slot), normalized ? '1' : '0');
  } catch {}
}

export const getLabLevelKey = (slot) => LAB_LEVEL_KEY(slot);

export function getLabLevel() {
  const slot = getActiveSlot();
  if (slot == null) return BigNum.fromInt(0);
  
  if (bank.coins.value.isInfinite()) {
      return BigNum.fromAny('Infinity');
  }
  
  if (_cachedSlot !== slot || _cachedLabLevel === null) {
      reloadLabCache();
  }
  return _cachedLabLevel;
}

export function setLabLevel(value) {
  const slot = getActiveSlot();
  if (slot == null) return;
  try {
    const valBn = BigNum.fromAny(value);
    
    // Ensure cache is loaded so we can compare
    if (_cachedSlot !== slot || _cachedLabLevel === null) {
        reloadLabCache();
    }
    
    if (valBn.cmp(_cachedLabLevel) === 0) return;

    _cachedLabLevel = valBn;
    localStorage.setItem(LAB_LEVEL_KEY(slot), valBn.toStorage());
    window.dispatchEvent(new CustomEvent('lab:level:change', { detail: { slot, level: valBn } }));
  } catch {}
}

export function getLabCost(level) {
    const lvl = BigNum.fromAny(level);
    if (lvl.isInfinite()) return BigNum.fromAny('Infinity');
    
    try {
        if (lvl.cmp(1e15) < 0) {
             const lvlNum = Number(lvl.toPlainIntegerString());
             const exponent = 20 + lvlNum;
             return new BigNum(1n, { base: exponent, offset: 0n });
        }
        
        if (lvl.cmp(BigNum.fromScientific("1e1000000")) > 0) {
             return BigNum.fromAny('Infinity');
        }
        
        const lvlStr = lvl.toPlainIntegerString();
        if (lvlStr === 'Infinity') return BigNum.fromAny('Infinity');
        
        const lvlBigInt = BigInt(lvlStr);
        const totalExponent = 20n + lvlBigInt;
        
        return new BigNum(1n, { base: 0, offset: totalExponent });

    } catch (e) {
        console.error("Error calculating lab cost", e);
        return BigNum.fromAny('Infinity');
    }
}

export function getLabLevelFromCoins(coins) {
    if (!coins || coins.isZero() || coins.isNegative()) return BigNum.fromInt(0);
    if (coins.isInfinite()) return BigNum.fromAny('Infinity');

    let exponentBn;
    if (coins._eOffset !== 0n) {
        const eVal = BigInt(coins.e) + coins._eOffset;
        const sigNum = Number(coins.sig);
        const logSig = Math.log10(sigNum);
        const logSigInt = Math.floor(logSig); 
        
        const levelBase = eVal - 20n + BigInt(logSigInt);
        
        if (levelBase < 0n) return BigNum.fromInt(0);
        
        return BigNum.fromInt(levelBase); 
    }
    
    const e = coins.e;
    const sigNum = Number(coins.sig);
    const logSig = Math.log10(sigNum);
    const val = e + logSig - 20;
    
    if (val < 0) return BigNum.fromInt(0);
    return BigNum.fromInt(Math.floor(val));
}

export function updateLabLevel() {
    const slot = getActiveSlot();
    if (slot != null && typeof window !== 'undefined' && window.__cccLockedStorageKeys?.has(LAB_LEVEL_KEY(slot))) {
        return;
    }

    const coins = bank.coins.value;
    const currentLevel = getLabLevel();
    
    if (coins.isInfinite()) {
        if (!currentLevel.isInfinite()) {
            setLabLevel(BigNum.fromAny('Infinity'));
        }
        return;
    }
    
    const targetLevel = getLabLevelFromCoins(coins);
    
    if (targetLevel.cmp(currentLevel) > 0) {
        setLabLevel(targetLevel);
    }
}

export function initLabLogic() {
    reloadLabCache();
    if (typeof window !== 'undefined') {
        window.addEventListener('saveSlot:change', reloadLabCache);
    }
    registerTick(updateLabLevel);
    // Also register research tick
    registerTick(tickResearch);
    initLabMultipliers();
}

// --- RP Logic Helper for Node ---

// Used by labNodes.js
function bigNumIsInfinite(bn) {
  return !!(bn && typeof bn === 'object' && (bn.isInfinite?.() || (typeof bn.isInfinite === 'function' && bn.isInfinite())));
}

function bigNumToFiniteNumber(bn) {
  if (!bn || typeof bn !== 'object') return 0;
  if (bigNumIsInfinite(bn)) return Number.POSITIVE_INFINITY;
  const sci = typeof bn.toScientific === 'function' ? bn.toScientific(18) : String(bn);
  if (!sci || sci === 'Infinity') return Number.POSITIVE_INFINITY;
  const match = sci.match(/^([0-9]+(?:\.[0-9]+)?)e([+-]?\d+)$/i);
  if (match) {
    const mant = parseFloat(match[1]);
    const exp = parseInt(match[2], 10);
    if (!Number.isFinite(mant) || !Number.isFinite(exp)) return Number.POSITIVE_INFINITY;
    if (exp >= 309) return Number.POSITIVE_INFINITY;
    return mant * Math.pow(10, exp);
  }
  const num = Number(sci);
  return Number.isFinite(num) ? num : Number.POSITIVE_INFINITY;
}

const infinityRequirementBn = BigNum.fromAny('Infinity');
const maxLog10Bn = BigNum.fromScientific(String(BigNum.MAX_E));

function bigNumPowerOf10(logBn) {
  if (bigNumIsInfinite(logBn) || (typeof logBn.cmp === 'function' && logBn.cmp(maxLog10Bn) >= 0)) {
      return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
  }

  const integerPart = logBn.floorToInteger();
  const fractionalPart = logBn.sub(integerPart);
  const fractionalNumber = bigNumToFiniteNumber(fractionalPart);

  if (!Number.isFinite(fractionalNumber)) {
      return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
  }

  let mantissa = Math.pow(10, fractionalNumber);
  mantissa = Number(mantissa.toPrecision(15));

  const precision = 18;
  const scaleFactor = 10n ** BigInt(precision);

  let exponentAdjustment = 0n;
  if (mantissa >= 10) {
      mantissa /= 10;
      exponentAdjustment = 1n;
  }

  const sig = BigInt(Math.round(mantissa * Number(scaleFactor)));

  const integerPartString = integerPart.toPlainIntegerString();
  if (integerPartString === 'Infinity') {
      return infinityRequirementBn.clone?.() ?? infinityRequirementBn;
  }
  const integerPartBigInt = BigInt(integerPartString);

  const totalExponent = integerPartBigInt + exponentAdjustment - BigInt(precision);

  const E_LIMIT = 250;
  const eBigInt = totalExponent % BigInt(E_LIMIT);
  const e = Number(eBigInt);
  const offset = totalExponent - eBigInt;

  return new BigNum(sig, { base: e, offset: offset });
}

export function getRpMultBase() {
    const level = getLabLevel();
    if (bigNumIsInfinite(level)) return BigNum.fromAny('Infinity');

    if (isSurgeActive(12)) {
        const effectiveNerf = getEffectiveTsunamiNerf();
        
        // Multiplier: 10^(5 * nerf) -> Log10 contribution: 5 * nerf
        const multLog10 = 5 * effectiveNerf;
        
        // Base: (2 + nerf/2)^level -> Log10 contribution: level * log10(2 + nerf/2)
        const base = 2 + (effectiveNerf / 2);
        const log10Base = Math.log10(base).toFixed(18);
        
        const exponentFromBase = level.mulDecimal(log10Base, 18);
        const exponent = exponentFromBase.add(BigNum.fromAny(String(multLog10)));
        
        return bigNumPowerOf10(exponent);
    }
    
    // 2^level = 10^(level * log10(2))
    const log10Of2 = "0.3010299956639812"; 
    
    const exponent = level.mulDecimal(log10Of2, 18);
    
    return bigNumPowerOf10(exponent);
}

export function getRpMult() {
    const base = getRpMultBase();
    if (typeof applyStatMultiplierOverride === 'function') {
        return applyStatMultiplierOverride('rp', base);
    }
    return base;
}

// --- UI Logic ---

let labSystem = null;

export function initLabTab(panel) {
  if (!panel) return;
  panel.innerHTML = '';
  panel.style.position = 'relative';
  panel.style.overflow = 'hidden';
  panel.style.height = '100%';
  panel.style.width = '100%';
  
  if (labSystem) {
      labSystem.destroy();
  }
  labSystem = new LabSystem(panel);
}

export function updateLabTab() {
  setLabVisited(true);
  if (labSystem) {
      labSystem.resize();
  }
}

const NODE_IMG_SIZE = 512 * 0.95;

class LabSystem {
    constructor(container) {
        this.container = container;
        this.canvas = document.createElement('canvas');
        this.canvas.classList.add('lab-bg-canvas');
        this.canvas.style.display = 'block';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        
        // Stats UI Container
        this.statsContainer = document.createElement('div');
        this.statsContainer.style.position = 'absolute';
        this.statsContainer.style.top = '0px';
        this.statsContainer.style.left = '50%';
        this.statsContainer.style.transform = 'translateX(-50%)';
        this.statsContainer.style.zIndex = '10';
        this.statsContainer.style.display = 'flex';
        this.statsContainer.style.flexDirection = 'column';
        this.statsContainer.style.alignItems = 'center';
        this.statsContainer.style.gap = '0px';
        this.statsContainer.style.pointerEvents = 'none';
        this.statsContainer.style.width = '100%'; 
        this.statsContainer.style.overflow = 'hidden';
        this.statsContainer.classList.add('lab-stats-container');

        const applyTextStyle = (el, fontSize, strokeWidth = '1px') => {
            el.style.fontFamily = 'var(--font-ui), system-ui, sans-serif';
            el.style.fontWeight = '900';
            el.style.color = '#fff';
            el.style.fontSize = fontSize;
            el.style.webkitTextStroke = `${strokeWidth} #000`;
            el.style.textShadow = '0 1px 0 rgba(0,0,0,0.35)';
            el.style.letterSpacing = '0.5px';
            el.style.lineHeight = '1';
            el.style.textAlign = 'center';
            el.style.whiteSpace = 'nowrap';
            el.style.overflow = 'hidden';
            el.style.textOverflow = 'ellipsis';
        };

        const applyBarStyle = (el) => {
            el.style.backgroundColor = '#151b2b'; 
            el.style.background = 'linear-gradient(180deg, #253650, #151b2b)';
            el.style.border = '3px solid #000';
            el.style.borderRadius = '0';
            el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.5)';
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
            el.style.boxSizing = 'border-box';
            el.style.margin = '0 auto'; 
        };

        // Lab Level Bar
        this.levelBar = document.createElement('div');
        this.levelBar.innerHTML = `Lab Level: ${formatNumber(getLabLevel())}`;
        applyBarStyle(this.levelBar);
        applyTextStyle(this.levelBar, '26px', '1px');
        this.levelBar.style.padding = '8px 12px';
        this.levelBar.style.height = '42px';
        this.levelBar.style.width = 'var(--coin-bar-w)'; 
        this.statsContainer.appendChild(this.levelBar);

        // Coins Needed Bar
        this.coinsBar = document.createElement('div');
        this.coinsBar.innerHTML = 'Coins needed to increment Lab Level: 0';
        applyBarStyle(this.coinsBar);
        applyTextStyle(this.coinsBar, '16px', '0.9px');
        this.coinsBar.style.padding = '6px 12px';
        this.coinsBar.style.height = '32px';
        this.coinsBar.style.width = 'calc(var(--coin-bar-w) * 0.9)'; 
        this.coinsBar.style.pointerEvents = 'auto'; 
        this.coinsBar.style.cursor = 'pointer';
        
        this.coinsBar.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            updateLabLevel();
        });
        
        this.statsContainer.appendChild(this.coinsBar);

        // Nerf Exponent Bar
        this.nerfBar = document.createElement('div');
        this.nerfBar.textContent = 'Tsunami Exponent: ^0.00';
        applyBarStyle(this.nerfBar);
        applyTextStyle(this.nerfBar, '14px', '0.8px');
        this.nerfBar.style.padding = '4px 12px';
        this.nerfBar.style.height = '26px';
        this.nerfBar.style.width = 'calc(var(--coin-bar-w) * 0.8)';
        this.statsContainer.appendChild(this.nerfBar);

        this.container.appendChild(this.statsContainer);
        
        // Return Button
        this.returnBtn = document.createElement('button');
        this.returnBtn.textContent = 'Return to (0,0)';
        this.returnBtn.style.position = 'absolute';
        this.returnBtn.style.top = '50%';
        this.returnBtn.style.left = '50%';
        this.returnBtn.style.transform = 'translate(-50%, -50%)';
        this.returnBtn.style.zIndex = '10';
        this.returnBtn.style.display = 'none';
        this.returnBtn.style.padding = '10px 20px';
        this.returnBtn.style.fontSize = '16px';
        this.returnBtn.style.cursor = 'pointer';
        this.returnBtn.style.backgroundColor = '#151b2b';
        this.returnBtn.style.background = 'linear-gradient(180deg, #253650, #151b2b)';
        this.returnBtn.style.color = '#fff';
        this.returnBtn.style.border = '2px solid #000';
        this.returnBtn.style.borderRadius = '4px';
        
        this.returnBtn.addEventListener('click', () => {
            this.camX = 0;
            this.camY = 0;
            this.zoom = 0.15;
            this.returnBtn.style.display = 'none';
        });
        
        this.container.appendChild(this.returnBtn);
        
        // Help Text
        this.helpText = document.createElement('div');
        this.helpText.style.position = 'absolute';
        this.helpText.style.bottom = '8px';
        this.helpText.style.left = '12px';
        this.helpText.style.pointerEvents = 'none';
        this.helpText.style.zIndex = '10';
        this.helpText.style.fontFamily = 'var(--font-ui), system-ui, sans-serif';
        this.helpText.style.fontSize = '14px';
        this.helpText.style.lineHeight = '1.5';
        this.helpText.style.textShadow = '0 1px 2px rgba(0,0,0,0.8)';
        
        const lines = IS_MOBILE ? [
            ['Node Details:', 'Tap'],
            ['Move Camera:', 'Tap and hold'],
            ['Zoom In/Out:', 'Pinch screen']
        ] : [
            ['Node Details:', 'Left click'],
            ['Toggle Node:', 'Right click'],
            ['Move Camera:', 'Left click and drag or WASD'],
            ['Zoom In/Out:', 'Scroll']
        ];
        
        let helpHtml = '';
        for (const [label, val] of lines) {
            helpHtml += `<div><span style="color: #fff; font-weight: 400;">${label}</span><span style="color: #ccc; margin-left: 6px;">${val}</span></div>`;
        }
        this.helpText.innerHTML = helpHtml;
        this.container.appendChild(this.helpText);
        
        this.camX = 0;
        this.camY = 0;
        this.zoom = 0.15;
        this.bursts = [];

        this.baseImage = new Image();
        this.baseImage.src = 'img/stats/rp/rp_base.webp';

        this.activeBorderImage = new Image();
        this.activeBorderImage.src = 'img/misc/green_border.webp';

        this.maxedBorderImage = new Image();
        this.maxedBorderImage.src = 'img/misc/maxed.webp';

        this.nodeImages = {};
        
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.lastMouse = { x: 0, y: 0 };
        this.dragDistance = 0;
        
        this.keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
        this.lastTime = 0;
        this.frameId = null;
        
        this.pinchDist = null;
        this.lastTouch = null; 

        this.binds = [];
        this.setupInput();
        
        this.observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                this.start();
            } else {
                this.stop();
            }
        }, { threshold: 0 });
        this.observer.observe(container);
        
        requestAnimationFrame(() => this.resize());
        this.lastRenderedLevel = null;
    }
    
    addBind(target, type, handler, opts) {
        target.addEventListener(type, handler, opts);
        this.binds.push({ target, type, handler });
    }
    
    setupInput() {
        this.addBind(this.canvas, 'contextmenu', (e) => e.preventDefault());
        this.addBind(this.canvas, 'mousedown', this.onMouseDown.bind(this));
        this.addBind(window, 'mousemove', this.onMouseMove.bind(this));
        this.addBind(window, 'mouseup', this.onMouseUp.bind(this));
        this.addBind(this.canvas, 'wheel', this.onWheel.bind(this), { passive: false });
        
        this.addBind(this.canvas, 'touchstart', this.onTouchStart.bind(this), { passive: false });
        this.addBind(this.canvas, 'touchmove', this.onTouchMove.bind(this), { passive: false });
        this.addBind(this.canvas, 'touchend', this.onTouchEnd.bind(this));
        
        this.addBind(window, 'keydown', (e) => { if(this.keys.hasOwnProperty(e.code)) this.keys[e.code] = true; });
        this.addBind(window, 'keyup', (e) => { if(this.keys.hasOwnProperty(e.code)) this.keys[e.code] = false; });
        
        this.addBind(window, 'resize', this.resize.bind(this));
    }
    
    destroy() {
        this.stop();
        this.observer.disconnect();
        for (const b of this.binds) {
            b.target.removeEventListener(b.type, b.handler);
        }
        this.canvas.remove();
        this.returnBtn.remove();
        this.helpText.remove();
        this.statsContainer.remove();
        if (this.overlay) {
            this.overlay.remove();
        }
    }
    
    resize() {
        if (!this.container.isConnected) return;
        const rect = this.container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.width = rect.width;
        this.height = rect.height;
        this.canvas.width = Math.floor(this.width * dpr);
        this.canvas.height = Math.floor(this.height * dpr);
        this.ctx.scale(dpr, dpr);
        this.render(); 
    }
    
    start() {
        if (!this.frameId) {
            this.lastTime = performance.now();
            this.loop();
        }
    }
    
    stop() {
        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
    }
    
    loop() {
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.1); 
        this.lastTime = now;
        
        this.update(dt);
        this.render();
        
        this.frameId = requestAnimationFrame(() => this.loop());
    }
    
    checkBounds() {
        const tooFar = Math.abs(this.camX) > 1e10 || Math.abs(this.camY) > 1e10;
        const badZoom = this.zoom > 1e10 || this.zoom < 1e-10;
        
        if (tooFar || badZoom) {
            this.returnBtn.style.display = 'block';
        } else {
            this.returnBtn.style.display = 'none';
        }

        // Hard limits to prevent crashes (although loop protection should handle rendering)
        if (this.camX > CAM_MAX_COORD) this.camX = CAM_MAX_COORD;
        if (this.camX < -CAM_MAX_COORD) this.camX = -CAM_MAX_COORD;
        if (this.camY > CAM_MAX_COORD) this.camY = CAM_MAX_COORD;
        if (this.camY < -CAM_MAX_COORD) this.camY = -CAM_MAX_COORD;
        
        if (this.zoom > CAM_MAX_ZOOM) this.zoom = CAM_MAX_ZOOM;
        if (this.zoom < CAM_MIN_ZOOM) this.zoom = CAM_MIN_ZOOM;
    }
    
    update(dt) {
        this.checkBounds();

        const currentLevel = getLabLevel();
        const cost = getLabCost(currentLevel.add(1));
        
        const baseNerf = getTsunamiNerf();
        const bonus = getTsunamiResearchBonus();
        let effectiveNerf = baseNerf + bonus;
        if (effectiveNerf > 1) effectiveNerf = 1;
        
        if (!this.lastRenderedLevel || currentLevel.cmp(this.lastRenderedLevel) !== 0 || !this.lastCost || cost.cmp(this.lastCost) !== 0) {
            this.levelBar.innerHTML = `Lab Level: ${formatNumber(currentLevel)}`;
            this.coinsBar.innerHTML = `Coins needed to increment Lab Level: ${formatNumber(cost)}`; 
            this.lastRenderedLevel = currentLevel;
            this.lastCost = cost;
        }

        if (effectiveNerf !== this.lastRenderedNerf) {
            this.nerfBar.textContent = `Tsunami Exponent: ^${effectiveNerf.toFixed(2)}`;
            this.lastRenderedNerf = effectiveNerf;
        }
        
        // Update Bursts
        for (let i = this.bursts.length - 1; i >= 0; i--) {
            const b = this.bursts[i];
            b.time += dt;

            for(const p of b.particles) {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.vx *= 0.95; 
                p.vy *= 0.95;
            }

            if (b.time >= b.life) {
                this.bursts.splice(i, 1);
            }
        }
        
        // WASD Movement
        const baseSpeed = 500;
        const speed = baseSpeed / this.zoom; 
        let dx = 0;
        let dy = 0;
        if (this.keys.KeyW) dy -= 1;
        if (this.keys.KeyS) dy += 1;
        if (this.keys.KeyA) dx -= 1;
        if (this.keys.KeyD) dx += 1;
        
        if (dx !== 0 || dy !== 0) {
            const len = Math.sqrt(dx*dx + dy*dy);
            dx /= len;
            dy /= len;
            this.camX += dx * speed * dt;
            this.camY += dy * speed * dt;
        }

        // Update active overlay if open
        if (this.activeOverlayId != null) {
            this.updateNodeOverlay();
        }
    }
    
    getNodePosition(node) {
        // Absolute coordinates
        return { x: node.x, y: node.y };
    }

    render() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const z = this.zoom;
        
        ctx.fillStyle = '#080d18';
        ctx.fillRect(0, 0, w, h);
        
        // --- Grid ---
        const baseGridSize = 100;
        const logZoom = Math.log10(z);
        const k = Math.floor(-logZoom + 0.3);
        const targetScreenSize = 100;
        const idealWorldUnit = targetScreenSize / z;
        const power = Math.floor(Math.log10(idealWorldUnit));
        const unit = Math.pow(10, power);
        
        const drawGrid = (gridUnit, opacity) => {
            if (opacity <= 0) return;
            ctx.strokeStyle = `rgba(60, 100, 160, ${0.15 * opacity})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            
            const startX = Math.floor((this.camX - (w/2)/z) / gridUnit) * gridUnit;
            const endX = Math.ceil((this.camX + (w/2)/z) / gridUnit) * gridUnit;
            if ((endX - startX) / gridUnit > 1000) return; 

            for (let x = startX; x <= endX; x += gridUnit) {
                // Safeguard against infinite loops due to precision loss
                if (x + gridUnit <= x) break;
                
                const sx = (x - this.camX) * z + w/2;
                ctx.moveTo(sx, 0);
                ctx.lineTo(sx, h);
            }
            const startY = Math.floor((this.camY - (h/2)/z) / gridUnit) * gridUnit;
            const endY = Math.ceil((this.camY + (h/2)/z) / gridUnit) * gridUnit;
            for (let y = startY; y <= endY; y += gridUnit) {
                // Safeguard against infinite loops due to precision loss
                if (y + gridUnit <= y) break;

                const sy = (y - this.camY) * z + h/2;
                ctx.moveTo(0, sy);
                ctx.lineTo(w, sy);
            }
            ctx.stroke();
        };

        const screenUnit = unit * z;
        const alpha = Math.max(0, Math.min(1, (screenUnit - 15) / 25));
        
        drawGrid(unit, alpha);
        drawGrid(unit * 10, 1.0);
        
        ctx.strokeStyle = 'rgba(60, 100, 160, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const axisY = (0 - this.camY) * z + h/2;
        if (axisY >= -10 && axisY <= h+10) {
             ctx.moveTo(0, axisY);
             ctx.lineTo(w, axisY);
        }
        const axisX = (0 - this.camX) * z + w/2;
        if (axisX >= -10 && axisX <= w+10) {
            ctx.moveTo(axisX, 0);
            ctx.lineTo(axisX, h);
        }
        ctx.stroke();
        
        // --- Calculate Visibility & Positions ---
        const visibleNodes = [];
        const nodePositions = new Map();
        
        for (const node of RESEARCH_NODES) {
             if (isResearchNodeVisible(node.id)) {
                 visibleNodes.push(node);
                 nodePositions.set(node.id, this.getNodePosition(node));
             }
        }

        // --- Draw Connections ---
        ctx.strokeStyle = '#2a5298'; // Dark blue
        ctx.lineWidth = 20 * z;
        ctx.lineCap = 'round';
        ctx.beginPath();
        
        for (const node of visibleNodes) {
             // Draw lines to ALL visible parents
             if (node.parentIds && node.parentIds.length > 0) {
                 for (const parentId of node.parentIds) {
                     const parent = RESEARCH_NODES.find(n => n.id === parentId);
                     if (parent && nodePositions.has(parent.id)) {
                         const start = nodePositions.get(parent.id);
                         const end = nodePositions.get(node.id);
                         
                         const sx = (start.x - this.camX) * z + w/2;
                         const sy = (start.y - this.camY) * z + h/2;
                         const ex = (end.x - this.camX) * z + w/2;
                         const ey = (end.y - this.camY) * z + h/2;
                         
                         ctx.moveTo(sx, sy);
                         ctx.lineTo(ex, ey);
                     }
                 }
             }
        }
        ctx.stroke();

        // --- Draw Nodes ---
        const imgSize = NODE_IMG_SIZE;
        const imgScreenSize = imgSize * z;
        const baseSize = imgSize * 1.6;
        const baseScreenSize = baseSize * z;
        
        for (const node of visibleNodes) {
             const pos = nodePositions.get(node.id);
             const cx = (pos.x - this.camX) * z + w/2;
             const cy = (pos.y - this.camY) * z + h/2;
             
             // Check visibility
             const nodeLevel = getResearchNodeLevel(node.id);
             const isMaxed = nodeLevel >= node.maxLevel;
             const hasBar = true;
             
             const bottomBound = 0.8;
             
             if (cx + baseScreenSize/2 < 0 || cx - baseScreenSize/2 > w ||
                 cy + baseScreenSize * bottomBound < 0 || cy - baseScreenSize/2 > h) {
                 continue;
             }
             
             // Draw Base
             if (this.baseImage.complete && this.baseImage.naturalWidth !== 0) {
                 ctx.drawImage(this.baseImage, cx - baseScreenSize/2, cy - baseScreenSize/2, baseScreenSize, baseScreenSize);
             }
             
             // Draw Active/Maxed Border
             if (isMaxed) {
                 if (this.maxedBorderImage.complete && this.maxedBorderImage.naturalWidth !== 0) {
                     ctx.drawImage(this.maxedBorderImage, cx - baseScreenSize/2, cy - baseScreenSize/2, baseScreenSize, baseScreenSize);
                 }
             } else if (isResearchNodeActive(node.id)) {
                 if (this.activeBorderImage.complete && this.activeBorderImage.naturalWidth !== 0) {
                     ctx.drawImage(this.activeBorderImage, cx - baseScreenSize/2, cy - baseScreenSize/2, baseScreenSize, baseScreenSize);
                 }
             }

             // Draw Icon
             let img = this.nodeImages[node.id];
             if (!img) {
                 img = new Image();
                 img.src = 'img/' + node.icon;
                 this.nodeImages[node.id] = img;
             }
             
             if (img.complete && img.naturalWidth !== 0) {
                 ctx.drawImage(img, cx - imgScreenSize/2, cy - imgScreenSize/2, imgScreenSize, imgScreenSize);
             }

             // Draw Active Progress Bar
             if (hasBar) {
                 const req = getResearchNodeRequirement(node.id);
                 let progress = 0;
                 
                 if (isMaxed) {
                     progress = 1;
                 } else {
                     // Handle progress calculation safely
                     if (req.isInfinite?.() || (typeof req.cmp === 'function' && req.cmp(BigNum.fromAny('Infinity')) === 0)) {
                         progress = 0;
                     } else {
                         const rp = getResearchNodeRp(node.id);
                         if (rp.isZero?.()) {
                             progress = 0;
                         } else {
                             try {
                                if (req.isZero?.()) {
                                    progress = 1;
                                } else {
                                    const ratio = rp.div(req);
                                    const ratioSci = ratio.toScientific(5);
                                    progress = Number(ratioSci);
                                }
                             } catch (e) {
                                progress = 0;
                             }
                         }
                     }
                 }
                 
                 progress = Math.max(0, Math.min(1, progress));
                 
                 const barWidth = baseScreenSize * 0.96;
                 const barHeight = baseScreenSize * 0.18;
                 const barX = cx - barWidth / 2;
                 const barY = cy + baseScreenSize / 2 + (baseScreenSize * 0.05); 
                 
                 // Background
                 ctx.fillStyle = '#111';
                 ctx.fillRect(barX, barY, barWidth, barHeight);
                 
                 // Progress Fill (Darkish Blue Gradient)
                 const grad = ctx.createLinearGradient(barX, barY, barX, barY + barHeight);
                 grad.addColorStop(0, '#2a5298');
                 grad.addColorStop(1, '#1e3c72');
                 
                 ctx.fillStyle = grad;
                 ctx.fillRect(barX, barY, barWidth * progress, barHeight);
                 
                 // Border
                 ctx.strokeStyle = '#fff';
                 ctx.lineWidth = Math.max(1, 2 * z); 
                 ctx.strokeRect(barX, barY, barWidth, barHeight);
                 
                 // Text
                 ctx.fillStyle = '#fff';
                 ctx.font = `bold ${barHeight * 0.7}px system-ui`;
                 ctx.textAlign = 'center';
                 ctx.textBaseline = 'alphabetic';
                 ctx.strokeStyle = '#000';
                 ctx.lineWidth = Math.max(0.5, barHeight * 0.08); 
                 
                 let text = '';
                 {
                     let lvlStr = formatNumber(BigNum.fromAny(nodeLevel));
                     if (lvlStr.indexOf('<') >= 0) lvlStr = '∞';
                     text = `Level ${lvlStr}`;
                 }
                 if (isMaxed) {
                     text = node.maxLevel === 1 ? 'UNLOCKED' : 'MAXED';
                 }

                 const metrics = ctx.measureText(text);
                 const textY = barY + barHeight / 2 + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;

                 ctx.strokeText(text, barX + barWidth / 2, textY);
                 ctx.fillText(text, barX + barWidth / 2, textY);
             }
        }

        // Draw Bursts
        const MAX_RADIUS = 35;
        const ringConfigs = [
            { delay: 0.00, dur: 0.50 },
            { delay: 0.05, dur: 0.55 },
            { delay: 0.10, dur: 0.60 }
        ];
        
        for (const b of this.bursts) {
            const cx = (b.x - this.camX) * this.zoom + w/2;
            const cy = (b.y - this.camY) * this.zoom + h/2;
            
            for (let i = 0; i < ringConfigs.length; i++) {
                const r = ringConfigs[i];
                const rt = b.time - r.delay;
                if (rt > 0 && rt < r.dur) {
                    const prog = rt / r.dur;
                    const ease = 1 - Math.pow(1 - prog, 3);
                    const rad = MAX_RADIUS * ease;
                    const alpha = Math.max(0, 1 - Math.pow(prog, 2));

                    const visibilityBoost = 1.0 + (i * 0.5); 
                    const grad = ctx.createRadialGradient(cx, cy, rad * 0.6, cx, cy, rad);
                    
                    grad.addColorStop(0, `rgba(255, 200, 50, 0)`);
                    grad.addColorStop(0.7, `rgba(255, 170, 20, ${Math.min(1, alpha * 0.15 * visibilityBoost)})`);
                    grad.addColorStop(0.9, `rgba(255, 240, 80, ${Math.min(1, alpha * 0.2 * visibilityBoost)})`);
                    grad.addColorStop(1, `rgba(255, 200, 50, 0)`);
                    
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#ffff00';
            for(const p of b.particles) {
                if (b.time < p.life) {
                    const pAlpha = 1 - (b.time / p.life);
                    const px = cx + p.x;
                    const py = cy + p.y;
                    
                    ctx.fillStyle = `rgba(255, 255, 150, ${pAlpha})`;
                    ctx.beginPath();
                    ctx.arc(px, py, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.shadowBlur = 0;
        }
    }
    
    addBurst(x, y) {
        const particles = [];
        const count = 10;
        for(let i=0; i<count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 30 + Math.random() * 40;
            particles.push({
                x: 0, 
                y: 0,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.4 + Math.random() * 0.3
            });
        }
        this.bursts.push({ x, y, time: 0, life: 0.7, particles });
    }

    addBurstFromScreen(mx, my) {
        const rect = this.canvas.getBoundingClientRect();
        const x = mx - rect.left;
        const y = my - rect.top;
        const wx = this.camX + (x - this.width/2) / this.zoom;
        const wy = this.camY + (y - this.height/2) / this.zoom;
        this.addBurst(wx, wy);
    }

    handleClick(x, y) {
        // x,y in screen coords
        const rect = this.canvas.getBoundingClientRect();
        const mx = x - rect.left;
        const my = y - rect.top;
        const wx = this.camX + (mx - this.width/2) / this.zoom;
        const wy = this.camY + (my - this.height/2) / this.zoom;
        
        // Check for node click
        const clickRadius = (NODE_IMG_SIZE / 2) * 1.6; // Base size radius in world units
        
        for (const node of RESEARCH_NODES) {
            if (!isResearchNodeVisible(node.id)) continue;
            
            const pos = this.getNodePosition(node);
            const dx = wx - pos.x;
            const dy = wy - pos.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist <= clickRadius) {
                this.openNodeOverlay(node.id);
                return;
            }
        }
    }

    // -- Overlay UI --
    openNodeOverlay(id) {
        const node = RESEARCH_NODES.find(n => n.id === id);
        if (!node) return;
        
        this.activeOverlayId = id;
        
        if (this.overlay) {
            this.overlay.remove();
        }
        
        this.overlay = document.createElement('div');
        this.overlay.className = 'upg-overlay'; 
        this.overlay.style.zIndex = '4005';
        
        const sheet = document.createElement('div');
        sheet.className = 'upg-sheet';
        sheet.style.gridTemplateRows = 'auto auto 1fr auto';
        
        const grabber = document.createElement('div');
        grabber.className = 'upg-grabber';
        grabber.innerHTML = `<div class="grab-handle"></div>`;
        
        const header = document.createElement('div');
        header.className = 'upg-header';
        
        const title = document.createElement('div');
        title.className = 'upg-title';
        title.textContent = node.title;
        
        this.overlayLevel = document.createElement('div');
        this.overlayLevel.className = 'upg-level'; 
        
        header.append(title, this.overlayLevel);
        
        const content = document.createElement('div');
        content.className = 'upg-content';
        
        // Description
        const desc = document.createElement('div');
        desc.className = 'upg-desc centered';
        desc.innerHTML = node.desc;
        
        const info = document.createElement('div');
        info.className = 'upg-info';
        
        // Bonus (Effect)
        this.overlayBonus = document.createElement('div');
        this.overlayBonus.className = 'upg-line';
        
        // Active Status
        this.overlayActiveStatus = document.createElement('div');
        this.overlayActiveStatus.className = 'upg-line';
        
        // Progress
        this.overlayProgress = document.createElement('div');
        this.overlayProgress.className = 'upg-line';
        this.overlayProgress.style.color = '#aaa';
        
        info.append(this.overlayBonus, this.overlayActiveStatus, this.overlayProgress);
        content.append(desc, info);
        
        // Actions
        const actions = document.createElement('div');
        actions.className = 'upg-actions';
        
        this.overlayToggleBtn = document.createElement('button');
        this.overlayToggleBtn.className = 'shop-delve';
        this.overlayToggleBtn.textContent = 'Toggle';
        this.overlayToggleBtn.onclick = () => {
             const active = isResearchNodeActive(id);
             setResearchNodeActive(id, !active);
             this.updateNodeOverlay();
        };
        
        const closeBtn = document.createElement('button');
        closeBtn.className = 'shop-close';
        closeBtn.textContent = 'Close';
        closeBtn.onclick = () => {
            this.activeOverlayId = null;
            if (this.overlay) {
                this.overlay.classList.remove('is-open');
                setTimeout(() => {
                    if (this.overlay) {
                        this.overlay.remove();
                        this.overlay = null;
                    }
                }, 300);
            }
        };
        
        actions.append(closeBtn, this.overlayToggleBtn);
        
        sheet.append(grabber, header, content, actions);
        this.overlay.appendChild(sheet);
        document.body.appendChild(this.overlay);
        
        setupDragToClose(grabber, sheet, () => !!this.overlay, () => closeBtn.click());
        
        requestAnimationFrame(() => {
            if (this.overlay) {
                this.overlay.classList.add('is-open');
            }
        });
        
        this.updateNodeOverlay();
    }
    
    updateNodeOverlay() {
        if (this.activeOverlayId == null || !this.overlay) return;
        const node = RESEARCH_NODES.find(n => n.id === this.activeOverlayId);
        if (!node || !isResearchNodeVisible(node.id)) {
            if (this.overlay) this.overlay.remove();
            this.activeOverlayId = null;
            this.overlay = null;
            return;
        }
        
        const level = getResearchNodeLevel(node.id);
        const rp = getResearchNodeRp(node.id);
        const req = getResearchNodeRequirement(node.id);
        const active = isResearchNodeActive(node.id);
        
        const isMaxed = level >= node.maxLevel;
        
        if (isMaxed) {
             const statusText = '(MAXED)';
             this.overlayLevel.innerHTML = `Level ${formatNumber(BigNum.fromAny(level))} / ${formatNumber(BigNum.fromAny(node.maxLevel))} ${statusText}`;
             this.overlayActiveStatus.style.display = 'none';
             this.overlayProgress.style.display = 'none';
             if (this.overlayToggleBtn) this.overlayToggleBtn.style.display = 'none';
        } else {
             this.overlayLevel.innerHTML = `Level ${formatNumber(BigNum.fromAny(level))} / ${formatNumber(BigNum.fromAny(node.maxLevel))}`;
             this.overlayActiveStatus.style.display = '';
             this.overlayProgress.style.display = '';
             if (this.overlayToggleBtn) this.overlayToggleBtn.style.display = '';
        }
        
        if (typeof node.bonusLine === 'function') {
            const line = node.bonusLine(level);
            if (line) {
                this.overlayBonus.style.display = '';
                this.overlayBonus.innerHTML = line;
            } else {
                this.overlayBonus.style.display = 'none';
            }
        } else {
            this.overlayBonus.style.display = 'none';
        }
        
        if (!isMaxed) {
            this.overlayActiveStatus.textContent = `Currently active: ${active ? 'Yes' : 'No'}`;
            this.overlayActiveStatus.style.color = active ? '#4f4' : '#f44';
            this.overlayActiveStatus.style.webkitTextFillColor = active ? '#4f4' : '#f44';
            
            const rpFmt = rp.cmp(1e9) > 0 ? formatNumber(rp) : rp.toString();
            const reqFmt = req.isInfinite?.() ? 'Infinity' : (req.cmp(1e9) > 0 ? formatNumber(req) : req.toString());
            
            this.overlayProgress.innerHTML = `RP to next level: ${formatNumber(rp)} / ${formatNumber(req)}`;
        }
    }

    // -- Input Handlers --
    
    handleRightClick(x, y) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = x - rect.left;
        const my = y - rect.top;
        const wx = this.camX + (mx - this.width/2) / this.zoom;
        const wy = this.camY + (my - this.height/2) / this.zoom;
        
        const clickRadius = (NODE_IMG_SIZE / 2) * 1.6;
        
        for (const node of RESEARCH_NODES) {
            if (!isResearchNodeVisible(node.id)) continue;
            
            const pos = this.getNodePosition(node);
            const dx = wx - pos.x;
            const dy = wy - pos.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist <= clickRadius) {
                 const level = getResearchNodeLevel(node.id);
                 if (level >= node.maxLevel) return;

                 const active = isResearchNodeActive(node.id);
                 setResearchNodeActive(node.id, !active);

                 if (this.activeOverlayId === node.id) {
                     this.updateNodeOverlay();
                 }
                 return;
            }
        }
    }

    onMouseDown(e) {
        if (e.button === 2) {
            this.handleRightClick(e.clientX, e.clientY);
            return;
        }
        if (e.button !== 0) return;
        this.isDragging = true;
        this.dragStart = { x: e.clientX, y: e.clientY };
        this.lastMouse = { x: e.clientX, y: e.clientY };
        this.addBurstFromScreen(e.clientX, e.clientY);
    }
    
    onMouseMove(e) {
        if (this.isDragging) {
            const dx = e.clientX - this.lastMouse.x;
            const dy = e.clientY - this.lastMouse.y;
            this.lastMouse = { x: e.clientX, y: e.clientY };
            
            this.camX -= dx / this.zoom;
            this.camY -= dy / this.zoom;
            this.canvas.style.cursor = 'grabbing';
            return;
        }

        // Hover logic
        this.lastMouse = { x: e.clientX, y: e.clientY };
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const wx = this.camX + (mx - this.width/2) / this.zoom;
        const wy = this.camY + (my - this.height/2) / this.zoom;

        let hovering = false;
        const clickRadius = (NODE_IMG_SIZE / 2) * 1.6;
        for (const node of RESEARCH_NODES) {
            if (!isResearchNodeVisible(node.id)) continue;
            
            const pos = this.getNodePosition(node);
            const dx = wx - pos.x;
            const dy = wy - pos.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist <= clickRadius) {
                hovering = true;
                break;
            }
        }
        this.canvas.style.cursor = hovering ? 'pointer' : 'default';
    }
    
    onMouseUp(e) {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.canvas.style.cursor = 'default';
        
        const dist = Math.sqrt(Math.pow(e.clientX - this.dragStart.x, 2) + Math.pow(e.clientY - this.dragStart.y, 2));
        if (dist < 10) { // Threshold for click
             this.handleClick(e.clientX, e.clientY);
        }
        
        // Trigger a move update to set correct hover cursor immediately
        this.onMouseMove(e);
    }
    
    onWheel(e) {
        e.preventDefault();
        const sensitivity = 0.001;
        const delta = -e.deltaY * sensitivity;
        const oldZoom = this.zoom;
        let newZoom = oldZoom * (1 + delta);
        
        // Clamp newZoom immediately to prevent camera drift at limits
        if (newZoom < CAM_MIN_ZOOM) newZoom = CAM_MIN_ZOOM;
        if (newZoom > CAM_MAX_ZOOM) newZoom = CAM_MAX_ZOOM;
        
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        
        const mouseWorldX = this.camX + (mx - this.width/2) / oldZoom;
        const mouseWorldY = this.camY + (my - this.height/2) / oldZoom;
        
        this.zoom = newZoom;
        
        this.camX = mouseWorldX - (mx - this.width/2) / newZoom;
        this.camY = mouseWorldY - (my - this.height/2) / newZoom;
    }
    
    // Touch
    getTouchDist(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx*dx + dy*dy);
    }
    
    getTouchCenter(touches) {
        return {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2
        };
    }
    
    onTouchStart(e) {
        e.preventDefault(); 
        if (e.touches.length === 1) {
            this.isDragging = true;
            this.lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            this.dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            this.addBurstFromScreen(e.touches[0].clientX, e.touches[0].clientY);
        } else if (e.touches.length === 2) {
            this.isDragging = false; 
            this.pinchDist = this.getTouchDist(e.touches);
        }
    }
    
    onTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 1 && this.isDragging) {
            const dx = e.touches[0].clientX - this.lastTouch.x;
            const dy = e.touches[0].clientY - this.lastTouch.y;
            this.lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            
            this.camX -= dx / this.zoom;
            this.camY -= dy / this.zoom;
        } else if (e.touches.length === 2) {
            const dist = this.getTouchDist(e.touches);
            if (this.pinchDist > 0) {
                const scale = dist / this.pinchDist;
                
                const oldZoom = this.zoom;
                let newZoom = oldZoom * scale;
                // Clamp newZoom immediately to prevent camera drift at limits
                if (newZoom < CAM_MIN_ZOOM) newZoom = CAM_MIN_ZOOM;
                if (newZoom > CAM_MAX_ZOOM) newZoom = CAM_MAX_ZOOM;
                
                const center = this.getTouchCenter(e.touches);
                const rect = this.canvas.getBoundingClientRect();
                const mx = center.x - rect.left;
                const my = center.y - rect.top;
                
                const worldX = this.camX + (mx - this.width/2) / oldZoom;
                const worldY = this.camY + (my - this.height/2) / oldZoom;
                
                this.zoom = newZoom;
                this.camX = worldX - (mx - this.width/2) / newZoom;
                this.camY = worldY - (my - this.height/2) / newZoom;
                
                this.pinchDist = dist;
            }
        }
    }
    
    onTouchEnd(e) {
        if (e.touches.length === 0) {
            if (this.isDragging) {
                 const dist = Math.sqrt(Math.pow(this.lastTouch.x - this.dragStart.x, 2) + Math.pow(this.lastTouch.y - this.dragStart.y, 2));
                 if (dist < 10) {
                     this.handleClick(this.lastTouch.x, this.lastTouch.y);
                 }
            }
            this.isDragging = false;
        } else if (e.touches.length === 1) {
            this.isDragging = true;
            this.lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    }
}
