/**
 * Combo system — streak tracking, milestone events, multiplier.
 */
(function(V8) {
  'use strict';

  /** Handle correct answer: increment combo, check milestones. */
  function onCorrect(gameState) {
    gameState.combo++;
    gameState.maxCombo = Math.max(gameState.maxCombo, gameState.combo);
    V8.sfx.ok();

    // Milestone triggers
    const tier = gameState.combo >= 15 ? 3 : gameState.combo >= 10 ? 2 : gameState.combo >= 5 ? 1 : 0;
    const prevTier = gameState.combo - 1 >= 15 ? 3 : gameState.combo - 1 >= 10 ? 2 : gameState.combo - 1 >= 5 ? 1 : 0;

    // The player changes form at five consecutive answers.  Keep this
    // effect tied to the threshold crossing so it can fire again after a
    // later miss resets the combo and the next evolution is earned.
    if (gameState.combo === 5 && V8.qtEvolutionBombFX) {
      V8.qtEvolutionBombFX(document.getElementById('char'), gameState);
    }

    if (tier > prevTier) {
      V8.bus.emit('combo:tierUp', { tier, count: gameState.combo, prev: prevTier });
    }

    // Every 5 combo: milestone burst
    if (gameState.combo % 5 === 0) {
      V8.sfx.combo_tier(gameState.combo / 5);
      const color = gameState.combo >= 15 ? '#ffd700' : gameState.combo >= 10 ? '#ff4d6d' : '#ff7b3c';
      V8.bigText(gameState.combo + ' COMBO!!', color);
      V8.burstFX(V8.render.R.w / 2, V8.render.R.h * .45);
      V8.coinBurst(V8.render.R.w * (.2 + Math.random() * .6), V8.render.R.h * (.25 + Math.random() * .3), 1.5);
      V8.bus.emit('combo:milestone', { count: gameState.combo, tier });
    }

    // Knight bubble messages
    if (gameState.combo === 5 || gameState.combo === 10 || gameState.combo === 15) {
      const ch = document.getElementById('char');
      if (ch) {
        const r = ch.getBoundingClientRect();
        const b = document.createElement('div'); b.className = 'kbubble';
        b.textContent = gameState.combo === 5 ? '热身完毕' : gameState.combo === 10 ? '还有谁?' : '🖤已黑化';
        b.style.left = Math.max(4, r.left - 8) + 'px'; b.style.top = (r.top - 40) + 'px';
        document.body.appendChild(b); setTimeout(() => b.remove(), 1250);
      }
    }

    // Dark awakening at 15
    if (gameState.combo === 15) {
      V8.bigText('⚡ 黑化觉醒!!', '#ff3355');
      V8.burstFX(V8.render.R.w * .17, V8.render.R.h * .6);
    }
  }

  /** Handle wrong answer: reset combo. */
  function onWrong(gameState) {
    gameState.combo = 0;
  }

  /** Speed multiplier from combo + progress. */
  function calcSpeed(gameState) {
    return Math.min(1.6, 1 + gameState.done * 0.0022 + gameState.combo * 0.02);
  }

  /** Update HUD combo display. */
  function updateUI(gameState) {
    const cl = document.getElementById('comboLine');
    if (!cl) return;
    if (gameState.combo >= 2) {
      cl.textContent = '🔥 COMBO ×' + gameState.combo;
      cl.className = 'combo-line on' + (gameState.combo >= 15 ? ' t3' : gameState.combo >= 10 ? ' t2' : gameState.combo >= 5 ? ' t1' : '');
    } else {
      cl.className = 'combo-line';
    }
  }

  V8.combo = { onCorrect, onWrong, calcSpeed, updateUI };
})(window.V8 = window.V8 || {});
