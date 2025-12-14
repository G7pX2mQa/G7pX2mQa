// js/game/cursorTrail.js

export function createCursorTrail(playfield) {
  if (!playfield || typeof window === 'undefined') {
    return { destroy() {} };
  }

  const POOL_SIZE = 1000;
  const PARTICLE_LIFETIME = 500; // ms
  const INTERPOLATION_STEP = 10; // px
  
  const pool = [];
  const activeParticles = [];
  
  // Create pool
  for (let i = 0; i < POOL_SIZE; i++) {
    const el = document.createElement('div');
    el.className = 'trail-particle';
    el.style.opacity = '0';
    el.style.transform = 'translate3d(-9999px, -9999px, 0)';
    playfield.appendChild(el);
    pool.push(el);
  }

  let pointerInside = false;
  let localX = 0;
  let localY = 0;
  
  // Track last spawn position for interpolation
  let lastSpawnX = null;
  let lastSpawnY = null;

  let rect = null;
  let rafId = 0;
  let lastTime = 0;
  let destroyed = false;

  const updateRect = () => {
    if (destroyed) return;
    rect = playfield.getBoundingClientRect();
  };
  
  // Initial rect
  updateRect();

  const onPointerMove = (e) => {
    if (destroyed) return;
    if (!rect) updateRect();
    
    // e.clientX is viewport relative. rect.left is viewport relative.
    localX = e.clientX - rect.left;
    localY = e.clientY - rect.top;
    
    pointerInside = (localX >= 0 && localX <= rect.width && localY >= 0 && localY <= rect.height);
  };
  
  const onPointerLeave = () => {
    pointerInside = false;
    lastSpawnX = null;
    lastSpawnY = null;
  };

  const spawnParticle = (x, y) => {
    if (pool.length === 0) {
      // Optional: Recycle oldest active particle?
      // For now, just skip to avoid churning too much
      return;
    }
    
    const el = pool.pop();
    const particle = {
      el,
      // Center the 20px particle (offset by 10px)
      x: x - 10,
      y: y - 10,
      age: 0,
      maxAge: PARTICLE_LIFETIME
    };
    
    // Reset element state
    el.style.opacity = '1';
    el.style.transform = `translate3d(${particle.x}px, ${particle.y}px, 0) scale(1)`;
    
    activeParticles.push(particle);
  };

  const loop = (now) => {
    if (destroyed) return;
    
    if (!lastTime) lastTime = now;
    const dt = now - lastTime;
    lastTime = now;
    
    // Spawn new particle if pointer is active
    if (pointerInside) {
      if (lastSpawnX === null || lastSpawnY === null) {
        spawnParticle(localX, localY);
      } else {
        const dx = localX - lastSpawnX;
        const dy = localY - lastSpawnY;
        const dist = Math.hypot(dx, dy);
        
        if (dist >= INTERPOLATION_STEP) {
          const steps = Math.floor(dist / INTERPOLATION_STEP);
          for (let i = 1; i <= steps; i++) {
             // Linear interpolation
             const tx = lastSpawnX + (dx / dist) * (i * INTERPOLATION_STEP);
             const ty = lastSpawnY + (dy / dist) * (i * INTERPOLATION_STEP);
             spawnParticle(tx, ty);
          }
        }
        
        // Always spawn at current to keep the cursor tip fresh
        spawnParticle(localX, localY);
      }
      
      lastSpawnX = localX;
      lastSpawnY = localY;
    } else {
      lastSpawnX = null;
      lastSpawnY = null;
    }
    
    // Update active particles
    // Iterate backwards to allow removal
    for (let i = activeParticles.length - 1; i >= 0; i--) {
      const p = activeParticles[i];
      p.age += dt;
      
      if (p.age >= p.maxAge) {
        // Recycle
        p.el.style.opacity = '0';
        p.el.style.transform = 'translate3d(-9999px, -9999px, 0)';
        pool.push(p.el);
        
        // Fast remove (swap with last)
        const last = activeParticles[activeParticles.length - 1];
        activeParticles[i] = last;
        activeParticles.pop();
      } else {
        // Animate
        const progress = p.age / p.maxAge;
        // Ease out opacity
        const opacity = 1 - progress; 
        // Slight shrink
        const scale = 1 - (0.4 * progress); 
        
        p.el.style.opacity = opacity.toFixed(2);
        p.el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) scale(${scale.toFixed(2)})`;
      }
    }
    
    rafId = requestAnimationFrame(loop);
  };

  // Start loop
  rafId = requestAnimationFrame(loop);

  // Event Listeners
  window.addEventListener('resize', updateRect);
  window.addEventListener('scroll', updateRect, { passive: true }); // Rect changes on scroll if not fixed
  
  // We use pointermove on playfield. 
  // Note: If the user drags out of playfield, pointerInside should become false via leave/move checks.
  const opts = { passive: true };
  playfield.addEventListener('pointermove', onPointerMove, opts);
  playfield.addEventListener('pointerdown', onPointerMove, opts);
  playfield.addEventListener('pointerenter', onPointerMove, opts);
  playfield.addEventListener('pointerleave', onPointerLeave, opts);
  playfield.addEventListener('pointercancel', onPointerLeave, opts);

  const destroy = () => {
    destroyed = true;
    if (rafId) cancelAnimationFrame(rafId);
    
    try { window.removeEventListener('resize', updateRect); } catch {}
    try { window.removeEventListener('scroll', updateRect); } catch {}
    
    try {
      playfield.removeEventListener('pointermove', onPointerMove);
      playfield.removeEventListener('pointerdown', onPointerMove);
      playfield.removeEventListener('pointerenter', onPointerMove);
      playfield.removeEventListener('pointerleave', onPointerLeave);
      playfield.removeEventListener('pointercancel', onPointerLeave);
    } catch {}
    
    // Remove elements
    pool.forEach(el => el.remove());
    activeParticles.forEach(p => p.el.remove());
    pool.length = 0;
    activeParticles.length = 0;
  };

  return { destroy };
}
