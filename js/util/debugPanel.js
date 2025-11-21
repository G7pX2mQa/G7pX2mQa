// This is NOT part of my project, this is just here for reference.

let testModeEnabled = true;
let devMenuOpen = false;
let devMenuUpdateInterval = null;
let activeInputElement = null;
let pendingStatUpdates = {};
const maxLogEntries = 100;
function getCurrentActionLog() {
    const saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};
    return saveData.actionLog || [];
}

const devMenuCSS = `
.dev-menu {
    position: fixed;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    background: rgba(0,0,0,0.9);
    color: white;
    padding: 15px;
    font-family: Arial, sans-serif;
    width: 430px;
    max-height: 80vh;
    overflow-y: auto;
    z-index: 100000;
    border-radius: 5px 0 0 5px;
    box-shadow: -2px 0 10px rgba(0,0,0,0.7);
}
.dev-menu-title {
    font-size: 1.2em;
    font-weight: bold;
    text-align: center;
    padding: 10px;
    margin: -10px -10px 10px -10px;
    background: rgba(255,255,255,0.1);
    position: sticky;
    top: 0;
    backdrop-filter: blur(5px);
}
.dev-section {
    margin: 12px 0;
    border: 1px solid #444;
    padding: 8px;
    border-radius: 4px;
    background: rgba(0,0,0,0.3);
}
.dev-section-content {
    display: none;
    margin-top: 5px;
}
.dev-section-header {
    cursor: pointer;
    font-weight: bold;
    padding: 6px;
    background: rgba(255,255,255,0.1);
    border-radius: 3px;
    display: flex;
    align-items: center;
}
.dev-section-header::before {
    content: '▶';
    margin-right: 8px;
    font-size: 0.8em;
}
.dev-section-header.expanded::before {
    content: '▼';
}
.stat-item {
    margin: 8px 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.9em;
}
.stat-item span:first-child {
    flex: 1;
    margin-right: 15px;
}
.stat-item input {
    width: 120px;
    background: #333;
    color: white;
    border: 1px solid #555;
    padding: 4px 8px;
    border-radius: 4px;
}
.upgrade-id {
    font-size: 0.8em;
    color: #888;
    margin-left: 8px;
}
.flag-item {
    margin: 8px 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.flag-toggle {
    position: relative;
    display: inline-block;
    width: 50px;
    height: 24px;
}
.flag-toggle input {
    opacity: 0;
    width: 0;
    height: 0;
}
.flag-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #555;
    transition: .2s;
    border-radius: 12px;
}
.flag-slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: .2s;
    border-radius: 50%;
}
.flag-toggle input:checked + .flag-slider {
    background-color: #2196F3;
}
.flag-toggle input:checked + .flag-slider:before {
    transform: translateX(26px);
}
.dev-misc-button {
    display: block;
    width: 100%;
    background: #444;
    color: white;
    border: 1px solid #666;
    border-radius: 4px;
    padding: 8px 12px;
    margin: 8px 0;
    cursor: pointer;
    transition: background 0.2s;
    text-align: center;
    font-size: 0.9em;
}
.dev-misc-button:hover {
    background: #555;
}
.dev-misc-button:active {
    background: #333;
}
.action-log-entry {
    font-size: 0.8em;
    padding: 5px;
    border-bottom: 1px solid #333;
    font-family: monospace;
    word-break: break-word;
}
.action-log-time {
    color: #aaa;
    margin-right: 8px;
}
.action-log-message {
    color: #ddd;
}
.action-log-empty {
    color: #aaa;
    font-style: italic;
    padding: 10px;
    text-align: center;
    font-size: 0.9em;
}
.action-log-number {
    color: #FFD700;
    font-weight: bold;
    text-shadow: 0 0 2px rgba(0,0,0,0.5);
    padding: 0 2px;
    border-radius: 3px;
    background: rgba(255, 215, 0, 0.1);
}
.action-log-number::after {
    content: "";
    color: #FFD700;
}
.dev-menu::-webkit-scrollbar {
    width: 8px;
}
.dev-menu::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 4px;
}
.dev-menu::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.1);
}
.dev-menu::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}
#action-log-entries::-webkit-scrollbar {
    width: 8px;
}
#action-log-entries::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 4px;
}
#action-log-entries::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.1);
}
#action-log-entries::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}
.action-log-level {
    color: #FFD700;
    font-weight: bold;
    text-shadow: 0 0 2px rgba(0,0,0,0.5);
    background: rgba(255, 215, 0, 0.1);
    border-radius: 3px;
    padding: 0 2px;
}
.action-log-level span {
    color: #FFD700;
}
.action-log-gold {
    color: #FFD700;
    font-weight: bold;
    text-shadow: 0 0 2px rgba(0,0,0,0.5);
    background: rgba(255, 215, 0, 0.1);
    border-radius: 3px;
    padding: 0 2px;
}
`;

function createDevMenu() {
    if (!testModeEnabled || devMenuOpen)
        return;

    // Remove existing menu if any
    const existingMenu = document.querySelector('.dev-menu');
    if (existingMenu)
        existingMenu.remove();

    // Create new menu
    const style = document.createElement('style');
    style.id = 'dev-menu-style';
    style.textContent = devMenuCSS;
    document.head.appendChild(style);

    const menu = document.createElement('div');
    menu.className = 'dev-menu';
    menu.innerHTML = `
        <div class="dev-menu-title">Dev Menu</div>
        <div class="dev-section">
            <div class="dev-section-header">Stats</div>
            <div class="dev-section-content" style="display:none" id="stats-section"></div>
        </div>
        <div class="dev-section">
            <div class="dev-section-header">Upgrades</div>
            <div class="dev-section-content" style="display:none" id="upgrades-section"></div>
        </div>
        <div class="dev-section">
            <div class="dev-section-header">Flags</div>
            <div class="dev-section-content" style="display:none" id="flags-section"></div>
        </div>
        <div class="dev-section">
            <div class="dev-section-header">Misc</div>
            <div class="dev-section-content" style="display:none" id="misc-section">
                <button class="dev-misc-button" id="spawn-boost-coin">Spawn Boost Coin</button>
                <button class="dev-misc-button" id="restore-dialogues">Restore Merchant Dialogues</button>
				<button class="dev-misc-button" id="instant-complete-merchant-dialogues">Instantly Complete All Merchant Dialogues</button>
				<button class="dev-misc-button" id="reset-all-stats">Reset All Stats to Nothing</button>
                <button class="dev-misc-button" id="reset-all-upgrades">Reset All Upgrades to Level 0</button>
				<button class="dev-misc-button" id="clear-active-coins">Clear All Active Coins</button>
				<button class="dev-misc-button" id="increment-all-upgrades">+1 Level to All Upgrades</button>
				<button class="dev-misc-button" id="hard-reset-game">Hard Reset All Progress</button>
				<button class="dev-misc-button" id="time-warp-button">OP Time Warp</button>
            </div>
        </div>
		<div class="dev-section">
            <div class="dev-section-header">Action Log</div>
            <div class="dev-section-content" style="display:none" id="action-log-section">
                <div id="action-log-entries" style="max-height: 200px; overflow-y: auto;"></div>
            </div>
        </div>
    `;

    document.body.appendChild(menu);
    devMenuOpen = true;

    document.getElementById('spawn-boost-coin').addEventListener('click', () => {
        logAction("Manually spawned boost coin");
        spawnBoostCoin();
    });
    document.getElementById('restore-dialogues').addEventListener('click', () => {
        logAction("Restored merchant dialogues");
        restoreMerchantDialogues();
    });
    document.getElementById('instant-complete-merchant-dialogues').addEventListener('click', () => {
        instantCompleteMerchantDialogues();
    });
    document.getElementById('reset-all-stats').addEventListener('click', () => {
        resetAllStats();
    });
    document.getElementById('reset-all-upgrades').addEventListener('click', () => {
        resetAllUpgradesToZero();
    });
    document.getElementById('clear-active-coins').addEventListener('click', () => {
        clearAllCoins();
    });
    document.getElementById('increment-all-upgrades').addEventListener('click', () => {
        incrementAllUpgradeLevels();
    });
    document.getElementById('hard-reset-game').addEventListener('click', () => {
        if (confirm("Are you sure you want to perform a hard reset? This will wipe all stats and upgrades!")) {
            resetGame();
            refreshAllDisplays();
        }
    });

    document.getElementById('time-warp-button').addEventListener('click', () => {
        let seconds = prompt("Enter seconds to warp forward:");
        if (!seconds || isNaN(seconds) || seconds <= 0)
            return;

        seconds = Number(seconds); // Ensure it's a number

        const saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};

        // Simulate elapsed time by setting the timestamp in the past
        saveData.timestamp = Date.now() - (seconds * 1000);

        // Calculate progress, destructuring the returned object
        const {
            generated,
            elapsedTime
        } = calculateOfflineProgress(saveData);

        // Update the localStorage with the new save data
        localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));

        // Show offline progress and log action if there are any generated resources.
        // Pass elapsedTime to the popup function.
        if (Object.keys(generated).length > 0) {
            showOfflineProgressPopup(generated, elapsedTime);
            logAction(`Time warp: +${seconds}s | Gained ${Object.entries(generated)
                .map(([k, v]) => `${formatNumber(v)} ${k}`)
                .join(', ')}`);
        }
    });

    // Initialize all sections as collapsed
    document.querySelectorAll('.dev-section-header').forEach(header => {
        header.addEventListener('click', function () {
            const wasExpanded = this.classList.contains('expanded');
            this.classList.toggle('expanded');
            const content = this.nextElementSibling;
            content.style.display = wasExpanded ? 'none' : 'block';
        });
    });

    if (localStorage.getItem('actionLog')) {
        const actionLog = getCurrentActionLog();
        try {
            const storedLogs = JSON.parse(localStorage.getItem('actionLog'));
            if (Array.isArray(storedLogs)) {
                actionLog.push(...storedLogs);
            }
        } catch (e) {
            console.error("Couldn't load action log", e);
        }
        updateActionLogDisplay(); // Update display with either logs or empty message
    }

    // Start real-time updates
    devMenuUpdateInterval = setInterval(updateDevMenu, 16);
    updateDevMenu();
    updateActionLogDisplay();
}

function handleStatChange(stat, value) {
    const oldValue = getCurrentStatValue(stat);
    const numValue = Number(value);
    if (isNaN(numValue))
        return;

    logAction(`Modified ${stat} from ${formatNumber(oldValue)} to ${formatNumber(numValue)}`);

    const saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};
    switch (stat) {
    case 'Coins':
        coinCount = numValue;
        break;
    case 'XP':
        saveData.xp = numValue;
        break;
    case 'Level':
        saveData.level = numValue;
        saveData.xpNeeded = 10 * Math.pow(1.1, numValue);
        break;
    case 'Special Coins':
        saveData.specialCoins = numValue;
        break;
    case 'Molten Coins':
        saveData.moltenCoins = numValue;
        break;
    case 'Platinum Coins':
        saveData.platinumCoins = numValue;
        break;
    case 'Infused Coins':
        saveData.infusedCoins = numValue;
        break;
    case 'Automation Cores':
        saveData.automationCores = numValue;
        break;
    }
    localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));
    refreshAllDisplays();
}

function getCurrentStatValue(stat) {
    const saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};
    switch (stat) {
    case 'Coins':
        return coinCount;
    case 'XP':
        return saveData.xp || 0;
    case 'Level':
        return saveData.level || 0;
    case 'Special Coins':
        return saveData.specialCoins || 0;
    case 'Molten Coins':
        return saveData.moltenCoins || 0;
    case 'Platinum Coins':
        return saveData.platinumCoins || 0;
    case 'Infused Coins':
        return saveData.infusedCoins || 0;
    case 'Automation Cores':
        return saveData.automationCores || 0;
    default:
        return '?';
    }
}

function handleUpgradeChange(id, category, value) {
    // Load the current saveData
    let saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};
    if (!saveData[category])
        saveData[category] = {};

    const oldLevel = saveData[category][id]?.level || 0;
    const newLevel = Number(value);

    const categoryName = Object.entries({
        'Coin Upgrades': 'upgrades',
        'Special Coin Upgrades': 'specialUpgrades',
        'Molten Coin Upgrades': 'forgeUpgrades',
        'Platinum Coin Upgrades': 'platinumUpgrades',
        'Infused Coin Upgrades': 'infusedUpgrades',
        'Automation Upgrades': 'automationUpgrades'
    }).find(([_, cat]) => cat === category)?.[0] || category;

    const upgradeName = {
        upgrades: upgrades[id]?.upgName,
        specialUpgrades: specialUpgrades[id]?.name,
        forgeUpgrades: forgeUpgrades[id]?.name,
        platinumUpgrades: platinumUpgrades[id]?.name,
        infusedUpgrades: infusedUpgrades[id]?.name,
        automationUpgrades: automationUpgrades[id]?.name,
    }
    [category] || `ID ${id}`;

    logAction(`Modified ${upgradeName} (${categoryName} - ID: ${id}) from Level ${formatNumber(oldLevel)} to Level ${formatNumber(newLevel)}`);

    // Reload saveData so we capture the updated actionLog
    saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};
    if (!saveData[category])
        saveData[category] = {};

    // Update the upgrade level
    saveData[category][id] = {
        level: newLevel
    };
    localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));

    applyUpgradeEffects();
    updateMerchantDisplay();
    updateDevMenu();
}

function updateDevMenu() {
    if (!devMenuOpen)
        return;

    // Update stats
    const statsSection = document.getElementById('stats-section');
    const currentStats = {
        'Coins': coinCount,
        'XP': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.xp || 0,
        'Level': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.level || 0,
        'Special Coins': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.specialCoins || 0,
        'Molten Coins': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.moltenCoins || 0,
        'Platinum Coins': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.platinumCoins || 0,
        'Infused Coins': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.infusedCoins || 0,
        'Automation Cores': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.automationCores || 0,
    };

    // Create a map of existing stat items
    const existingStats = {};
    statsSection.querySelectorAll('.stat-item').forEach(item => {
        const name = item.querySelector('span').textContent.replace(':', '').trim();
        existingStats[name] = item;
    });

    // Update or create stat items
    Object.entries(currentStats).forEach(([name, value]) => {
        if (existingStats[name]) {
            const input = existingStats[name].querySelector('input');
            // Only update if not currently being edited
            if (input && input !== activeInputElement && input.value !== String(value)) {
                input.value = value;
            }
        } else {
            const item = document.createElement('div');
            item.className = 'stat-item';
            const input = document.createElement('input');
            input.type = 'number';
            input.value = value;
            input.step = 'any'; // Allow decimals
            // Disable validation tooltip
            input.oninvalid = (e) => e.preventDefault();
            input.addEventListener('input', function () {
                handleStatChange(name, this.value);
            });
            input.addEventListener('focus', function () {
                activeInputElement = this;
            });
            input.addEventListener('blur', function () {
                activeInputElement = null;
                // Apply any queued updates
                Object.entries(pendingStatUpdates).forEach(([stat, value]) => {
                    handleStatChange(stat, value);
                });
                pendingStatUpdates = {};
            });

            item.innerHTML = `<span>${name}:</span>`;
            item.appendChild(input);
            statsSection.appendChild(item);
        }
    });

    // Update upgrades
    const upgradeCategories = {
        'Coin Upgrades': {
            object: upgrades,
            key: 'upgrades'
        },
        'Special Coin Upgrades': {
            object: specialUpgrades,
            key: 'specialUpgrades'
        },
        'Molten Coin Upgrades': {
            object: forgeUpgrades,
            key: 'forgeUpgrades'
        },
        'Platinum Coin Upgrades': {
            object: platinumUpgrades,
            key: 'platinumUpgrades'
        },
        'Infused Coin Upgrades': {
            object: infusedUpgrades,
            key: 'infusedUpgrades'
        },
        'Automation Upgrades': {
            object: automationUpgrades,
            key: 'automationUpgrades'
        }
    };

    Object.entries(upgradeCategories).forEach(([category, data]) => {
        const categoryId = category.replace(/\s+/g, '-');
        let contentDiv = document.getElementById(`${categoryId}-content`);

        if (!contentDiv) {
            const categoryDiv = document.createElement('div');
            categoryDiv.className = 'dev-subsection';
            const header = document.createElement('div');
            header.className = 'dev-section-header';
            header.textContent = category;

            contentDiv = document.createElement('div');
            contentDiv.className = 'dev-section-content';
            contentDiv.id = `${categoryId}-content`;

            header.addEventListener('click', function () {
                this.classList.toggle('expanded');
                contentDiv.style.display =
                    this.classList.contains('expanded') ? 'block' : 'none';
            });

            categoryDiv.appendChild(header);
            categoryDiv.appendChild(contentDiv);
            document.getElementById('upgrades-section').appendChild(categoryDiv);
        }

        // Create a map of existing upgrade items
        const existingUpgrades = {};
        contentDiv.querySelectorAll('.stat-item').forEach(item => {
            const id = item.querySelector('input')?.dataset.upgradeId;
            if (id)
                existingUpgrades[id] = item;
        });

        Object.values(data.object).forEach(upg => {
            const saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};
            const currentLevel = saveData[data.key]?.[upg.id]?.level || 0;

            if (existingUpgrades[upg.id]) {
                const input = existingUpgrades[upg.id].querySelector('input');
                // Only update if not currently being edited
                if (input && input !== activeInputElement && input.value !== String(currentLevel)) {
                    input.value = currentLevel;
                }
            } else {
                const item = document.createElement('div');
                item.className = 'stat-item';
                const input = document.createElement('input');
                input.type = 'number';
                input.value = currentLevel;
                input.min = 0;
                input.max = upg.maxLevel || upg.levelCap || 999;
                input.step = 'any'; // Allow decimals
                // Disable validation tooltip
                input.oninvalid = (e) => e.preventDefault();
                input.dataset.upgradeId = upg.id;
                input.addEventListener('input', function () {
                    handleUpgradeChange(upg.id, data.key, this.value);
                });
                input.addEventListener('focus', function () {
                    activeInputElement = this;
                });
                input.addEventListener('blur', function () {
                    activeInputElement = null;
                });

                item.innerHTML = `
            <span>${upg.upgName || upg.name}
                <span class="upgrade-id">(ID: ${upg.id})</span>
            </span>
        `;
                item.appendChild(input);
                contentDiv.appendChild(item);
            }
        });
    });
    // Update flags
    const flagsSection = document.getElementById('flags-section');
    const currentFlags = {
        'Game Active': gameActive,
        'Disable Background Music': !musicManager.isMusicOn,
        'Disable Coin Pickup Animation': disableAnimation.checked,
        'Disable Coin Pickup Sound': disableSound.checked,
        'Enable Scientific Notation': useScientificNotation,
        'Disable Formatted Numbers': JSON.parse(localStorage.getItem('disableFormattedNumbers') || 'false'),
        'Disable Boost Coin Spawning': !boostCoinsUnlocked,
        'Has Done Forge Reset': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.hasDoneForgeReset || false,
        'Has Platinum Unlocked': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.hasPlatinumUnlocked || false,
        'Has Done Infuse Reset': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.hasDoneInfuseReset || false,
        'Disable Magnet': JSON.parse(localStorage.getItem('disableMagnet') || 'false')
    };

    // Create a map of existing flag items
    const existingFlags = {};
    flagsSection.querySelectorAll('.flag-item').forEach(item => {
        const name = item.querySelector('span').textContent;
        existingFlags[name] = item;
    });

    // Update or create flag items
    Object.entries(currentFlags).forEach(([name, value]) => {
        if (existingFlags[name]) {
            const input = existingFlags[name].querySelector('input');
            if (input && input.checked !== value) {
                input.checked = value;
            }
        } else {
            const item = document.createElement('div');
            item.className = 'flag-item';

            const label = document.createElement('label');
            label.className = 'flag-toggle';

            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = value;
            input.addEventListener('change', function () {
                handleFlagChange(name, this.checked);
            });

            const slider = document.createElement('span');
            slider.className = 'flag-slider';

            label.appendChild(input);
            label.appendChild(slider);

            item.innerHTML = `<span>${name}</span>`;
            item.appendChild(label);
            flagsSection.appendChild(item);
        }
    });
}

function handleFlagChange(name, value) {
    const currentFlags = {
        'Game Active': gameActive,
        'Disable Background Music': !musicManager.isMusicOn,
        'Disable Coin Pickup Animation': disableAnimation.checked,
        'Disable Coin Pickup Sound': disableSound.checked,
        'Enable Scientific Notation': useScientificNotation,
        'Disable Formatted Numbers': JSON.parse(localStorage.getItem('disableFormattedNumbers') || 'false'),
        'Disable Boost Coin Spawning': !boostCoinsUnlocked,
        'Has Done Forge Reset': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.hasDoneForgeReset || false,
        'Has Platinum Unlocked': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.hasPlatinumUnlocked || false,
        'Has Done Infuse Reset': JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`))?.hasDoneInfuseReset || false,
        'Disable Magnet': JSON.parse(localStorage.getItem('disableMagnet') || 'false')
    };

    const oldValue = currentFlags[name];
    logAction(`Toggled flag "${name}" from ${oldValue} to ${value}`);

    const saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};

    switch (name) {
    case 'Game Active':
        gameActive = value;
        if (!value)
            pauseGame();
        else
            startGame();
        break;

    case 'Disable Background Music':
        document.getElementById('music-toggle').checked = value;
        musicManager.toggleMusic();
        break;

    case 'Disable Coin Pickup Animation':
        disableAnimation.checked = value;
        localStorage.setItem('disableAnimation', value);
        break;

    case 'Disable Coin Pickup Sound':
        disableSound.checked = value;
        localStorage.setItem('disableSound', value);
        break;

    case 'Enable Scientific Notation':
        useScientificNotation = value;
        localStorage.setItem('useScientificNotation', value);
        document.getElementById('notation-toggle').checked = value;
        refreshAllDisplays();
        break;

    case 'Disable Formatted Numbers':
        localStorage.setItem('disableFormattedNumbers', value);
        refreshAllDisplays();
        break;

    case 'Disable Boost Coin Spawning':
        boostCoinsUnlocked = !value;
        if (value)
            clearInterval(boostSpawnInterval);
        else
            boostSpawnInterval = setInterval(spawnBoostCoin, 60000);
        break;

    case 'Has Done Forge Reset':
        saveData.hasDoneForgeReset = value;
        localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));
        break;

    case 'Has Platinum Unlocked':
        saveData.hasPlatinumUnlocked = value;
        localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));
        const platinumSection = document.querySelector('.platinum-section');
        if (platinumSection) {
            platinumSection.remove();
        }
        break;

    case 'Has Done Infuse Reset':
        saveData.hasDoneInfuseReset = value;
        localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));
        break;

    case 'Disable Magnet':
        saveData.forgeUpgrades = saveData.forgeUpgrades || {};

        if (value) {
            if (!localStorage.getItem('prevMagnetLevel')) {
                localStorage.setItem('prevMagnetLevel', saveData.forgeUpgrades[2]?.level || 0);
            }
            saveData.forgeUpgrades[2] = {
                level: 0
            };
        } else {
            const prevLevel = parseInt(localStorage.getItem('prevMagnetLevel')) || 0;
            saveData.forgeUpgrades[2] = {
                level: prevLevel
            };
            localStorage.removeItem('prevMagnetLevel');
        }

        localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));
        localStorage.setItem('disableMagnet', value);
        updateMagnetIndicator();
        updateMerchantDisplay();
        break;
    }

    refreshAllDisplays();
}

// Close menu and cleanup
function closeDevMenu() {
    const actionLog = getCurrentActionLog()
        const menu = document.querySelector('.dev-menu');
    if (menu)
        menu.remove();
    const style = document.getElementById('dev-menu-style');
    if (style)
        style.remove();
    devMenuOpen = false;
    if (devMenuUpdateInterval) {
        clearInterval(devMenuUpdateInterval);
        devMenuUpdateInterval = null;
    }
    localStorage.setItem('actionLog', JSON.stringify(actionLog.slice(0, maxLogEntries)));
}

function updateActionLog(newEntry) {
    const saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};
    const actionLog = saveData.actionLog || [];

    actionLog.unshift(newEntry);

    // Trim to max length
    if (actionLog.length > maxLogEntries) {
        actionLog.length = maxLogEntries;
    }

    saveData.actionLog = actionLog;
    localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));

    return actionLog;
}

function logAction(message) {
    const now = new Date();
    const timeString = now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });

    updateActionLog({
        time: timeString,
        message: message,
        timestamp: now.getTime()
    });

    if (devMenuOpen)
        updateActionLogDisplay();
}

function updateActionLogDisplay() {
    const logContainer = document.getElementById('action-log-entries');
    if (!logContainer)
        return;

    const actionLog = getCurrentActionLog();

    if (actionLog.length === 0) {
        logContainer.innerHTML = `
			<div class="action-log-empty">
                Actions you perform in the Dev Menu will be logged permanently in this action log.
            </div>
		`;
    } else {
        logContainer.innerHTML = actionLog.map(entry => {
            let formattedMessage = entry.message.replace(
                    /\[GOLD\](.*?)\[\/GOLD\]/g,
                    '<span class="action-log-gold">$1</span>');

            formattedMessage = formattedMessage.replace(
                    /\b(Level \d+)\b/g,
                    '<span class="action-log-level">$1</span>');

            formattedMessage = formattedMessage.replace(
                    /(\d[\d,.]*(?:e[+-]?\d+)*(?:[KMBTQa-zA-Z]*))/g,
                    (match) => /\d/.test(match) ? `<span class="action-log-number">${match}</span>` : match);

            return `
                <div class="action-log-entry">
                    <span class="action-log-time">${entry.time}:</span>
                    <span class="action-log-message">${formattedMessage}</span>
                </div>
            `;
        }).join('');
    }
}

function cleanUpLogs() {
    const actionLog = getCurrentActionLog();
    if (actionLog.length > maxLogEntries) {
        actionLog = actionLog.slice(0, maxLogEntries);
        localStorage.setItem('actionLog', JSON.stringify(actionLog));
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'c' && testModeEnabled) {
        e.preventDefault();
        if (devMenuOpen) {
            closeDevMenu();
        } else {
            createDevMenu();
        }
    }
});

function instantCompleteMerchantDialogues() {
    const saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};

    let completeCount = 0;

    // Iterate through the merchant dialogues and mark them as completed
    merchantDialogues.introduction.options.forEach(option => {
        if (!option.completed) {
            // Mark the dialogue as completed
            option.completed = true;

            // Give the reward for this dialogue
            if (option.reward) {
                if (option.reward.type === 'platinum') {
                    saveData.platinumCoins = (saveData.platinumCoins || 0) + option.reward.amount;
                } else if (option.reward.type === 'molten') {
                    saveData.moltenCoins = (saveData.moltenCoins || 0) + option.reward.amount;
                } else {
                    // Regular coins
                    coinCount += option.reward.amount || option.reward;
                }
            }

            completeCount++;
        }
    });

    // Save the updated save data
    saveData.dialogues = merchantDialogues.introduction.options.map(option => ({
                id: option.id,
                completed: option.completed
            }));
    localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));

    // Log the action in the action log
    logAction(`Instantly completed all merchant dialogues. Total dialogues completed: ${completeCount}`);

    updateDevMenu();
    refreshAllDisplays();
    showDialogue();
}

function resetAllStats() {
    // Load save data
    let saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};
    let resetCount = 0;

    // Reset the global coin count
    if (coinCount !== 0) {
        coinCount = 0;
        resetCount++;
    }

    // Define the correct keys and their default values
    const statProperties = [{
            key: 'moltenCoins',
        default:
            0
        }, {
            key: 'platinumCoins',
        default:
            0
        }, {
            key: 'specialCoins',
        default:
            0
        }, {
            key: 'level',
        default:
            0
        }, {
            key: 'xp',
        default:
            0
        }, {
            key: 'xpNeeded',
        default:
            10
        }
    ];

    // Reset each stat in the save data
    statProperties.forEach(stat => {
        // Only reset if the property exists and is different from its default value
        if (typeof saveData[stat.key] !== 'undefined' && saveData[stat.key] !== stat.default) {
            saveData[stat.key] = stat.default;
            resetCount++;
        }
    });

    // Save the updated data
    localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));

    // Log the action with the total reset count
    logAction(`Reset all stats to nothing. Total stats reset: ${resetCount}`);

    // Update the UI immediately
    updateDevMenu();
    refreshAllDisplays();
}

function resetAllUpgradesToZero() {
    let saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};
    const upgradeCategories = [
        'upgrades',
        'specialUpgrades',
        'forgeUpgrades',
        'platinumUpgrades',
        'infusedUpgrades',
        'automationUpgrades',
    ];

    let resetCount = 0;

    upgradeCategories.forEach(category => {
        if (saveData[category]) {
            Object.keys(saveData[category]).forEach(id => {
                const currentLevel = saveData[category][id].level;
                if (currentLevel !== 0) {
                    saveData[category][id].level = 0;
                    resetCount++;
                }
            });
        }
    });

    localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));

    logAction(`Reset all upgrades to Level 0. Total upgrades reset: ${resetCount}`);

    applyUpgradeEffects();
    updateDevMenu();
    updateMerchantDisplay();
}

function clearAllCoins() {
    // Remove all coin elements
    const coins = document.querySelectorAll('.coin, .special-coin, .boost-coin, .platinum-coin');
    coins.forEach(coin => coin.remove());

    // Clear pending spawns
    activeSpawns.forEach(timeoutId => clearTimeout(timeoutId));
    activeSpawns = [];
}

function incrementAllUpgradeLevels() {
    // Load current save data
    let saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};
    let incrementCount = 0;

    // Define the upgrade categories and their corresponding keys
    const upgradeCategories = [{
            key: 'upgrades',
            upgrades: upgrades
        }, {
            key: 'specialUpgrades',
            upgrades: specialUpgrades
        }, {
            key: 'forgeUpgrades',
            upgrades: forgeUpgrades
        }, {
            key: 'platinumUpgrades',
            upgrades: platinumUpgrades
        }, {
            key: 'infusedUpgrades',
            upgrades: infusedUpgrades
        }, {
            key: 'automationUpgrades',
            upgrades: automationUpgrades
        }

    ];

    // Ensure the upgrade categories exist in saveData
    upgradeCategories.forEach(category => {
        if (!saveData[category.key]) {
            saveData[category.key] = {};
        }
    });

    // Iterate over each category of upgrades and increment their levels
    upgradeCategories.forEach(category => {
        Object.entries(category.upgrades).forEach(([id, upgrade]) => {
            // Check if the upgrade exists in the save data
            const currentLevel = saveData[category.key][id]?.level || 0;

            // If it doesn't exist in the save data, initialize it with level 0
            if (saveData[category.key][id] === undefined) {
                saveData[category.key][id] = {
                    level: 0
                };
            }

            // Increment the level by 1
            saveData[category.key][id].level = currentLevel + 1;
            incrementCount++;
        });
    });

    // Save the updated data
    localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));

    // Log the action
    logAction(`Incremented all upgrade levels by 1. Total upgrades incremented: ${incrementCount}`);

    // Update the UI to reflect the changes
    updateDevMenu();
    applyUpgradeEffects();
    refreshAllDisplays();
}

function resetGame() {
    // Load current save data
    let saveData = JSON.parse(localStorage.getItem(`saveSlot${currentSlotId}`)) || {};

    const upgradeCategories = [
        'upgrades', 'specialUpgrades', 'forgeUpgrades', 'platinumUpgrades', 'infusedUpgrades', 'automationUpgrades'
    ];

    if (coinCount !== 0) {
        coinCount = 0;
    }

    upgradeCategories.forEach(category => {
        saveData[category] = {};
    });

    const statsToReset = [
        'coins', 'moltenCoins', 'platinumCoins', 'specialCoins', 'level', 'xp', 'xpNeeded', 'infusedCoins', 'automationCores'
    ];

    statsToReset.forEach(stat => {
        if (stat === 'xpNeeded') {
            saveData[stat] = 10;
        } else {
            saveData[stat] = 0;
        }
    });

    // Set key flags to false
    const flagsToReset = [
        'hasReached10Coins', 'hasDoneForgeReset', 'hasPlatinumUnlocked', 'hasDoneInfuseReset'
    ];

    flagsToReset.forEach(flag => {
        saveData[flag] = false;
    });

    localStorage.setItem(`saveSlot${currentSlotId}`, JSON.stringify(saveData));

    updateDevMenu();
    updateActionLogDisplay();

    restoreMerchantDialogues();

    logAction('Performed a hard reset. All stats and upgrades have been wiped.');
    clearAllCoins();
    applyUpgradeEffects();

}
