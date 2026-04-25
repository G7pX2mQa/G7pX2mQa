// js/game/cursorTrail.js

import { settingsManager } from './settingsManager.js';
import { getLevelNumber } from './upgrades.js';
import { RAINBOW_GEM_AREA_KEY } from './rainbowGemUpgrades.js';

export function createCursorTrail(playfield, options = {}) {
  if (!playfield || typeof window === 'undefined') {
    return { destroy() {} };
  }

  // Idempotency check
  if (playfield.querySelector('.cursor-trail-canvas')) {
      const old = playfield.querySelectorAll('.cursor-trail-canvas');
      old.forEach(el => el.remove());
  }

  // --- Configuration ---
  const isBossFight = options.isBossFight || false;
  const CAPACITY = 10000;
  const PARTICLE_LIFETIME = 500; // ms
  const INTERPOLATION_STEP = 4; // px
  const applyCursorSetting = (showCursor) => {
    if (playfield) {
      if (showCursor) {
        playfield.style.cursor = 'default';
      } else {
        playfield.style.cursor = isBossFight ? 'none' : '';
      }
    }
  };
  // MAX_SPAWN_PER_FRAME is less relevant with coalesced events but still good for sanity
  const MAX_SPAWN_PER_FRAME = 2000; 
  
  // Visuals
  const PARTICLE_SIZE = 16; 
  const PARTICLE_RADIUS = PARTICLE_SIZE / 2;
  const GLOW_RADIUS = 8;
  const TEXTURE_SIZE = 32; 
  const CENTER = TEXTURE_SIZE / 2;

  // --- State ---
  const STRIDE = 5;
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
    zIndex: isBossFight ? '2147483646' : '5',
    touchAction: 'none'
  });
  
  playfield.appendChild(canvas);

  // Use desynchronized for lower latency
  const ctx = canvas.getContext('2d', { 
    alpha: true,
    desynchronized: true 
  });

  // --- Texture Generation ---
  // Textures are generated in generateTexture()
  
  let particleColorIndex = 0;
  let activeColors = ['#FFEB3B'];

  const updateColors = () => {
    let mod = settingsManager.get('active_trail_mod');
    if (mod === 5) {
      activeColors = ['#c0c0c0']; // Silver
    } else if (mod === 2) {
      activeColors = ['#cd7f32']; // Bronze
    } else if (mod === 8) {
      activeColors = ['#ffd700']; // Gold
    } else if (mod === 11) {
      activeColors = ['#0f52ba']; // Sapphire
    } else if (mod === 14) {
      activeColors = ['#50c878']; // Emerald
    } else if (mod === 17) {
      activeColors = ['#FF0033']; // Ruby
    } else if (mod === 20) {
      activeColors = ['#9966CC']; // Amethyst
    } else if (mod === 23) {
      activeColors = ['#FF69B4', '#8A2BE2']; // Sunset
    } else if (mod === 26) {
      activeColors = ['#0a0010']; // Void
    } else if (mod === 29) {
      activeColors = ['#c4e4f7', '#5289ad']; // Ethereal
    } else if (mod === 32) {
      activeColors = ['#8A612A', '#60441E']; // Earth
    } else if (mod === 35) {
      activeColors = ['#F0FFFF', '#87CEEB']; // Air
    } else if (mod === 38) {
      activeColors = ['#FF4500', '#FF8C00']; // Fire
    } else if (mod === 41) {
      activeColors = ['#006FAC', '#009CF2', '#33B6FF']; // Water
    } else if (mod === 44) {
      activeColors = ['#6C3E1B', '#A56E3B', '#C99753']; // Cookie
    } else if (mod === 47) {
      activeColors = ['#C99853', '#C46A1A', '#F6BB00']; // Pancake
    } else if (mod === 50) {
      activeColors = ['#8CE632', '#1E9638', '#126422']; // Watermelon
    } else if (mod === 53) {
      activeColors = ['#E44E30', '#FFD69A', '#F17A3C']; // Pepperoni
    } else if (mod === 56) {
      activeColors = ['#6F3005', '#FFA500', '#FFFF00', '#FFA500', '#FFFF00']; // Pizza
    } else if (mod === 59) {
      // Donut logic: brown/pink base, with a different sprinkle every 3rd particle
      // We construct a repeating pattern: brown, pink, sprinkle
      const br = '#B37933';
      const pi = '#FF3783';
      const sprinkles = ['#FF4B4B', '#FF872D', '#FFE96B', '#78E08F', '#63C0FF', '#FFFFFF'];
      activeColors = [];
      for (const sprinkle of sprinkles) {
        activeColors.push(br, pi, sprinkle);
      }
    } else if (mod === 62) {
      activeColors = ['#1CB1E6', '#0B6BAE', '#EED48A']; // Glass
    } else if (mod === 65) {
      activeColors = ['#6EC9FF', '#3477B8', '#C3E5EA']; // Diamond
    } else if (mod === 68) {
      activeColors = ['#E6CFFF', '#C8F5F0', '#B0D3FF']; // Opal
    } else if (mod === 71) {
      activeColors = ['#2EE4FF', '#2088FF', '#49FFCA', '#C42BFF']; // Cosmic
    } else if (mod === 74) {
      activeColors = ['#FF0044', '#FF7C00', '#FFF85C', '#00FFAA', '#00E6FF', '#0044FF', '#A020F0', '#FF00FF']; // Prismatic
    } else {
      activeColors = ['#FFEB3B']; // Default
    }
    generateTexture();
  };

  const textureSheet = document.createElement('canvas');
  let textureCount = 1;

  const generateTexture = () => {
    textureCount = activeColors.length;
    textureSheet.width = TEXTURE_SIZE * textureCount;
    textureSheet.height = TEXTURE_SIZE;
    const ctx = textureSheet.getContext('2d');
    ctx.clearRect(0, 0, textureSheet.width, textureSheet.height);

    for (let i = 0; i < textureCount; i++) {
      const color = activeColors[i];
      const offsetX = i * TEXTURE_SIZE;
      ctx.shadowColor = color;
      ctx.shadowBlur = GLOW_RADIUS;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(offsetX + CENTER, CENTER, PARTICLE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  
  updateColors();

  // --- Interaction State ---
  let pointerInside = false;
  let lastSpawnX = null;
  let lastSpawnY = null;
  let lastEmitX = null;
  let lastEmitY = null;
  let isNewTouch = false;
  
  if (isBossFight && typeof window !== 'undefined') {
      pointerInside = true;
      if (window.globalLastMouseX !== undefined && window.globalLastMouseY !== undefined) {
          lastSpawnX = window.globalLastMouseX;
          lastSpawnY = window.globalLastMouseY;
      } else {
          lastSpawnX = window.innerWidth / 2;
          lastSpawnY = window.innerHeight / 2 + 50; // default slightly below center
      }
  }
  
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
    // Optimization: Assume playfield fills the viewport (position: fixed, inset: 0)
    // This avoids getBoundingClientRect() forcing reflows or returning stale offsets
    const w = document.documentElement.clientWidth;
    const h = document.documentElement.clientHeight;
    rect = { left: 0, top: 0, width: w, height: h, right: w, bottom: h, x: 0, y: 0 };
  };

  const resize = () => {
    if (destroyed) return;
    updateBounds();
    const quality = settingsManager.get('graphics_quality') ?? 10;
    const qualityScale = 0.5 + (quality / 10) * 1.5;
    const baseDpr = Math.min(window.devicePixelRatio || 1, 2) * qualityScale;
    const MAX_CANVAS_WIDTH = 512 * qualityScale;
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
    if (freeCount <= 0 || !settingsManager.get('cursor_trail')) return;
    const idx = freeSlots[--freeCount];
    if (idx > maxActiveIndex) maxActiveIndex = idx;
    const offset = idx * STRIDE;
    data[offset] = x;
    data[offset + 1] = y;
    data[offset + 2] = 0;
    data[offset + 3] = PARTICLE_LIFETIME;
    data[offset + 4] = particleColorIndex++;
  };

  const processPoint = (localX, localY, budgetRef) => {
      // Spawn at this point, interpolating from lastSpawnX if needed
      if (lastSpawnX === null || lastSpawnY === null || isNewTouch) {
          isNewTouch = false;
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
      lastTime = 0;
      rafId = requestAnimationFrame(loop);
    }
    if (!rect.width) updateBounds();

    // Calculate offset once per event
    // Note: rect.left/top are screen coordinates. clientX/Y are screen coordinates.
    // Optimization: rect.left/top are assumed 0 for full-screen playfield
    const offsetX = 0;
    const offsetY = 0;

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
    if (!isBossFight) {
      pointerInside = false;
      lastSpawnX = null;
      lastSpawnY = null;
      pointsQueue.length = 0; // Clear queue on leave
    }
  };

  const loop = () => {
    if (destroyed) return;
    
    const now = performance.now();
    if (!lastTime) lastTime = now;
    let dt = now - lastTime;
    lastTime = now;
    if (dt > 100) dt = 100;

    // --- Spawning Logic (Process Queue) ---
    const budget = { count: 0 };
    
    if (pointsQueue.length > 0) {
        // We have new input data
        for (const pt of pointsQueue) {
            let px = pt.x;
            let py = pt.y;
            let pInside = pt.inside;
            
            if (isBossFight) {
                // Clamp coordinates
                const radius = TEXTURE_SIZE / 2;
                px = Math.max(radius, Math.min(rect.width - radius, px));
                py = Math.max(radius, Math.min(rect.height - radius, py));
                pInside = true; // Always inside for boss fight
            }

            if (pInside) {
                pointerInside = true;
                processPoint(px, py, budget);
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
        let lastPt = pointsQueue[pointsQueue.length - 1];
        let lastPtInside = lastPt.inside;
        let lastPx = lastPt.x;
        let lastPy = lastPt.y;
        
        if (isBossFight) {
            const radius = TEXTURE_SIZE / 2;
            lastPx = Math.max(radius, Math.min(rect.width - radius, lastPx));
            lastPy = Math.max(radius, Math.min(rect.height - radius, lastPy));
            lastPtInside = true;
        }

        if (lastPtInside) {
             // If we haven't spawned at exact last location yet (due to budget), force it.
             // (Simple check: compare lastSpawnX/Y with lastPt)
             if (lastSpawnX !== lastPx || lastSpawnY !== lastPy) {
                 spawn(lastPx, lastPy);
                 lastSpawnX = lastPx;
                 lastSpawnY = lastPy;
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
        
        const texIndex = Math.floor(data[offset + 4]) % textureCount;
        const sx = texIndex * TEXTURE_SIZE;
        ctx.drawImage(textureSheet, sx, 0, TEXTURE_SIZE, TEXTURE_SIZE, drawX, drawY, drawSize, drawSize);

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
    
    // Dispatch boss cursor hit event for collision logic
    if (isBossFight && lastSpawnX !== null && lastSpawnY !== null) {
        document.dispatchEvent(new CustomEvent('boss_cursor_hit', {
            detail: { 
                x: lastSpawnX, 
                y: lastSpawnY, 
                lastX: lastEmitX !== null ? lastEmitX : lastSpawnX, 
                lastY: lastEmitY !== null ? lastEmitY : lastSpawnY
            }
        }));
        lastEmitX = lastSpawnX;
        lastEmitY = lastSpawnY;
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
      if (isBossFight) isNewTouch = true;
      updateBounds();
      onPointerMove(e);
  };

  const onPointerDown = (e) => {
      if (isBossFight) isNewTouch = true;
      updateBounds();
      onPointerMove(e);
  };

  playfield.addEventListener('pointermove', onPointerMove, opts);
  playfield.addEventListener('pointerdown', onPointerDown, opts);
  playfield.addEventListener('pointerenter', onPointerEnter, opts);
  playfield.addEventListener('pointerleave', onPointerLeave, opts);
  playfield.addEventListener('pointercancel', onPointerLeave, opts);

  document.addEventListener('ccc:upgrades:changed', updateColors);
  const activeTrailUnsub = settingsManager.subscribe('active_trail_mod', updateColors);
  const graphicsQualityUnsub = settingsManager.subscribe('graphics_quality', resize);
  const cursorSettingUnsub = settingsManager.subscribe('show_cursor', applyCursorSetting);

  applyCursorSetting(settingsManager.get('show_cursor'));

  resize();
  rafId = requestAnimationFrame(loop);

  // Periodically update bounds to sync with any layout shifts
  const syncInterval = setInterval(updateBounds, 1000);

  const destroy = () => {
    destroyed = true;
    if (rafId) cancelAnimationFrame(rafId);
    if (syncInterval) clearInterval(syncInterval);
    
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }

    try { window.removeEventListener('resize', resize); } catch {}
    try { window.removeEventListener('scroll', updateBounds); } catch {}
    try { window.removeEventListener('focus', updateBounds); } catch {}
    try { document.removeEventListener('visibilitychange', updateBounds); } catch {}
    try { document.removeEventListener('ccc:upgrades:changed', generateTexture); } catch {}
    if (activeTrailUnsub) {
        try { activeTrailUnsub(); } catch {}
    }
    if (graphicsQualityUnsub) {
        try { graphicsQualityUnsub(); } catch {}
    }
    if (cursorSettingUnsub) {
        try { cursorSettingUnsub(); } catch {}
    }
    
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
