// js/ui/delveCore.js
import { playAudio, setAudioUnderwater } from '../util/audioManager.js';
import { shouldSkipGhostTap, suppressNextGhostTap } from '../util/ghostTapGuard.js';
import { blockInteraction } from './shopOverlay.js';
import { IS_MOBILE } from '../main.js';


export let merchantOverlayEl = null;
export let merchantSheetEl = null;
let __typeTextId = 0;
export let __isTypingActive = false;
export let activeTypingAudio = null;
export const TYPING_SFX_SRC = 'sounds/merchant_typing.ogg';

export function setDelveElements(overlay, sheet) {
    merchantOverlayEl = overlay;
    merchantSheetEl = sheet;
}

export function setTypingActive(active) {
    if (!active) __typeTextId++;
    __isTypingActive = active;
}

export function setActiveTypingAudio(audio) {
    activeTypingAudio = audio;
}

export const MYSTERIOUS_ICON_SRC = 'img/misc/mysterious.webp';
export const HIDDEN_DIALOGUE_TITLE = 'Hidden Dialogue';
export const LOCKED_DIALOGUE_TITLE = 'Locked Dialogue';
export const DEFAULT_MYSTERIOUS_BLURB = 'Hidden Dialogue';
export const DEFAULT_LOCKED_BLURB = 'Locked';
export const DEFAULT_LOCK_MESSAGE = 'Locked Dialogue';
export const DIALOGUE_STATUS_ORDER = { locked: 0, mysterious: 1, unlocked: 2 };
export const HAS_POINTER_EVENTS = typeof window !== 'undefined' && 'PointerEvent' in window;
export const HAS_TOUCH_EVENTS = !HAS_POINTER_EVENTS && typeof window !== 'undefined' && 'ontouchstart' in window;

export class DialogueEngine {
  constructor({ textEl, choicesEl, skipTargets, onEnd, onChoice, pauseMultiplier = 20 }) {
      this.textEl = textEl;
      this.choicesEl = choicesEl;
      this.skipTargets = skipTargets;
      this.onEnd = (info) => {
        setAudioUnderwater(false);
        if (onEnd) onEnd(info);
      };
      this.onChoice = onChoice;
      this.pauseMultiplier = pauseMultiplier;
      this.nodes = {};
      this.current = null;

      this.deferNextChoices = false;
      this._reservedH = 0;
  }

  load(script) {
      this.nodes = script.nodes || {};
      this.startId = script.start;
  }

  async start() {
      setAudioUnderwater(true);
      if (!this.startId) return;
      await this.goto(this.startId);
  }

  async goto(id) {
      const node = this.nodes[id];
      if (!node) return;
      this.current = id;

      if (node.type === 'line') {
      const nextNode = this.nodes[node.next];

      // Pre-render next choices invisibly to reserve height (unless deferring)
      if (!this.deferNextChoices && nextNode && nextNode.type === 'choice') {
        this._renderChoices(nextNode.options || [], true);
      } else {
        this._hideChoices();
      }

      await typeText(this.textEl, node.say, node.msPerChar ?? 22, this.skipTargets, this.pauseMultiplier);

      if (nextNode && nextNode.type === 'choice') {
        this.current = node.next;

        if (this.deferNextChoices) {
          this.deferNextChoices = false;
          this._renderChoices(nextNode.options || [], false); // build & reveal now
          this.choicesEl.style.minHeight = '';
          return;
        }

        this._revealPreparedChoices();
        return;
      }

      this.choicesEl.style.minHeight = '';
      if (node.next === 'start_boss_fight') return this.onEnd({ startBossFight: true });
      if (node.next === 'end' || node.end === true) return this.onEnd();
      if (node.next) return this.goto(node.next);
      return;
      }

      if (node.type === 'choice') {
      this._renderChoices(node.options || [], false);
      }
  }

  _hideChoices() {
      this.choicesEl.classList.remove('is-visible');
      this._applyInlineChoiceHide();
  }

  _renderChoices(options, prepare = false) {
      this.choicesEl.innerHTML = '';
      for (const opt of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice';
      btn.innerHTML = opt.label;
      const unbind = bindRapidActivation(btn, async (event) => {
        event?.stopPropagation?.();
        this.onChoice?.(this.current, opt);
        this._reservedH = this.choicesEl.offsetHeight | 0;
        this.choicesEl.style.minHeight = this._reservedH + 'px';
        this._hideChoices();
        this.choicesEl.innerHTML = '';

        this.deferNextChoices = true;

        if (opt.to === 'end') {
          return this.onEnd({ noReward: false });
        }
        if (opt.to === 'end_nr') {
          return this.onEnd({ noReward: true });
        }
        if (opt.to === 'end_explosion') {
          return this.onEnd({ noReward: true, exploded: true });
        }
        if (opt.to === 'start_boss_fight') {
          return this.onEnd({ noReward: true, startBossFight: true });
        }

        await this.goto(opt.to);
      }, { once: true });
      this.choicesEl.appendChild(btn);
      }

      if (prepare) {
      this.choicesEl.classList.remove('is-visible');
      this._applyInlineChoiceHide();
      return;
      }
      this._clearInlineChoiceHide();
      requestAnimationFrame(() => this.choicesEl.classList.add('is-visible'));
  }

  _revealPreparedChoices() {
      this._clearInlineChoiceHide();
      requestAnimationFrame(() => this.choicesEl.classList.add('is-visible'));
  }

  _applyInlineChoiceHide() {
      this.choicesEl.style.opacity = '0';
      this.choicesEl.style.transform = 'translateY(6px)';
      this.choicesEl.style.pointerEvents = 'none';
  }

  _clearInlineChoiceHide() {
      this.choicesEl.style.opacity = '';
      this.choicesEl.style.transform = '';
      this.choicesEl.style.pointerEvents = '';
  }
}

export function typeText(el, full, msPerChar = 22, skipTargets = [], pauseMultiplier = 20) {
  return new Promise((resolve) => {
    // Basic HTML parser for typewriter
    const segments = [];
    let currentText = '';
    let inTag = false;
    
    for (let i = 0; i < full.length; i++) {
        const char = full[i];
        if (char === '<') {
            if (currentText) {
                segments.push({ type: 'text', content: currentText });
                currentText = '';
            }
            inTag = true;
            currentText += char;
        } else if (char === '>' && inTag) {
            currentText += char;
            segments.push({ type: 'tag', content: currentText });
            currentText = '';
            inTag = false;
        } else {
            currentText += char;
        }
    }
    if (currentText) {
        segments.push({ type: inTag ? 'tag' : 'text', content: currentText });
    }

    let segIndex = 0;
    let charIndex = 0;
    let skipping = false;
    let armed = false;
    let buffer = '';
    let tickTimer = null;
    let sfxTimer = null;

    __isTypingActive = true;
    __typeTextId++;
    const myId = __typeTextId;
    startTypingSfx();

    const skip = (e) => { 
        if (!armed) return; 
        if (e) e.preventDefault(); 
        skipping = true;
        if (tickTimer) clearTimeout(tickTimer);
        if (sfxTimer) clearTimeout(sfxTimer);
        tick();
    };
    const onKey = (e) => { if (!armed) return; if (e.key === 'Enter' || e.key === ' ') skip(); };

    const targets = skipTargets.length ? skipTargets : [el];

    requestAnimationFrame(() => {
      armed = true;
      targets.forEach(t => t.addEventListener('click', skip, { once: true }));
      document.addEventListener('keydown', onKey, { once: true });
      });

      el.classList.add('is-typing');
      el.innerHTML = '';

      const cleanup = () => {
      targets.forEach(t => t.removeEventListener('click', skip));
      document.removeEventListener('keydown', onKey);
      el.classList.remove('is-typing');
      stopTypingSfx();
      __isTypingActive = false;
      };

      const tick = () => {
      if (skipping || !__isTypingActive || __typeTextId !== myId) {
          if (skipping) el.innerHTML = full;
          cleanup();
          resolve();
          return;
      }
      
      if (segIndex >= segments.length) {
          cleanup();
          resolve();
          return;
      }

      const seg = segments[segIndex];
      
      if (seg.type === 'tag') {
          buffer += seg.content;
          el.innerHTML = buffer;
          segIndex++;
          tickTimer = setTimeout(tick, 0);
      } else {
          // Type text char by char
          const charJustTyped = seg.content[charIndex];
          buffer += charJustTyped;
          el.innerHTML = buffer;
          charIndex++;
          
          if (charIndex >= seg.content.length) {
              segIndex++;
              charIndex = 0;
          }

          let delay = msPerChar;
          if (charJustTyped === '.' || charJustTyped === ',' || charJustTyped === ':' || charJustTyped === '?') {
              let sIdx = segIndex;
              let cIdx = charIndex;
              let nextChar = null;
              
              while (sIdx < segments.length) {
                  const s = segments[sIdx];
                  if (s.type === 'text') {
                      if (cIdx < s.content.length) {
                          nextChar = s.content[cIdx];
                          break;
                      }
                  }
                  sIdx++;
                  cIdx = 0;
              }
              
              if (nextChar !== null && nextChar !== '.' && nextChar !== ',' && nextChar !== ':' && nextChar !== '?' && nextChar !== '"') {
                  delay = msPerChar * pauseMultiplier;
                  stopTypingSfx();
                  sfxTimer = setTimeout(() => {
                      if (!skipping && __isTypingActive && __typeTextId === myId) {
                          startTypingSfx();
                      }
                  }, delay - 5); // Resume SFX slightly before the next tick
              }
          }

          tickTimer = setTimeout(tick, delay);
      }
      };
      tick();
  });
}

export function primeTypingSfx() {
    import('../util/audioManager.js').then(({ loadAudio }) => {
        loadAudio(TYPING_SFX_SRC);
    });
}

export function startTypingSfx() {
    if (activeTypingAudio) return;
    
    const vol = IS_MOBILE ? 0.15 : 0.3;
    activeTypingAudio = playAudio(TYPING_SFX_SRC, { 
        volume: vol,
        loop: true,
        type: 'ui' 
    });
}

export function stopTypingSfx() {
    if (activeTypingAudio) {
        if (activeTypingAudio.stop) activeTypingAudio.stop();
        activeTypingAudio = null;
    }
}

const SCROLL_TIMELINE_STYLES_ID = 'ccc-scroll-timeline-styles';

export function injectScrollTimelineStyles() {
  if (document.getElementById(SCROLL_TIMELINE_STYLES_ID)) return;
  const style = document.createElement('style');
  style.id = SCROLL_TIMELINE_STYLES_ID;
  style.textContent = `
      @keyframes scroll-thumb-move {
      0% { transform: translate(0, 0); }
      100% { transform: translate(var(--thumb-x, 0), var(--thumb-y, 0)); }
      }
  `;
  document.head.appendChild(style);
}

export function ensureMerchantScrollbar(scrollerSelector = '.merchant-content', extraClass = '') {
  const scroller = merchantOverlayEl?.querySelector(scrollerSelector);
  if (!scroller || scroller.__customScroll) return;
  if (!merchantSheetEl) return;

  const bar = document.createElement('div');
  bar.className = 'merchant-scrollbar' + (extraClass ? ' ' + extraClass : '');
  const thumb = document.createElement('div');
  thumb.className = 'merchant-scrollbar__thumb';
  bar.appendChild(thumb);
  merchantSheetEl.appendChild(bar);

  const FADE_SCROLL_MS = 150;
  const FADE_DRAG_MS = 120;
  const supportsScrollEnd = 'onscrollend' in window;
  let fadeTimer = null;

  // --- Scroll-Driven Animation Support Check ---
  const supportsTimelineScope = CSS.supports('timeline-scope', 'none');
  const useCssTimeline = supportsTimelineScope && CSS.supports('animation-timeline', 'scroll()');

  if (useCssTimeline) {
      injectScrollTimelineStyles();
      const uniqueId = Math.random().toString(36).slice(2, 8);
      const timelineName = `--merchant-scroll-${uniqueId}`;
    
      merchantSheetEl.style.timelineScope = timelineName;
      scroller.style.scrollTimelineName = timelineName;
      scroller.style.scrollTimelineAxis = 'block'; // Merchant only has vertical
    
      thumb.style.animationName = 'scroll-thumb-move';
      thumb.style.animationTimeline = timelineName;
      thumb.style.animationDuration = '1ms';
      thumb.style.animationTimingFunction = 'linear';
      thumb.style.animationFillMode = 'both';
  }

const updateBounds = () => {
      const grabber = merchantOverlayEl.querySelector('.merchant-grabber');
      const header  = merchantOverlayEl.querySelector('.merchant-header');
      const actions = merchantOverlayEl.querySelector('.merchant-actions');

      const top = ((grabber?.offsetHeight || 0) + (header?.offsetHeight || 0)) | 0;
      const bottom = (actions?.offsetHeight || 0) | 0;

      bar.style.top = top + 'px';
      bar.style.bottom = bottom + 'px';
  };

  // --- Cached Metrics to Avoid Layout Thrashing ---
  let cachedMetrics = {
      scrollHeight: 0,
      clientHeight: 0,
      barH: 0,
      thumbH: 0,
      maxScroll: 1,
      range: 0
  };

  const updateMetrics = () => {
      const { scrollHeight, clientHeight } = scroller;
      const barH = bar.clientHeight || scroller.clientHeight || 1;

      const visibleRatio = clientHeight / Math.max(1, scrollHeight);
      const thumbH = Math.max(28, Math.round(barH * visibleRatio));

      const maxScroll = Math.max(1, scrollHeight - clientHeight);
      const range = Math.max(0, barH - thumbH);

      cachedMetrics = { scrollHeight, clientHeight, barH, thumbH, maxScroll, range };

      thumb.style.height = thumbH + 'px';

      if (useCssTimeline) {
          thumb.style.setProperty('--thumb-y', `${range}px`);
          thumb.style.setProperty('--thumb-x', '0px');
      }

      bar.style.display = (scrollHeight <= clientHeight + 1) ? 'none' : '';
      
      // Force immediate visual update
      performScrollUpdate();
  };

  let lastShadow = null;

  const performScrollUpdate = () => {
      const scrollTop = scroller.scrollTop;

      // 1. Shadow
      const hasShadow = (scrollTop || 0) > 0;
      if (lastShadow !== hasShadow) {
          lastShadow = hasShadow;
          merchantSheetEl?.classList.toggle('has-scroll-shadow', hasShadow);
      }

      // 2. Thumb Position (if not using CSS Timeline)
      if (!useCssTimeline) {
          const { maxScroll, range } = cachedMetrics;
          const rawY = (scrollTop / maxScroll) * range;
          const y = IS_MOBILE ? rawY : Math.round(rawY);
          thumb.style.transform = `translateY(${y}px)`;
      }

      if (IS_MOBILE) showBar();
  };

  const updateAll = () => {
      updateBounds();
      updateMetrics();
  };

  const showBar = () => {
      if (!IS_MOBILE) return;
      merchantSheetEl.classList.add('is-scrolling');
      if (fadeTimer) clearTimeout(fadeTimer);
  };

  const scheduleHide = (delay) => {
      if (!IS_MOBILE) return;
      if (fadeTimer) clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => {
          merchantSheetEl.classList.remove('is-scrolling');
      }, delay);
  };

  const onScroll = () => {
      performScrollUpdate();
      scheduleHide(FADE_SCROLL_MS);
  };

  const onScrollEnd = () => scheduleHide(FADE_SCROLL_MS);

  // Always listen to scroll for shadows and visibility
  scroller.addEventListener('scroll', onScroll, { passive: true });
  if (supportsScrollEnd) {
      scroller.addEventListener('scrollend', onScrollEnd, { passive: true });
  }

  const ro = new ResizeObserver(updateAll);
  ro.observe(scroller);

  let debounceTimer;
  const debouncedUpdateAll = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(updateAll, 100);
  };

  if (typeof MutationObserver !== 'undefined') {
      const obs = new MutationObserver(debouncedUpdateAll);
      obs.observe(scroller, { childList: true, subtree: true, characterData: true });
  }

  window.addEventListener('resize', updateAll);
  requestAnimationFrame(updateAll); // Initial kick

  // ----- Drag thumb to scroll -----
  let dragging = false;
  let dragStartY = 0;
  let startScrollTop = 0;

  const startDrag = (e) => {
      dragging = true;
      dragStartY = e.clientY;
      startScrollTop = scroller.scrollTop;
      thumb.classList.add('dragging');
      showBar();
      try { thumb.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
  };

  const onDragMove = (e) => {
      if (!dragging) return;
      const { range, maxScroll } = cachedMetrics;
      if (range <= 0) return;
      const deltaY = e.clientY - dragStartY;
      const scrollDelta = (deltaY / range) * maxScroll;
      scroller.scrollTop = startScrollTop + scrollDelta;
  };

  const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      thumb.classList.remove('dragging');
      scheduleHide(FADE_DRAG_MS);
      try { thumb.releasePointerCapture(e.pointerId); } catch {}
  };

  thumb.addEventListener('pointerdown', startDrag);
  window.addEventListener('pointermove', onDragMove, { passive: true });
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  // Click track to jump
  bar.addEventListener('pointerdown', (e) => {
      if (e.target === thumb) return;
      const rect = bar.getBoundingClientRect();
      const clickY = e.clientY - rect.top;

      const { thumbH, range, maxScroll } = cachedMetrics;
      const targetY = Math.max(0, Math.min(clickY - thumbH / 2, range));

      scroller.scrollTop = (targetY / Math.max(1, range)) * maxScroll;

      showBar();
      scheduleHide(FADE_SCROLL_MS);
  });

  // mark so we don't double-init
  scroller.__customScroll = { bar, thumb, ro, updateAll };
  updateAll();
}

export function bindRapidActivation(target, handler, { once = false } = {}) {
  if (!target || typeof handler !== 'function') return () => {};
  let used = false;
  let pointerTriggered = false;
  let activePointerId = null;

  const run = (event) => {
    if (once && used) return;
    if (event?.type === 'click' && event.isTrusted && shouldSkipGhostTap(target)) {
      event.preventDefault?.();
      return;
    }
    // markGhostTapTarget removed - global handler manages clicks
    used = once ? true : used;
    Promise.resolve(handler(event)).catch((e) => console.error(e));
    if (once) cleanup();
  };

  const resetPointerTrigger = () => {
    pointerTriggered = false;
    activePointerId = null;
  };

  const onClick = (event) => {
    // Simplified logic: Allow synthetic events (from ghostTapGuard) to pass through.
    // The previous check blocked them because pointerTriggered was true during the synthetic click
    // (which happens inside the pointerdown event dispatch on touch devices).
    if (pointerTriggered) {
      resetPointerTrigger();
    }
    run(event);
  };

const onPointerDown = (event) => {
  if (event.pointerType === 'mouse') return;
  if (typeof event.button === 'number' && event.button !== 0) return;
  pointerTriggered = true;
  activePointerId = typeof event.pointerId === 'number' ? event.pointerId : null;
  suppressNextGhostTap(160);
};

  const onPointerUp = (event) => {
    if (!pointerTriggered) return;
    if (activePointerId != null && typeof event.pointerId === 'number' && event.pointerId !== activePointerId) {
      return;
    }
    resetPointerTrigger();
    // run(event) removed here to prevent double-firing if global handler also triggers click
    // or if standard click follows. Let 'click' event handle execution.
  };

  const onPointerCancel = () => {
    if (!pointerTriggered) return;
    resetPointerTrigger();
  };

const onTouchStart = (event) => {
  pointerTriggered = true;
  suppressNextGhostTap(160);
};

  const onTouchEnd = (event) => {
    if (!pointerTriggered) return;
    resetPointerTrigger();
    // run(event) removed here as well
  };

  const onTouchCancel = () => {
    if (!pointerTriggered) return;
    resetPointerTrigger();
  };

  const cleanup = () => {
    target.removeEventListener('click', onClick);
    if (HAS_POINTER_EVENTS) {
      target.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    } else if (HAS_TOUCH_EVENTS) {
      target.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchCancel);
    }
  };

  target.addEventListener('click', onClick);
  
  return () => { target.removeEventListener('click', onClick); };
}
export function openDialogueLockInfo(lockInfo = {}) {
  setAudioUnderwater(true);
  if (!merchantOverlayEl) return;

  primeTypingSfx();

  const overlay = document.createElement('div');
  overlay.className = 'merchant-firstchat merchant-lockinfo';
  overlay.setAttribute('data-dismissible', '1');
  overlay.innerHTML = `
      <div class="merchant-firstchat__card" role="dialog" aria-label="${lockInfo.ariaLabel || HIDDEN_DIALOGUE_TITLE}">
      <div class="merchant-firstchat__header">
        <div class="name"></div>
        <div class="rule" aria-hidden="true"></div>
      </div>
      <div class="merchant-firstchat__row merchant-lockinfo__row">
        <img class="merchant-firstchat__icon" src="${lockInfo.icon || MYSTERIOUS_ICON_SRC}" alt="">
        <div class="merchant-firstchat__text merchant-lockinfo__message"></div>
      </div>
      <div class="merchant-firstchat__actions merchant-lockinfo__actions">
        <button type="button" class="merchant-firstchat__continue merchant-lockinfo__close">Close</button>
      </div>
      </div>
  `;

  merchantOverlayEl.appendChild(overlay);

  const cardEl = overlay.querySelector('.merchant-firstchat__card');
  const nameEl = overlay.querySelector('.merchant-firstchat__header .name');
  const messageEl = overlay.querySelector('.merchant-lockinfo__message');
  const closeBtn = overlay.querySelector('.merchant-lockinfo__close');

  nameEl.textContent = lockInfo.headerTitle || HIDDEN_DIALOGUE_TITLE;
  messageEl.textContent = lockInfo.message || DEFAULT_LOCK_MESSAGE;

  requestAnimationFrame(() => overlay.classList.add('is-visible'));
  merchantOverlayEl.classList.add('firstchat-active');

  let closed = false;

  const close = () => {
      if (closed) return;
      closed = true;
      overlay.classList.remove('is-visible');
      merchantOverlayEl.classList.remove('firstchat-active');
      stopTypingSfx();
      setTypingActive(false);
      setAudioUnderwater(false);
      document.removeEventListener('keydown', onEsc, true);
      const delay = document.body.classList.contains('no-overlay-transitions') ? 0 : 160;
      setTimeout(() => overlay.remove(), delay);
  };

  const onEsc = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      close();
  };

  document.addEventListener('keydown', onEsc, true);

overlay.addEventListener('pointerdown', (e) => {
  if (!cardEl.contains(e.target)) {
      // Don’t arm global ghost guard for background taps — just shield briefly
      e.preventDefault();
      blockInteraction(160);
      close();
  }
});

const doCloseFromBtn = (e) => {
  if (!e || e.pointerType !== 'mouse') blockInteraction(160);
  close();
};

  bindRapidActivation(closeBtn, () => { doCloseFromBtn(); }, { once: true });

  closeBtn.focus?.();
}


export function openDelveOverlay(overlayEl, sheetEl) {
    if (!overlayEl || !sheetEl) return;
    
    sheetEl.style.transition = 'none';
    sheetEl.style.transform = '';
    overlayEl.removeAttribute('inert');

    void sheetEl.offsetHeight;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            sheetEl.style.transition = '';
            overlayEl.classList.add('is-open');
            blockInteraction(140);
        });
    });
}
