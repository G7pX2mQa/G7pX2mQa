// js/misc/prismaticPickaxeCinematic.js
//
// Orchestrates the over-the-top cinematic animation that plays the first time
// the player performs a Compress reset.  Purely cosmetic — game state has
// already been committed before this module runs.

import { playAudio, setAudioUnderwater, fadeAudioUnderwaterToNormal, setCinematicMuffleException } from "../util/audioManager.js";
import { closeMiner } from "../ui/minerTabs/dlgTab.js";
import { closeShop } from "../ui/shopOverlay.js";
import { disableGlobalOverlayEsc, enableGlobalOverlayEsc } from "../util/globalOverlayEsc.js";

// ── Assets ──────────────────────────────────────────────────────────────────
const PRISMATIC_SRC  = "img/misc/prismatic_pickaxe.webp";
const OLD_PICKAXE_SRC = "img/misc/pickaxe.webp";
const SPINNY_SFX     = "sounds/spinny.ogg";
const EXPLOSION_SFX  = "sounds/explosion_caused_by_spinny.ogg";

// ── Timeline (ms) ───────────────────────────────────────────────────────────
const DANCE_END   = 3000;   // End of dance → close overlay
const COLLISION   = 5000;   // Prismatic pickaxe slams into old pickaxe
const TOTAL       = 8000;   // Entire cinematic duration

// ── Sparkles ────────────────────────────────────────────────────────────────
const RAINBOW = [
    "#ff0000", "#ff5500", "#ff9900", "#ffcc00", "#ffff00",
    "#88ff00", "#00ff00", "#00ffaa", "#00ffff", "#00aaff",
    "#0044ff", "#4400ff", "#8800ff", "#cc00ff", "#ff00cc",
    "#ff0088",
];
const SPARKLE_INTERVAL = 15;   // ms between spawns
const MAX_SPARKLES     = 200;

// ═════════════════════════════════════════════════════════════════════════════
//  Public entry point
// ═════════════════════════════════════════════════════════════════════════════

/**
 * @param {HTMLElement} compressBtnEl  The Compress reset button element (used
 *   as the visual origin for the prismatic pickaxe).
 */
export function playPrismaticPickaxeCinematic(compressBtnEl) {
    // ── 1. Capture origin position ──────────────────────────────────────────
    const btnRect = compressBtnEl.getBoundingClientRect();
    const originX = btnRect.left + btnRect.width / 2;
    const originY = btnRect.top  + btnRect.height / 2;

    const pickaxeSize = Math.min(200, Math.max(96, window.innerHeight * 0.18));

    // ── 2. Block all user interaction ───────────────────────────────────────
    const blocked = blockInteractions();

    // ── 3. Pause material spawning ──────────────────────────────────────────
    window._prismaticCinematicActive = true;
    window._wasCinematicActive = true;

    // ── 4. Setup old pickaxe (freeze, teleport, force-show) ─────────────────
    const oldPickaxe = window._ucPickaxeElement || document.getElementById("uc-pickaxe");
    const savedOldState = freezeAndTeleportOldPickaxe(oldPickaxe);

    // ── 5. Create cinematic DOM ─────────────────────────────────────────────
    const dom = createCinematicDOM(pickaxeSize, originX, originY);

    const activeSparkles = [];

    // Handle resize
    const onResize = () => {
        if (dom.sparkles && dom.sparkles.parentNode) {
            dom.sparkles.width = window.innerWidth;
            dom.sparkles.height = window.innerHeight;
        }
    };
    window.addEventListener("resize", onResize);

    // ── 6. Play spinny sound & start underwater music ────────────────────────
    try { playAudio(SPINNY_SFX, { volume: 0.7, type: "sfx", bypassFilter: true, persistOnHide: true }); } catch {}
    setCinematicMuffleException(true);
    try { setAudioUnderwater(true); } catch {}

    // ── 7. Pre-calc collision target (old pickaxe viewport position) ────────
    let collisionTarget = calcCollisionTarget(oldPickaxe, pickaxeSize);

    // ── 8. Kick off dance ───────────────────────────────────────────────────
    requestAnimationFrame(() => {
        dom.spotlight.classList.add("is-visible");
        dom.pickaxe.classList.add("is-dancing");
        // Slide from button origin to viewport centre
        const cx = window.innerWidth  / 2 - pickaxeSize / 2;
        const cy = window.innerHeight * 0.40 - pickaxeSize / 2;
        dom.pickaxe.style.transition = "left 0.45s ease-out, top 0.45s ease-out";
        requestAnimationFrame(() => {
            dom.pickaxe.style.left = cx + "px";
            dom.pickaxe.style.top  = cy + "px";
        });
    });

    // ── 9. Main rAF timeline ────────────────────────────────────────────────
    let t0 = null;
    let lastNow = null;
    let lastSparkleT = 0;
    let didClose   = false;
    let didFlashStart = false;
    let didCollide = false;
    let didShake   = false;

    function tick(now) {
        if (!t0) t0 = now;
        const elapsed = now - t0;
        const dt = lastNow ? (now - lastNow) : 0;
        lastNow = now;

        // ── Sparkles (phases 1 – 3) ─────────────────────────────────────────
        if (elapsed < COLLISION && now - lastSparkleT > SPARKLE_INTERVAL && activeSparkles.length < MAX_SPARKLES) {
            lastSparkleT = now;
            const r = dom.pickaxe.getBoundingClientRect();
            emitSparkle(activeSparkles, r.left + r.width / 2, r.top + r.height / 2);
        }

        // Render Canvas Sparkles
        if (dom.sparklesCtx) {
            dom.sparklesCtx.clearRect(0, 0, dom.sparkles.width, dom.sparkles.height);
            for (let i = activeSparkles.length - 1; i >= 0; i--) {
                const sp = activeSparkles[i];
                sp.age += dt;
                if (sp.age >= sp.dur) {
                    activeSparkles.splice(i, 1);
                    continue;
                }

                const progress = sp.age / sp.dur;
                const easeOut = 1 - Math.pow(1 - progress, 3);
                const x = sp.startX + sp.dx * easeOut;
                const y = sp.startY + sp.dy * easeOut;
                
                const scale = sp.sz * (1 - 0.9 * progress);
                let opacity = 1;
                if (progress > 0.6) {
                    opacity = 0.8 * (1 - (progress - 0.6) / 0.4);
                } else {
                    opacity = 1 - (0.2 * (progress / 0.6));
                }

                dom.sparklesCtx.globalAlpha = opacity;
                const tex = getStarTexture(sp.color);
                const drawSize = 64 * scale;
                dom.sparklesCtx.drawImage(tex, x - drawSize / 2, y - drawSize / 2, drawSize, drawSize);
            }
            dom.sparklesCtx.globalAlpha = 1.0;
        }

        // ── Phase 2 — close miner overlay (at 3 s) ─────────────────────────
        if (elapsed >= DANCE_END && !didClose) {
            didClose = true;

            // Forcefully close the miner and shop overlays
            try { closeMiner(); } catch {}
            try { closeShop(); } catch {}
            // They clear the underwater filter, so re-apply it immediately!
            setCinematicMuffleException(true);
            try { setAudioUnderwater(true); } catch {}

            // Swap animations to begin drifting toward old pickaxe
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    // Recalculate target (playfield is now uncovered)
                    const finalSize = oldPickaxe ? (parseInt(oldPickaxe.style.width, 10) || 64) : pickaxeSize;
                    collisionTarget = calcCollisionTarget(oldPickaxe, finalSize);
                    
                    // Remove dance and apply drift (this enables CSS transitions for top/left/width/height)
                    dom.pickaxe.classList.remove("is-dancing");
                    dom.pickaxe.classList.add("is-drifting");
                    
                    // Set targets so the transition smoothly glides it across the screen
                    dom.pickaxe.style.width = finalSize + "px";
                    dom.pickaxe.style.height = finalSize + "px";
                    dom.pickaxe.style.left = collisionTarget.x + "px";
                    dom.pickaxe.style.top  = collisionTarget.y + "px";
                });
            });

            // Fade the spotlight
            dom.spotlight.classList.remove("is-visible");
            dom.spotlight.classList.add("is-fading");
        }

        // ── Pre-collision Flash (starts 500ms early to peak on impact) ──────
        if (elapsed >= COLLISION - 500 && !didFlashStart) {
            didFlashStart = true;
            dom.flash.classList.add("is-active");
        }

        // ── Phase 4 — COLLISION (at 5 s) ────────────────────────────────────
        if (elapsed >= COLLISION && !didCollide) {
            didCollide = true;

            // Instantly hide cinematic pickaxe to seamlessly handoff to the real one
            dom.pickaxe.style.display = "none";

            // Explosion SFX & restore music over 10s
            try { playAudio(EXPLOSION_SFX, { volume: 0.85, type: "sfx", bypassFilter: true, persistOnHide: true }); } catch {}
            try { fadeAudioUnderwaterToNormal(10); } catch {}

            // Swap old pickaxe image to prismatic (the "upgrade" moment)
            if (oldPickaxe) oldPickaxe.src = PRISMATIC_SRC;

            // Burst of sparkles at impact
            for (let i = 0; i < 150; i++) {
                setTimeout(() => {
                    emitSparkle(
                        activeSparkles,
                        collisionTarget.cx,
                        collisionTarget.cy
                    );
                }, i * 6);
            }
        }

        // ── Phase 5 — screen shake (at 5 s) ─────────────────────────────────
        if (elapsed >= COLLISION && !didShake) {
            didShake = true;
            const gameRoot = document.getElementById("game-root");
            if (gameRoot) gameRoot.classList.add("prismatic-shake");
        }

        // ── Cleanup (at 8 s) ────────────────────────────────────────────────
        if (elapsed >= TOTAL) {
            window.removeEventListener("resize", onResize);
            cleanup(blocked, oldPickaxe, savedOldState, dom);
            return; // stop rAF loop
        }

        requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Old pickaxe helpers
// ═════════════════════════════════════════════════════════════════════════════

function freezeAndTeleportOldPickaxe(el) {
    if (!el) return null;

    const saved = {
        left:        el.style.left,
        top:         el.style.top,
        display:     el.style.display,
        transform:   el.style.transform,
        transition:  el.style.transition,
        src:         el.src,
        elapsedTime: el._elapsedTime,
        playedSound: el._playedSound,
    };

    // Stop animation cycle
    el._elapsedTime = undefined;

    // Force visible (overrides Spawn Vessels setting)
    el.style.display = "block";

    // Show the OLD pickaxe image for narrative purposes
    // (the game state already swapped it to prismatic — we revert visually)
    el.src = OLD_PICKAXE_SRC;

    // Teleport: 15 % from right edge, keep current vertical
    const playfield = el.closest(".playfield") || document.querySelector(".playfield");
    if (playfield) {
        const pfW   = playfield.getBoundingClientRect().width;
        const elW   = parseInt(el.style.width, 10) || 64;
        el.style.left = (pfW * 0.85 - elW / 2) + "px";
        // top stays as-is
    }

    // Static resting pose facing the center
    el.style.transform  = "scaleX(-1) rotate(-30deg)";
    el.style.transition = "none";

    return saved;
}

function calcCollisionTarget(oldPickaxe, cinematicSize) {
    if (oldPickaxe && oldPickaxe.offsetParent) {
        const r = oldPickaxe.getBoundingClientRect();
        return {
            x: r.left + r.width  / 2 - cinematicSize / 2,
            y: r.top  + r.height / 2 - cinematicSize / 2,
            cx: r.left + r.width / 2,
            cy: r.top + r.height / 2,
        };
    }
    // Fallback when the element isn't in the DOM or is invisible
    return {
        x: window.innerWidth  * 0.85 - cinematicSize / 2,
        y: window.innerHeight * 0.50 - cinematicSize / 2,
        cx: window.innerWidth  * 0.85,
        cy: window.innerHeight * 0.50,
    };
}

const starTextures = {};
function getStarTexture(color) {
    if (starTextures[color]) return starTextures[color];
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const cx = c.getContext("2d");

    cx.shadowBlur = 10;
    cx.shadowColor = color;
    cx.fillStyle = color;

    cx.beginPath();
    cx.moveTo(32, 4);
    cx.lineTo(36, 28);
    cx.lineTo(60, 32);
    cx.lineTo(36, 36);
    cx.lineTo(32, 60);
    cx.lineTo(28, 36);
    cx.lineTo(4, 32);
    cx.lineTo(28, 28);
    cx.closePath();
    cx.fill();

    starTextures[color] = c;
    return c;
}

// ═════════════════════════════════════════════════════════════════════════════
//  DOM creation
// ═════════════════════════════════════════════════════════════════════════════

function createCinematicDOM(size, startX, startY) {
    const spotlight = document.createElement("div");
    spotlight.className = "prismatic-spotlight";
    document.body.appendChild(spotlight);

    const sparkles = document.createElement("canvas");
    sparkles.className = "prismatic-sparkle-container";
    sparkles.width = window.innerWidth;
    sparkles.height = window.innerHeight;
    document.body.appendChild(sparkles);

    const sparklesCtx = sparkles.getContext("2d", { alpha: true });

    const flash = document.createElement("div");
    flash.className = "prismatic-flash";
    document.body.appendChild(flash);

    const pickaxe = document.createElement("img");
    pickaxe.src        = PRISMATIC_SRC;
    pickaxe.className  = "prismatic-cinematic-pickaxe";
    pickaxe.draggable  = false;
    pickaxe.style.width  = size + "px";
    pickaxe.style.height = size + "px";
    pickaxe.style.left = (startX - size / 2) + "px";
    pickaxe.style.top  = (startY - size / 2) + "px";
    document.body.appendChild(pickaxe);

    return { spotlight, sparkles, sparklesCtx, flash, pickaxe };
}

// ═════════════════════════════════════════════════════════════════════════════
//  Sparkle emitter
// ═════════════════════════════════════════════════════════════════════════════

function emitSparkle(activeSparkles, cx, cy) {
    const color = RAINBOW[Math.floor(Math.random() * RAINBOW.length)];
    const angle = Math.random() * Math.PI * 2;
    const dist  = 60 + Math.random() * 180;
    const dx    = Math.cos(angle) * dist;
    const dy    = Math.sin(angle) * dist;
    const dur   = (0.4 + Math.random() * 0.65) * 1000;
    const sz    = (10 + Math.random() * 15) / 64; // Scale factor relative to 64x64 texture

    activeSparkles.push({
        startX: cx, startY: cy,
        dx, dy, dur, sz, color,
        age: 0
    });
}

// ═════════════════════════════════════════════════════════════════════════════
//  Interaction blocking / unblocking
// ═════════════════════════════════════════════════════════════════════════════

function blockInteractions() {
    const state = { handler: null, elements: [], blocker: null };

    // Capturing keydown on window — blocks Escape, Tab, and number keys.
    state.handler = (e) => {
        if (e.key === "Escape" || e.key === "Tab" || /^[0-9]$/.test(e.key)) {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
        }
    };
    window.addEventListener("keydown", state.handler, true);

    // Disable the global Escape/Tab overlay-close handler
    disableGlobalOverlayEsc();

    // Disable click-based interaction on overlay controls
    const sels =
        ".merchant-tab, .merchant-close, .shop-close, " +
        ".merchant-grabber, .grab-handle, " +
        ".merchant-reset__layer, .merchant-reset__action";
    document.querySelectorAll(sels).forEach((el) => {
        state.elements.push({ el, pe: el.style.pointerEvents });
        el.style.pointerEvents = "none";
    });

    // Create a full-screen invisible blocker to absolutely prevent ALL clicks (HUD, etc.)
    const blocker = document.createElement("div");
    blocker.id = "cinematic-click-blocker";
    blocker.style.position = "fixed";
    blocker.style.inset = "0";
    blocker.style.zIndex = "9999999"; // High enough to cover HUD but under cinematic elements (100000)
    document.body.appendChild(blocker);
    state.blocker = blocker;

    return state;
}

function unblockInteractions(state) {
    if (state.handler) {
        window.removeEventListener("keydown", state.handler, true);
    }
    enableGlobalOverlayEsc();
    state.elements.forEach(({ el, pe }) => {
        el.style.pointerEvents = pe || "";
    });
    if (state.blocker) {
        state.blocker.remove();
    }
}

// ═════════════════════════════════════════════════════════════════════════════
//  Cleanup
// ═════════════════════════════════════════════════════════════════════════════

function cleanup(blocked, oldPickaxe, savedOldState, dom) {
    // Remove cinematic DOM
    try { dom.spotlight.remove(); } catch {}
    try { dom.sparkles.remove();  } catch {}
    try { dom.flash.remove();     } catch {}
    try { dom.pickaxe.remove();   } catch {}

    // Remove screen shake
    const gameRoot = document.getElementById("game-root");
    if (gameRoot) gameRoot.classList.remove("prismatic-shake");

    // Unpause spawner
    window._prismaticCinematicActive = false;

    // Restore old pickaxe for normal operation
    if (oldPickaxe && savedOldState) {
        // The game state already says prismatic — keep that src
        oldPickaxe.src = PRISMATIC_SRC;
        // Prevent ghost swinging: wait for the spawner to schedule the next real strike
        oldPickaxe._elapsedTime = undefined;
        oldPickaxe._playedSound = true;
        // Let the spawner know it needs to smoothly fly this pickaxe to its next target 
        // rather than instantly teleporting it.
        oldPickaxe._needsFlightToNextTarget = true;
    }

    // Unblock user interaction
    unblockInteractions(blocked);
}
