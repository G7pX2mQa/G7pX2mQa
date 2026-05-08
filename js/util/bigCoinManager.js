import { isLabDialogueOpen } from '../ui/merchantTabs/dlgTab.js';
import { _isSurge8Pending, _isSurge125Pending } from '../ui/merchantTabs/resetTab.js';

export function shouldBlockBigCoins() {
  if (isLabDialogueOpen && isLabDialogueOpen()) return true;
  if (_isSurge8Pending || _isSurge125Pending) return true;
  return false;
}

export function collectActiveBigCoins() {
    if (window.spawner && window.coinPickupController) {
        const activeCoins = window.spawner.getActiveCoins ? window.spawner.getActiveCoins() : [];
        const toCollect = [];
        for (let i = 0; i < activeCoins.length; i++) {
            const c = activeCoins[i];
            if (c && c.sizeIndex >= 4 && !c.isRemoved) {
                toCollect.push({ coin: c });
            }
        }
        if (toCollect.length > 0 && window.coinPickupController.collectBatch) {
            window.coinPickupController.collectBatch(toCollect);
        }
    }
}