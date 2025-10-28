// js/util/audioCache.js

const cache = new Map();

const normalize = (src) => {
  try {
    return new URL(src, document.baseURI).href;
  } catch (_) {
    return src;
  }
};

export function registerPreloadedAudio(src, element) {
  const key = normalize(src);
  if (!key || !element) return;
  element.pause?.();
  try { element.currentTime = 0; } catch (_) {}
  cache.set(key, element);
}

export function takePreloadedAudio(src) {
  const key = normalize(src);
  if (!cache.has(key)) return null;
  const el = cache.get(key);
  cache.delete(key);
  return el;
}