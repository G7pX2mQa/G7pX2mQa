
import { IS_MOBILE } from '../../main.js';
import { blockInteraction, ensureCustomScrollbar, setupDragToClose } from '../shopOverlay.js';
import { suppressNextGhostTap } from '../../util/ghostTapGuard.js';
import { settingsManager, SETTING_DEFINITIONS } from '../../game/settingsManager.js';

let visualsOverlayEl = null;
let visualsSheetEl = null;
let isOpen = false;
let closeTimer = null;
let postOpenPointer = false;

const unsubscribers = [];

function buildVisualsOverlay() {
  if (visualsOverlayEl) return;

  visualsOverlayEl = document.createElement('div');
  visualsOverlayEl.className = 'sas-overlay';
  visualsOverlayEl.id = 'visuals-overlay';

  // Ensure it has a higher z-index to stay above sasOverlay
  visualsOverlayEl.style.zIndex = '4010';

  visualsSheetEl = document.createElement('div');
  visualsSheetEl.className = 'sas-sheet';
  visualsSheetEl.setAttribute('role', 'dialog');

  const grabber = document.createElement('div');
  grabber.className = 'sas-grabber';
  grabber.innerHTML = `<div class="grab-handle" aria-hidden="true"></div>`;

  const content = document.createElement('div');
  content.className = 'sas-content';

  const header = document.createElement('header');
  header.className = 'sas-header';
  header.innerHTML = `<div class="sas-title">Visuals</div><div class="sas-line" aria-hidden="true"></div>`;

  const settingsContainer = document.createElement('div');
  settingsContainer.className = 'sas-settings-container';
  
  const scroller = document.createElement('div');
  scroller.className = 'sas-scroller';
  scroller.appendChild(settingsContainer);

  content.append(header, scroller);
  ensureCustomScrollbar(visualsOverlayEl, visualsSheetEl, '.sas-scroller');

  const actions = document.createElement('div');
  actions.className = 'sas-actions';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'sas-close';
  closeBtn.textContent = 'Close';
  actions.appendChild(closeBtn);

  visualsSheetEl.append(grabber, content, actions);
  visualsOverlayEl.appendChild(visualsSheetEl);
  document.body.appendChild(visualsOverlayEl);

  // Listeners
  visualsOverlayEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    postOpenPointer = true;
  }, { capture: true, passive: true });

  visualsOverlayEl.addEventListener('touchstart', (e) => {
    postOpenPointer = true;
  }, { capture: true, passive: true });

  visualsOverlayEl.addEventListener('click', (e) => {
    if (!IS_MOBILE) return;
    if (!postOpenPointer) {
      e.preventDefault(); e.stopImmediatePropagation();
      return;
    }
  }, { capture: true });

  closeBtn.addEventListener('click', () => {
    if (IS_MOBILE) blockInteraction(80);
    closeVisualsOverlay();
  }, { passive: true });

  setupDragToClose(grabber, visualsSheetEl, () => isOpen, () => {
    isOpen = false;
    closeTimer = setTimeout(() => {
      closeTimer = null;
      closeVisualsOverlay(true);
    }, 150);
  });
}

function renderVisuals() {
  if (!visualsOverlayEl) return;
  const container = visualsOverlayEl.querySelector('.sas-settings-container');
  if (!container) return;

  container.innerHTML = '';
  // Cleanup old listeners
  while (unsubscribers.length > 0) {
    unsubscribers.pop()();
  }

  for (const [key, def] of Object.entries(SETTING_DEFINITIONS)) {
    if (def.overlay !== 'visuals') continue;
    if (def.unlockCondition && !def.unlockCondition()) {
      continue;
    }

    const row = document.createElement("div");
    row.className = "setting-row";
    
    if (def.type === "slider") {
      row.classList.add("setting-row-slider");
    } else if (def.type === "dropdown") {
      row.classList.add("setting-row-dropdown");
    }

    const desc = document.createElement("div");
    desc.className = "setting-description";
    
    if (def.type === "toggle") {
      const labelSpan = document.createElement("span");
      // Use span instead of label so clicks on the empty space don't naturally trigger it.
      // We will handle the span click manually via event listener on the row.
      labelSpan.textContent = def.label;
      labelSpan.style.cursor = "pointer";
      labelSpan.className = "setting-text-label";
      // This prevents the label from expanding to fill the rest of the flex container
      labelSpan.style.flex = "0 1 auto";
      // Explicitly set width to fit-content to be safe
      labelSpan.style.width = "max-content";
      
      desc.appendChild(labelSpan);
    } else {
      const labelSpan = document.createElement("span");
      labelSpan.textContent = def.label;
      desc.appendChild(labelSpan);
    }

    if (def.hasExtraInfo && def.info) {
      const infoIcon = document.createElement("span");
      infoIcon.className = "setting-info-icon";
      const infoIconImg = document.createElement("img");
      infoIconImg.src = "img/misc/i.webp";
      infoIconImg.style.width = "1.2em";
      infoIconImg.style.height = "1.2em";
      infoIconImg.style.display = "block";
      infoIconImg.style.borderRadius = "50%";
      infoIcon.appendChild(infoIconImg);
      
      const infoTooltip = document.createElement("div");
      infoTooltip.className = "setting-info-tooltip";
      infoTooltip.textContent = def.info;
      
      infoIcon.appendChild(infoTooltip);
      desc.appendChild(infoIcon);
    }

    if (def.type === "toggle") {
      const toggleContainer = document.createElement("div");
      toggleContainer.className = "setting-toggle";
      
      // We create a custom toggle switch
      const toggleInput = document.createElement("input");
      toggleInput.type = "checkbox";
      toggleInput.className = "setting-toggle-input";
      toggleInput.id = `setting_toggle_${key}`;
      toggleInput.checked = settingsManager.get(key);

      const toggleLabel = document.createElement("label");
      toggleLabel.htmlFor = `setting_toggle_${key}`;
      toggleLabel.className = "setting-toggle-label";

      toggleInput.addEventListener("change", (e) => {
        settingsManager.set(key, e.target.checked);
      });

      // Optionally update input if setting changes from elsewhere while open
      const unsub = settingsManager.subscribe(key, (newVal) => {
        toggleInput.checked = newVal;
      });
      unsubscribers.push(unsub);

      toggleContainer.append(toggleInput, toggleLabel);
      const clickGap = document.createElement("div");
      clickGap.className = "setting-click-gap";
      row.append(toggleContainer, clickGap, desc);

      row.style.cursor = 'default';
      desc.style.cursor = 'default';
      row.addEventListener('click', (e) => {
        // Only allow clicking the actual row element (the gap) or the specific text label.
        // Clicks strictly on `desc` will be ignored.
        if (e.target === clickGap || e.target.classList.contains('setting-text-label')) {
          toggleInput.click();
        }
      });
    } else if (def.type === "slider") {
      const sliderWrapper = document.createElement("div");
      sliderWrapper.className = "setting-slider-wrapper";

      const sliderContainer = document.createElement("div");
      sliderContainer.className = "setting-slider-container";

      const sliderInput = document.createElement("input");
      sliderInput.type = "range";
      sliderInput.className = "setting-slider-input";
      sliderInput.id = `setting_slider_${key}`;
      sliderInput.min = def.min;
      sliderInput.max = def.max;
      sliderInput.step = def.step;
      sliderInput.value = settingsManager.get(key);
      
      // Create thumb label element first so updateSliderProgress can use it
      const thumbLabel = document.createElement("div");
      thumbLabel.className = "setting-slider-thumb-label";

      // Create a visual track element (since the input will be made transparent and wider)
      const visualTrack = document.createElement("div");
      visualTrack.className = "setting-slider-visual-track";

      const updateSliderProgress = () => {
        const val = parseFloat(sliderInput.value);
        const min = parseFloat(sliderInput.min);
        const max = parseFloat(sliderInput.max);
        const percentage = ((val - min) / (max - min)) * 100;
        
        // Apply progress variable to the container so both track and input can use it
        sliderContainer.style.setProperty('--slider-progress', `${percentage}%`);
        
        // Update the thumb label text
        thumbLabel.textContent = val;
        
        // Since the input range is now wider by exactly 36px (width of thumb) 
        // and shifted left by 18px, the center of the thumb natively travels exactly 
        // from 0% of the *container's* width to 100% of the *container's* width.
        // So the label just needs to follow the percentage exactly.
        thumbLabel.style.left = `${percentage}%`; 
        
        let thumbColor;
        // Hex to RGB conversion for vibrant track colors:
        // Vibrant Red (#ff2a2a): 255, 42, 42
        // Vibrant Yellow (#ffea00): 255, 234, 0
        // Vibrant Green (#24e524): 36, 229, 36
        const cRed = [255, 42, 42];
        const cYellow = [255, 234, 0];
        const cGreen = [36, 229, 36];

        if (percentage <= 50) {
          // Interpolate Red to Yellow
          const ratio = percentage / 50;
          const r = Math.round(cRed[0] + (cYellow[0] - cRed[0]) * ratio);
          const g = Math.round(cRed[1] + (cYellow[1] - cRed[1]) * ratio);
          const b = Math.round(cRed[2] + (cYellow[2] - cRed[2]) * ratio);
          thumbColor = `rgb(${r}, ${g}, ${b})`;
        } else {
          // Interpolate Yellow to Green
          const ratio = (percentage - 50) / 50;
          const r = Math.round(cYellow[0] + (cGreen[0] - cYellow[0]) * ratio);
          const g = Math.round(cYellow[1] + (cGreen[1] - cYellow[1]) * ratio);
          const b = Math.round(cYellow[2] + (cGreen[2] - cYellow[2]) * ratio);
          thumbColor = `rgb(${r}, ${g}, ${b})`;
        }
        sliderContainer.style.setProperty('--slider-thumb-color', thumbColor);
      };

      sliderInput.addEventListener("input", (e) => {
        settingsManager.set(key, parseFloat(e.target.value));
        updateSliderProgress();
      });

      sliderInput.addEventListener("change", (e) => {
        settingsManager.set(key, parseFloat(e.target.value));
        updateSliderProgress();
      });

      let pointerDownPos = null;
      sliderInput.addEventListener('pointerdown', (e) => {
        pointerDownPos = { x: e.clientX, y: e.clientY };
      });
      sliderInput.addEventListener('pointerup', (e) => {
        if (!pointerDownPos) return;
        const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
        if (dist < 5) {
          const rect = sliderContainer.getBoundingClientRect();
          let pct = (e.clientX - rect.left) / rect.width;
          pct = Math.max(0, Math.min(1, pct));
          const min = parseFloat(sliderInput.min);
          const max = parseFloat(sliderInput.max);
          const step = parseFloat(sliderInput.step) || 1;
          
          let val = min + pct * (max - min);
          val = min + Math.round((val - min) / step) * step;
          val = Math.max(min, Math.min(max, val));
          
          if (parseFloat(sliderInput.value) !== val) {
            sliderInput.value = val;
            settingsManager.set(key, val);
            updateSliderProgress();
          }
        }
        pointerDownPos = null;
      });

      const unsub = settingsManager.subscribe(key, (newVal) => {
        sliderInput.value = newVal;
        updateSliderProgress();
      });
      unsubscribers.push(unsub);

      const labelsContainer = document.createElement("div");
      labelsContainer.className = "setting-slider-labels";
      
      const minLabel = document.createElement("div");
      minLabel.className = "slider-label slider-label-min";
      minLabel.innerHTML = `<span>${def.min}</span>`;
      
      const midVal = (parseFloat(def.min) + parseFloat(def.max)) / 2;
      const midLabel = document.createElement("div");
      midLabel.className = "slider-label slider-label-mid";
      midLabel.innerHTML = `<span>${midVal}</span>`;
      
      const maxLabel = document.createElement("div");
      maxLabel.className = "slider-label slider-label-max";
      maxLabel.innerHTML = `<span>${def.max}</span>`;
      
      labelsContainer.append(minLabel, midLabel, maxLabel);
      
      const markersContainer = document.createElement("div");
      markersContainer.className = "setting-slider-markers";
      markersContainer.innerHTML = `
        <div class="slider-marker marker-min"></div>
        <div class="slider-marker marker-mid"></div>
        <div class="slider-marker marker-max"></div>
      `;
      
      sliderContainer.append(visualTrack, markersContainer, sliderInput, thumbLabel, labelsContainer);
      sliderWrapper.appendChild(sliderContainer);
      
      // Space for gap layout consistency
      const gapEl = document.createElement("div");
      gapEl.style.width = "32px";
      gapEl.style.height = "100%";
      row.append(sliderWrapper, gapEl, desc);

      // Initial update
      updateSliderProgress();
    } else if (def.type === "dropdown") {
      const dropdownWrapper = document.createElement("div");
      dropdownWrapper.className = "setting-dropdown-wrapper";

      const dropdownBtn = document.createElement("button");
      dropdownBtn.className = "setting-dropdown-btn";
      
      const dropdownValue = document.createElement("span");
      dropdownValue.className = "setting-dropdown-value";
      dropdownValue.style.display = "flex";
      dropdownValue.style.alignItems = "center";
      dropdownValue.style.gap = "8px";
      
      const dropdownIcon = document.createElement("span");
      dropdownIcon.className = "setting-dropdown-icon";
      dropdownIcon.innerHTML = "&#9662;"; // Downward triangle

      dropdownBtn.append(dropdownValue, dropdownIcon);

      const dropdownMenu = document.createElement("div");
      dropdownMenu.className = "setting-dropdown-menu";
      
      // Support dynamic options vs static options
      const getOpts = () => {
        if (def.getOptions) return def.getOptions();
        return def.options || [];
      };

      const renderOption = (opt) => {
        const optionEl = document.createElement("div");
        optionEl.className = "setting-dropdown-option";
        
        const isObj = typeof opt === 'object' && opt !== null;
        const val = isObj ? opt.value : opt;
        const labelText = isObj ? opt.label : opt;
        const iconSrc = isObj ? opt.icon : null;
        
        // Store the value as an attribute
        optionEl.dataset.value = val;

        if (val === settingsManager.get(key)) {
          optionEl.classList.add("is-selected");
        }

        optionEl.style.display = "flex";
        optionEl.style.alignItems = "center";
        optionEl.style.gap = "8px";

        if (iconSrc) {
          const img = document.createElement("img");
          img.src = iconSrc;
          img.style.width = "1.2em";
          img.style.height = "1.2em";
          img.style.objectFit = "contain";
          optionEl.appendChild(img);
        }

        const textSpan = document.createElement("span");
        textSpan.textContent = labelText;
        optionEl.appendChild(textSpan);

        optionEl.addEventListener("click", () => {
          settingsManager.set(key, val);
          dropdownMenu.classList.remove("is-open");
        });

        return optionEl;
      };

      const buildMenu = () => {
        dropdownMenu.innerHTML = '';
        const opts = getOpts();
        opts.forEach(opt => {
          dropdownMenu.appendChild(renderOption(opt));
        });
      };
      
      buildMenu();

      const updateSelectedValueDisplay = (newVal) => {
        const opts = getOpts();
        const selectedOpt = opts.find(o => {
          if (typeof o === 'object' && o !== null) return o.value === newVal;
          return o === newVal;
        }) || newVal;
        
        dropdownValue.innerHTML = '';
        
        const isObj = typeof selectedOpt === 'object' && selectedOpt !== null;
        const labelText = isObj ? selectedOpt.label : selectedOpt;
        const iconSrc = isObj ? selectedOpt.icon : null;
        
        if (iconSrc) {
          const img = document.createElement("img");
          img.src = iconSrc;
          img.style.width = "1.2em";
          img.style.height = "1.2em";
          img.style.objectFit = "contain";
          dropdownValue.appendChild(img);
        }

        const textSpan = document.createElement("span");
        textSpan.textContent = labelText;
        dropdownValue.appendChild(textSpan);
      };
      
      updateSelectedValueDisplay(settingsManager.get(key));

      dropdownBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        
        // Close all other open dropdowns
        document.querySelectorAll(".setting-dropdown-menu.is-open").forEach(menu => {
          if (menu !== dropdownMenu) {
            menu.classList.remove("is-open");
          }
        });
        
        // Before opening, rebuild the menu in case options changed dynamically
        buildMenu();
        
        dropdownMenu.classList.toggle("is-open");
      });

      const unsub = settingsManager.subscribe(key, (newVal) => {
        updateSelectedValueDisplay(newVal);
        const options = dropdownMenu.querySelectorAll(".setting-dropdown-option");
        options.forEach(opt => {
          if (opt.dataset.value === newVal) {
            opt.classList.add("is-selected");
          } else {
            opt.classList.remove("is-selected");
          }
        });
      });
      unsubscribers.push(unsub);

      dropdownWrapper.append(dropdownBtn, dropdownMenu);

      // Space for gap layout consistency
      const gapEl = document.createElement("div");
      gapEl.style.width = "32px";
      gapEl.style.height = "100%";
      row.append(dropdownWrapper, gapEl, desc);
    } else {
      row.append(desc);
    }
    container.appendChild(row);
  }

  // Handle closing the dropdowns when clicking outside
  const handleOutsideClick = (e) => {
    if (!e.target.closest('.setting-dropdown-wrapper')) {
      document.querySelectorAll('.setting-dropdown-menu.is-open').forEach(menu => {
        menu.classList.remove('is-open');
      });
    }
  };
  
  visualsOverlayEl.addEventListener('click', handleOutsideClick);
  
  unsubscribers.push(() => {
    visualsOverlayEl.removeEventListener('click', handleOutsideClick);
  });
}

export function openMainSettingsOverlay() {
  buildMainSettingsOverlay();

  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  
  renderSettings();

  if (isOpen) return;
  isOpen = true;

  mainSettingsSheetEl.style.transition = 'none';
  mainSettingsSheetEl.style.transform = 'translateY(100%)';
  mainSettingsOverlayEl.style.pointerEvents = 'auto';

  void mainSettingsSheetEl.offsetHeight;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      mainSettingsSheetEl.style.transition = '';
      mainSettingsSheetEl.style.transform = '';
      mainSettingsOverlayEl.classList.add('is-open');
      postOpenPointer = false;

      if (IS_MOBILE) {
        try { setTimeout(() => suppressNextGhostTap(240), 120); } catch {}
      }

      blockInteraction(10);
      ensureCustomScrollbar(mainSettingsOverlayEl, mainSettingsSheetEl, '.sas-scroller');
    });
  });
}

export function closeMainSettingsOverlay(force = false) {
  const forceClose = force === true;
  const overlayOpen = mainSettingsOverlayEl?.classList?.contains('is-open');

  if (!forceClose && !isOpen && !overlayOpen) {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    return;
  }

  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }

  isOpen = false;
  if (mainSettingsSheetEl) {
    mainSettingsSheetEl.style.transition = '';
    mainSettingsSheetEl.style.transform = '';
  }
  if (mainSettingsOverlayEl) {
    mainSettingsOverlayEl.classList.remove('is-open');
    mainSettingsOverlayEl.style.pointerEvents = 'none';
  }
  postOpenPointer = false;
}


export function openVisualsOverlay() {
  buildVisualsOverlay();

  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }

  renderVisuals();

  if (isOpen) return;
  isOpen = true;

  visualsSheetEl.style.transition = 'none';
  visualsSheetEl.style.transform = 'translateY(100%)';
  visualsOverlayEl.style.pointerEvents = 'auto';

  void visualsSheetEl.offsetHeight;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      visualsSheetEl.style.transition = '';
      visualsSheetEl.style.transform = '';
      visualsOverlayEl.classList.add('is-open');
      postOpenPointer = false;

      if (IS_MOBILE) {
        try { setTimeout(() => suppressNextGhostTap(240), 120); } catch {}
      }

      blockInteraction(10);
      ensureCustomScrollbar(visualsOverlayEl, visualsSheetEl, '.sas-scroller');

      const focusable = visualsOverlayEl.querySelector('.sas-close');
      if (focusable) focusable.focus();
    });
  });
}

export function closeVisualsOverlay(force = false) {
  const forceClose = force === true;
  const overlayOpen = visualsOverlayEl?.classList?.contains('is-open');

  if (!forceClose && !isOpen && !overlayOpen) {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    return;
  }

  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }

  isOpen = false;
  if (visualsSheetEl) {
    visualsSheetEl.style.transition = '';
    visualsSheetEl.style.transform = '';
  }
  if (visualsOverlayEl) {
    visualsOverlayEl.classList.remove('is-open');
    visualsOverlayEl.style.pointerEvents = 'none';
  }
  postOpenPointer = false;
}
