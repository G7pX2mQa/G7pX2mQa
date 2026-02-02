import { getActiveSlot } from '../../util/storage.js';

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
        this.canvas.style.display = 'block';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        
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
            this.zoom = 0.5;
            this.returnBtn.style.display = 'none';
        });
        
        this.container.appendChild(this.returnBtn);
        
        this.camX = 0;
        this.camY = 0;
        this.zoom = 0.5;
        
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
    }
    
    // -- Input Handlers --
    
    onMouseDown(e) {
        if (e.button !== 0) return;
        this.isDragging = true;
        this.lastMouse = { x: e.clientX, y: e.clientY };
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
