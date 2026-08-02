/** Dragon companion system — preserves the historical V8.brick API. */
(function(V8) {
  'use strict';

  const DRAGON = V8.ASSETS.dragon;
  // Keep the particle count and trajectories stable while making each core more visible.
  // Sword form applies its existing parent scales in main.css after this value is set.
  const DRAGON_PARTICLE_DIAMETER_SCALE = 3;
  const DRAGON_RUSH_DURATION = 1400;
  const SWORD_RUSH_DURATION = 1050;
  let transformTimer = 0;
  let bumpTimer = 0;
  let rushTimer = 0;
  let rushEndTimer = 0;
  let rushToken = 0;
  let rushState = null;
  let rushRunId = null;
  let rushPhase = null;
  let reduceMotionQuery = null;

  try {
    if (window.matchMedia) reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  } catch (_) {}

  function ensureFlightRig(host) {
    let rig = Array.from(host.children).find((child) => child.classList.contains('dragon-flight-rig'));
    if (!rig) {
      rig = document.createElement('span');
      rig.className = 'dragon-flight-rig';
      rig.setAttribute('aria-hidden', 'true');
      host.appendChild(rig);
    }

    const effectClasses = ['dragon-companion', 'dragon-aura', 'dragon-trail', 'dragon-magic', 'dragon-wake'];
    Array.from(host.children).forEach((child) => {
      if (child !== rig && effectClasses.some((className) => child.classList.contains(className))) {
        rig.appendChild(child);
      }
    });
    return rig;
  }

  function ensureEffects(host) {
    if (!host) return null;
    const rig = ensureFlightRig(host);

    if (!rig.querySelector('.dragon-wake')) {
      const wake = document.createElement('span');
      wake.className = 'dragon-wake';
      wake.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 7; i++) {
        const streak = document.createElement('i');
        streak.style.setProperty('--wake-y', (12 + i * 11) + '%');
        streak.style.setProperty('--wake-width', (48 + (i % 4) * 13) + '%');
        streak.style.setProperty('--wake-delay', (-(i * 137)) + 'ms');
        wake.appendChild(streak);
      }
      rig.insertBefore(wake, rig.firstChild);
    }

    if (!rig.querySelector('.dragon-aura')) {
      const aura = document.createElement('span');
      aura.className = 'dragon-aura';
      aura.setAttribute('aria-hidden', 'true');
      rig.insertBefore(aura, rig.firstChild);
    }

    if (!rig.querySelector('.dragon-trail')) {
      const trail = document.createElement('span');
      trail.className = 'dragon-trail';
      trail.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 30; i++) {
        const particle = document.createElement('i');
        particle.style.left = (18 + ((i * 29) % 49)) + '%';
        particle.style.top = (14 + ((i * 41) % 70)) + '%';
        particle.style.setProperty('--particle-dx', (-76 - (i % 7) * 18) + 'px');
        particle.style.setProperty('--particle-dy', (-40 + ((i * 17) % 82)) + 'px');
        particle.style.setProperty('--particle-delay', (-(i * 53)) + 'ms');
        particle.style.setProperty('--particle-duration', (.92 + (i % 6) * .11) + 's');
        particle.style.setProperty('--particle-size', ((2 + (i % 5) * .7) * DRAGON_PARTICLE_DIAMETER_SCALE) + 'px');
        trail.appendChild(particle);
      }
      rig.appendChild(trail);
    }

    if (!rig.querySelector('.dragon-magic')) {
      const magic = document.createElement('span');
      magic.className = 'dragon-magic';
      magic.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 38; i++) {
        const particle = document.createElement('i');
        particle.style.left = (5 + ((i * 37) % 91)) + '%';
        particle.style.top = (15 + ((i * 43) % 68)) + '%';
        particle.style.setProperty('--magic-dx', (-30 + ((i * 23) % 63)) + 'px');
        particle.style.setProperty('--magic-dy', (-34 - (i % 7) * 10) + 'px');
        particle.style.setProperty('--magic-delay', (-(i * 71)) + 'ms');
        particle.style.setProperty('--magic-duration', (1.22 + (i % 7) * .1) + 's');
        particle.style.setProperty('--magic-size', ((1.7 + (i % 5) * .64) * DRAGON_PARTICLE_DIAMETER_SCALE) + 'px');
        particle.style.setProperty('--magic-turn', ((i % 2 ? -1 : 1) * (80 + (i % 4) * 35)) + 'deg');
        magic.appendChild(particle);
      }
      rig.appendChild(magic);
    }
    return rig;
  }

  function prefersReducedMotion() {
    return Boolean(reduceMotionQuery && reduceMotionQuery.matches);
  }

  function clearRushClasses(host) {
    if (host) host.classList.remove('dragon-rush', 'sword-rush');
  }

  /** Invalidate every queued rush callback before clearing its visual state. */
  function cancelAmbientRush(host, forgetRun) {
    rushToken++;
    clearTimeout(rushTimer);
    clearTimeout(rushEndTimer);
    rushTimer = 0;
    rushEndTimer = 0;
    clearRushClasses(host);
    if (forgetRun) {
      rushState = null;
      rushRunId = null;
      rushPhase = null;
    }
  }

  function isCurrentRushRun(gameState, runId, phase) {
    return Boolean(gameState) && V8._gameState === gameState &&
      gameState.runId === runId && gameState.phase === phase;
  }

  function rushIsBlocked(host, gameState) {
    return !host || !gameState || V8._gameState !== gameState ||
      !gameState.started || gameState.over || gameState.lock || gameState.rdy ||
      gameState.dead || gameState.warn || document.hidden || prefersReducedMotion() ||
      document.body.classList.contains('route-transitioning') ||
      host.classList.contains('bump') || host.classList.contains('danger') ||
      host.dataset.swordTransforming === '1' ||
      host.dataset.form === 'turning' || host.dataset.form === 'blade-transform' ||
      host.dataset.form === 'danger' || Number(host.dataset.overrideUntil) > performance.now();
  }

  function randomRushDelay(blade) {
    // The blade darts a little more often without turning the effect into noise.
    return blade ? 6000 + Math.random() * 3000 : 7000 + Math.random() * 4000;
  }

  function armAmbientRush(host, gameState) {
    if (rushTimer || rushEndTimer || rushIsBlocked(host, gameState)) return;
    const runId = gameState.runId;
    const phase = gameState.phase;
    const token = ++rushToken;
    const bladeAtSchedule = host.dataset.form === 'blade';

    rushTimer = setTimeout(() => {
      if (token !== rushToken) return;
      rushTimer = 0;
      if (!host.isConnected || !isCurrentRushRun(gameState, runId, phase) ||
          rushIsBlocked(host, gameState)) {
        clearRushClasses(host);
        return;
      }

      const blade = host.dataset.form === 'blade';
      const className = blade ? 'sword-rush' : 'dragon-rush';
      const duration = blade ? SWORD_RUSH_DURATION : DRAGON_RUSH_DURATION;
      clearRushClasses(host);
      // The host only exposes selector state; CSS moves .dragon-flight-rig.
      host.classList.add(className);

      rushEndTimer = setTimeout(() => {
        if (token !== rushToken) return;
        rushEndTimer = 0;
        clearRushClasses(host);
        if (isCurrentRushRun(gameState, runId, phase) && !rushIsBlocked(host, gameState)) {
          armAmbientRush(host, gameState);
        }
      }, duration);
    }, randomRushDelay(bladeAtSchedule));
  }

  /** Keep one rush scheduler bound to exactly one run and one visible world. */
  function syncAmbientRush(host, gameState) {
    const contextChanged = rushState !== gameState || rushRunId !== (gameState && gameState.runId) ||
      rushPhase !== (gameState && gameState.phase);
    if (contextChanged) {
      cancelAmbientRush(host, true);
      rushState = gameState;
      rushRunId = gameState && gameState.runId;
      rushPhase = gameState && gameState.phase;
    }
    if (rushIsBlocked(host, gameState)) {
      cancelAmbientRush(host, false);
      return;
    }
    armAmbientRush(host, gameState);
  }

  function clearSwordState(host) {
    clearTimeout(transformTimer);
    clearTimeout(bumpTimer);
    cancelAmbientRush(host, true);
    delete host.dataset.swordTransforming;
    delete host.dataset.swordReady;
    host.classList.remove('bump');
  }

  function cancelSwordTransformation(host) {
    clearTimeout(transformTimer);
    delete host.dataset.swordTransforming;
  }

  function startSwordTransformation(host, gameState) {
    clearTimeout(transformTimer);
    cancelAmbientRush(host, false);
    host.dataset.swordTransforming = '1';
    transformTimer = setTimeout(() => {
      if (!host.isConnected) return;
      delete host.dataset.swordTransforming;
      host.dataset.swordReady = '1';
      if (gameState && gameState.combo >= 15 && !gameState.dead && !gameState.warn) {
        setForm(host, 'blade', DRAGON.swordFly, '持续化剑飞行的暗龙伙伴');
      }
    }, 1100);
  }

  function setForm(host, form, src, label) {
    const image = host.querySelector('.dragon-companion');
    if (image && image.getAttribute('src') !== src) image.src = src;
    host.dataset.form = form;
    host.dataset.restSrc = src;
    host.setAttribute('aria-label', label);
  }

  /** Select a dragon animation instead of changing a symbol on a block. */
  function updateFace(gameState) {
    const bk = document.getElementById('brick');
    if (!bk) return;
    ensureEffects(bk);
    if (Number(bk.dataset.overrideUntil) > performance.now()) {
      syncAmbientRush(bk, gameState);
      return;
    }
    const swordActive = gameState.combo >= 15 && !gameState.dead && !gameState.warn;
    if (!swordActive && bk.dataset.swordTransforming) cancelSwordTransformation(bk);
    if (gameState.dead || gameState.warn) {
      setForm(bk, 'danger', DRAGON.darkFly, '警戒中的暗龙伙伴');
    } else if (gameState.combo >= 15) {
      if (bk.dataset.swordReady === '1') {
        setForm(bk, 'blade', DRAGON.swordFly, '持续化剑飞行的暗龙伙伴');
      } else if (bk.dataset.swordTransforming === '1') {
        setForm(bk, 'blade-transform', DRAGON.darkTurnSword, '首次化剑中的暗龙伙伴');
      } else {
        setForm(bk, 'blade-transform', DRAGON.darkTurnSword, '首次化剑中的暗龙伙伴');
        startSwordTransformation(bk, gameState);
      }
    } else if (gameState.combo >= 10) {
      setForm(bk, 'dark', DRAGON.darkFly, '觉醒的暗龙伙伴');
    } else if (gameState.combo >= 5) {
      setForm(bk, 'turning', DRAGON.turnDark, '正在觉醒的龙伙伴');
    } else {
      setForm(bk, gameState.sleepy ? 'sleepy' : 'gold', DRAGON.fly, gameState.sleepy ? '困倦的金龙伙伴' : '金龙伙伴');
    }
    bk.classList.toggle('sweat', gameState.warn && !gameState.dead);
    bk.classList.toggle('sleepy', gameState.sleepy && !gameState.warn && !gameState.dead);
    syncAmbientRush(bk, gameState);
  }

  /** Lunge on a correct answer; after the one-time transformation, keep the sword flight form. */
  function bump(gameState) {
    const bk = document.getElementById('brick');
    if (!bk) return;
    ensureEffects(bk);
    cancelAmbientRush(bk, false);
    clearTimeout(bumpTimer);
    bk.classList.remove('bump'); void bk.offsetWidth; bk.classList.add('bump');
    bumpTimer = setTimeout(() => {
      if (bk.isConnected) bk.classList.remove('bump');
    }, bk.dataset.form === 'blade' ? 620 : 480);
    if (gameState && gameState.combo >= 15 && bk.dataset.swordReady === '1') {
      setForm(bk, 'blade', DRAGON.swordFly, '持续化剑飞行的暗龙伙伴');
    }
  }

  /** Set brick to danger mode. */
  function danger() {
    const bk = document.getElementById('brick');
    if (bk) {
      cancelAmbientRush(bk, false);
      bk.classList.add('danger');
    }
  }

  /** Reset brick to default. */
  function reset() {
    const bk = document.getElementById('brick');
    if (!bk) return;
    ensureEffects(bk);
    clearSwordState(bk);
    delete bk.dataset.overrideUntil;
    bk.classList.remove('danger', 'bump', 'sweat', 'sleepy');
    setForm(bk, 'gold', DRAGON.fly, '金龙伙伴');
  }

  function onMotionPreferenceChange(event) {
    const bk = document.getElementById('brick');
    if (!bk) return;
    if (event.matches) cancelAmbientRush(bk, false);
    else if (V8._gameState) syncAmbientRush(bk, V8._gameState);
  }

  function onVisibilityChange() {
    const bk = document.getElementById('brick');
    if (!bk) return;
    if (document.hidden) cancelAmbientRush(bk, false);
    else if (V8._gameState) syncAmbientRush(bk, V8._gameState);
  }

  if (reduceMotionQuery) {
    if (typeof reduceMotionQuery.addEventListener === 'function') {
      reduceMotionQuery.addEventListener('change', onMotionPreferenceChange);
    } else if (typeof reduceMotionQuery.addListener === 'function') {
      reduceMotionQuery.addListener(onMotionPreferenceChange);
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange);

  V8.brick = { updateFace, bump, danger, reset };
})(window.V8 = window.V8 || {});
