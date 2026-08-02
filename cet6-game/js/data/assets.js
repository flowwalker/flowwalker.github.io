/** Qt-Gaming assets verified against the current C++ runtime paths. */
(function(V8) {
  'use strict';

  // Resolve from this script rather than from the host HTML. The shared
  // engine is used both by templates/game_v8/ and sibling dayN/ pages.
  const scriptURL = document.currentScript && document.currentScript.src;
  const ASSET_ROOT = scriptURL ? new URL('../../assets/', scriptURL).href : 'assets/';
  const ROOT = ASSET_ROOT + 'qt/';
  V8.ASSETS = Object.freeze({
    player: Object.freeze({
      idle: ROOT + 'player-idle.webp',
      run: ROOT + 'player-run.webp',
      enhancedIdle: ROOT + 'player-enhanced-idle.webp',
      enhancedRun: ROOT + 'player-enhanced-run.webp',
    }),
    pet: Object.freeze({
      idle: ROOT + 'pet-idle.webp',
      run: ROOT + 'pet-run.webp',
    }),
    effects: Object.freeze({
      fireHit: ROOT + 'fire-hit.webp',
      bomb: ROOT + 'bomb.webp',
      flyFireRight: ROOT + 'fly-fire-right.webp',
      flyFireLeftDown: ROOT + 'fly-fire-left-down.webp',
    }),
    dragon: Object.freeze({
      fly: ASSET_ROOT + 'dragon/dragon_fly.gif',
      turnDark: ASSET_ROOT + 'dragon/dragon_turn_dark.gif',
      darkFly: ASSET_ROOT + 'dragon/dragon_dark_fly.gif',
      darkTurnSword: ASSET_ROOT + 'dragon/dragon_dark_turn_sword.gif',
      swordFly: ASSET_ROOT + 'dragon/soword_fly.gif',
    }),
  });
})(window.V8 = window.V8 || {});
