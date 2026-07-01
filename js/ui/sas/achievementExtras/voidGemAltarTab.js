import { bank, getActiveSlot } from '../../../util/storage.js';
import { ACHIEVEMENTS, ACHIEVEMENT_STATES, getAchievementState } from '../../../game/achievements.js';
import { formatNumber } from '../../../util/numFormat.js';
import { BigNum, bigNumFromLog10 } from '../../../util/bigNum.js';
import { playAudio, applyAudioDrownEffect, removeAudioDrownEffect } from '../../../util/audioManager.js';
import { registerTick } from '../../../game/gameLoop.js';
import { settingsManager } from '../../../game/settingsManager.js';
import { setHtmlOrText } from '../../../util/uiHelpers.js';

const VOID_LEVEL_KEY = (slot) => `ccc:voidLevel:${slot}`;

export function getVoidLevel(slot = getActiveSlot()) {
    const slotKey = String(slot ?? 'default');
    try {
        const valStr = localStorage.getItem(VOID_LEVEL_KEY(slotKey));
        if (valStr !== null && valStr !== 'undefined') {
            try {
                return BigNum.fromAny(valStr);
            } catch {
                return BigNum.fromInt(0);
            }
        }
    } catch {}
    return BigNum.fromInt(0);
}

export function setVoidLevel(level, slot = getActiveSlot()) {
    const slotKey = String(slot ?? 'default');
    let valBn;
    try {
        valBn = level instanceof BigNum ? level : BigNum.fromAny(level);
        if (valBn.isNegative && valBn.isNegative()) valBn = BigNum.fromInt(0);
    } catch {
        valBn = BigNum.fromInt(0);
    }
    try {
        localStorage.setItem(VOID_LEVEL_KEY(slotKey), valBn.toStorage?.() ?? valBn.toString());
        if (bank.rainbowGems && bank.rainbowGems.mult) {
            bank.rainbowGems.mult.set(getRainbowGemMultiplier());
        }
        if (typeof document !== 'undefined') {
            document.dispatchEvent(new CustomEvent('ccc:voidLevel:changed'));
        }
    } catch {}
}

export function getRainbowGemMultiplier() {
    const level = getVoidLevel();
    const levelNum = (level.inf ? Infinity : (level.sig * Math.pow(10, level.e)));
    if (levelNum < 300) {
        return BigNum.fromAny(Math.pow(1.1, levelNum));
    }
    const multLog10 = Math.log10(1.1) * levelNum;
    return bigNumFromLog10(multLog10);
}

export function feedVoidGem() {
    if (!bank.voidGems || bank.voidGems.value.cmp(1) < 0) return false;

    const slot = getActiveSlot();
    const oldMultiplier = getRainbowGemMultiplier();

    let sumBaseRewards = 0;
    for (const achievement of ACHIEVEMENTS) {
        if (getAchievementState(achievement.id, slot) === ACHIEVEMENT_STATES.ACHIEVED) {
            sumBaseRewards += achievement.rewardAmount;
        }
    }

    const oldTotal = oldMultiplier.mulScaledIntFloor(Number(Math.round(sumBaseRewards)), 0);

    bank.voidGems.sub(1);
    const currentLevel = getVoidLevel(slot);
    setVoidLevel(currentLevel.add(1), slot);

    const newMultiplier = getRainbowGemMultiplier();
    const newTotal = newMultiplier.mulScaledIntFloor(Number(Math.round(sumBaseRewards)), 0);
    const diff = newTotal.sub(oldTotal);

    if (diff.cmp(0) > 0 && bank.rainbowGems) {
        bank.rainbowGems.mult.set(newMultiplier);
        bank.rainbowGems.add(diff);
    }

    return true;
}

let altarTabPanel = null;
let isFeeding = false;

function playVoidExplosion() {
    const explosionContainer = document.createElement('div');
    explosionContainer.style.position = 'fixed';
    explosionContainer.style.top = '0';
    explosionContainer.style.left = '0';
    explosionContainer.style.width = '100vw';
    explosionContainer.style.height = '100vh';
    explosionContainer.style.pointerEvents = 'none'; // Don't block interactions, the game should be playable again
    explosionContainer.style.zIndex = '999999';
    explosionContainer.style.overflow = 'hidden';
    document.body.appendChild(explosionContainer);

    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.pointerEvents = 'none';
    explosionContainer.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const particles = [];
    let isAnimating = true;

    // Void theme colors
    const colors = ['#000000', '#1a0033', '#4b0082', '#800080', '#2d004d', '#3a0066', '#5900b3'];

    class Particle {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            
            const angle = Math.random() * Math.PI * 2;
            const speed = (Math.random() * 20 + 5); // Fast explosion out
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
            
            this.size = (Math.random() * 300 + 100);
            this.color = colors[Math.floor(Math.random() * colors.length)];
            
            this.life = 1.0;
            this.decay = (Math.random() * 0.005 + 0.005);
            this.gravity = 0.3; // Fall down
        }

        update(timeScale = 1) {
            this.x += this.vx * timeScale;
            this.y += this.vy * timeScale;
            this.vy += this.gravity * timeScale;
            this.life -= this.decay * timeScale;
            this.size *= Math.pow(0.98, timeScale);
        }


        draw(ctx) {
            if (this.life <= 0) return;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.globalAlpha = this.life;
            ctx.fill();
            ctx.globalAlpha = 1.0;
        }
    }

    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    
    // Spawn 500 large void particles
    for (let i = 0; i < 500; i++) {
        particles.push(new Particle(centerX, centerY));
    }

    const animate = (time) => {
        if (!isAnimating) return;
        
        const dt = time - lastTime;
        lastTime = time;
        // Cap dt to prevent massive jumps if tab is backgrounded
        const safeDt = Math.min(dt, 100);
        const timeScale = safeDt / (1000 / 120);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.update(timeScale);
            p.draw(ctx);
            if (p.life <= 0) {
                particles.splice(i, 1);
            }
        }
        
        if (particles.length > 0) {
            requestAnimationFrame(animate);
        } else {
            isAnimating = false;
        }
    };
    
    let lastTime = performance.now();
    requestAnimationFrame((time) => {
        lastTime = time;
        animate(time);
    });

    const onResize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    // Wait for long explosion to finish before removing container
    setTimeout(() => {
        isAnimating = false;
        window.removeEventListener('resize', onResize);
        if (explosionContainer.parentElement) {
            explosionContainer.remove();
        }
    }, 5000);
}

// Moved to inline logic for unified tick loop inside the click handler
// function triggerVoidVisuals() removed


export function initVoidGemAltarTab(panel) {
    if (bank.rainbowGems) bank.rainbowGems.mult.set(getRainbowGemMultiplier());
    if (!panel || panel.__vgInit) return;
    panel.__vgInit = true;
    altarTabPanel = panel;

    panel.innerHTML = `
        <div class="warp-tab">
            <h3 class="warp-title void-gem-altar-title">Void Gem Altar</h3>
            <div class="warp-desc">
                <p>Feed your Void Gems to the ??? to power your Void Level<br>For every Void Level after 0, multiply Rainbow Gem value by 1.1x compounding<br>You will also gain the updated Rainbow Gem amount from achievements that have already been claimed</p>
            </div>
            <div class="warp-status">
                <div class="warp-timer void-gem-counter" style="visibility: visible; font-weight: bold;"><span class="void-text-black">Void Gems: </span><span class="void-text-black" style="font-weight: bold;">0</span></div>
                <div class="warp-counter void-level-indicator" style="font-weight: bold;"><span class="void-level-text-black">Void Level: </span><span class="void-level-text-black" style="font-weight: bold;">0</span></div>
            </div>
            <button type="button" class="void-feed-btn warp-btn">Feed</button>
        </div>
    `;

    const feedBtn = panel.querySelector('.void-feed-btn');
    feedBtn.addEventListener('click', (e) => {
        if (isFeeding) return;
        if (!bank.voidGems || bank.voidGems.value.cmp(1) < 0) return;

        isFeeding = true;
        updateVoidGemAltarTab(); // Update button state

        // Audio sequence
        let buildupAudio = playAudio('sounds/void_buildup.ogg', { volume: 0.6, type: 'ui' });
        
        applyAudioDrownEffect(9.5);

        let overlay = null;
        if (settingsManager.get('warp_vfx') !== false) {
            overlay = document.createElement('div');
            overlay.className = 'void-overlay';
            
            const vortex = document.createElement('div');
            vortex.className = 'void-vortex';
            overlay.appendChild(vortex);

            document.body.appendChild(overlay);
        }

        let isExploded = false;
        let isStage2 = false;
        let voidTimeAccumulator = 0;
        let debrisTimeAccumulator = 0;

        let unsub = null;
        unsub = registerTick((dt) => {
            if (!document.hidden) {
                voidTimeAccumulator += dt;
                debrisTimeAccumulator += dt;

                // Debris spawning
                if (overlay && overlay.parentElement && !isExploded) {
                    // Spawn every ~0.03 seconds (30ms)
                    if (debrisTimeAccumulator >= 0.03) {
                        debrisTimeAccumulator = 0;
                        
                        const numDebris = isStage2 ? 15 : 3;

                        for (let i = 0; i < numDebris; i++) {
                            const debris = document.createElement('div');
                            debris.className = 'void-debris';

                            const edge = Math.floor(Math.random() * 4);
                            let startX, startY;
                            if (edge === 0) {
                                startX = Math.random() * window.innerWidth;
                                startY = -50;
                            } else if (edge === 1) {
                                startX = window.innerWidth + 50;
                                startY = Math.random() * window.innerHeight;
                            } else if (edge === 2) {
                                startX = Math.random() * window.innerWidth;
                                startY = window.innerHeight + 50;
                            } else {
                                startX = -50;
                                startY = Math.random() * window.innerHeight;
                            }

                            const size = 10 + Math.random() * 40;
                            debris.style.width = `${size}px`;
                            debris.style.height = `${size}px`;
                            debris.style.left = `${startX}px`;
                            debris.style.top = `${startY}px`;
                            
                            const colors = ['#111', '#222', '#333', '#1a1a2e', '#0f0f1a'];
                            debris.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                            
                            const targetX = window.innerWidth / 2;
                            const targetY = window.innerHeight / 2;
                            
                            const duration = isStage2 
                                ? 200 + Math.random() * 500 
                                : 1000 + Math.random() * 1500; 
                            
                            debris.style.transition = `transform ${duration}ms cubic-bezier(0.5, 0, 1, 0.5), opacity ${duration}ms ease-in`;
                            
                            overlay.appendChild(debris);

                            debris.getBoundingClientRect(); // Trigger reflow

                            const deltaX = targetX - startX - (size / 2);
                            const deltaY = targetY - startY - (size / 2);
                            const rotate = (Math.random() - 0.5) * 720;

                            debris.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(0) rotate(${rotate}deg)`;
                            debris.style.opacity = '0';

                            // CSS transition handles animation. We just clean it up later.
                            setTimeout(() => {
                                if (debris.parentElement) debris.remove();
                            }, duration);
                        }
                    }
                }

                if (voidTimeAccumulator >= 7.777 && !isStage2) {
                    isStage2 = true;
                    if (overlay) overlay.classList.add('stage-2');
                }

                if (voidTimeAccumulator >= 9.5 && !isExploded) {
                    isExploded = true;
                    if (unsub) unsub();
                    
                    if (buildupAudio && typeof buildupAudio.stop === 'function') {
                        buildupAudio.stop();
                    }
                    removeAudioDrownEffect();
                    playAudio('sounds/explosion_long.ogg', { volume: 1.0, type: 'ui' });

                    if (overlay) {
                        overlay.style.transition = 'opacity 500ms ease-out';
                        overlay.style.opacity = '0';
                        setTimeout(() => {
                            if (overlay.parentElement) overlay.remove();
                        }, 500);
                        playVoidExplosion();
                    }

                    if (feedVoidGem()) {
                        updateVoidGemAltarTab();
                    }
                    isFeeding = false;
                    updateVoidGemAltarTab();
                }
            }
        });
    });

    updateVoidGemAltarTab();

    // Listen for debug panel changes
    if (!panel.__debugListenerAdded) {
        panel.__debugListenerAdded = true;
        document.addEventListener('ccc:voidLevel:changed', updateVoidGemAltarTab);
        window.addEventListener('currency:change', (e) => {
            if (e.detail && e.detail.key === 'voidGems') {
                updateVoidGemAltarTab();
            }
        });
    }
}

export function updateVoidGemAltarTab() {
    if (!altarTabPanel) return;

    const gemCounterEl = altarTabPanel.querySelectorAll('.void-gem-counter span')[1];
    const levelIndicatorEl = altarTabPanel.querySelectorAll('.void-level-indicator span')[1];
    const feedBtn = altarTabPanel.querySelector('.void-feed-btn');

    const voidGemsAmount = bank.voidGems ? bank.voidGems.value : BigNum.fromInt(0);
    const currentVoidLevel = getVoidLevel();

    if (gemCounterEl) {
        let text = typeof formatNumber === 'function' ? formatNumber(voidGemsAmount) : voidGemsAmount.toString();
        if (text.includes('infinity-symbol')) {
             text = text.replace('class="infinity-symbol"', 'class="infinity-symbol void-text-black"');
        }
        setHtmlOrText(gemCounterEl, text);
    }

    if (levelIndicatorEl) {
        let text = typeof formatNumber === 'function' ? formatNumber(currentVoidLevel) : currentVoidLevel.toString();
        if (text.includes('infinity-symbol')) {
             text = text.replace('class="infinity-symbol"', 'class="infinity-symbol void-level-text-black"');
        }
        setHtmlOrText(levelIndicatorEl, text);
    }

    if (feedBtn) {
        if (isFeeding) {
            feedBtn.disabled = true;
        } else if (bank.voidGems && bank.voidGems.value.cmp(1) >= 0) {
            feedBtn.disabled = false;
        } else {
            feedBtn.disabled = true;
        }
    }
}
