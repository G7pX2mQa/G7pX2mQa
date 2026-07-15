// js/util/platformChecker.js

export const IS_MOBILE = (() => {
  if (typeof window === 'undefined') return false;

  if (typeof window.IS_MOBILE !== 'undefined') {
    return !!window.IS_MOBILE;
  }

  const detected = (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
    || ('ontouchstart' in window)
    || (window.navigator && window.navigator.maxTouchPoints > 0);
  window.IS_MOBILE = detected;
  return detected;
})();