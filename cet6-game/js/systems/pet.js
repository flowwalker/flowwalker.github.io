/**
 * Pet system — companion that follows player, evolves with combos.
 * Inspired by Qt-Gaming's Pet class (idle/run states, follow distance, reset).
 */
(function(V8) {
  'use strict';

  const EVOLUTIONS = [
    { name: '灵猫', comboReq: 0 },
    { name: '灵猫·共鸣', comboReq: 5 },
    { name: '灵猫·觉醒', comboReq: 15 },
  ];

  let petEl = null;
  let petState = { evo: 0, mood: 'idle', x: null, y: null, asset: '' };

  function setAsset(name) {
    if (!petEl || !V8.ASSETS || !V8.ASSETS.pet) return;
    if (petState.asset === name && petEl.getAttribute('src')) return;
    petState.asset = name;
    petEl.src = V8.ASSETS.pet[name];
  }

  function init() {
    if (petEl) { petEl.remove(); petEl = null; }
    petState = { evo: 0, mood: 'idle', x: null, y: null, asset: '' };
    petEl = document.createElement('img');
    petEl.className = 'pet';
    petEl.id = 'pet';
    petEl.alt = '';
    petEl.setAttribute('aria-hidden', 'true');
    setAsset('idle');
    document.body.appendChild(petEl);
  }

  function destroy() {
    if (petEl) { petEl.remove(); petEl = null; }
    petState = { evo: 0, mood: 'idle', x: null, y: null, asset: '' };
  }

  /** Update pet position and animation each frame. */
  function update(gameState, playerEl) {
    if (!petEl || !playerEl) return;
    if (!gameState.started || gameState.over) { petEl.style.opacity = '0'; return; }
    petEl.style.opacity = '1';

    // Determine evolution level from combo
    let newEvo = 0;
    if (gameState.combo >= 15) newEvo = 2;
    else if (gameState.combo >= 5) newEvo = 1;

    // Evolution transition
    if (newEvo !== petState.evo) {
      petState.evo = newEvo;
      if (newEvo > 0) V8.sfx.evolve();
    }

    // Determine mood
    if (gameState.dead) petState.mood = 'scared';
    else if (gameState.combo >= 5) petState.mood = 'happy';
    else if (gameState.warn) petState.mood = 'scared';
    else petState.mood = 'idle';

    // Position: follow player's feet
    const pr = playerEl.getBoundingClientRect();
    const happyOrbit = petState.mood === 'happy' ? Math.sin(Date.now() * .008) * 18 : 0;
    const targetX = pr.left - 48 + happyOrbit;
    const targetY = pr.bottom - 46;

    if (petState.x === null) { petState.x = targetX; petState.y = targetY; }
    const distance = Math.hypot(targetX - petState.x, targetY - petState.y);
    setAsset(distance > 2.5 ? 'run' : 'idle');

    // Smooth follow with spring physics
    petState.x += (targetX - petState.x) * 0.1;
    petState.y += (targetY - petState.y) * 0.1;

    // Bob animation for happy mood
    const bob = petState.mood === 'happy' ? Math.abs(Math.sin(Date.now() * .006)) * 10 : 0;

    petEl.style.left = petState.x + 'px';
    petEl.style.top = (petState.y - bob) + 'px';
    petEl.style.transform = distance > 2.5 ? 'scaleX(1)' : 'scaleX(1)';

    // Visual tweaks
    if (petState.mood === 'scared') {
      petEl.className = 'pet scared';
    } else if (petState.mood === 'happy') {
      petEl.className = 'pet happy';
    } else {
      petEl.className = 'pet';
    }
  }

  V8.pet = { init, destroy, update, EVOLUTIONS };
})(window.V8 = window.V8 || {});
