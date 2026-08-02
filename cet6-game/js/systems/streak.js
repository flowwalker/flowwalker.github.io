/**
 * Timed streak effects — visual rewards for unusually fast correct answers.
 * The metric is the sum of countdown time consumed by each answered word,
 * not wall-clock time between answer submissions.
 * Gameplay owns continuity and calls reset() on wrong/timeout/quit/skip.
 */
(function(V8) {
  'use strict';

  const TIER_ONE_COUNT = 5;
  const TIER_ONE_SECONDS = 5;
  const TIER_TWO_COUNT = 10;
  const TIER_TWO_SECONDS = 10;
  const EPSILON = .0001;
  const PRISM_DURATION = 1550;
  const VORTEX_DURATION = 3200;

  let activeGameState = null;
  let correctDurations = [];
  let tierOneFired = false;
  let tierTwoFired = false;
  let generation = 0;
  let pendingReward = null;
  const effects = new Set();

  function callEffect(name) {
    if (typeof V8[name] !== 'function') return;
    const args = Array.prototype.slice.call(arguments, 1);
    V8[name].apply(V8, args);
  }

  function playSound(name) {
    if (!V8.sfx || typeof V8.sfx[name] !== 'function') return;
    try { V8.sfx[name](); } catch (e) {}
  }

  function playerCenter() {
    const player = document.getElementById('char');
    if (!player) {
      return { x: window.innerWidth * .17, y: window.innerHeight * .72, player: null };
    }
    const rect = player.getBoundingClientRect();
    return {
      x: rect.left + rect.width * .5,
      y: rect.top + rect.height * .48,
      player,
    };
  }

  function positionEffect(effect) {
    if (!effect.root || !effect.root.isConnected) return;
    const pos = playerCenter();
    effect.root.style.setProperty('--v8-streak-x', pos.x + 'px');
    effect.root.style.setProperty('--v8-streak-y', pos.y + 'px');
  }

  function removeEffect(effect) {
    if (!effect || !effects.has(effect)) return;
    effects.delete(effect);
    if (effect.timer) clearTimeout(effect.timer);
    if (effect.frame) cancelAnimationFrame(effect.frame);
    if (effect.player && effect.playerClass) {
      effect.player.classList.remove(effect.playerClass);
    }
    if (effect.root) effect.root.remove();
  }

  function followPlayer(effect) {
    if (!effects.has(effect)) return;
    positionEffect(effect);
    effect.frame = requestAnimationFrame(function() { followPlayer(effect); });
  }

  function mountEffect(root, duration, playerClass) {
    const pos = playerCenter();
    const effect = {
      root,
      player: pos.player,
      playerClass,
      frame: 0,
      timer: 0,
    };

    root.style.setProperty('--v8-streak-x', pos.x + 'px');
    root.style.setProperty('--v8-streak-y', pos.y + 'px');
    document.body.appendChild(root);
    if (effect.player && playerClass) effect.player.classList.add(playerClass);
    effects.add(effect);
    effect.timer = setTimeout(function() { removeEffect(effect); }, duration);
    followPlayer(effect);
    return effect;
  }

  function makeRoot(modifier) {
    const root = document.createElement('div');
    root.className = 'v8-streak-fx ' + modifier;
    root.setAttribute('aria-hidden', 'true');
    return root;
  }

  function addCallout(anchor, text, tier) {
    const label = document.createElement('div');
    label.className = 'v8-streak-callout v8-streak-callout--' + tier;
    label.textContent = text;
    anchor.appendChild(label);
  }

  function addPrismSparks(container) {
    const sparks = [
      [-82, -30, 0, '#ff5577'], [-114, 6, 80, '#ffbd3c'],
      [-56, 30, 160, '#fff07a'], [-142, -18, 240, '#58f0c7'],
      [-92, 45, 320, '#55c8ff'], [-164, 18, 400, '#a98bff'],
      [-42, -44, 480, '#ff70c6'], [-126, 39, 560, '#ffffff'],
    ];
    sparks.forEach(function(spec) {
      const spark = document.createElement('i');
      spark.className = 'v8-streak-prism-spark';
      spark.style.setProperty('--spark-x', spec[0] + 'px');
      spark.style.setProperty('--spark-y', spec[1] + 'px');
      spark.style.setProperty('--spark-delay', spec[2] + 'ms');
      spark.style.setProperty('--spark-color', spec[3]);
      container.appendChild(spark);
    });
  }

  function triggerPrismLift() {
    const root = makeRoot('v8-streak-fx--prism');
    const anchor = document.createElement('div');
    anchor.className = 'v8-streak-anchor v8-streak-prism-lift';

    const trail = document.createElement('div');
    trail.className = 'v8-streak-rainbow';
    for (let i = 0; i < 6; i++) {
      const ribbon = document.createElement('i');
      ribbon.className = 'v8-streak-ribbon';
      trail.appendChild(ribbon);
    }

    const halo = document.createElement('div');
    halo.className = 'v8-streak-prism-halo';
    const arc = document.createElement('div');
    arc.className = 'v8-streak-prism-arc';
    const sparks = document.createElement('div');
    sparks.className = 'v8-streak-prism-sparks';
    addPrismSparks(sparks);

    anchor.appendChild(trail);
    anchor.appendChild(halo);
    anchor.appendChild(arc);
    anchor.appendChild(sparks);
    addCallout(anchor, '5题累计≤5秒 · 彩虹腾空', 'prism');
    root.appendChild(anchor);
    mountEffect(root, PRISM_DURATION, 'v8-streak-airborne');

    const pos = playerCenter();
    callEffect('ringFX', 'rgb(88,240,199)', pos.x, pos.y);
    playSound('riser');
  }

  function addSpeedLines(container) {
    const lines = [
      [10, 24, 0], [17, 42, 130], [24, 31, 50], [32, 54, 180],
      [40, 27, 90], [49, 46, 220], [58, 36, 20], [67, 58, 150],
      [75, 30, 250], [83, 48, 70], [90, 25, 190],
    ];
    lines.forEach(function(spec) {
      const line = document.createElement('i');
      line.style.setProperty('--line-y', spec[0] + 'vh');
      line.style.setProperty('--line-w', spec[1] + 'vw');
      line.style.setProperty('--line-delay', spec[2] + 'ms');
      container.appendChild(line);
    });
  }

  function triggerVortexDrive() {
    // A tier-two reward supersedes the brief tier-one lift instead of stacking
    // two independent center-facing effects.
    clearEffects();
    const root = makeRoot('v8-streak-fx--vortex');
    const flash = document.createElement('div');
    flash.className = 'v8-streak-flash';
    const lines = document.createElement('div');
    lines.className = 'v8-streak-speed-lines';
    addSpeedLines(lines);

    const anchor = document.createElement('div');
    anchor.className = 'v8-streak-anchor v8-streak-vortex-lift';
    const dashTrail = document.createElement('div');
    dashTrail.className = 'v8-streak-dash-trail';
    for (let i = 0; i < 6; i++) {
      const ray = document.createElement('i');
      ray.style.setProperty('--dash-ray-delay', (i * 38) + 'ms');
      dashTrail.appendChild(ray);
    }
    const dashShock = document.createElement('div');
    dashShock.className = 'v8-streak-dash-shock';
    dashShock.appendChild(document.createElement('i'));
    dashShock.appendChild(document.createElement('i'));
    const vortex = document.createElement('div');
    vortex.className = 'v8-streak-vortex';
    for (let i = 0; i < 3; i++) {
      const ring = document.createElement('i');
      ring.className = 'v8-streak-vortex-ring';
      vortex.appendChild(ring);
    }
    const core = document.createElement('div');
    core.className = 'v8-streak-vortex-core';
    const pulse = document.createElement('div');
    pulse.className = 'v8-streak-vortex-pulse';

    anchor.appendChild(dashTrail);
    anchor.appendChild(dashShock);
    anchor.appendChild(vortex);
    anchor.appendChild(core);
    anchor.appendChild(pulse);
    addCallout(anchor, '10题累计≤10秒 · 时空冲刺', 'vortex');
    root.appendChild(flash);
    root.appendChild(lines);
    root.appendChild(anchor);
    mountEffect(root, VORTEX_DURATION, 'v8-streak-overdrive');

    const pos = playerCenter();
    callEffect('ringFX', 'rgb(125,249,255)', pos.x, pos.y);
    callEffect('ringFX', 'rgb(255,77,177)', pos.x, pos.y);
    callEffect('burstFX', pos.x, pos.y);
    playSound('vortex');
  }

  function clearEffects() {
    Array.from(effects).forEach(removeEffect);
    document.querySelectorAll('.v8-streak-fx').forEach(function(node) { node.remove(); });
    const player = document.getElementById('char');
    if (player) player.classList.remove('v8-streak-airborne', 'v8-streak-overdrive');
  }

  function reset() {
    generation++;
    correctDurations = [];
    tierOneFired = false;
    tierTwoFired = false;
    pendingReward = null;
    clearEffects();
  }

  function cleanup() {
    reset();
    activeGameState = null;
  }

  function init(gameState) {
    cleanup();
    activeGameState = gameState || null;
  }

  function sumLast(count) {
    return correctDurations.slice(-count).reduce(function(total, seconds) {
      return total + seconds;
    }, 0);
  }

  function triggerTier(tier) {
    if (tier === 2) triggerVortexDrive();
    else if (tier === 1) triggerPrismLift();
  }

  function durationForTier(tier) {
    return tier === 2 ? VORTEX_DURATION : tier === 1 ? PRISM_DURATION : 0;
  }

  /**
   * Mount after the answer callback has finished. The same callback can start
   * a world shift at word 10, so this short deferral lets the transition claim
   * the screen first and preserves the reward for a full replay afterwards.
   */
  function scheduleReward(tier, gameState) {
    const runId = gameState.runId;
    const token = generation;
    const run = function() {
      if (token !== generation || activeGameState !== gameState || gameState.runId !== runId ||
          !gameState.started || gameState.over || gameState.dead) return;
      if (gameState._worldShiftLock) {
        pendingReward = { tier, gameState, runId, generation: token };
        return;
      }
      triggerTier(tier);
    };
    if (typeof queueMicrotask === 'function') queueMicrotask(run);
    else Promise.resolve().then(run);
  }

  function flushPendingReward(payload) {
    const pending = pendingReward;
    if (!pending || !payload || payload.gameState !== pending.gameState || payload.runId !== pending.runId) return;
    pendingReward = null;
    if (pending.generation !== generation || activeGameState !== pending.gameState ||
        pending.gameState.runId !== pending.runId || !pending.gameState.started ||
        pending.gameState.over || pending.gameState.dead || pending.gameState._worldShiftLock) return;
    triggerTier(pending.tier);
  }

  function cancelPendingReward(payload) {
    if (!pendingReward) return;
    if (!payload || (payload.gameState === pendingReward.gameState && payload.runId === pendingReward.runId)) {
      pendingReward = null;
    }
  }

  function recordCorrect(gameState, elapsedSeconds) {
    if (!gameState) return 0;
    if (activeGameState !== gameState) init(gameState);
    if (gameState.over || gameState.dead || !gameState.started) return 0;

    let duration = Number(elapsedSeconds);
    if (!Number.isFinite(duration)) {
      duration = V8.CFG.TIME_LIMIT - Number(gameState.timeLeft);
    }
    duration = Math.max(0, Math.min(V8.CFG.TIME_LIMIT, Number.isFinite(duration) ? duration : 0));
    correctDurations.push(duration);
    if (correctDurations.length > TIER_TWO_COUNT) correctDurations.shift();

    const tenReady = correctDurations.length >= TIER_TWO_COUNT &&
      sumLast(TIER_TWO_COUNT) <= TIER_TWO_SECONDS + EPSILON;
    const fiveReady = correctDurations.length >= TIER_ONE_COUNT &&
      sumLast(TIER_ONE_COUNT) <= TIER_ONE_SECONDS + EPSILON;
    const completesLevel = gameState.done + 1 >= (gameState.words || []).length;

    // Tier two wins if both thresholds first become true on the same answer.
    if (!tierTwoFired && tenReady) {
      tierTwoFired = true;
      tierOneFired = true;
      if (completesLevel) triggerTier(2);
      else scheduleReward(2, gameState);
      return 2;
    }
    if (!tierOneFired && fiveReady) {
      tierOneFired = true;
      if (completesLevel) triggerTier(1);
      else scheduleReward(1, gameState);
      return 1;
    }
    return 0;
  }

  if (V8.bus) {
    V8.bus.on('world:shift:end', flushPendingReward);
    V8.bus.on('world:shift:cancel', cancelPendingReward);
  }

  V8.streak = { init, recordCorrect, reset, cleanup, durationForTier };
})(window.V8 = window.V8 || {});
