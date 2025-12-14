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
  const CAPACITY = 10000;  // This capacity is high but realistically nobody is ever reaching anywhere near this, highest amount people might get normally is like 1000 or so
  const PARTICLE_LIFETIME = 500; // ms
  const INTERPOLATION_STEP = 10; // px
  const MAX_SPAWN_PER_FRAME = 80; // Prevent death spiral
  
  // Visuals
  const PARTICLE_SIZE = 16; // px diameter
  const PARTICLE_RADIUS = PARTICLE_SIZE / 2;
  const GLOW_RADIUS = 8;
  // Texture needs to be large enough to hold the circle + blur
  // Circle radius 8, Blur 8 => 16px radius total visual => 32px diameter
  // We reduce this to 32px to save fill-rate (4x reduction vs 64px)
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
    touchAction: 'none' // Should inherit, but good to be explicit if it captured events
  });
  
  playfield.appendChild(canvas);

  // Alpha is needed for transparency
  const ctx = canvas.getContext('2d', { alpha: true });

  // --- Texture Generation ---
  // We pre-render the glowing particle to an offscreen canvas
  const texture = document.createElement('canvas');
  texture.width = TEXTURE_SIZE;
  texture.height = TEXTURE_SIZE;
  const tCtx = texture.getContext('2d');
  
  tCtx.shadowColor = '#FFEB3B';
  tCtx.shadowBlur = GLOW_RADIUS;
  tCtx.fillStyle = '#FFEB3B';
  
  tCtx.beginPath();
  // Draw centered at (CENTER, CENTER)
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

  // --- Methods ---

  const updateBounds = () => {
    if (destroyed) return;
    rect = playfield.getBoundingClientRect();
  };

  const resize = () => {
    if (destroyed) return;
    updateBounds();
    // Cap DPR to prevent massive memory usage/fill-rate issues on high density displays or large zoom
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    
    // Resize canvas to match display size * dpr for sharp rendering
    // This clears the canvas context
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    // Scale context so we can draw using CSS pixels
    ctx.scale(dpr, dpr);
    lastClearRect = null; // Reset dirty rect on resize
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
    
    // Simple bounds check
    pointerInside = (localX >= 0 && localX <= rect.width && localY >= 0 && localY <= rect.height);
  };
  
  const onPointerLeave = () => {
    pointerInside = false;
    lastSpawnX = null;
    lastSpawnY = null;
  };

  const loop = (now) => {
    if (destroyed) return;
    
    if (!lastTime) lastTime = now;
    let dt = now - lastTime;
    lastTime = now;
    
    // Cap dt to prevent huge jumps if tab was inactive
    if (dt > 100) dt = 100;

    // --- Spawning Logic ---
    if (pointerInside) {
      let spawnedCount = 0;
      const trySpawn = (x, y) => {
          if (spawnedCount >= MAX_SPAWN_PER_FRAME) return;
          spawn(x, y);
          spawnedCount++;
      };

      if (lastSpawnX === null || lastSpawnY === null) {
        trySpawn(localX, localY);
      } else {
        const dx = localX - lastSpawnX;
        const dy = localY - lastSpawnY;
        const dist = Math.hypot(dx, dy);
        
        if (dist >= INTERPOLATION_STEP) {
          const steps = Math.floor(dist / INTERPOLATION_STEP);
          for (let i = 1; i <= steps; i++) {
             // Hard cap loop to avoid freezing on massive jumps
             if (spawnedCount >= MAX_SPAWN_PER_FRAME) break;

             const progress = i * INTERPOLATION_STEP;
             const fraction = progress / dist;
             const tx = lastSpawnX + dx * fraction;
             const ty = lastSpawnY + dy * fraction;
             trySpawn(tx, ty);
          }
        }
        // Always spawn at current cursor position
        trySpawn(localX, localY);
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
      // Clear only the dirty area from the previous frame
      ctx.clearRect(lastClearRect.x, lastClearRect.y, lastClearRect.w, lastClearRect.h);
    } else {
      ctx.clearRect(0, 0, rect.width, rect.height);
    }
    wasDirty = false;
    
    // Iterate over all slots. 
    // Optimization: We could maintain a packed list of active indices, 
    // but iterating 1000 items is extremely cheap in JS, especially with TypedArrays.
    // The main cost is drawImage, which only happens for active particles.
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    if (activeParticles > 0) {
      // Use 'lighter' blend mode if you want addictive blending (glow adds up)
      // The original CSS used normal blending (DOM elements stacked).
      // Let's stick to default source-over to match original look, 
      // or 'screen' might look nice for glows. 
      // User said "striking visual effects", usually implies glow.
      // Let's try 'source-over' first to match CSS.
      
      for (let i = 0; i < CAPACITY; i++) {
        const offset = i * STRIDE;
        let age = data[offset + 2];
        
        // Skip dead particles
        if (age >= data[offset + 3]) continue;
        
        age += dt;
        data[offset + 2] = age;
        
        if (age >= data[offset + 3]) {
          // Recycle
          freeSlots[freeCount++] = i;
          continue;
        }
        
        // Calculate visuals
        const maxAge = data[offset + 3];
        const progress = age / maxAge;
        const opacity = 1 - progress;
        const scale = 1 - (0.4 * progress); // 1.0 -> 0.6
        
        // Draw
        wasDirty = true;
        ctx.globalAlpha = opacity;
        
        const size = TEXTURE_SIZE * scale;
        const halfSize = size / 2;
        const x = data[offset];
        const y = data[offset + 1];
        
        // Round coordinates to avoid sub-pixel rendering cost on high-DPI
        const drawX = Math.round(x - halfSize);
        const drawY = Math.round(y - halfSize);
        const drawSize = Math.round(size);
        
        ctx.drawImage(texture, drawX, drawY, drawSize, drawSize);

        // Update bounds for dirty rect clearing
        if (drawX < minX) minX = drawX;
        if (drawY < minY) minY = drawY;
        const right = drawX + drawSize;
        const bottom = drawY + drawSize;
        if (right > maxX) maxX = right;
        if (bottom > maxY) maxY = bottom;
      }
    }

    if (minX !== Infinity) {
        const PADDING = 2; // Slight padding to ensure full clear
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
