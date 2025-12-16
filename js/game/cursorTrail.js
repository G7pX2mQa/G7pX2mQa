// js/game/cursorTrail.js

export function createCursorTrail(playfield) {
  if (!playfield || typeof window === 'undefined') {
    return { destroy() {} };
  }

  // Idempotency check
  if (playfield.querySelector('.cursor-trail-canvas')) {
      const old = playfield.querySelectorAll('.cursor-trail-canvas');
      old.forEach(el => el.remove());
  }

  // --- Configuration ---
  const CAPACITY = 10000;
  const PARTICLE_LIFETIME = 500; // ms
  const INTERPOLATION_STEP = 10; // px
  // MAX_SPAWN_PER_FRAME is less relevant with coalesced events but still good for sanity
  const MAX_SPAWN_PER_FRAME = 200; 
  
  // Visuals
  const PARTICLE_SIZE = 16; 
  const PARTICLE_RADIUS = PARTICLE_SIZE / 2;
  const GLOW_RADIUS = 8;
  const TEXTURE_SIZE = 32; 
  const CENTER = TEXTURE_SIZE / 2;

  // --- State ---
  const STRIDE = 4;
  const data = new Float32Array(CAPACITY * STRIDE);
  
  for (let i = 0; i < CAPACITY; i++) {
    data[i * STRIDE + 2] = Infinity;
  }
  
  const freeSlots = new Int16Array(CAPACITY);
  let freeCount = CAPACITY;
  // Reverse fill so we pop low indices first
  for (let i = 0; i < CAPACITY; i++) freeSlots[i] = CAPACITY - 1 - i;

  let maxActiveIndex = -1;

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

  // Use desynchronized for lower latency
  const ctx = canvas.getContext('2d', { 
    alpha: true,
    desynchronized: true 
  });

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
  let lastSpawnX = null;
  let lastSpawnY = null;
  
  let rect = { left: 0, top: 0, width: 0, height: 0 };
  let dpr = 1;
  let destroyed = false;
  let rafId = 0;
  let lastTime = 0;
  let wasDirty = false;
  let lastClearRect = null;

  // Queue for incoming pointer points (from coalesced events)
  // Each entry is { x, y } in local coordinates
  const pointsQueue = [];

  // --- Methods ---

  const updateBounds = () => {
    if (destroyed) return;
    rect = playfield.getBoundingClientRect();
  };

  const resize = () => {
    if (destroyed) return;
    updateBounds();
    const baseDpr = Math.min(window.devicePixelRatio || 1, 2);
    const MAX_CANVAS_WIDTH = 512;
    const widthScale = (rect.width > 0) ? Math.min(baseDpr, MAX_CANVAS_WIDTH / rect.width) : baseDpr;
    dpr = widthScale;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    ctx.scale(dpr, dpr);
    lastClearRect = null; 
  };

  let resizeObserver = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
        resize();
    });
    resizeObserver.observe(playfield);
  }

  const spawn = (x, y) => {
    if (freeCount <= 0) return;
    const idx = freeSlots[--freeCount];
    if (idx > maxActiveIndex) maxActiveIndex = idx;
    const offset = idx * STRIDE;
    data[offset] = x;
    data[offset + 1] = y;
    data[offset + 2] = 0;
    data[offset + 3] = PARTICLE_LIFETIME;
  };

  const processPoint = (localX, localY, budgetRef) => {
      // Spawn at this point, interpolating from lastSpawnX if needed
      if (lastSpawnX === null || lastSpawnY === null) {
          if (budgetRef.count < MAX_SPAWN_PER_FRAME) {
            spawn(localX, localY);
            budgetRef.count++;
          }
      } else {
        const dx = localX - lastSpawnX;
        const dy = localY - lastSpawnY;
        const dist = Math.hypot(dx, dy);
        
        if (dist >= INTERPOLATION_STEP) {
          const steps = Math.floor(dist / INTERPOLATION_STEP);
          for (let i = 1; i <= steps; i++) {
             if (budgetRef.count >= MAX_SPAWN_PER_FRAME) break;
             const fraction = (i * INTERPOLATION_STEP) / dist;
             spawn(lastSpawnX + dx * fraction, lastSpawnY + dy * fraction);
             budgetRef.count++;
          }
        }
        // Always spawn the point itself if we haven't blown budget drastically
        // (Actually, we should prioritize the *end* points of the coalesced events, 
        // but spawning intermediate interpolated points is fine too)
        if (budgetRef.count < MAX_SPAWN_PER_FRAME) {
            spawn(localX, localY);
            budgetRef.count++;
        }
      }
      lastSpawnX = localX;
      lastSpawnY = localY;
  };

  const onPointerMove = (e) => {
    if (destroyed) return;
    if (!rafId) {
      lastTime = performance.now();
      rafId = requestAnimationFrame(loop);
    }
    if (!rect.width) updateBounds();

    // Calculate offset once per event
    // Note: rect.left/top are screen coordinates. clientX/Y are screen coordinates.
    const offsetX = rect.left;
    const offsetY = rect.top;

    // Helper to check bounds
    const isIn = (x, y) => (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height);
    
    // Process coalesced events if available to get high-frequency path
    if (e.getCoalescedEvents) {
        const events = e.getCoalescedEvents();
        if (events.length > 0) {
            for (const ev of events) {
                const lx = ev.clientX - offsetX;
                const ly = ev.clientY - offsetY;
                pointsQueue.push({ x: lx, y: ly, inside: isIn(lx, ly) });
            }
        } else {
            // Fallback if empty list returned
            const lx = e.clientX - offsetX;
            const ly = e.clientY - offsetY;
            pointsQueue.push({ x: lx, y: ly, inside: isIn(lx, ly) });
        }
    } else {
        const lx = e.clientX - offsetX;
        const ly = e.clientY - offsetY;
        pointsQueue.push({ x: lx, y: ly, inside: isIn(lx, ly) });
    }
  };
  
  const onPointerLeave = () => {
    pointerInside = false;
    lastSpawnX = null;
    lastSpawnY = null;
    pointsQueue.length = 0; // Clear queue on leave
  };

  const loop = (now) => {
    if (destroyed) return;
    
    if (!lastTime) lastTime = now;
    let dt = now - lastTime;
    lastTime = now;
    if (dt > 100) dt = 100;

    // --- Spawning Logic (Process Queue) ---
    const budget = { count: 0 };
    
    if (pointsQueue.length > 0) {
        // We have new input data
        for (const pt of pointsQueue) {
            if (pt.inside) {
                pointerInside = true;
                processPoint(pt.x, pt.y, budget);
            } else {
                pointerInside = false;
                lastSpawnX = null;
                lastSpawnY = null;
            }
        }
        // Force the last point to be spawned exactly, to ensure tip connectivity
        // (processPoint already does this, but let's double check logic)
        // processPoint spawns at (localX, localY). 
        // If the budget ran out, we might have skipped it. 
        // Let's force the very last point of the queue if it was inside.
        const lastPt = pointsQueue[pointsQueue.length - 1];
        if (lastPt.inside) {
             // If we haven't spawned at exact last location yet (due to budget), force it.
             // (Simple check: compare lastSpawnX/Y with lastPt)
             if (lastSpawnX !== lastPt.x || lastSpawnY !== lastPt.y) {
                 spawn(lastPt.x, lastPt.y);
                 lastSpawnX = lastPt.x;
                 lastSpawnY = lastPt.y;
             }
        }
        
        pointsQueue.length = 0; // Consumed
    } else if (pointerInside && lastSpawnX !== null && lastSpawnY !== null) {
        spawn(lastSpawnX, lastSpawnY);
    }

    // --- Render & Update ---
    const activeParticles = CAPACITY - freeCount;
    
    if (activeParticles === 0 && !wasDirty) {
      rafId = 0;
      return;
    }

    if (lastClearRect) {
      ctx.clearRect(lastClearRect.x, lastClearRect.y, lastClearRect.w, lastClearRect.h);
    } else {
      ctx.clearRect(0, 0, rect.width, rect.height);
    }
    wasDirty = false;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    let newMaxIndex = -1;
    if (activeParticles > 0) {
      for (let i = 0; i <= maxActiveIndex; i++) {
        const offset = i * STRIDE;
        let age = data[offset + 2];
        
        if (age >= data[offset + 3]) continue;
        
        age += dt;
        data[offset + 2] = age;
        
        if (age >= data[offset + 3]) {
          freeSlots[freeCount++] = i;
          continue;
        }

        newMaxIndex = i;
        
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
    maxActiveIndex = newMaxIndex;

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
  window.addEventListener('focus', updateBounds, { passive: true });
  document.addEventListener('visibilitychange', updateBounds, { passive: true });
  
  const opts = { passive: true };
  
  const onPointerEnter = (e) => {
      updateBounds();
      onPointerMove(e);
  };

  const onPointerDown = (e) => {
      updateBounds();
      onPointerMove(e);
  };

  playfield.addEventListener('pointermove', onPointerMove, opts);
  playfield.addEventListener('pointerdown', onPointerDown, opts);
  playfield.addEventListener('pointerenter', onPointerEnter, opts);
  playfield.addEventListener('pointerleave', onPointerLeave, opts);
  playfield.addEventListener('pointercancel', onPointerLeave, opts);

  resize();
  rafId = requestAnimationFrame(loop);

  const destroy = () => {
    destroyed = true;
    if (rafId) cancelAnimationFrame(rafId);
    
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }

    try { window.removeEventListener('resize', resize); } catch {}
    try { window.removeEventListener('scroll', updateBounds); } catch {}
    try { window.removeEventListener('focus', updateBounds); } catch {}
    try { document.removeEventListener('visibilitychange', updateBounds); } catch {}
    
    try {
      playfield.removeEventListener('pointermove', onPointerMove);
      playfield.removeEventListener('pointerdown', onPointerDown);
      playfield.removeEventListener('pointerenter', onPointerEnter); 
      playfield.removeEventListener('pointerleave', onPointerLeave);
      playfield.removeEventListener('pointercancel', onPointerLeave);
    } catch {}
    
    canvas.remove();
  };

  return { destroy };
}
