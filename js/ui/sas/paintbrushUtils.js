// js/ui/sas/paintbrushUtils.js

export function createPaintBrush({
    getInitialState,
    togglesConfig,
    descriptionText,
    onApply,
    getOverlayEl
}) {
    let paintBrushActive = false;
    let paintBrushPopup = null;
    let paintBrushState = {};
    let paintBrushRowStates = {};
    let isPaintBrushMouseDown = false;
    let hoveredRowDuringPaintBrush = null;

    function open() {
        if (paintBrushActive) return;
        paintBrushActive = true;
        paintBrushRowStates = {};
        
        paintBrushState = getInitialState();

        paintBrushPopup = document.createElement('div');
        paintBrushPopup.className = 'paintbrush-popup';
        paintBrushPopup.style.position = 'fixed';
        paintBrushPopup.style.top = '0';
        paintBrushPopup.style.left = '50%';
        paintBrushPopup.style.transform = 'translateX(-50%)';
        paintBrushPopup.style.background = '#111';
        paintBrushPopup.style.color = '#fff';
        paintBrushPopup.style.border = '1px solid #444';
        paintBrushPopup.style.borderTop = 'none';
        paintBrushPopup.style.borderBottomLeftRadius = '8px';
        paintBrushPopup.style.borderBottomRightRadius = '8px';
        paintBrushPopup.style.padding = '15px';
        paintBrushPopup.style.zIndex = '10000';
        paintBrushPopup.style.width = '100vw';
        paintBrushPopup.style.maxWidth = '800px';
        paintBrushPopup.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';
        paintBrushPopup.style.display = 'flex';
        paintBrushPopup.style.flexDirection = 'column';
        paintBrushPopup.style.gap = '15px';

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
            checkbox.checked = paintBrushState[key];
            checkbox.addEventListener('change', (e) => {
                paintBrushState[key] = e.target.checked;
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

        paintBrushPopup.appendChild(togglesContainer);
        paintBrushPopup.appendChild(textEl);
        paintBrushPopup.appendChild(buttonsContainer);

        document.body.appendChild(paintBrushPopup);

        document.addEventListener('mousedown', handleMouseDownDocument);
        document.addEventListener('mouseup', handleMouseUpDocument);

        initEvents();
    }

    function close() {
        if (!paintBrushActive) return;
        paintBrushActive = false;
        paintBrushRowStates = {};
        if (paintBrushPopup) {
            paintBrushPopup.remove();
            paintBrushPopup = null;
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
            onApply(affectedRows, paintBrushState);
        }

        close();
    }

    function handleMouseDownDocument(e) {
        if (!paintBrushActive) return;
        if (e.button !== 0) return; 
        isPaintBrushMouseDown = true;
        
        const row = e.target.closest('.currency-row:not(.universal-row)');
        const overlayEl = getOverlayEl();
        if (row && overlayEl && overlayEl.contains(row)) {
            flipRowStateFromElement(row);
        }
    }

    function handleMouseUpDocument(e) {
        if (!paintBrushActive) return;
        if (e.button !== 0) return;
        isPaintBrushMouseDown = false;
        hoveredRowDuringPaintBrush = null;
    }

    function handleMouseEnter(e) {
        if (!paintBrushActive || !isPaintBrushMouseDown) return;
        flipRowStateFromElement(e.currentTarget);
    }

    function handleMouseLeave(e) {
        if (!paintBrushActive) return;
        const row = e.currentTarget;
        if (hoveredRowDuringPaintBrush === row) {
            hoveredRowDuringPaintBrush = null;
        }
    }

    function flipRowStateFromElement(row) {
        if (!row || hoveredRowDuringPaintBrush === row) return;
        
        const overlay = row.querySelector('.paintbrush-row-overlay');
        const dataId = row.dataset.currency || row.dataset.level;
        
        if (overlay) {
            if (overlay.dataset.state === 'red') {
                overlay.dataset.state = 'green';
                overlay.style.background = 'rgba(0, 255, 0, 0.5)';
                overlay.style.borderColor = 'rgba(0, 255, 0, 1)';
                if (dataId) paintBrushRowStates[dataId] = 'green';
            } else {
                overlay.dataset.state = 'red';
                overlay.style.background = 'rgba(255, 0, 0, 0.5)';
                overlay.style.borderColor = 'rgba(255, 0, 0, 1)';
                if (dataId) paintBrushRowStates[dataId] = 'red';
            }
        }
        hoveredRowDuringPaintBrush = row;
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
                if (dataId && paintBrushRowStates[dataId] === 'green') {
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
        isPaintBrushMouseDown = false;
        hoveredRowDuringPaintBrush = null;
    }

    function reinit() {
        if (paintBrushActive) {
            cleanupEvents();
            initEvents();
        }
    }

    return {
        open,
        close,
        reinit,
        isActive: () => paintBrushActive
    };
}