import { getActiveSlot, bank } from '../../util/storage.js';
import { IS_MOBILE } from '../../main.js';
import { BigNum } from '../../util/bigNum.js';
import { formatNumber } from '../../util/numFormat.js';
import { getTsunamiNerf } from '../../game/surgeEffects.js';

const LAB_VISITED_KEY = (slot) => `ccc:lab:visited:${slot}`;

export function hasVisitedLab() {
  const slot = getActiveSlot();
  if (slot == null) return false;
  try {
    return localStorage.getItem(LAB_VISITED_KEY(slot)) === '1';
  } catch {
    return false;
  }
}

export function setLabVisited(value) {
  const slot = getActiveSlot();
  if (slot == null) return;
  const normalized = !!value;
  try {
    localStorage.setItem(LAB_VISITED_KEY(slot), normalized ? '1' : '0');
  } catch {}
}

export const getLabLevelKey = (slot) => `ccc:lab:level:${slot}`;

export function getLabLevel() {
  const slot = getActiveSlot();
  if (slot == null) return BigNum.fromInt(0);
  
  // If coins are infinite, Lab Level is effectively infinite
  if (bank.coins.value.isInfinite()) {
      return BigNum.fromAny('Infinity');
  }
  
  try {
    const raw = localStorage.getItem(getLabLevelKey(slot));
    if (!raw) return BigNum.fromInt(0);
    // Support legacy BigInt parsing or new BigNum storage
    return BigNum.fromAny(raw);
  } catch {
    return BigNum.fromInt(0);
  }
}

export function setLabLevel(value) {
  const slot = getActiveSlot();
  if (slot == null) return;
  try {
    const valBn = BigNum.fromAny(value);
    localStorage.setItem(getLabLevelKey(slot), valBn.toStorage());
    window.dispatchEvent(new CustomEvent('lab:level:change', { detail: { slot, level: valBn } }));
  } catch {}
}

export function getLabCost(level) {
    // Cost = 10^(30 + level)
    const lvl = BigNum.fromAny(level);
    if (lvl.isInfinite()) return BigNum.fromAny('Infinity');
    
    let lvlBigInt;
    try {
        // Handle huge levels by converting to BigInt (supports arbitrary size)
        lvlBigInt = BigInt(lvl.toPlainIntegerString());
    } catch {
        return BigNum.fromAny('Infinity');
    }

    const exponent = 30n + lvlBigInt;
    // Use offset for arbitrary large exponents
    return new BigNum(1n, { base: 0, offset: exponent });
}

export function buyLabLevel() {
    const level = getLabLevel();
    if (level.isInfinite()) return false;
    
    const cost = getLabCost(level);
    if (bank.coins.value.cmp(cost) >= 0) {
        bank.coins.sub(cost);
        
        let increment = BigNum.fromInt(1);
        
        // Adaptive scaling:
        // Up to 1e12: increment by 1.
        // Above 1e12: increment by 10^(log10(level) - 11).
        // e.g. at 1e12 (log 12) -> 10^(12-11) = 10^1 = 10.
        // e.g. at 1e13 (log 13) -> 10^(13-11) = 10^2 = 100.
        
        // We use level.decExp (or level.e if within normal range)
        // If level < 1e12, we stick to 1.
        
        // 1e12 has 13 digits (1 + 12 zeros). BigNum p is 18.
        // We can check level.e directly if offset is 0.
        
        // Safety check for huge numbers
        if (level.e >= 12 || level._eOffset > 0n) {
             // Calculate effective exponent
             let exponent = level.e;
             if (level._eOffset) {
                 // If offset exists, exponent is huge.
                 // We need to add offset to e.
                 // BigNum .e is a Number. ._eOffset is a BigInt.
                 // If _eOffset is huge, the result won't fit in Number.
                 // But we just need to construct 10^(exp - 11).
                 // We can construct a BigNum directly.
                 
                 // inc_exp = (e + offset) - 11
                 const offsetBi = BigInt(level._eOffset);
                 const eBi = BigInt(level.e);
                 const totalExp = offsetBi + eBi;
                 const incExp = totalExp - 11n;
                 
                 increment = new BigNum(1n, { base: 0, offset: incExp });
             } else {
                 // Standard large number (no offset yet)
                 const incExp = level.e - 11;
                 if (incExp > 0) {
                     increment = new BigNum(1n, incExp);
                 }
             }
        }

        setLabLevel(level.add(increment));
        return true;
    }
    return false;
}

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
        this.statsContainer.style.width = '100%'; // Ensure full width for centering

        // --- Common Text Style ---
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

        // --- Common Bar Style ---
        const applyBarStyle = (el) => {
            el.style.backgroundColor = '#151b2b'; // Base color (fallback)
            el.style.background = 'linear-gradient(180deg, #253650, #151b2b)';
            el.style.border = '3px solid #000';
            el.style.borderRadius = '0';
            el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.5)';
            el.style.display = 'flex';
            el.style.alignItems = 'center';
            el.style.justifyContent = 'center';
            el.style.boxSizing = 'border-box';
            el.style.margin = '0 auto'; // Center in container
        };

        // Lab Level Bar (Biggest)
        this.levelBar = document.createElement('div');
        this.levelBar.textContent = `Lab Level: ${formatNumber(getLabLevel())}`;
        applyBarStyle(this.levelBar);
        applyTextStyle(this.levelBar, '26px', '1px');
        this.levelBar.style.padding = '8px 12px';
        this.levelBar.style.height = '42px';
        this.levelBar.style.width = 'var(--coin-bar-w)'; // Matches Coin Bar
        this.statsContainer.appendChild(this.levelBar);

        // Coins Needed Bar (Medium)
        this.coinsBar = document.createElement('div');
        this.coinsBar.textContent = 'Coins needed to increment Lab Level: 0';
        applyBarStyle(this.coinsBar);
        applyTextStyle(this.coinsBar, '16px', '0.9px');
        this.coinsBar.style.padding = '6px 12px';
        this.coinsBar.style.height = '32px';
        this.coinsBar.style.width = 'calc(var(--coin-bar-w) * 0.9)'; // 90% width
        this.coinsBar.style.pointerEvents = 'auto'; // Enable clicks
        this.coinsBar.style.cursor = 'pointer';
        
        this.coinsBar.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            buyLabLevel();
        });
        
        this.statsContainer.appendChild(this.coinsBar);

        // Nerf Exponent Bar (Smallest)
        this.nerfBar = document.createElement('div');
        this.nerfBar.textContent = 'Tsunami nerf exponent: ^0.00';
        applyBarStyle(this.nerfBar);
        applyTextStyle(this.nerfBar, '14px', '0.8px');
        this.nerfBar.style.padding = '4px 12px';
        this.nerfBar.style.height = '26px';
        this.nerfBar.style.width = 'calc(var(--coin-bar-w) * 0.8)'; // 80% width
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
        this.returnBtn.style.backgroundColor = '#222';
        this.returnBtn.style.color = '#fff';
        this.returnBtn.style.border = '2px solid #555';
        this.returnBtn.style.borderRadius = '4px';
        
        this.returnBtn.addEventListener('click', () => {
            this.camX = 0;
            this.camY = 0;
            this.zoom = 0.25;
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
        this.zoom = 0.25;
        this.bursts = [];
        
        this.isDragging = false;
        this.lastMouse = { x: 0, y: 0 };
        
        this.keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
        this.lastTime = 0;
        this.frameId = null;
        
        // Touch
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
        
        // Initial resize
        requestAnimationFrame(() => this.resize());

        this.lastRenderedLevel = null;
    }
    
    addBind(target, type, handler, opts) {
        target.addEventListener(type, handler, opts);
        this.binds.push({ target, type, handler });
    }
    
    setupInput() {
        // Mouse
        this.addBind(this.canvas, 'mousedown', this.onMouseDown.bind(this));
        this.addBind(window, 'mousemove', this.onMouseMove.bind(this));
        this.addBind(window, 'mouseup', this.onMouseUp.bind(this));
        this.addBind(this.canvas, 'wheel', this.onWheel.bind(this), { passive: false });
        
        // Touch
        this.addBind(this.canvas, 'touchstart', this.onTouchStart.bind(this), { passive: false });
        this.addBind(this.canvas, 'touchmove', this.onTouchMove.bind(this), { passive: false });
        this.addBind(this.canvas, 'touchend', this.onTouchEnd.bind(this));
        
        // Keys
        this.addBind(window, 'keydown', (e) => { if(this.keys.hasOwnProperty(e.code)) this.keys[e.code] = true; });
        this.addBind(window, 'keyup', (e) => { if(this.keys.hasOwnProperty(e.code)) this.keys[e.code] = false; });
        
        // Resize
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
    }
    
    resize() {
        if (!this.container.isConnected) return;
        const rect = this.container.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
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
        const dt = Math.min((now - this.lastTime) / 1000, 0.1); // Cap dt
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
    }
    
    update(dt) {
        this.checkBounds();

        const currentLevel = getLabLevel();
        const cost = getLabCost(currentLevel);
        const currentNerf = getTsunamiNerf();
        
        // Update UI Text if needed
        // Compare BigNums
        if (!this.lastRenderedLevel || currentLevel.cmp(this.lastRenderedLevel) !== 0 || !this.lastCost || cost.cmp(this.lastCost) !== 0) {
            this.levelBar.textContent = `Lab Level: ${formatNumber(currentLevel)}`;
            this.coinsBar.textContent = `Coins needed to increment Lab Level: ${formatNumber(cost)}`; 
            this.lastRenderedLevel = currentLevel;
            this.lastCost = cost;
        }

        if (currentNerf !== this.lastRenderedNerf) {
            this.nerfBar.textContent = `Tsunami nerf exponent: ^${currentNerf.toFixed(2)}`;
            this.lastRenderedNerf = currentNerf;
        }
        
        // Visual feedback for affordability
        if (bank.coins.value.cmp(cost) >= 0) {
             this.coinsBar.style.borderColor = '#0f0'; 
        } else {
             this.coinsBar.style.borderColor = '#000'; 
        }

        // Update Bursts
        for (let i = this.bursts.length - 1; i >= 0; i--) {
            const b = this.bursts[i];
            b.time += dt;

            // Update particles
            for(const p of b.particles) {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                // Friction
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
            // Normalize
            const len = Math.sqrt(dx*dx + dy*dy);
            dx /= len;
            dy /= len;
            this.camX += dx * speed * dt;
            this.camY += dy * speed * dt;
        }
    }
    
    render() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;
        const z = this.zoom;
        
        // Background
        ctx.fillStyle = '#080d18'; // Dark Blue
        ctx.fillRect(0, 0, w, h);
        
        // --- Infinite Grid Implementation ---
        
        // Base grid size in world units
        const baseGridSize = 100;
        
        // Determine the "level" of zoom.
        const logZoom = Math.log10(z);
        
        const k = Math.floor(-logZoom + 0.3);
        const primarySpacing = baseGridSize * Math.pow(10, k);
        
        // Standard approach:
        // Find power of 10 such that screen size is roughly 100px.
        const targetScreenSize = 100;
        const idealWorldUnit = targetScreenSize / z;
        const power = Math.floor(Math.log10(idealWorldUnit));
        const unit = Math.pow(10, power);
        
        const drawGrid = (gridUnit, opacity) => {
            if (opacity <= 0) return;
            
            ctx.strokeStyle = `rgba(60, 100, 160, ${0.15 * opacity})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            
            // Vertical
            // Align to gridUnit
            const startX = Math.floor((this.camX - (w/2)/z) / gridUnit) * gridUnit;
            const endX = Math.ceil((this.camX + (w/2)/z) / gridUnit) * gridUnit;
            
            // Optimization: Prevent drawing millions of lines if something goes wrong
            if ((endX - startX) / gridUnit > 1000) return; 

            for (let x = startX; x <= endX; x += gridUnit) {
                const sx = (x - this.camX) * z + w/2;
                ctx.moveTo(sx, 0);
                ctx.lineTo(sx, h);
            }
            
            // Horizontal
            const startY = Math.floor((this.camY - (h/2)/z) / gridUnit) * gridUnit;
            const endY = Math.ceil((this.camY + (h/2)/z) / gridUnit) * gridUnit;
            
            for (let y = startY; y <= endY; y += gridUnit) {
                const sy = (y - this.camY) * z + h/2;
                ctx.moveTo(0, sy);
                ctx.lineTo(w, sy);
            }
            
            ctx.stroke();
        };

        // Screen size of the calculated unit
        const screenUnit = unit * z;
        
        const alpha = Math.max(0, Math.min(1, (screenUnit - 15) / 25)); // Fade in between 15px and 40px
        
        // Draw minor grid (unit)
        drawGrid(unit, alpha);
        
        // Draw major grid (unit * 10)
        drawGrid(unit * 10, 1.0); // Major lines always overlapping minor
        
        // Axis Lines
        ctx.strokeStyle = 'rgba(60, 100, 160, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        // X Axis (y=0)
        const axisY = (0 - this.camY) * z + h/2;
        if (axisY >= -10 && axisY <= h+10) {
             ctx.moveTo(0, axisY);
             ctx.lineTo(w, axisY);
        }
        // Y Axis (x=0)
        const axisX = (0 - this.camX) * z + w/2;
        if (axisX >= -10 && axisX <= w+10) {
            ctx.moveTo(axisX, 0);
            ctx.lineTo(axisX, h);
        }
        ctx.stroke();
        
        // Draw (0,0) Black Square
        // Size 50x50 world units
        const sqSize = 50;
        const sqScreenSize = sqSize * z;
        const sqX = (0 - this.camX) * z + w/2 - sqScreenSize/2;
        const sqY = (0 - this.camY) * z + h/2 - sqScreenSize/2;
        
        ctx.fillStyle = '#000000';
        ctx.fillRect(sqX, sqY, sqScreenSize, sqScreenSize);
        
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1;
        ctx.strokeRect(sqX, sqY, sqScreenSize, sqScreenSize);

        // Draw Bursts
        const MAX_RADIUS = 35;
        // Ring configurations: [delay, duration]
        const ringConfigs = [
            { delay: 0.00, dur: 0.50 }, // Outer
            { delay: 0.05, dur: 0.55 }, // Middle
            { delay: 0.10, dur: 0.60 }  // Inner
        ];
        
        for (const b of this.bursts) {
            // Calculate screen center for the burst
            const cx = (b.x - this.camX) * this.zoom + w/2;
            const cy = (b.y - this.camY) * this.zoom + h/2;
            
            // Draw 3 Soft Rings
            // r.delay affects order: 0.00 (Outer), 0.05 (Middle), 0.10 (Inner)
            // To make inner rings more visible, we boost their alpha multiplier
            for (let i = 0; i < ringConfigs.length; i++) {
                const r = ringConfigs[i];
                const rt = b.time - r.delay;
                if (rt > 0 && rt < r.dur) {
                    const prog = rt / r.dur;
                    const ease = 1 - Math.pow(1 - prog, 3); // Ease out cubic
                    const rad = MAX_RADIUS * ease;
                    const alpha = Math.max(0, 1 - Math.pow(prog, 2)); // Fade out

                    // Boost visibility for inner rings (higher index = more inner)
                    // Index 0: Outer (base)
                    // Index 1: Middle (1.5x)
                    // Index 2: Inner (2.0x)
                    const visibilityBoost = 1.0 + (i * 0.5); 

                    // Soft Radial Gradient "Ring"
                    // Inner radius varies to keep the ring "thick" but soft
                    const grad = ctx.createRadialGradient(cx, cy, rad * 0.6, cx, cy, rad);
                    
                    // Center of ring (transparent)
                    grad.addColorStop(0, `rgba(255, 200, 50, 0)`);
                    
                    // "Peak" of the soft ring - slight orange shift
                    // We mix orange (255, 160, 0) and yellow (255, 240, 100)
                    grad.addColorStop(0.7, `rgba(255, 170, 20, ${Math.min(1, alpha * 0.15 * visibilityBoost)})`); // Orange-ish inner
                    grad.addColorStop(0.9, `rgba(255, 240, 80, ${Math.min(1, alpha * 0.2 * visibilityBoost)})`); // Yellow-ish outer
                    
                    // Edge (transparent)
                    grad.addColorStop(1, `rgba(255, 200, 50, 0)`);
                    
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            
            // Draw Particles with Glow
            ctx.shadowBlur = 8;
            ctx.shadowColor = '#ffff00';
            
            for(const p of b.particles) {
                if (b.time < p.life) {
                    const pAlpha = 1 - (b.time / p.life);
                    // Particles are offset from the burst center
                    const px = cx + p.x;
                    const py = cy + p.y;
                    
                    ctx.fillStyle = `rgba(255, 255, 150, ${pAlpha})`;
                    ctx.beginPath();
                    ctx.arc(px, py, 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            
            // Reset shadow
            ctx.shadowBlur = 0;
        }
    }
    
    addBurst(x, y) {
        // x, y are World Coordinates
        const particles = [];
        const count = 10;
        for(let i=0; i<count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 30 + Math.random() * 40; // Screen pixels per second
            particles.push({
                x: 0, 
                y: 0,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.4 + Math.random() * 0.3 // 0.4 to 0.7
            });
        }

        this.bursts.push({ 
            x, y, 
            time: 0, 
            life: 0.7,
            particles 
        });
    }

    addBurstFromScreen(mx, my) {
        const rect = this.canvas.getBoundingClientRect();
        const x = mx - rect.left;
        const y = my - rect.top;
        const wx = this.camX + (x - this.width/2) / this.zoom;
        const wy = this.camY + (y - this.height/2) / this.zoom;
        this.addBurst(wx, wy);
    }

    // -- Input Handlers --
    
    onMouseDown(e) {
        if (e.button !== 0) return;
        this.isDragging = true;
        this.lastMouse = { x: e.clientX, y: e.clientY };
        this.addBurstFromScreen(e.clientX, e.clientY);
    }
    
    onMouseMove(e) {
        if (!this.isDragging) return;
        const dx = e.clientX - this.lastMouse.x;
        const dy = e.clientY - this.lastMouse.y;
        this.lastMouse = { x: e.clientX, y: e.clientY };
        
        this.camX -= dx / this.zoom;
        this.camY -= dy / this.zoom;
    }
    
    onMouseUp(e) {
        this.isDragging = false;
    }
    
    onWheel(e) {
        e.preventDefault();
        const sensitivity = 0.001;
        const delta = -e.deltaY * sensitivity;
        const oldZoom = this.zoom;
        let newZoom = oldZoom * (1 + delta);
        
        // Infinite zoom limits (or practically infinite)
        if (newZoom < Number.MIN_VALUE) newZoom = Number.MIN_VALUE;
        if (newZoom > Number.MAX_VALUE) newZoom = Number.MAX_VALUE;
        
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
        } else if (e.touches.length === 2) {
            this.isDragging = false; 
            this.pinchDist = this.getTouchDist(e.touches);
        }
        
        for (let i = 0; i < e.changedTouches.length; i++) {
            const t = e.changedTouches[i];
            this.addBurstFromScreen(t.clientX, t.clientY);
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
                // Infinite zoom
                if (newZoom < Number.MIN_VALUE) newZoom = Number.MIN_VALUE;
                if (newZoom > Number.MAX_VALUE) newZoom = Number.MAX_VALUE;
                
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
            this.isDragging = false;
        } else if (e.touches.length === 1) {
            this.isDragging = true;
            this.lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    }
}
