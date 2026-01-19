// js/util/audioManager.js

let audioContext = null;
let masterGain = null;
const buffers = new Map();
const loadPromises = new Map();

// Helper to get or create context
function getAudioContext() {
  if (audioContext) return audioContext;
  
  // Check browser support
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;

  audioContext = new Ctx();
  masterGain = audioContext.createGain();
  masterGain.connect(audioContext.destination);
  
  // Initial gain setup
  masterGain.gain.value = 1.0; 
  
  return audioContext;
}

export function initAudio() {
    getAudioContext();
}

// "Warm" the context on user interaction
function warm() {
  if (audioContext && audioContext.state === 'suspended') {
    audioContext.resume().catch(() => {});
  }
}

if (typeof window !== 'undefined') {
  ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(evt => {
    window.addEventListener(evt, warm, { capture: true, passive: true });
  });
}

/**
 * Loads and decodes audio from a URL.
 * @param {string} src - The URL of the audio file.
 * @returns {Promise<AudioBuffer|null>}
 */
export async function loadAudio(src) {
  const ctx = getAudioContext();
  if (!ctx) return null; // No Web Audio support

  // Normalize URL
  const url = new URL(src, document.baseURI).href;

  if (buffers.has(url)) return buffers.get(url);
  if (loadPromises.has(url)) return loadPromises.get(url);

  const promise = (async () => {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed to fetch ${url}`);
      const arrayBuffer = await resp.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      buffers.set(url, decoded);
      return decoded;
    } catch (e) {
      console.warn('[audioManager] Load failed', src, e);
      return null;
    } finally {
      loadPromises.delete(url);
    }
  })();

  loadPromises.set(url, promise);
  return promise;
}

/**
 * Plays audio.
 * @param {string} src - The URL of the audio file.
 * @param {object} options
 * @param {number} [options.volume=1.0] - Playback volume (0.0 to 1.0).
 * @param {number} [options.detune=0] - Detune in cents.
 * @param {number} [options.playbackRate=1.0] - Playback rate.
 * @param {boolean} [options.loop=false] - Whether to loop.
 */
export function playAudio(src, { volume = 1.0, detune = 0, playbackRate = 1.0, loop = false } = {}) {
  const ctx = getAudioContext();
  const url = new URL(src, document.baseURI).href;
  
  // Try Web Audio first
  if (ctx) {
    if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(()=>{});
    
    const buffer = buffers.get(url);
    if (buffer) {
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.detune.value = detune;
        source.playbackRate.value = playbackRate;
        source.loop = loop;
        
        const gainNode = ctx.createGain();
        gainNode.gain.value = volume;
        
        source.connect(gainNode);
        gainNode.connect(masterGain);
        source.start(0);
        return {
            stop: () => {
                try { source.stop(); } catch {}
            },
            source
        };
    } else {
        // Trigger load for next time
        loadAudio(src);
    }
  }

  // Fallback: HTML5 Audio (if Web Audio unavailable or buffer not loaded yet)
  // Note: This might still have latency, but it's a fallback.
  try {
      const a = new Audio(url);
      a.volume = volume;
      if (typeof a.playbackRate !== 'undefined') {
          a.playbackRate = playbackRate;
      }
      a.loop = loop;
      a.play().catch(() => {});
      return {
          stop: () => {
              try { a.pause(); a.currentTime = 0; } catch {}
          },
          element: a
      };
  } catch(e) {
      console.warn('[audioManager] Fallback play failed', e);
  }
  return null;
}

// Support for preloading from main.js (compatible signature if needed, or just use loadAudio)
export function registerPreloadedBuffer(src, buffer) {
  const url = new URL(src, document.baseURI).href;
  buffers.set(url, buffer);
}

export function setAudioSuspended(suspended) {
  if (audioContext) {
    if (suspended) {
      if (audioContext.state === 'running') audioContext.suspend().catch(()=>{});
    } else {
      if (audioContext.state === 'suspended') audioContext.resume().catch(()=>{});
    }
  }
}
