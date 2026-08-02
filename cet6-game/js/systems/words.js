/**
 * Words system — word management, answer checking, level progression.
 */
(function(V8) {
  'use strict';

  const { LV_DEF, SIGN_DIR, CHAR_MODE, WORDS_PER_LEVEL, WORLD_ROTATION, WORLDS } = V8.CFG;
  const RENDER = V8.render;

  /** Get the currently active word from the game state. */
  function currentWord(gameState) {
    const words = gameState.words || [];
    const sequence = gameState.sequence && gameState.sequence.length === words.length
      ? gameState.sequence : words.map((_, index) => index);
    const position = gameState.dir === 1 ? gameState.idx : words.length - 1 - gameState.idx;
    return words[sequence[position]];
  }

  /** Check if answer is correct. Returns { correct, bonus }. */
  function checkAnswer(answer, word, mode) {
    if (mode === 0) {
      // 汉译英: exact match (case-insensitive)
      const correct = answer.toLowerCase() === word.e.toLowerCase();
      return { correct, bonus: 0 };
    } else {
      // 英译汉: substring/contains match
      const a = answer.replace(/\s/g, '');
      let mc = 0;
      for (let c of word.c) {
        const cl = c.replace(/[,，\s]/g, '');
        if (a === cl || a.includes(cl) || cl.includes(a)) mc++;
      }
      const correct = mc >= 1;
      return { correct, bonus: correct && mc >= 2 ? mc : 0 };
    }
  }

  /** Change the visual skin without changing the quiz level or direction. */
  function switchWorld(gameState, nextPhase, announce) {
    const next = WORLDS[nextPhase];
    if (!next || !gameState || gameState.phase === nextPhase || gameState.over || !gameState.started) return false;
    const oldPhase = gameState.phase;
    const oldSky = RENDER.R.palSky.map(c => c.slice());
    const oldRoad = RENDER.R.palRoad.slice();

    gameState.phase = nextPhase;
    RENDER.initWorldStructs(nextPhase);
    RENDER.R.terrMix = { from: oldPhase, to: nextPhase, t0: performance.now(), t: 0 };
    RENDER.R.palFrom = { sky: oldSky, road: oldRoad };
    RENDER.R.palTo = { sky: RENDER.copySky(next), road: next.road.slice() };
    RENDER.R.palT = 0;
    RENDER.R.paling = true;
    RENDER.R.flashA = .5;
    if (announce !== false) {
      V8.bigText(next.icon + ' ' + next.name, '#7df9ff');
      // A world-only gate masks the plugin reset and palette handoff without
      // using the menu route lock. The final-word completion path returns
      // before this function, so victory remains visually uninterrupted.
      if (V8.ui && typeof V8.ui.showWorldTransition === 'function') {
        V8.ui.showWorldTransition(oldPhase, nextPhase, gameState);
      } else {
        V8.sfx.ui();
      }
    }
    // Keep music matched to the visible world. The BGM manager waits until
    // the buffered target can play, then crossfades without a silent gap.
    V8.bgm.switchTrack(nextPhase);
    return true;
  }

  /** Advance to next word or trigger level complete. */
  function advance(gameState) {
    gameState.idx++;
    if (gameState.idx >= (gameState.words || []).length) {
      gameState.lock = true;
      V8.bus.emit('level:complete', { level: gameState.windowIndex, challengeId: gameState.challengeId });
      return true; // level complete
    }

    // Every 10 words: random world switch with palette lerp. The five bonus
    // worlds use optional plugins and coexist with the original four skins.
    if (gameState.done % 10 === 0) {
      const pool = WORLD_ROTATION && WORLD_ROTATION.length ? WORLD_ROTATION : WORLDS.map((world, index) => index);
      const candidates = pool.filter(phase => phase !== gameState.phase && WORLDS[phase]);
      if (candidates.length) {
        const next = candidates[Math.floor(Math.random() * candidates.length)];
        switchWorld(gameState, next);
      }
    }
    return false; // not done yet
  }

  /** Phase warp: level transition (world change with flight). */
  function phaseWarp(gameState) {
    gameState.lock = true;
    const np = (gameState.phase + 1) % WORLDS.length;
    V8.sfx.riser();
    RENDER.R.warp = true;
    gameState.sceneSpd = 3.4;
    RENDER.R.palFrom = { sky: RENDER.R.palSky.map(c => c.slice()), road: RENDER.R.palRoad.slice() };
    RENDER.R.palTo = { sky: RENDER.copySky(V8.CFG.WORLDS[np]), road: V8.CFG.WORLDS[np].road.slice() };
    RENDER.R.palT = 0; RENDER.R.paling = true;
    V8.ringFX('rgb(255,255,255)'); V8.ringFX('rgb(255,215,0)');

    // Title card
    const tc = document.createElement('div'); tc.className = 'title-card';
    const rule = (LV_DEF[np] && LV_DEF[np].subtitle) || '世界皮肤切换 · 继续前进';
    tc.innerHTML = `<div class="tc-inner"><div class="tc-phase">WORLD ${np + 1}</div><div class="tc-name">${V8.CFG.WORLDS[np].icon} ${V8.CFG.WORLDS[np].name}</div><div class="tc-rule">${rule}</div></div>`;
    document.body.appendChild(tc); setTimeout(() => tc.remove(), 1600);

    setTimeout(() => {
      const op = gameState.phase;
      gameState.phase = np; gameState.idx = 0;
      RENDER.initWorldStructs(np); RENDER.R.flashA = .5;
      RENDER.R.terrMix = { from: op, to: np, t0: performance.now(), t: 0 };
      V8.burstFX(RENDER.R.w / 2, RENDER.R.h * .42);
      V8.player.startFlight(gameState, document.getElementById('char'));
    }, 720);

    setTimeout(() => {
      RENDER.R.warp = false; gameState.sceneSpd = 1; gameState.lock = false;
      gameState.idx = 0;
    }, 1550);
  }

  /** Display next word on the sign. */
  function displayNextWord(gameState) {
    const w = currentWord(gameState);
    const sg = document.getElementById('sign');
    document.getElementById('signDir').textContent = gameState.mode === 0 ? '汉 → 英' : '英 → 汉';
    document.getElementById('promptWord').textContent = (gameState.mode === 0 ? w.c.join('；') : w.e) + (gameState.dir === 1 ? ' ' + w.p : '');
    if (sg) { sg.classList.remove('pop'); void sg.offsetWidth; sg.classList.add('pop'); }

    // FINAL word golden sign
    const isFinal = (gameState.idx === (gameState.words || []).length - 1);
    if (sg) sg.classList.toggle('final', isFinal);
    if (isFinal && !gameState._finalShown) { gameState._finalShown = true; V8.bigText('FINAL WORD', '#ffd700'); V8.sfx.gem(); }

    document.getElementById('answerIn').value = '';
    renderSlots(gameState);
  }

  /** Render letter count slots for 汉译英 mode. */
  function renderSlots(gameState) {
    const sh = document.getElementById('slotHint');
    if (!sh) return;
    sh.innerHTML = '';
    if (gameState.mode === 1) return; // no slots for 英译汉
    const n = currentWord(gameState).e.length;
    for (let i = 0; i < n; i++) { const s = document.createElement('span'); s.className = 'slot'; sh.appendChild(s); }
  }

  /** Update filled slot count. */
  function updateSlots() {
    const sh = document.getElementById('slotHint');
    if (!sh || !sh.children.length) return;
    const n = (document.getElementById('answerIn').value || '').trim().length;
    for (let i = 0; i < sh.children.length; i++) sh.children[i].classList.toggle('f', i < n);
  }

  /** Burst slots on correct answer. */
  function burstSlots() {
    const sh = document.getElementById('slotHint');
    if (!sh || !sh.children.length) return;
    const r = sh.getBoundingClientRect();
    const cl = sh.cloneNode(true);
    cl.removeAttribute('id');
    cl.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;margin:0;z-index:48`;
    [...cl.children].forEach((s, i) => { s.style.animationDelay = (i * 35) + 'ms'; s.classList.add('burst'); });
    document.body.appendChild(cl);
    setTimeout(() => cl.remove(), 950);
  }

  V8.words = {
    currentWord, checkAnswer, advance, switchWorld, phaseWarp,
    displayNextWord, renderSlots, updateSlots, burstSlots,
  };
})(window.V8 = window.V8 || {});
