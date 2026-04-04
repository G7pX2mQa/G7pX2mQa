// js/ui/sas/dropdownUtils.js

export function createDropdown(options) {
  const {
    getOptions,
    getValue,
    setValue,
    subscribe,
    isChecklist = false,
    getDisplayValue = null,
    onOpen = null,
    onClose = null,
  } = options;

  const dropdownWrapper = document.createElement("div");
  dropdownWrapper.className = "setting-dropdown-wrapper";

  const dropdownBtn = document.createElement("button");
  dropdownBtn.className = "setting-dropdown-btn";
  
  const dropdownValueDisplay = document.createElement("span");
  dropdownValueDisplay.className = "setting-dropdown-value";
  dropdownValueDisplay.style.display = "flex";
  dropdownValueDisplay.style.alignItems = "center";
  dropdownValueDisplay.style.flexWrap = "wrap";
  dropdownValueDisplay.style.gap = "8px";
  
  const dropdownIcon = document.createElement("span");
  dropdownIcon.className = "setting-dropdown-icon";
  dropdownIcon.innerHTML = "&#9662;"; // Downward triangle

  dropdownBtn.append(dropdownValueDisplay, dropdownIcon);

  const dropdownMenu = document.createElement("div");
  dropdownMenu.className = "setting-dropdown-menu";

  let currentUnsub = null;

  const renderOption = (opt) => {
    const optionEl = document.createElement("div");
    optionEl.className = "setting-dropdown-option";
    
    const isObj = typeof opt === 'object' && opt !== null;
    const val = isObj ? opt.value : opt;
    const labelText = isObj ? opt.label : opt;
    const iconSrc = isObj ? opt.icon : null;
    const customClass = isObj ? opt.className : null;
    if (customClass) optionEl.classList.add(customClass);

    
    optionEl.dataset.value = val;

    const isButton = isObj && opt.isButton;

    if (isButton) {
      optionEl.style.justifyContent = "center";
      optionEl.style.fontWeight = "bold";
    } else if (isChecklist) {
      // In checklist mode, we add a checkbox
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "setting-dropdown-checkbox";
      cb.style.marginRight = "8px";
      cb.style.pointerEvents = "none"; // Let the option click handle it
      
      const currentVals = getValue() || [];
      cb.checked = currentVals.includes(val);
      optionEl.appendChild(cb);
    } else {
      // Regular mode
      if (val === getValue()) {
        optionEl.classList.add("is-selected");
      }
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
    // Apply a specific class for the paintbrush button text animation if needed
    if (customClass === "paintbrush-btn-anim") {
      textSpan.className = "paintbrush-text";
    }
    optionEl.appendChild(textSpan);

    optionEl.addEventListener("click", (e) => {
      const isButton = isObj && opt.isButton;
      if (isButton) {
        dropdownMenu.classList.remove("is-open");
        if (onClose) onClose();
        setValue([val]); // Trigger special behaviour without being a checklist
        return;
      }
      if (isChecklist) {
        // Toggle value in array
        e.stopPropagation(); // prevent closing
        let currentVals = getValue() || [];
        if (currentVals.includes(val)) {
          currentVals = currentVals.filter(v => v !== val);
        } else {
          currentVals = [...currentVals, val];
        }
        setValue(currentVals);
        
        // Update checkbox visually right away
        const cb = optionEl.querySelector('input[type="checkbox"]');
        if (cb) cb.checked = currentVals.includes(val);
        
        // Update button display value
        updateSelectedValueDisplay(currentVals);
      } else {
        setValue(val);
        dropdownMenu.classList.remove("is-open");
        if (onClose) onClose();
      }
    });

    return optionEl;
  };

  const buildMenu = () => {
    dropdownMenu.innerHTML = '';
    const opts = getOptions();
    opts.forEach(opt => {
      dropdownMenu.appendChild(renderOption(opt));
    });
  };
  
  buildMenu();

  const updateSelectedValueDisplay = (newVal) => {
    dropdownValueDisplay.innerHTML = '';

    if (isChecklist && getDisplayValue) {
      const displayVal = getDisplayValue(newVal);
      if (displayVal instanceof Node) {
        dropdownValueDisplay.appendChild(displayVal);
      } else if (Array.isArray(displayVal)) {
        displayVal.forEach(node => {
          if (node instanceof Node) {
            dropdownValueDisplay.appendChild(node);
          } else {
            const span = document.createElement("span");
            span.textContent = node;
            dropdownValueDisplay.appendChild(span);
          }
        });
      } else {
        const textSpan = document.createElement("span");
        textSpan.textContent = displayVal;
        dropdownValueDisplay.appendChild(textSpan);
      }
      return;
    }

    const opts = getOptions();
    const selectedOpt = opts.find(o => {
      if (typeof o === 'object' && o !== null) return o.value === newVal;
      return o === newVal;
    }) || newVal;
    
    const isObj = typeof selectedOpt === 'object' && selectedOpt !== null;
    const labelText = isObj ? selectedOpt.label : selectedOpt;
    const iconSrc = isObj ? selectedOpt.icon : null;
    
    if (iconSrc) {
      const img = document.createElement("img");
      img.src = iconSrc;
      img.style.width = "1.2em";
      img.style.height = "1.2em";
      img.style.objectFit = "contain";
      dropdownValueDisplay.appendChild(img);
    }

    const textSpan = document.createElement("span");
    textSpan.textContent = labelText;
    dropdownValueDisplay.appendChild(textSpan);
  };
  
  updateSelectedValueDisplay(getValue());

  dropdownBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    
    document.querySelectorAll(".setting-dropdown-menu.is-open").forEach(menu => {
      if (menu !== dropdownMenu) {
        menu.classList.remove("is-open");
      }
    });
    
    const wasOpen = dropdownMenu.classList.contains("is-open");
    
    buildMenu(); // Rebuild in case options changed dynamically
    
    if (!wasOpen) {
      const origVisibility = dropdownMenu.style.visibility;
      const origDisplay = dropdownMenu.style.display;
      
      dropdownMenu.style.visibility = "hidden";
      dropdownMenu.style.display = "block";
      dropdownMenu.style.maxHeight = "none";
      dropdownMenu.classList.add("is-open");
      
      const menuHeight = dropdownMenu.scrollHeight;
      const rect = dropdownBtn.getBoundingClientRect();
      
      let scrollContainer = dropdownBtn.parentElement;
      let containerRect = null;
      while (scrollContainer && scrollContainer !== document.body) {
        const style = window.getComputedStyle(scrollContainer);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
          containerRect = scrollContainer.getBoundingClientRect();
          break;
        }
        scrollContainer = scrollContainer.parentElement;
      }
      
      let viewportBottom, viewportTop;
      if (containerRect) {
        viewportBottom = Math.min(window.innerHeight, containerRect.bottom);
        viewportTop = Math.max(0, containerRect.top);
      } else {
        viewportBottom = window.innerHeight;
        viewportTop = 0;
      }
      
      const spaceBelow = viewportBottom - rect.bottom - 10;
      const spaceAbove = rect.top - viewportTop - 10;
      
      dropdownMenu.classList.remove("is-open");
      dropdownMenu.style.visibility = origVisibility;
      dropdownMenu.style.display = origDisplay;
      
      let renderUpwards = false;
      let newMaxHeight = spaceBelow;
      
      if (menuHeight <= spaceBelow) {
        renderUpwards = false;
        newMaxHeight = spaceBelow;
      } else if (menuHeight <= spaceAbove) {
        renderUpwards = true;
        newMaxHeight = spaceAbove;
      } else {
        if (spaceBelow >= spaceAbove) {
          renderUpwards = false;
          newMaxHeight = spaceBelow;
        } else {
          renderUpwards = true;
          newMaxHeight = spaceAbove;
        }
      }
      
      if (renderUpwards) {
        dropdownMenu.classList.add("is-upwards");
      } else {
        dropdownMenu.classList.remove("is-upwards");
      }
      dropdownMenu.style.maxHeight = `${newMaxHeight}px`;
      dropdownMenu.classList.add("is-open");
      if (onOpen) onOpen();
    } else {
      dropdownMenu.classList.remove("is-open");
      if (onClose) onClose();
    }
  });

  if (subscribe) {
    currentUnsub = subscribe((newVal) => {
      updateSelectedValueDisplay(newVal);
      if (!isChecklist) {
        const optionsEls = dropdownMenu.querySelectorAll(".setting-dropdown-option");
        optionsEls.forEach(opt => {
          if (opt.dataset.value === newVal) {
            opt.classList.add("is-selected");
          } else {
            opt.classList.remove("is-selected");
          }
        });
      } else {
        const optionsEls = dropdownMenu.querySelectorAll(".setting-dropdown-option");
        optionsEls.forEach(opt => {
          const cb = opt.querySelector('input[type="checkbox"]');
          if (cb) {
            cb.checked = (newVal || []).includes(opt.dataset.value);
          }
        });
      }
    });
  }

  dropdownWrapper.append(dropdownBtn, dropdownMenu);

  return {
    wrapper: dropdownWrapper,
    updateDisplay: () => {
      const newVal = getValue();
      updateSelectedValueDisplay(newVal);
      if (!isChecklist) {
        const optionsEls = dropdownMenu.querySelectorAll(".setting-dropdown-option");
        optionsEls.forEach(opt => {
          if (opt.dataset.value === newVal) {
            opt.classList.add("is-selected");
          } else {
            opt.classList.remove("is-selected");
          }
        });
      } else {
        const optionsEls = dropdownMenu.querySelectorAll(".setting-dropdown-option");
        optionsEls.forEach(opt => {
          const cb = opt.querySelector('input[type="checkbox"]');
          if (cb) {
            cb.checked = (newVal || []).includes(opt.dataset.value);
          }
        });
      }
    },
    cleanup: () => {
      if (currentUnsub) currentUnsub();
    }
  };
}
