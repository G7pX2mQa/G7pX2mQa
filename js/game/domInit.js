export function ensureGameDom() {
  if (document.getElementById('game-root')) return;

  const main = document.createElement('main');
  main.id = 'game-root';
  main.className = 'area area-cove';
  main.hidden = true;

  main.innerHTML = `
      <div class="hud-top">
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

        <canvas id="water-background" class="water-base" style="position: absolute; top: 0; left: 0; width: 100%; height: 18%; pointer-events: none; z-index: 1;"></canvas>
        <div class="coins-layer" id="coins-layer"></div>
        <canvas id="water-effects" style="position: absolute; top: 0; left: 0; width: 100%; height: 15%; pointer-events: none; z-index: 99;"></canvas>
      </section>

      <nav class="hud-bottom" id="hud-bottom">
        <button class="game-btn btn-help" data-btn="help"><span>Help</span></button>
        <button class="game-btn btn-shop" data-btn="shop"><span>Shop</span></button>
        <button class="game-btn btn-stats" data-btn="stats"><span>Stats &amp; Settings</span></button>
        <button class="game-btn btn-map" data-btn="map"><span>Map</span></button>
      </nav>
  `;

  document.body.appendChild(main);
}
