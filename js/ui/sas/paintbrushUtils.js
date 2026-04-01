// js/ui/sas/paintbrushUtils.js

export function createPaintbrush({
    getInitialState,
    togglesConfig,
    descriptionText,
    onApply,
    getOverlayEl
}) {
    let paintbrushActive = false;
    let paintbrushPopup = null;
    let paintbrushState = {};
    let paintbrushRowStates = {};
    let isPaintbrushMouseDown = false;
    let hoveredRowDuringPaintbrush = null;

    function open() {
        if (paintbrushActive) return;
        paintbrushActive = true;
        paintbrushRowStates = {};
        
        paintbrushState = getInitialState();

        paintbrushPopup = document.createElement('div');
        paintbrushPopup.className = 'paintbrush-popup';
        paintbrushPopup.style.position = 'fixed';
        paintbrushPopup.style.top = '0';
        paintbrushPopup.style.left = '50%';
        paintbrushPopup.style.transform = 'translateX(-50%)';
        paintbrushPopup.style.background = '#111';
        paintbrushPopup.style.color = '#fff';
        paintbrushPopup.style.border = '1px solid #444';
        paintbrushPopup.style.borderTop = 'none';
        paintbrushPopup.style.borderBottomLeftRadius = '8px';
        paintbrushPopup.style.borderBottomRightRadius = '8px';
        paintbrushPopup.style.padding = '15px';
        paintbrushPopup.style.zIndex = '10000';
        paintbrushPopup.style.width = '100vw';
        paintbrushPopup.style.maxWidth = '800px';
        paintbrushPopup.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';
        paintbrushPopup.style.display = 'flex';
        paintbrushPopup.style.flexDirection = 'column';
        paintbrushPopup.style.gap = '15px';

        const togglesContainer = document.createElement('div');
        togglesContainer.style.display = 'flex';
        togglesContainer.style.justifyContent = 'space-around';
        togglesContainer.style.padding = '0';
        togglesContainer.style.marginBottom = '-5px';

        const createToggle = (key, label) => {
            const labelEl = document.createElement('label');
            labelEl.style.display = 'flex';
            labelEl.style.alignItems = 'center';
            labelEl.style.gap = '5px';
            labelEl.style.cursor = 'pointer';
            labelEl.style.userSelect = 'none';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = paintbrushState[key];
            checkbox.addEventListener('change', (e) => {
                paintbrushState[key] = e.target.checked;
            });

            labelEl.appendChild(checkbox);
            labelEl.appendChild(document.createTextNode(label));
            return labelEl;
        };

        togglesConfig.forEach(tc => {
            togglesContainer.appendChild(createToggle(tc.key, tc.label));
        });

        const textEl = document.createElement('div');
        textEl.style.fontSize = '0.9em';
        textEl.style.lineHeight = '1.4';
        textEl.style.color = '#ccc';
        textEl.style.textAlign = 'center';
        textEl.textContent = descriptionText;

        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.display = 'flex';
        buttonsContainer.style.justifyContent = 'space-between';
        buttonsContainer.style.gap = '10px';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel changes';
        cancelBtn.style.background = '#aa0000';
        cancelBtn.style.color = '#fff';
        cancelBtn.style.border = 'none';
        cancelBtn.style.padding = '8px 15px';
        cancelBtn.style.borderRadius = '4px';
        cancelBtn.style.cursor = 'pointer';
        cancelBtn.style.flex = '1';
        cancelBtn.addEventListener('click', close);

        const applyBtn = document.createElement('button');
        applyBtn.textContent = 'Apply changes';
        applyBtn.style.background = '#008800';
        applyBtn.style.color = '#fff';
        applyBtn.style.border = 'none';
        applyBtn.style.padding = '8px 15px';
        applyBtn.style.borderRadius = '4px';
        applyBtn.style.cursor = 'pointer';
        applyBtn.style.flex = '1';
        applyBtn.addEventListener('click', apply);

        buttonsContainer.appendChild(cancelBtn);
        buttonsContainer.appendChild(applyBtn);

        paintbrushPopup.appendChild(togglesContainer);
        paintbrushPopup.appendChild(textEl);
        paintbrushPopup.appendChild(buttonsContainer);

        document.body.appendChild(paintbrushPopup);

        document.addEventListener('mousedown', handleMouseDownDocument);
        document.addEventListener('mouseup', handleMouseUpDocument);

        initEvents();
    }

    function close() {
        if (!paintbrushActive) return;
        paintbrushActive = false;
        paintbrushRowStates = {};
        if (paintbrushPopup) {
            paintbrushPopup.remove();
            paintbrushPopup = null;
        }
        
        document.removeEventListener('mousedown', handleMouseDownDocument);
        document.removeEventListener('mouseup', handleMouseUpDocument);

        cleanupEvents();
    }

    function apply() {
        const overlayEl = getOverlayEl();
        if (!overlayEl) {
            close();
            return;
        }

        const rows = overlayEl.querySelectorAll('.currency-row:not(.universal-row)');
        const affectedRows = [];
        rows.forEach(row => {
            const overlay = row.querySelector('.paintbrush-row-overlay');
            if (overlay && overlay.dataset.state === 'green') {
                affectedRows.push(row);
            }
        });

        if (affectedRows.length > 0) {
            onApply(affectedRows, paintbrushState);
        }

        close();
    }

    function handleMouseDownDocument(e) {
        if (!paintbrushActive) return;
        if (e.button !== 0) return; 
        isPaintbrushMouseDown = true;
        
        const row = e.target.closest('.currency-row:not(.universal-row)');
        const overlayEl = getOverlayEl();
        if (row && overlayEl && overlayEl.contains(row)) {
            flipRowStateFromElement(row);
        }
    }

    function handleMouseUpDocument(e) {
        if (!paintbrushActive) return;
        if (e.button !== 0) return;
        isPaintbrushMouseDown = false;
        hoveredRowDuringPaintbrush = null;
    }

    function handleMouseEnter(e) {
        if (!paintbrushActive || !isPaintbrushMouseDown) return;
        flipRowStateFromElement(e.currentTarget);
    }

    function handleMouseLeave(e) {
        if (!paintbrushActive) return;
        const row = e.currentTarget;
        if (hoveredRowDuringPaintbrush === row) {
            hoveredRowDuringPaintbrush = null;
        }
    }

    function flipRowStateFromElement(row) {
        if (!row || hoveredRowDuringPaintbrush === row) return;
        
        const overlay = row.querySelector('.paintbrush-row-overlay');
        const dataId = row.dataset.currency || row.dataset.level;
        
        if (overlay) {
            if (overlay.dataset.state === 'red') {
                overlay.dataset.state = 'green';
                overlay.style.background = 'rgba(0, 255, 0, 0.5)';
                overlay.style.borderColor = 'rgba(0, 255, 0, 1)';
                if (dataId) paintbrushRowStates[dataId] = 'green';
            } else {
                overlay.dataset.state = 'red';
                overlay.style.background = 'rgba(255, 0, 0, 0.5)';
                overlay.style.borderColor = 'rgba(255, 0, 0, 1)';
                if (dataId) paintbrushRowStates[dataId] = 'red';
            }
        }
        hoveredRowDuringPaintbrush = row;
    }

    function initEvents() {
        const overlayEl = getOverlayEl();
        if (overlayEl) {
            const controls = overlayEl.querySelectorAll('.currency-controls');
            controls.forEach(c => {
                c.style.pointerEvents = 'none';
            });
            
            overlayEl.style.userSelect = 'none';

            const rows = overlayEl.querySelectorAll('.currency-row:not(.universal-row)');
            rows.forEach(r => {
                if (window.getComputedStyle(r).position === 'static') {
                    r.style.position = 'relative';
                }
                
                const overlay = document.createElement('div');
                overlay.className = 'paintbrush-row-overlay';
                overlay.style.position = 'absolute';
                overlay.style.top = '-6px';
                overlay.style.bottom = '-6px';
                overlay.style.left = 'calc(-1 * (var(--grid-padding-left, 16px) + var(--row-margin-left, 24px)))';
                overlay.style.width = 'calc(100% + var(--grid-padding-left, 16px) + var(--row-margin-left, 24px) + var(--grid-padding-right, 16px))';
                overlay.style.boxSizing = 'border-box';
                overlay.style.zIndex = '10';
                overlay.style.pointerEvents = 'none'; 
                
                const dataId = r.dataset.currency || r.dataset.level;
                if (dataId && paintbrushRowStates[dataId] === 'green') {
                    overlay.style.background = 'rgba(0, 255, 0, 0.5)';
                    overlay.style.border = '5px solid rgba(0, 255, 0, 1)';
                    overlay.dataset.state = 'green';
                } else {
                    overlay.style.background = 'rgba(255, 0, 0, 0.5)';
                    overlay.style.border = '5px solid rgba(255, 0, 0, 1)';
                    overlay.dataset.state = 'red';
                }

                r.appendChild(overlay);

                r.addEventListener('mouseenter', handleMouseEnter);
                r.addEventListener('mouseleave', handleMouseLeave);
            });
        }
    }

    function cleanupEvents() {
        const overlayEl = getOverlayEl();
        if (overlayEl) {
            const controls = overlayEl.querySelectorAll('.currency-controls');
            controls.forEach(c => {
                c.style.pointerEvents = '';
            });
            
            overlayEl.style.userSelect = '';

            const rows = overlayEl.querySelectorAll('.currency-row:not(.universal-row)');
            rows.forEach(r => {
                const overlay = r.querySelector('.paintbrush-row-overlay');
                if (overlay) overlay.remove();
                
                r.removeEventListener('mouseenter', handleMouseEnter);
                r.removeEventListener('mouseleave', handleMouseLeave);
            });
        }
        isPaintbrushMouseDown = false;
        hoveredRowDuringPaintbrush = null;
    }

    function reinit() {
        if (paintbrushActive) {
            cleanupEvents();
            initEvents();
        }
    }

    return {
        open,
        close,
        reinit,
        isActive: () => paintbrushActive
    };
}
