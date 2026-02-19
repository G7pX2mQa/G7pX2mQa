import { getActiveSlot } from '../../util/storage.js';

let channelTabInitialized = false;
let channelPanel = null;

export function isChannelUnlocked() {
  const slot = getActiveSlot();
  if (slot == null) return false;
  
  // Check if manually unlocked via debug/console
  try {
      if (localStorage.getItem(`ccc:unlock:channel:${slot}`) === '1') return true;
  } catch {}

  // Check Surge 20
  // We need to import isSurgeActive, but surgeEffects imports from here potentially (circular dep?)
  // Actually, surgeEffects is usually imported by dlgTab.
  // We can inject the checker or use a global event listener, or import it dynamically if needed.
  // For simplicity, let's assume the caller (dlgTab) will handle the primary unlock logic or pass it.
  // BUT, to keep it self-contained:
  try {
      // Dynamic import to avoid circular dependency if surgeEffects imports dlgTab which imports this.
      // However, surgeEffects is a game system, dlgTab is UI.
      // Let's rely on the caller passing the state or checking it in dlgTab.
      // For now, let's just return false and let dlgTab manage the "unlocked" state based on its own logic (Surge 20).
      // Wait, the plan says "Implement isChannelUnlocked... using isSurgeActive(20)".
      // Let's try importing it. js/game/surgeEffects.js
      // surgeEffects imports: bigNum, storage, xpSystem, upgradeEffects, mutationSystem, resetTab, gameLoop, labNodes, comboSystem, numFormat.
      // It does NOT import dlgTab. So we are safe to import surgeEffects here?
      // No, resetTab imports dlgTab. surgeEffects imports resetTab. So surgeEffects -> resetTab -> dlgTab.
      // If dlgTab imports channelTab, and channelTab imports surgeEffects, we have a cycle:
      // dlgTab -> channelTab -> surgeEffects -> resetTab -> dlgTab.
      // We must avoid importing surgeEffects here.
      
      // Solution: dlgTab will determine if it's unlocked and pass that state, OR we use a global checker.
      // actually, isSurgeActive is also available via window if we expose it, or we can just check the surge level directly from storage/resetTab.
      // resetTab imports dlgTab? Yes.
      // So we can't import resetTab either.
      
      // Let's make isChannelUnlocked rely ONLY on the storage flag for now, and let dlgTab handle the Surge 20 check
      // and SET the storage flag or handle the "OR" logic itself.
      // Actually, the plan says "isChannelUnlocked will check isSurgeActive(20) OR debug flag".
      // To break the cycle, we can inject the `isSurgeActive` function or let dlgTab pass it.
      // Let's implement `setChannelUnlockChecker` or similar.
  } catch {}
  
  return false; 
}

let isSurgeActiveFn = () => false;

export function setChannelUnlockChecker(fn) {
    isSurgeActiveFn = fn;
}

export function getChannelUnlockState() {
    const slot = getActiveSlot();
    if (slot == null) return false;
    
    // 1. Debug/Manual Flag
    try {
        if (localStorage.getItem(`ccc:unlock:channel:${slot}`) === '1') return true;
    } catch {}
    
    // 2. Surge 20
    if (isSurgeActiveFn(20)) return true;
    
    return false;
}

export function initChannelTab(panelEl) {
  if (channelTabInitialized) return;
  channelPanel = panelEl;
  
  // Empty for now
  panelEl.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">Channel Tab (Empty)</div>';
  
  channelTabInitialized = true;
}

export function updateChannelTab() {
  if (!channelTabInitialized || !channelPanel) return;
  // Update logic here
}