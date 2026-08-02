/**
 * HP system — health points with heart UI.
 * Default 3HP, hardcore mode = 1HP.
 * Lose 1HP on wrong answer, regain 1HP every 5-combo milestone.
 */
(function(V8) {
  'use strict';

  const MAX_HP = 3;

  /** Apply damage. Returns true if still alive. */
  function takeDamage(gameState) {
    gameState.hp = Math.max(0, gameState.hp - 1);
    gameState.mistakes++;
    V8.sfx.hp_loss();
    V8.bus.emit('hp:change', { current: gameState.hp, max: gameState.maxHp });

    // Visual: heart shatter particle, screen flash
    const ch = document.getElementById('char');
    if (ch) {
      ch.style.filter = 'brightness(2) saturate(0)';
      setTimeout(() => { ch.style.filter = ''; }, 200);
    }

    updateHPUI(gameState);
    return gameState.hp > 0;
  }

  /** Regain HP at combo milestone. */
  function regainHP(gameState) {
    if (gameState.hp < gameState.maxHp) {
      gameState.hp = Math.min(gameState.maxHp, gameState.hp + 1);
      V8.bus.emit('hp:change', { current: gameState.hp, max: gameState.maxHp });
      V8.sfx.bonus(1);
      V8.floatText('+❤️', '#ff6666', '18%');
      updateHPUI(gameState);
    }
  }

  /** Render heart UI in HUD. */
  function updateHPUI(gameState) {
    const container = document.getElementById('hpDisplay');
    if (!container) return;
    let html = '';
    for (let i = 0; i < gameState.maxHp; i++) {
      html += i < gameState.hp ? '❤️' : '🖤';
    }
    container.innerHTML = html;
  }

  /** Initialize HP display element. */
  function createHPUI(maxHp) {
    const hud = document.getElementById('hud');
    if (!hud) return;
    let hp = document.getElementById('hpDisplay');
    if (!hp) {
      hp = document.createElement('div');
      hp.id = 'hpDisplay';
      hp.style.cssText = 'font-size:18px;letter-spacing:4px;min-width:80px;text-align:center';
      const left = hud.querySelector('.hud-left');
      if (left) left.appendChild(hp);
      else hud.appendChild(hp);
    }
  }

  V8.hp = { takeDamage, regainHP, updateHPUI, createHPUI, MAX_HP };
})(window.V8 = window.V8 || {});
