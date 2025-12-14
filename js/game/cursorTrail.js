// js/game/cursorTrail.js

export function createCursorTrail(playfield) {
  if (!playfield || typeof window === 'undefined') {
    return { destroy() {} };
  }

  // Idempotency check: Don't stack multiple canvases if called repeatedly
  if (playfield.querySelector('.cursor-trail-canvas')) {
      const old = playfield.querySelectorAll('.cursor-trail-canvas');
      old.forEach(el => el.remove());
  }

  // --- Configuration ---
  const CAPACITY = 10000;
  const PARTICLE_LIFETIME = 500; // ms
  const INTERPOLATION_STEP = 10; // px
  // Instead of a hard cap that stops spawning, we use this to calculate dynamic spacing
  const MAX_SPAWN_PER_FRAME = 80; 
  
  // Visuals
  const PARTICLE_SIZE = 16; // px diameter
  const PARTICLE_RADIUS = PARTICLE_SIZE / 2;
  const GLOW_RADIUS = 8;
  const TEXTURE_SIZE = 32; 
  const CENTER = TEXTURE_SIZE / 2;

  // --- State ---
  // Layout per particle: [x, y, age, maxAge]
  const STRIDE = 4;
  const data = new Float32Array(CAPACITY * STRIDE);
  
  // Initialize ages to Infinity so they are considered "dead"
  for (let i = 0; i < CAPACITY; i++) {
    data[i * STRIDE + 2] = Infinity;
  }
  
  // Track free slots using a stack
  const freeSlots = new Int16Array(CAPACITY);
  let freeCount = CAPACITY;
  for (let i = 0; i < CAPACITY; i++) freeSlots[i] = i;

  // --- DOM Setup ---
  const canvas = document.createElement('canvas');
  canvas.className = 'cursor-trail-canvas';
  Object.assign(canvas.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    zIndex: '5',
    touchAction: 'none'
  });
  
  playfield.appendChild(canvas);

  // Alpha is needed for transparency
  const ctx = canvas.getContext('2d', { alpha: true });

  // --- Texture Generation ---
  const texture = document.createElement('canvas');
  texture.width = TEXTURE_SIZE;
  texture.height = TEXTURE_SIZE;
  const tCtx = texture.getContext('2d');
  
  tCtx.shadowColor = '#FFEB3B';
  tCtx.shadowBlur = GLOW_RADIUS;
  tCtx.fillStyle = '#FFEB3B';
  
  tCtx.beginPath();
  tCtx.arc(CENTER, CENTER, PARTICLE_RADIUS, 0, Math.PI * 2);
  tCtx.fill();

  // --- Interaction State ---
  let pointerInside = false;
  let localX = 0;
  let localY = 0;
  let lastSpawnX = null;
  let lastSpawnY = null;
  
  let rect = { left: 0, top: 0, width: 0, height: 0 };
  let dpr = 1;
  let destroyed = false;
  let rafId = 0;
  let lastTime = 0;
  let wasDirty = false;
  let lastClearRect = null;
  let frameCount = 0; // For periodic checks

  // --- Methods ---

  const updateBounds = () => {
    if (destroyed) return;
    rect = playfield.getBoundingClientRect();
  };

  const resize = () => {
    if (destroyed) return;
    updateBounds();
    const baseDpr = Math.min(window.devicePixelRatio || 1, 2);
    
    // Cap absolute width to prevent massive fill-rate on large screens/zooms
    const MAX_CANVAS_WIDTH = 512;
    const widthScale = (rect.width > 0) ? Math.min(baseDpr, MAX_CANVAS_WIDTH / rect.width) : baseDpr;
    
    dpr = widthScale;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    ctx.scale(dpr, dpr);
    lastClearRect = null;
  };

  const spawn = (x, y) => {
    if (freeCount <= 0) return;
    
    const idx = freeSlots[--freeCount];
    const offset = idx * STRIDE;
    
    data[offset] = x;
    data[offset + 1] = y;
    data[offset + 2] = 0; // age
    data[offset + 3] = PARTICLE_LIFETIME;
  };

  const onPointerMove = (e) => {
    if (destroyed) return;
    
    // Check if rect needs update (e.g. if we haven't resized yet)
    if (!rect.width) updateBounds();

    localX = e.clientX - rect.left;
    localY = e.clientY - rect.top;
    
    pointerInside = (localX >= 0 && localX <= rect.width && localY >= 0 && localY <= rect.height);
  };
  
  const onPointerLeave = () => {
    pointerInside = false;
    lastSpawnX = null;
    lastSpawnY = null;
  };

  const loop = (now) => {
    if (destroyed) return;
    
    // Periodic bounds update to fix drift (every ~0.5s)
    frameCount++;
    if (frameCount % 30 === 0) {
        updateBounds();
    }
    
    if (!lastTime) lastTime = now;
    let dt = now - lastTime;
    lastTime = now;
    
    if (dt > 100) dt = 100;

    // --- Spawning Logic ---
    if (pointerInside) {
      if (lastSpawnX === null || lastSpawnY === null) {
        spawn(localX, localY);
      } else {
        const dx = localX - lastSpawnX;
        const dy = localY - lastSpawnY;
        const dist = Math.hypot(dx, dy);
        
        let step = INTERPOLATION_STEP;
        let steps = Math.floor(dist / step);
        
        // Dynamic interpolation:
        // If the number of steps would exceed our per-frame spawn limit,
        // we increase the step size so we can still cover the full distance
        // in this frame. This prevents the trail from "lagging behind" (rubber banding)
        // during extremely fast movement.
        if (steps > MAX_SPAWN_PER_FRAME) {
            step = dist / MAX_SPAWN_PER_FRAME;
            steps = MAX_SPAWN_PER_FRAME;
        }

        if (dist >= step) {
          for (let i = 1; i <= steps; i++) {
             const progress = i * step;
             const fraction = progress / dist;
             const tx = lastSpawnX + dx * fraction;
             const ty = lastSpawnY + dy * fraction;
             spawn(tx, ty);
          }
        }
        // Always spawn at current cursor position to ensure connection
        spawn(localX, localY);
      }
      lastSpawnX = localX;
      lastSpawnY = localY;
    } else {
      lastSpawnX = null;
      lastSpawnY = null;
    }

    // --- Render & Update ---
    const activeParticles = CAPACITY - freeCount;
    
    if (activeParticles === 0 && !wasDirty) {
      rafId = requestAnimationFrame(loop);
      return;
    }

    if (lastClearRect) {
      ctx.clearRect(lastClearRect.x, lastClearRect.y, lastClearRect.w, lastClearRect.h);
    } else {
      ctx.clearRect(0, 0, rect.width, rect.height);
    }
    wasDirty = false;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    if (activeParticles > 0) {
      for (let i = 0; i < CAPACITY; i++) {
        const offset = i * STRIDE;
        let age = data[offset + 2];
        
        if (age >= data[offset + 3]) continue;
        
        age += dt;
        data[offset + 2] = age;
        
        if (age >= data[offset + 3]) {
          freeSlots[freeCount++] = i;
          continue;
        }
        
        const maxAge = data[offset + 3];
        const progress = age / maxAge;
        const opacity = 1 - progress;
        const scale = 1 - (0.4 * progress); 
        
        wasDirty = true;
        ctx.globalAlpha = opacity;
        
        const size = TEXTURE_SIZE * scale;
        const halfSize = size / 2;
        const x = data[offset];
        const y = data[offset + 1];
        
        const drawX = Math.round(x - halfSize);
        const drawY = Math.round(y - halfSize);
        const drawSize = Math.round(size);
        
        ctx.drawImage(texture, drawX, drawY, drawSize, drawSize);

        if (drawX < minX) minX = drawX;
        if (drawY < minY) minY = drawY;
        const right = drawX + drawSize;
        const bottom = drawY + drawSize;
        if (right > maxX) maxX = right;
        if (bottom > maxY) maxY = bottom;
      }
    }

    if (minX !== Infinity) {
        const PADDING = 2;
        minX -= PADDING;
        minY -= PADDING;
        maxX += PADDING;
        maxY += PADDING;
        lastClearRect = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    } else {
        lastClearRect = null;
    }
    
    rafId = requestAnimationFrame(loop);
  };

  // --- Listeners ---
  window.addEventListener('resize', resize);
  window.addEventListener('scroll', updateBounds, { passive: true });
  
  const opts = { passive: true };
  playfield.addEventListener('pointermove', onPointerMove, opts);
  playfield.addEventListener('pointerdown', onPointerMove, opts);
  playfield.addEventListener('pointerenter', onPointerMove, opts);
  playfield.addEventListener('pointerleave', onPointerLeave, opts);
  playfield.addEventListener('pointercancel', onPointerLeave, opts);

  // Initial setup
  resize();
  rafId = requestAnimationFrame(loop);

  const destroy = () => {
    destroyed = true;
    if (rafId) cancelAnimationFrame(rafId);
    
    try { window.removeEventListener('resize', resize); } catch {}
    try { window.removeEventListener('scroll', updateBounds); } catch {}
    
    try {
      playfield.removeEventListener('pointermove', onPointerMove);
      playfield.removeEventListener('pointerdown', onPointerMove);
      playfield.removeEventListener('pointerenter', onPointerMove);
      playfield.removeEventListener('pointerleave', onPointerLeave);
      playfield.removeEventListener('pointercancel', onPointerLeave);
    } catch {}
    
    canvas.remove();
  };

  return { destroy };
}
