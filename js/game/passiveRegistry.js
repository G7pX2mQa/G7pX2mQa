export const passiveRegistry = [];

/**
 * Registers a passive system that generates resources both actively and offline.
 * 
 * @param {Object} systemDef
 * @param {string} systemDef.id - Unique identifier for the system.
 * @param {function} systemDef.getRate - Returns the base rate (ticks per second).
 * @param {function} systemDef.getAmountMultiplier - Returns the amount multiplier for each tick.
 * @param {function} systemDef.onTick - Called during active gameplay: onTick(collectCount)
 * @param {function} systemDef.onOffline - Called during offline progress calculation: onOffline(secondsBn, totalPassives)
 *                                         Must return an object of rewards.
 */
export function registerPassiveSystem(systemDef) {
    // Add default accumulator if not provided
    systemDef.accumulator = 0;
    passiveRegistry.push(systemDef);
}