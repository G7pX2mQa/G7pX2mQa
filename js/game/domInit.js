import { settingsManager } from './settingsManager.js';
import { initPinnedCurrencies, initPinnedLevels } from '../ui/currencyAndLevelPins.js';
import { initPinnedAreas } from '../ui/areaPins.js';
import { RESOURCE_REGISTRY } from './offlinePanel.js';
import { getLevelNumber } from './upgrades.js';
import { RAINBOW_GEM_AREA_KEY } from './rainbowGemUpgrades.js';
import { FONT_MAP, ALL_FONT_CLASSES } from '../main.js';

export function ensureGameDom(layerCount, startZ) {
  if (document.getElementById('game-root')) return;

  const main = document.createElement('main');
  const uiHiddenClass = settingsManager.get('user_interface') ? '' : 'hide-ui';
  main.id = 'game-root';
  main.className = 'area area-cove';
  main.hidden = true;

  // Generate a single master foreground canvas
  let waterLayersHtml = `<canvas id="water-foreground" style="position: absolute; top: 0; left: 0; width: 100%; height: 35%; pointer-events: none; z-index: ${startZ};"></canvas>`;

  main.innerHTML = `
      <div class="hud-top ${uiHiddenClass}">
        <div id="pinned-currencies-container"></div>
        <div class="coin-counter">
          <img src="img/currencies/coin/coin_plus_base.webp" alt="" class="coin-plus"/>
          <div class="coin-bar">
            <span class="coin-amount">0</span>
          </div>
        </div>

        <div class="scrap-counter" style="display: none;">
          <img src="img/currencies/scrap/scrap_plus_base.webp" alt="" class="scrap-plus"/>
          <div class="scrap-bar">
            <span class="scrap-amount">0</span>
          </div>
        </div>

        <div class="xp-counter" data-xp-hud hidden>
          <img src="img/stats/xp/xp_plus_base.webp" alt="" class="xp-plus"/>

          <div class="xp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="0 / 10 XP">
            <div class="xp-bar__fill" style="width: 0%"></div>
			
            <div class="xp-bar__frame">
              <div class="xp-bar__level">
                Level<span class="xp-level-value">0</span>
              </div>

              <div class="xp-bar__divider" aria-hidden="true"></div>

              <div class="xp-bar__progress" data-xp-progress>
                0<span class="xp-progress-separator">/</span>10<span class="xp-progress-suffix">XP</span>
              </div>
            </div>
          </div>
        </div>

        <div class="mp-counter" data-mp-hud hidden>
          <img src="img/stats/mp/mp_plus_base.webp" alt="" class="mp-plus"/>

          <div class="mp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-valuetext="0 / 10 MP">
            <div class="mp-bar__fill" style="width: 0%"></div>

            <div class="mp-bar__frame">
              <div class="mp-bar__level">
                Mutation<span class="mp-level-value">0</span>
              </div>

              <div class="mp-bar__divider" aria-hidden="true"></div>

              <div class="mp-bar__progress" data-mp-progress>
                0<span class="mp-progress-separator">/</span>10<span class="mp-progress-suffix">MP</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section class="playfield" aria-label="Starter Cove Sand">
        <div class="waves" id="waves"></div>

        <canvas id="water-background" class="water-base" style="position: absolute; top: 0; left: 0; width: 100%; height: 35%; pointer-events: none; z-index: 1;"></canvas>
        <div class="coins-layer" id="coins-layer"></div>
        <div class="materials-layer" id="materials-layer" style="position: absolute; inset: 0; pointer-events: none; display: none;"></div>
        <div class="rubble-layer" id="rubble-layer"></div>
        ${waterLayersHtml.trim()}
      </section>

      <div class="hud-bottom-wrapper ${uiHiddenClass}" id="hud-bottom-wrapper">
        <nav class="hud-bottom" id="hud-bottom">
          <button class="game-btn btn-help" data-btn="help"><span>Help</span></button>
          <button class="game-btn btn-shop" data-btn="shop"><span>Shop</span></button>
          <button class="game-btn btn-stats" data-btn="stats"><span>Stats &amp; Settings</span></button>
          <button class="game-btn btn-map" data-btn="map"><span>Map</span></button>
        </nav>
        <div class="goal-progress-bar" id="goal-progress-bar">
          <div class="goal-bar-fill" id="goal-bar-fill"></div>
          <div class="goal-bar-text" id="goal-bar-text"></div>
        </div>
      </div>
  `;

  document.body.appendChild(main);

  initPinnedCurrencies(document.getElementById('pinned-currencies-container'));
  // We use the same container for both currency and level pins because they share the same absolute positioning anchor in the HUD.
  initPinnedLevels(document.getElementById('pinned-currencies-container'));
  initPinnedAreas();

  const xpConfig = RESOURCE_REGISTRY.find(c => c.key === 'xp');
  if (xpConfig) {
      const xpBar = document.getElementById('game-root').querySelector('.xp-bar');
      const xpFill = document.getElementById('game-root').querySelector('.xp-bar__fill');
      if (xpBar) {
          if (xpConfig.pinBgGradient) xpBar.style.background = xpConfig.pinBgGradient;
          if (xpConfig.borderColor) xpBar.style.setProperty('--bar-border-color', xpConfig.borderColor);
          if (xpConfig.barBoxShadow) xpBar.style.setProperty('--bar-box-shadow', xpConfig.barBoxShadow);
      }
      if (xpFill) {
          if (xpConfig.fillGradient) xpFill.style.background = xpConfig.fillGradient;
          if (xpConfig.glassBg) xpFill.style.setProperty('--glass-bg', xpConfig.glassBg);
          if (xpConfig.glassOpacity) xpFill.style.setProperty('--glass-opacity', xpConfig.glassOpacity);
      }
  }

  const mpConfig = RESOURCE_REGISTRY.find(c => c.key === 'mp');
  if (mpConfig) {
      const mpBar = document.getElementById('game-root').querySelector('.mp-bar');
      const mpFill = document.getElementById('game-root').querySelector('.mp-bar__fill');
      if (mpBar) {
          if (mpConfig.pinBgGradient) mpBar.style.background = mpConfig.pinBgGradient;
          if (mpConfig.borderColor) mpBar.style.setProperty('--bar-border-color', mpConfig.borderColor);
          if (mpConfig.barBoxShadow) mpBar.style.setProperty('--bar-box-shadow', mpConfig.barBoxShadow);
      }
      if (mpFill) {
          if (mpConfig.fillGradient) mpFill.style.background = mpConfig.fillGradient;
          if (mpConfig.glassBg) mpFill.style.setProperty('--glass-bg', mpConfig.glassBg);
          if (mpConfig.glassOpacity) mpFill.style.setProperty('--glass-opacity', mpConfig.glassOpacity);
      }
  }

  // Apply rainbow gem upgrades effects on load
  const applyFontSetting = () => {
    document.body.classList.remove(...ALL_FONT_CLASSES);
    const fontMod = settingsManager.get('active_font_mod');
    if (FONT_MAP[fontMod]) {
      document.body.classList.add(FONT_MAP[fontMod]);
    }
  };
  
  settingsManager.subscribe('active_font_mod', applyFontSetting);
  applyFontSetting();

  const applyOverlayTransitionSetting = () => {
    if (settingsManager.get('overlay_transition') === false) {
      document.body.classList.add('no-overlay-transitions');
    } else {
      document.body.classList.remove('no-overlay-transitions');
    }
  };

  settingsManager.subscribe('overlay_transition', applyOverlayTransitionSetting);
  applyOverlayTransitionSetting();
}
