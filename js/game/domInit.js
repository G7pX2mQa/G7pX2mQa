import { settingsManager } from './settingsManager.js';
import { initPinnedCurrencies, initPinnedLevels } from '../ui/currencyPins.js';
import { RESOURCE_REGISTRY } from './offlinePanel.js';

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
        ${waterLayersHtml.trim()}
      </section>

      <nav class="hud-bottom ${uiHiddenClass}" id="hud-bottom">
        <button class="game-btn btn-help" data-btn="help"><span>Help</span></button>
        <button class="game-btn btn-shop" data-btn="shop"><span>Shop</span></button>
        <button class="game-btn btn-stats" data-btn="stats"><span>Stats &amp; Settings</span></button>
        <button class="game-btn btn-map" data-btn="map"><span>Map</span></button>
      </nav>
  `;

  document.body.appendChild(main);

  const applyCursorSetting = (showCursor) => {
    const playfield = document.querySelector('.playfield');
    if (playfield) {
      if (showCursor) {
        playfield.style.cursor = 'default';
      } else {
        playfield.style.cursor = '';
      }
    }
  };

  settingsManager.subscribe('show_cursor', applyCursorSetting);
  applyCursorSetting(settingsManager.get('show_cursor'));

  initPinnedCurrencies(document.getElementById('pinned-currencies-container'));
  // We use the same container for both currency and level pins because they share the same absolute positioning anchor in the HUD.
  initPinnedLevels(document.getElementById('pinned-currencies-container'));

  const xpConfig = RESOURCE_REGISTRY.find(c => c.key === 'xp');
  if (xpConfig) {
      const xpBar = document.getElementById('game-root').querySelector('.xp-bar');
      const xpFill = document.getElementById('game-root').querySelector('.xp-bar__fill');
      if (xpBar && xpConfig.bgGradient) xpBar.style.background = xpConfig.bgGradient;
      if (xpFill && xpConfig.fillGradient) xpFill.style.background = xpConfig.fillGradient;
  }

  const mpConfig = RESOURCE_REGISTRY.find(c => c.key === 'mp');
  if (mpConfig) {
      const mpBar = document.getElementById('game-root').querySelector('.mp-bar');
      const mpFill = document.getElementById('game-root').querySelector('.mp-bar__fill');
      if (mpBar && mpConfig.bgGradient) mpBar.style.background = mpConfig.bgGradient;
      if (mpFill && mpConfig.fillGradient) mpFill.style.background = mpConfig.fillGradient;
  }
}
