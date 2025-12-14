// js/game/cursorTrail.js

export function createCursorTrail(playfield) {
  if (!playfield || typeof window === 'undefined') {
    return { destroy() {} };
  }

  const POOL_SIZE = 60;
  const PARTICLE_LIFETIME = 500; // ms
  
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
  };

  const spawnParticle = () => {
    if (pool.length === 0) {
      // Optional: Recycle oldest active particle?
      // For now, just skip to avoid churning too much
      return;
    }
    
    const el = pool.pop();
    const particle = {
      el,
      // Center the 6px particle (offset by 3px)
      x: localX - 3,
      y: localY - 3,
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
    // We limit spawning to 1 per frame, which is exactly what "every frame" means.
    if (pointerInside) {
      spawnParticle();
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