// js/ui/sas/levelsOverlay.js

import { IS_MOBILE } from '../../main.js';
import { createSASOverlay } from './sasOverlayBuilder.js';
import { formatNumber } from '../../util/numFormat.js';
import { RESOURCE_REGISTRY } from '../../game/offlinePanel.js';
import { bank } from "../../util/storage.js";
import { settingsManager } from "../../game/settingsManager.js";
import { createDropdown } from "./dropdownUtils.js";
import { createPaintbrush } from "./paintbrushUtils.js";

const levelStateCache = {};

window.addEventListener("level:change", (e) => {
    if (e.detail && e.detail.prefix) {
        levelStateCache[e.detail.prefix] = e.detail;
    }
});

function getStatIsUnlocked(prefix) {
    if (levelStateCache[prefix]) {
        return levelStateCache[prefix].isUnlocked;
    }
    return true;
}

function getUnlockedLevels() {
    const levelConfigs = RESOURCE_REGISTRY.filter(c => c.type === 'levelStat');
    const progConfigs = RESOURCE_REGISTRY.filter(c => c.type === 'levelProg');
    const unlocked = [];
    levelConfigs.forEach(levelConfig => {
        const prefix = levelConfig.key.replace('_levels', '');
        const progConfig = progConfigs.find(c => c.key === prefix);
        if (progConfig && getStatIsUnlocked(prefix)) {
            unlocked.push({ levelConfig, progConfig, prefix });
        }
    });
    return unlocked;
}

function getToggleKey(prefix, type) {
  return `level_${prefix}_${type}`;
}

function ensureLevelSettings() {
  const levels = getUnlockedLevels();
  levels.forEach(l => {
    if (settingsManager.get(getToggleKey(l.prefix, 'popups')) === undefined) {
      settingsManager.set(getToggleKey(l.prefix, 'popups'), true);
    }
    if (settingsManager.get(getToggleKey(l.prefix, 'pinned')) === undefined) {
      settingsManager.set(getToggleKey(l.prefix, 'pinned'), false);
    }
  });
}

function createLevelRow(container, isUniversal, levelConfig, progConfig, prefix) {
  const row = document.createElement('div');
  row.className = 'currency-row level-row' + (isUniversal ? ' universal-row' : '');
  if (prefix && prefix !== 'universal') {
    row.dataset.level = prefix;
    if (progConfig && progConfig.bgGradient) {
      row.style.setProperty('background', progConfig.bgGradient, 'important');
    }
  }
  
  const info = document.createElement('div');
  info.className = 'currency-info';
  
  const iconWrapper = document.createElement('div');
  iconWrapper.className = 'currency-icon-wrapper';
  
  const iconImg = document.createElement('img');
  iconImg.className = 'currency-base';
  
  let iconSrc = isUniversal ? 'img/misc/mysterious.webp' : (levelConfig.icon || 'img/misc/mysterious.webp');
  if (!isUniversal && iconSrc && iconSrc.endsWith('.webp')) {
      const parts = iconSrc.split('/');
      const filename = parts.pop();
      const baseName = filename.replace('.webp', '');
      iconSrc = parts.join('/') + '/' + baseName + '_plus_base.webp';
  } else if (isUniversal) {
      iconSrc = 'img/misc/locked_base.webp';
  }
  iconImg.src = iconSrc;
  
  iconWrapper.appendChild(iconImg);
  info.appendChild(iconWrapper);
  
  const amountDiv = document.createElement('div');
  amountDiv.className = 'currency-amount';
  
  if (isUniversal) {
      amountDiv.textContent = "Universal Toggle";
      info.appendChild(amountDiv);
  } else {
      amountDiv.classList.add('level-row-amount');
      
      const bar = document.createElement('div');
      bar.className = 'level-row-bar'; // We reuse mp-bar styles as a base generic level bar
      
      if (progConfig) {
          if (progConfig.pinBgGradient) bar.style.background = progConfig.pinBgGradient;
          if (progConfig.borderColor) bar.style.setProperty('--bar-border-color', progConfig.borderColor);
          if (progConfig.barBoxShadow) bar.style.setProperty('--bar-box-shadow', progConfig.barBoxShadow);
      }

      const fill = document.createElement('div');
      fill.className = 'level-row-bar__fill';
      fill.dataset.fill = 'true';
      if (progConfig) {
          if (progConfig.fillGradient) fill.style.background = progConfig.fillGradient;
          if (progConfig.glassBg) fill.style.setProperty('--glass-bg', progConfig.glassBg);
          if (progConfig.glassOpacity) fill.style.setProperty('--glass-opacity', progConfig.glassOpacity);
      }

      const frame = document.createElement('div');
      frame.className = 'level-row-bar__frame';

      const levelDiv = document.createElement('div');
      levelDiv.className = 'level-row-bar__level';
      levelDiv.innerHTML = `${levelConfig.singular}<span class="level-row-level-value" data-level-val>0</span>`;

      const divider = document.createElement('div');
      divider.className = 'level-row-bar__divider';
      divider.setAttribute('aria-hidden', 'true');

      const progressDiv = document.createElement('div');
      progressDiv.className = 'level-row-bar__progress';
      progressDiv.innerHTML = `<span data-prog-val>0</span><span class="level-row-progress-separator">/</span><span data-req-val>10</span><span class="level-row-progress-suffix">${progConfig ? progConfig.singular : ''}</span>`;

      frame.appendChild(levelDiv);
      frame.appendChild(divider);
      frame.appendChild(progressDiv);

      bar.appendChild(fill);
      bar.appendChild(frame);
      amountDiv.appendChild(bar);
      info.appendChild(amountDiv);
  }
  
  row.appendChild(info);

  // Dropdown controls
  const controls = document.createElement('div');
  controls.className = 'currency-controls';

  const opts = [
    { value: 'popups', label: 'Popups' },
    { value: 'pinned', label: 'Pinned' },
  ];

  if (isUniversal && !IS_MOBILE) {
    opts.push({ value: 'paintbrush', label: 'Enable Multi-Toggle', isButton: true, className: 'paintbrush-btn-anim' });
  }

  const getDropdownValue = () => {
    if (!isUniversal) {
      const selected = [];
      if (settingsManager.get(getToggleKey(prefix, 'popups'))) selected.push('popups');
      if (settingsManager.get(getToggleKey(prefix, 'pinned'))) selected.push('pinned');
      return selected;
    } else {
      const allLevels = getUnlockedLevels().map(l => l.prefix);
      let hasVariance = false;
      
      ['popups', 'pinned'].forEach(type => {
         const firstVal = settingsManager.get(getToggleKey(allLevels[0], type));
         for (let i = 1; i < allLevels.length; i++) {
           if (settingsManager.get(getToggleKey(allLevels[i], type)) !== firstVal) {
             hasVariance = true;
             break;
           }
         }
      });

      if (hasVariance) {
        return [];
      }

      const selected = [];
      ['popups', 'pinned'].forEach(type => {
         if (allLevels.every(c => settingsManager.get(getToggleKey(c, type)))) {
           selected.push(type);
         }
      });
      return selected;
    }
  };

  const setDropdownValue = (newVals) => {
    if (newVals.includes('paintbrush')) {
      openPaintbrushMode();
      return;
    }

    const prevVals = getDropdownValue();
    const toggledType = ['popups', 'pinned'].find(type => 
      prevVals.includes(type) !== newVals.includes(type)
    );

    if (!toggledType) return;

    if (!isUniversal) {
      const newVal = newVals.includes(toggledType);
      settingsManager.set(getToggleKey(prefix, toggledType), newVal);
      if (toggledType === 'pinned') {
        window.dispatchEvent(new CustomEvent('levels:pinsChanged'));
      }
      const overlayEl = container.closest('.sas-overlay');
      if (overlayEl) {
        const universalRow = overlayEl.querySelector('.universal-row');
        if (universalRow && universalRow._updateDropdownVisually) {
          universalRow._updateDropdownVisually();
        }
      }
    } else {
      const allLevels = getUnlockedLevels().map(l => l.prefix);
      allLevels.forEach(c => {
        settingsManager.set(getToggleKey(c, "popups"), newVals.includes("popups"));
        settingsManager.set(getToggleKey(c, "pinned"), newVals.includes("pinned"));
      });
      
      const overlayEl = container.closest('.sas-overlay');
      if (overlayEl) {
        const rows = overlayEl.querySelectorAll('.currency-row:not(.universal-row)');
        rows.forEach(row => {
          if (row._updateDropdownVisually) {
            row._updateDropdownVisually();
          }
        });
      }
      window.dispatchEvent(new CustomEvent("levels:pinsChanged"));
    }
  };

  const getDisplayValue = (vals) => {
    let hasVariance = false;
    if (isUniversal && !IS_MOBILE) {
      const allLevels = getUnlockedLevels().map(l => l.prefix);
      ['popups', 'pinned'].forEach(type => {
         const firstVal = settingsManager.get(getToggleKey(allLevels[0], type));
         for (let i = 1; i < allLevels.length; i++) {
           if (settingsManager.get(getToggleKey(allLevels[i], type)) !== firstVal) {
             hasVariance = true;
             break;
           }
         }
      });
      if (hasVariance) {
        const span = document.createElement("span");
        span.textContent = "Variance within levels detected";
        span.style.color = "#ffaa00";
        return span;
      }
    }

    const makeSpan = (text, isTruthy) => {
      const span = document.createElement('span');
      span.textContent = text;
      span.style.color = isTruthy ? '#44ff44' : '#ff4444';
      return span;
    };
    
    const verticalBar = () => {
      const span = document.createElement('span');
      span.textContent = '| ';
      span.style.color = 'inherit';
      return span;
    };

    const hasPopups = vals.includes('popups');
    const isPinned = vals.includes('pinned');

    return [
      makeSpan(hasPopups ? 'Has popups' : 'No popups', hasPopups),
      verticalBar(),
      makeSpan(isPinned ? 'Is pinned' : 'Is not pinned', isPinned)
    ];
  };

  const { wrapper, cleanup, updateDisplay } = createDropdown({
    getOptions: () => opts,
    getValue: getDropdownValue,
    setValue: setDropdownValue,
    isChecklist: true,
    getDisplayValue: getDisplayValue,
  });

  row._cleanupDropdown = cleanup;
  row._updateDropdownVisually = updateDisplay;

  controls.appendChild(wrapper);
  row.appendChild(controls);

  container.appendChild(row);
}

function populateLevelsOverlay(overlayEl) {
  const grid = overlayEl.querySelector('.currencies-grid');
  if (!grid) return;
  grid.innerHTML = "";
  grid.setAttribute('role', 'grid');
  
  const levels = getUnlockedLevels();
  if (levels.length === 0) return;

  ensureLevelSettings();
  
  createLevelRow(grid, true, null, null, 'universal');

  levels.forEach(l => {
    createLevelRow(grid, false, l.levelConfig, l.progConfig, l.prefix);
  });
}

function handleOutsideClick(e) {
  if (!levelsOverlay.isOpen) return;
  const overlayEl = levelsOverlay.overlayEl;
  if (!overlayEl) return;
  
  if (!e.target.closest('.setting-dropdown-wrapper')) {
    const openMenus = overlayEl.querySelectorAll('.setting-dropdown-menu.is-open');
    openMenus.forEach(menu => {
      menu.classList.remove('is-open');
    });
  }
}

function handleStatChange(e) {
  if (!levelsOverlay.isOpen) return;
  const overlayEl = levelsOverlay.overlayEl;
  if (!overlayEl) return;
  
  const grid = overlayEl.querySelector(".currencies-grid");
  if (!grid) return;

  const levels = getUnlockedLevels();
  let needsRerender = false;
  if (grid.querySelectorAll(".currency-row:not(.universal-row)").length !== levels.length) {
    needsRerender = true;
  }

  if (needsRerender) {
    populateLevelsOverlay(overlayEl);
  } else {

  levels.forEach(l => {
    const row = grid.querySelector(`.currency-row[data-level="${l.prefix}"]`);
    if (row) {
      const state = levelStateCache[l.prefix] || {};
      const levelVal = state.level || 0;
      const levelValEl = row.querySelector("[data-level-val]");
      if (levelValEl) levelValEl.textContent = " " + formatNumber(levelVal);

      if (l.progConfig) {
          const progVal = state.progress || 0;
          const reqVal = state.requirement || 0;
          
          const progValEl = row.querySelector("[data-prog-val]");
          if (progValEl) progValEl.textContent = formatNumber(progVal);
          
          const reqValEl = row.querySelector("[data-req-val]");
          
          let pct = 0;
          if (reqVal === Infinity || (typeof reqVal === "string" && reqVal === "Infinity") || (reqVal && typeof reqVal.isInfinite === "function" && reqVal.isInfinite())) {
             if (reqValEl) reqValEl.innerHTML = "<span class=\"infinity-symbol\">∞</span>";
             pct = 100;
          } else {
             if (reqValEl) reqValEl.textContent = formatNumber(reqVal);
             if (reqVal && progVal !== null && progVal !== undefined) {
                 const reqNum = Number(reqVal.toString());
                 const progNum = Number(progVal.toString());
                 if (reqNum > 0) pct = Math.min(100, Math.max(0, (progNum / reqNum) * 100));
             }
          }
          
          const fillEl = row.querySelector("[data-fill]");
          if (fillEl) fillEl.style.width = `${pct}%`;
      }
      }
  });
  }
  
  if (paintbrush && paintbrush.isActive()) {
    updatePaintbrushIfActive();
  }
}

const levelsOverlay = createSASOverlay({
  id: 'levels-overlay',
  title: 'Levels',
  containerClass: 'currencies-grid',
  focusSelector: '.level-row, .currencies-grid',
  onRender: (overlayEl) => {
    populateLevelsOverlay(overlayEl);
    window.addEventListener('level:change', handleStatChange);
    document.addEventListener('click', handleOutsideClick);
  },
  onClose: () => {
    window.removeEventListener('level:change', handleStatChange);
    document.removeEventListener('click', handleOutsideClick);
    if (levelsOverlay.overlayEl) {
      const rows = levelsOverlay.overlayEl.querySelectorAll('.currency-row');
      rows.forEach(row => {
        if (row._cleanupDropdown) row._cleanupDropdown();
      });
    }
  }
});

export function openLevelsOverlay() {
  levelsOverlay.open();
}

export function closeLevelsOverlay(force = false) {
  levelsOverlay.close(force);
}



const paintbrush = createPaintbrush({
  getOverlayEl: () => levelsOverlay.overlayEl,
  getInitialState: () => {
    const allLevels = getUnlockedLevels().map(l => l.prefix);
    let state = { popups: true, pinned: true };

    ['popups', 'pinned'].forEach(type => {
       if (!allLevels.every(c => settingsManager.get(getToggleKey(c, type)))) {
         state[type] = false;
       }
    });
    return state;
  },
  togglesConfig: [
    { key: 'popups', label: 'Popups' },
    { key: 'pinned', label: 'Pinned' }
  ],
  descriptionText: "Left click and drag over any level row to apply specific changes in accordance to the dropdown options listed right above this text. Use this tool to apply arbitrary customizations of settings to an arbitrary amount of levels quickly. Rows highlighted in red will be unchanged, and rows highlighted in green will be affected, apply changes when done.",
  onApply: (affectedRows, paintbrushState) => {
    let changedAny = false;
    let changedPins = false;

    affectedRows.forEach(row => {
      const prefix = row.dataset.level;
      if (!prefix) return;

      changedAny = true;

      const newPopups = paintbrushState.popups;
      const newPinned = paintbrushState.pinned;

      if (settingsManager.get(getToggleKey(prefix, 'popups')) !== newPopups) {
        settingsManager.set(getToggleKey(prefix, 'popups'), newPopups);
      }

      if (settingsManager.get(getToggleKey(prefix, 'pinned')) !== newPinned) {
        settingsManager.set(getToggleKey(prefix, 'pinned'), newPinned);
        changedPins = true;
      }
      
      if (row._updateDropdownVisually) {
        row._updateDropdownVisually();
      }
    });

    if (changedAny) {
      if (changedPins) {
        window.dispatchEvent(new CustomEvent('levels:pinsChanged'));
      }
      
      const overlayEl = levelsOverlay.overlayEl;
      if (overlayEl) {
        const universalRow = overlayEl.querySelector('.universal-row');
        if (universalRow && universalRow._updateDropdownVisually) {
          universalRow._updateDropdownVisually();
        }
      }
    }
  }
});

function openPaintbrushMode() {
  paintbrush.open();
}

function updatePaintbrushIfActive() {
  if (paintbrush && paintbrush.isActive()) {
    paintbrush.reinit();
  }
}
