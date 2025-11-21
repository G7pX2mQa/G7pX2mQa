// js/util/debugPanel.js

const DEBUG_PANEL_STYLE_ID = 'debug-panel-style';
const DEBUG_PANEL_ID = 'debug-panel';
const DEBUG_PANEL_TOGGLE_ID = 'debug-panel-toggle';
let debugPanelOpen = false;
let debugPanelAccess = true;

function ensureDebugPanelStyles() {
    let style = document.getElementById(DEBUG_PANEL_STYLE_ID);
    if (style) return;

    style = document.createElement('style');
    style.id = DEBUG_PANEL_STYLE_ID;
    style.textContent = `
        .debug-panel {
            position: fixed;
            top: 50%;
            right: 0;
            transform: translateY(-50%);
            width: 430px;
            max-height: 80vh;
            overflow-y: auto;
            background: rgba(0, 0, 0, 0.9);
            color: #fff;
            font-family: Arial, sans-serif;
            padding: 12px;
            border-radius: 6px 0 0 6px;
            box-shadow: -2px 0 10px rgba(0, 0, 0, 0.6);
            z-index: 2147483646;
        }

        .debug-panel-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
        }

        .debug-panel-title {
            font-size: 1.2em;
            font-weight: bold;
        }

        .debug-panel-close {
            background: transparent;
            border: none;
            color: #fff;
            font-size: 1.2em;
            cursor: pointer;
        }

        .debug-panel-section {
            border: 1px solid #444;
            border-radius: 4px;
            margin-bottom: 10px;
            background: rgba(255, 255, 255, 0.05);
        }

        .debug-panel-section-toggle {
            width: 100%;
            text-align: left;
            background: rgba(255, 255, 255, 0.08);
            border: none;
            color: #fff;
            padding: 8px 10px;
            font-weight: bold;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .debug-panel-section-toggle::before {
            content: '▶';
            font-size: 0.8em;
        }

        .debug-panel-section-toggle.expanded::before {
            content: '▼';
        }

        .debug-panel-section-content {
            padding: 8px 10px;
            border-top: 1px solid #444;
            display: none;
        }

        .debug-panel-section-content.active {
            display: block;
        }

        .debug-panel-empty {
            color: #aaa;
            font-style: italic;
        }

        .debug-panel-toggle-button {
            position: fixed;
            top: 10px;
            left: 10px;
            z-index: 2147483647;
            background: rgba(0, 0, 0, 0.85);
            color: #fff;
            border: 1px solid #666;
            border-radius: 4px;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 0.9em;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
        }

        .debug-panel-toggle-button:hover {
            background: rgba(0, 0, 0, 0.95);
        }
    `;

    document.head.appendChild(style);
}

function removeDebugPanelToggleButton() {
    const existingButton = document.getElementById(DEBUG_PANEL_TOGGLE_ID);
    if (existingButton) existingButton.remove();
}

function createSection(title, contentId, contentBuilder) {
    const section = document.createElement('div');
    section.className = 'debug-panel-section';

    const toggle = document.createElement('button');
    toggle.className = 'debug-panel-section-toggle';
    toggle.type = 'button';
    toggle.textContent = title;
    section.appendChild(toggle);

    const content = document.createElement('div');
    content.className = 'debug-panel-section-content';
    content.id = contentId;
    contentBuilder(content);
    section.appendChild(content);

    toggle.addEventListener('click', () => {
        const expanded = toggle.classList.toggle('expanded');
        content.classList.toggle('active', expanded);
    });

    return section;
}

function buildDebugPanel() {
    if (!debugPanelAccess) return;
    ensureDebugPanelStyles();

    const existingPanel = document.getElementById(DEBUG_PANEL_ID);
    if (existingPanel) existingPanel.remove();

    const panel = document.createElement('div');
    panel.id = DEBUG_PANEL_ID;
    panel.className = 'debug-panel';

    const header = document.createElement('div');
    header.className = 'debug-panel-header';

    const title = document.createElement('div');
    title.className = 'debug-panel-title';
    title.textContent = 'Debug Panel';

    const closeButton = document.createElement('button');
    closeButton.className = 'debug-panel-close';
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Close Debug Panel');
    closeButton.textContent = '×';
    closeButton.addEventListener('click', closeDebugPanel);

    header.appendChild(title);
    header.appendChild(closeButton);
    panel.appendChild(header);

    panel.appendChild(createSection('Areas', 'debug-areas', content => {
        const placeholder = document.createElement('div');
        placeholder.className = 'debug-panel-empty';
        placeholder.textContent = 'Areas will list currencies, stats, and upgrades per area.';
        content.appendChild(placeholder);
    }));

    panel.appendChild(createSection('Unlocks', 'debug-unlocks', content => {
        const placeholder = document.createElement('div');
        placeholder.className = 'debug-panel-empty';
        placeholder.textContent = 'Toggle unlock-type upgrades here.';
        content.appendChild(placeholder);
    }));

    panel.appendChild(createSection('Misc', 'debug-misc', content => {
        const placeholder = document.createElement('div');
        placeholder.className = 'debug-panel-empty';
        placeholder.textContent = 'Utility buttons will appear here.';
        content.appendChild(placeholder);
    }));

    panel.appendChild(createSection('Action Log', 'debug-action-log', content => {
        const placeholder = document.createElement('div');
        placeholder.className = 'debug-panel-empty';
        placeholder.textContent = 'No actions logged yet.';
        content.appendChild(placeholder);
    }));

    document.body.appendChild(panel);
    debugPanelOpen = true;
}

function openDebugPanel() {
    if (!debugPanelAccess) return;
    if (debugPanelOpen) return;
    buildDebugPanel();
}

function closeDebugPanel() {
    const panel = document.getElementById(DEBUG_PANEL_ID);
    if (panel) panel.remove();
    debugPanelOpen = false;
}

function toggleDebugPanel() {
    if (!debugPanelAccess) return;
    if (debugPanelOpen) {
        closeDebugPanel();
    } else {
        openDebugPanel();
    }
}

function teardownDebugPanel() {
    closeDebugPanel();
    removeDebugPanelToggleButton();
}

function createDebugPanelToggleButton() {
    if (!debugPanelAccess) return;
    ensureDebugPanelStyles();

    removeDebugPanelToggleButton();

    const button = document.createElement('button');
    button.id = DEBUG_PANEL_TOGGLE_ID;
    button.className = 'debug-panel-toggle-button';
    button.type = 'button';
    button.textContent = 'Debug Panel';
    button.addEventListener('click', toggleDebugPanel);

    document.body.appendChild(button);
}

function applyDebugPanelAccess(enabled) {
    debugPanelAccess = !!enabled;
    if (debugPanelAccess) {
        createDebugPanelToggleButton();
    } else {
        teardownDebugPanel();
    }
}

document.addEventListener('keydown', event => {
    if (!debugPanelAccess) return;
    if (event.key?.toLowerCase() !== 'c') return;
    const target = event.target;
	console.log("Success");
    toggleDebugPanel();
});

document.addEventListener('DOMContentLoaded', () => {
    if (debugPanelAccess) createDebugPanelToggleButton();
});

export function setDebugPanelAccess(enabled) {
    applyDebugPanelAccess(enabled);
}
