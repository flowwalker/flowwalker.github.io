/**
 * Main entry — boot sequence, game loop, event wiring.
 */
(function(V8) {
  'use strict';

  const { LV_DEF, WORDS_PER_LEVEL, TIME_LIMIT, WORLDS, charModeFor } = V8.CFG;
  const $ = id => document.getElementById(id);

  // ── Game state (single source of truth) ────────────────
  function createGameState() {
    return {
      // Level config
      level: 0,
      windowIndex: 0,
      challengeId: 'en-forward',
      order: 'normal',
      selection: null,
      phase: 0,
      idx: 0,
      mode: 1,    // 0=汉译英, 1=英译汉
      dir: 1,     // 1=正序, -1=逆序
      words: [],
      // Progress
      done: 0,
      score: 100,
      combo: 0,
      maxCombo: 0,
      mistakes: 0,
      // HP (Qt-Gaming inspired)
      hp: 3,
      maxHp: 3,
      // Status flags
      over: false,
      lock: false,
      started: false,
      dead: false,
      warn: false,
      rdy: false,
      sleepy: false,
      // Timer
      timeLeft: TIME_LIMIT,
      lastTick: 0,
      // Motion
      spd: 1,
      sceneSpd: 1,
      slowmo: false,
      jumping: false,
      flying: false,
      gstate: 'ground',
      airborne: false,
      airB: 0,
      landN: 0,
      dashT0: 0,
      dashDist: 0,
      dashX: 0,
      dashY: 0,
      // Misc
      lastAct: performance.now(),
      runId: 1,
      dbg: false,
      dbgTainted: false,
      _finalShown: false,
      _timerFrozen: false,
      _timerExpired: false,
      _freezeUntil: 0,
      _cancelFreeze: null,
      // Timer handles
      _charT: null, _dustT: null, _ufoT: null, _ambT: null, _canT: null, _critT: null,
    };
  }

  let GS = createGameState();
  V8._gameState = GS;

  // ── Run-token helpers ──────────────────────────────────
  // Every delayed gameplay callback belongs to the run that scheduled it.
  // A menu exit invalidates that run before the transition starts, so a late
  // animation cannot mutate the next menu/run.
  function isCurrentRun(gameState, runId) {
    return Boolean(gameState) && V8._gameState === gameState && gameState.runId === runId;
  }

  function later(fn, ms, gameState) {
    const state = gameState || GS;
    const id = state.runId;
    return setTimeout(() => {
      if (isCurrentRun(state, id)) fn(state);
    }, ms);
  }

  /** Stop gameplay schedulers while preserving runId for result animations. */
  V8._stopRunLoops = function(gameState, options) {
    const state = gameState || GS;
    if (!state || V8._gameState !== state) return false;
    options = options || {};

    clearTimeout(state._charT); clearTimeout(state._dustT);
    clearTimeout(state._ufoT); clearTimeout(state._ambT);
    clearTimeout(state._canT); clearTimeout(state._critT);
    clearTimeout(state._readyGoT); clearTimeout(state._readyDoneT);
    state._charT = state._dustT = state._ufoT = state._ambT = state._canT = state._critT = null;
    state._readyGoT = state._readyDoneT = null;
    if (typeof state._cancelFreeze === 'function') state._cancelFreeze();
    state._cancelFreeze = null;

    if (V8.timer) V8.timer.stop();
    if (V8.entities) V8.entities.clearAll();
    if (V8.streak && !options.preserveStreak) V8.streak.cleanup();
    const R = V8.render && V8.render.R;
    if (R) {
      (R.cans || []).forEach(item => item.el && item.el.remove());
      (R.critters || []).forEach(item => item.el && item.el.remove());
      R.cans = []; R.critters = [];
    }
    document.querySelectorAll('.ufo,.beam,.cow,.can,.critter').forEach(node => node.remove());
    if (V8.ui && V8.ui.setInputEnabled) V8.ui.setInputEnabled(false);
    return true;
  };

  /** Stop a run without showing an answer/death screen before routing home. */
  V8._prepareQuit = function(gameState) {
    const state = gameState || GS;
    if (!state || V8._gameState !== state) return false;

    state.started = false;
    state.lock = true;
    state.over = true;
    state.dead = false;
    state.rdy = false;
    state.slowmo = false;
    state._timerFrozen = false;
    state._freezeUntil = 0;
    V8._stopRunLoops(state);
    // Invalidate all callbacks that captured the old token.
    state.runId = 'aborted-' + Date.now() + '-' + Math.random();
    if (V8.ui && V8.ui.setInputEnabled) V8.ui.setInputEnabled(false);
    return true;
  };

  /** Activate the full workbook pack without replacing the current page. */
  V8._activateWordPack = function(pack) {
    if (!pack || !Array.isArray(pack.words) || !pack.words.length) return false;
    if (GS.started && !GS.over) return false;
    if (GS.started) V8._prepareQuit(GS);
    if (V8.timer) V8.timer.stop();
    if (V8.entities) V8.entities.clearAll();
    if (V8.streak) V8.streak.cleanup();
    V8.WORD_PACK = pack;
    GS = createGameState();
    V8._gameState = GS;
    return true;
  };

  // ── Boot ───────────────────────────────────────────────
  function boot() {
    const pack = V8.WORD_PACK;
    document.title = '⭐ CET-6 单词跑酷 v13 · ' + pack.title;
    $('startSub').textContent = `${pack.title} · ${pack.words.length} 词 · 每关 ${WORDS_PER_LEVEL} 词`;
    V8.render.boot();
    V8.player.setChar('A');
    GS.muted = V8.storage.getSfxMuted();
    V8.SFX_MUTED = GS.muted;
    V8.ui.initMuteButtons();
    V8.ui.showStartScreen();

    // Night owl mode (23-5)
    const h = new Date().getHours();
    if (h >= 23 || h < 5) document.body.classList.add('nightowl');

    // Start render loop (always running for menu ambiance)
    requestAnimationFrame(frame);
  }

  // ── Start game (called by UI level button) ────────────
  V8._startGame = function(windowIndex, options) {
    options = options || {};
    const challenge = LV_DEF.find(item => item.id === options.challengeId) || LV_DEF[0];
    const fullWords = V8.WORD_PACK.words;
    const start = Math.max(0, Math.min(fullWords.length - 1, Number(options.startIndex ?? windowIndex * WORDS_PER_LEVEL) || 0));
    const end = Math.max(start + 1, Math.min(fullWords.length, Number(options.endIndex ?? start + WORDS_PER_LEVEL) || start + WORDS_PER_LEVEL));
    const selected = Array.isArray(options.words) && options.words.length ? options.words.slice() : fullWords.slice(start, end);
    if (!selected.length) return false;
    const deferReady = Boolean(options && options.deferReady);
    if (V8.timer) V8.timer.stop();
    if (V8.entities) V8.entities.clearAll();
    GS = createGameState();
    GS.level = Number(windowIndex) || 0;
    GS.windowIndex = Number(windowIndex) || 0;
    GS.challengeId = challenge.id;
    GS.order = challenge.order || 'normal';
    GS.selection = { startIndex: start, endIndex: end, challengeId: challenge.id, custom: Boolean(options.custom) };
    GS.words = selected;
    GS.sequence = selected.map((_, index) => index);
    if (GS.order === 'random') {
      for (let i = GS.sequence.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [GS.sequence[i], GS.sequence[j]] = [GS.sequence[j], GS.sequence[i]];
      }
    }
    GS.phase = Math.abs(GS.windowIndex + LV_DEF.indexOf(challenge)) % WORLDS.length;
    GS.mode = challenge.mode;
    GS.dir = challenge.dir;
    GS.runId = Math.random();
    GS.hp = V8.storage.getHardcore() ? 1 : 3;
    GS.maxHp = GS.hp;
    GS.muted = V8.SFX_MUTED;
    GS.started = true;
    GS.lastTick = performance.now();
    V8._gameState = GS;

    // Reset world
    const R = V8.render.R;
    R.ts = 1; R.warp = false; R.fw = 0; R.parts = []; R.rings = []; R.paling = false; R.flashA = 0; R.terrMix = null; R.goldT = 0;
    R.palSky = V8.render.copySky(WORLDS[GS.phase]); R.palRoad = WORLDS[GS.phase].road.slice();
    V8.render.initWorldStructs(GS.phase);

    // Reset UI
    V8.brick.reset();
    $('sign').classList.remove('final');
    $('distNum').classList.remove('mile');
    $('wordStage').style.opacity = '1';
    const ch = $('char');
    ch.className = 'char'; ch.dataset.mode = charModeFor(GS.phase); ch.style.filter = '';
    V8.player.charFrame = 0; V8.player.setChar('A');
    V8.player.syncAsset(GS);
    $('charInner').style.transform = '';

    // Clear environmental timers
    V8.entities.clearAll();

    // Init skills
    V8.skills.init();
    V8.streak.init(GS);
    $('skillBar').classList.remove('hidden');
    V8.hp.createHPUI(GS.maxHp);
    V8.pet.init();

    // Start systems
    V8.ui.updateHUD(GS);
    V8.ui.updateSpeed(GS);
    V8.bgm.switchTrack(GS.phase);
    V8.words.displayNextWord(GS);
    V8.player.startCharLoop(GS);
    V8.player.startDustLoop(GS);
    V8.timer.startTickLoop(GS);
    V8.entities.startUfoLoop(GS);
    V8.entities.startAmbientLoop(GS);
    V8.entities.startCanLoop(GS);
    V8.entities.startCritterLoop(GS);
    if (deferReady) {
      GS.rdy = true;
      V8.ui.setInputEnabled(false);
    } else {
      V8.ui.readySeq(GS);
    }
    return true;
  };

  // ── Reset run (rewind) ────────────────────────────────
  V8._resetRun = function() {
    const lv = GS.windowIndex;
    const selection = GS.selection || {};
    V8._startGame(lv, {
      challengeId: selection.challengeId || 'en-forward',
      startIndex: selection.startIndex,
      endIndex: selection.endIndex,
      custom: Boolean(selection.custom),
    });
  };

  // ── Game loop ──────────────────────────────────────────
  function frame(t) {
    requestAnimationFrame(frame);
    const R = V8.render.R;
    if (!R.lastT) R.lastT = t;
    const dt = Math.min(50, t - R.lastT);
    R.lastT = t;
    const k = dt / 16.7;

    // Speed smoothing
    R.ts += (R.tsT - R.ts) * .045 * k;

    if (GS.started && !GS.over) {
      V8.render.update(t, dt, k);
      V8.entities.updateCans(k, GS);
      V8.entities.updateCritters(k);

      // Player-ground sync
      const res = V8.render.syncCharToGround(t, $('char'), charModeFor(GS.phase), GS.airborne, GS.airB, GS.landN, GS.dashT0, GS.dashDist);
      if (res.dashT0 === 0) { GS.dashT0 = 0; GS.dashDist = 0; }
      GS.dashX = res.dashX;
      const charInner = $('charInner');
      if (charInner) {
        if (GS.airborne) charInner.style.removeProperty('transform');
        else charInner.style.transform = `translate3d(${res.dashX.toFixed(2)}px,0,0) rotate(${res.tilt.toFixed(2)}deg)`;
      }
      if (GS.landN > 0) GS.landN--;
      V8.render.updateWorldPlayer(GS, $('char'), t, dt);

      // Pet update
      V8.pet.update(GS, $('char'));
    } else if (GS.started && GS.over) {
      // Result screens freeze world simulation but keep impact particles,
      // rings, and fireworks alive until their own lifetimes expire.
      V8.render.updateEffects(t, dt, k);
    }

    V8.render.drawBG(t);
    V8.render.drawFX(t);
  }

  // ── Answer submission ──────────────────────────────────
  function jump() {
    if (!GS.started || GS.over || GS.lock) return;
    const input = $('answerIn');
    const ans = (input.value || '').trim();
    if (!ans) { V8.ui.focusInput(); return; }

    V8.ac && V8.ac();
    GS.lastAct = performance.now();

    // Debug: flowwalker
    if (ans === 'flowwalker') { input.value = ''; V8.words.updateSlots(); V8.ui.toggleDebug(GS); V8.ui.focusInput(); return; }

    const word = V8.words.currentWord(GS);
    const { correct, bonus } = V8.words.checkAnswer(ans, word, GS.mode);

    if (correct) {
      onCorrectAnswer(bonus);
    } else {
      onWrongAnswer(word);
    }
  }

  function onCorrectAnswer(bonus) {
    const run = GS;
    const elapsedSeconds = V8.timer.elapsedForWord(run);
    V8.combo.onCorrect(run);
    const streakTier = V8.streak.recordCorrect(run, elapsedSeconds);
    run.done++;

    // Score
    let points = 10 + run.combo;
    if (bonus > 0) points *= bonus;
    if (V8.skills.consumeDouble()) {
      points *= 2;
      V8.bigText('×2 双倍得分 +' + points, '#ffd700');
    }
    run.score += points;

    // FINAL word gold tint
    if (run.done >= (run.words || []).length) { V8.render.R.goldT = performance.now() + 780; }

    // Player jump
    const ch = $('char');
    if (run.gstate === 'flip' || run.gstate === 'djump') ch.classList.remove('flip', 'djump');
    V8.player.doJump(run, ch);
    later(() => { if (run.gstate === 'jump') V8.player.landFrom(run, ch, 'jump'); }, 560, run);

    // Brick + hit FX
    const bk = $('brick');
    later(() => { V8.brick.bump(run); const r = bk.getBoundingClientRect(); V8.coinBurst(r.left + r.width / 2, r.top, bonus ? 2.5 : 1.2); V8.hitFX(bk, run.combo); }, 180, run);

    // Coin fly
    later(() => V8.coinFlyFX(bk, $('scoreBox')), 190, run);

    // Slots burst
    V8.words.burstSlots();

    // Screen shake
    V8.render.R.shake = Math.min(9, V8.render.R.shake + 1.6);

    // CLOSE CALL (answered in last 3s)
    const closeCall = run.timeLeft > 0 && run.timeLeft < 3;
    if (closeCall) {
      run.slowmo = true; V8.ui.updateSpeed(run);
      document.body.classList.add('slowmo');
      V8.bigText('CLOSE CALL!!', '#7df9ff'); V8.ringFX('rgb(125,249,255)');
      V8.sfx.combo();
      later(() => { run.slowmo = false; V8.ui.updateSpeed(run); document.body.classList.remove('slowmo'); }, 900, run);
    }

    // HP regain at milestone
    if (run.combo > 0 && run.combo % 5 === 0) V8.hp.regainHP(run);

    // Check skill unlocks
    const tier = run.combo >= 15 ? 3 : run.combo >= 10 ? 2 : run.combo >= 5 ? 1 : 0;
    if (tier > 0 && run.combo % 5 === 0) V8.skills.onComboMilestone(tier);

    // Meteor wish (W4)
    if (run.phase === 3 && V8.render.R.events.some(e => e.kind === 'meteor')) V8.floatText('🌠 许愿成功!', '#bfe6ff', '20%');

    // Random praise
    if (bonus) {
      V8.sfx.bonus(bonus);
      V8.ringFX('rgb(255,215,0)');
      V8.floatText('💎 多义命中 ×' + bonus, '#ffd700', '30%');
    } else if (run.combo >= 3 && Math.random() < .2) {
      V8.floatText(['漂亮!', '好球!', 'NICE!', '✨ 稳!', '完美!'][Math.floor(Math.random() * 5)], '#ffd700', '30%');
    }

    V8.ui.updateSpeed(run);

    // Advance
    const isComplete = V8.words.advance(run);
    if (isComplete) {
      V8.ui.showVictory(run, { streakTier });
    } else {
      V8.timer.resetWord(run);
      V8.words.displayNextWord(run);
      if (!run._worldShiftLock) V8.ui.focusInput();
    }
    V8.ui.updateHUD(run);
  }

  function onWrongAnswer(word) {
    V8.combo.onWrong(GS);
    if (V8.streak) V8.streak.reset();
    V8.ui.updateSpeed(GS);

    // Check HP
    const alive = V8.hp.takeDamage(GS);
    V8.brick.danger();
    V8.render.R.shake = 9;

    if (alive) {
      // Still alive: reset timer, next word
      V8.timer.resetWord(GS);
      V8.brick.reset();
      V8.words.displayNextWord(GS);
      V8.ui.updateHUD(GS);
      V8.ui.focusInput();
      V8.floatText('💔 -1', '#ff4444', '20%');
    } else finishRun(word, GS.timeLeft <= 0 ? 'time' : 'miss');

    V8.ui.updateHUD(GS);
  }

  function finishRun(word, reason) {
    const run = GS;
    $('vignette').classList.add('on');
    $('wordStage').classList.add('shake');
    later(() => $('wordStage').classList.remove('shake'), 500, run);
    V8.brick.danger();
    $('vgnDanger').classList.remove('on', 'max');
    V8.ui.setInputEnabled(false);
    V8._stopRunLoops(run);

    if (reason === 'time') V8.player.deathTimeout(run, $('char'));
    else if (reason === 'giveup') V8.player.deathWrong(run, $('char'));
    else if (run.maxCombo >= 10) V8.player.deathExplode(run, $('char'));
    else V8.player.deathWrong(run, $('char'));
    V8.ui.setInputEnabled(false);

    later(() => {
      const r = $('char').getBoundingClientRect();
      const g = document.createElement('div'); g.className = 'ghost-float'; g.textContent = '👻';
      g.style.left = (r.left + r.width / 2 - 15) + 'px'; g.style.top = (V8.render.R.h * .78) + 'px';
      document.body.appendChild(g); later(() => g.remove(), 4100, run);
    }, 1000, run);

    later(() => V8.ui.showGameOver(run, word, reason), 1600, run);
  }

  function giveUp() {
    if (!GS.started || GS.over || GS.dead || GS.lock || GS.rdy) return;
    V8.combo.onWrong(GS);
    if (V8.streak) V8.streak.reset();
    V8.ui.updateSpeed(GS);
    GS.mistakes++;
    V8.bigText('本词暂时不会', '#ffd36a');
    finishRun(V8.words.currentWord(GS), 'giveup');
    V8.ui.updateHUD(GS);
  }

  // ── Event bindings ─────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    V8.bus.on('timer:expire', () => {
      if (!GS.started || GS.over || GS.dead || GS.lock || GS.rdy || GS.timeLeft > 0) return;
      onWrongAnswer(V8.words.currentWord(GS));
    });
    // Input
    $('answerIn').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); jump(); }
      if (!e.isComposing && !GS.dbg && /^[1-3]$/.test(e.key) && GS.started && !GS.over) {
        // The answer input normally owns focus, so allow a ready skill to use
        // its numeric shortcut here as well. Locked/used skills still leave
        // the number available for normal answer entry.
        if (V8.skills.useSkill(parseInt(e.key) - 1, GS)) e.preventDefault();
      }
    });
    $('answerIn').addEventListener('input', () => { GS.lastAct = performance.now(); V8.words.updateSlots(); });
    $('answerIn').addEventListener('focus', () => setTimeout(V8.ui.fitVP, 250));
    $('giveUpBtn').addEventListener('click', giveUp);
    const quitBtn = $('quitBtn');
    if (quitBtn) quitBtn.addEventListener('click', () => V8.ui.quitRun());

    // Character animationend -> land
    $('char').addEventListener('animationend', e => {
      const map = { charJump: 'jump', charFly: 'flight', charFlip: 'flip', charDjump: 'djump' };
      const m = map[e.animationName];
      if (m) V8.player.landFrom(GS, $('char'), m);
    });

    // Debug key listener
    document.addEventListener('keydown', e => {
      if (e.isComposing) return;
      if (e.key && e.key.toLowerCase() === 'q' && e.target !== $('answerIn') && GS.started && !GS.over) {
        e.preventDefault();
        V8.ui.quitRun();
        return;
      }
      if (e.key === 'Escape' && GS.started && !GS.over) {
        e.preventDefault(); giveUp(); return;
      }
      if (GS.dbg && !GS.over && /^[1-6]$/.test(e.key)) {
        e.preventDefault(); V8.ui.dbgKey(e.key, GS); return;
      }
      if (e.key && e.key.length === 1 && e.target !== $('answerIn')) {
        V8.ui.dbgBuf = (V8.ui.dbgBuf + e.key).slice(-10);
        if (V8.ui.dbgBuf.endsWith('flowwalker')) {
          V8.ui.dbgBuf = '';
          V8.ui.toggleDebug(GS);
        }
      }
      // Skill hotkeys (1-3) when not in input
      if (e.target !== $('answerIn') && /^[1-3]$/.test(e.key) && GS.started && !GS.over) {
        e.preventDefault();
        V8.skills.useSkill(parseInt(e.key) - 1, GS);
        V8.ui.focusInput();
      }
    });

    // Gameplay stays fixed, while menu/result panels may need to scroll on
    // short mobile viewports.
    document.addEventListener('touchmove', e => {
      if (e.target.closest('.review-panel,.start-overlay,.vic-overlay,.go-overlay')) return;
      e.preventDefault();
    }, { passive: false });

    // Viewport
    if (window.visualViewport) {
      visualViewport.addEventListener('resize', V8.ui.fitVP);
      visualViewport.addEventListener('scroll', V8.ui.fitVP);
    }
    window.addEventListener('resize', V8.ui.fitVP);
    window.addEventListener('orientationchange', () => setTimeout(V8.ui.fitVP, 300));

    // Hardcore mode toggle
    const hcCheck = $('hardcoreCheck');
    if (hcCheck) {
      hcCheck.checked = V8.storage.getHardcore();
      hcCheck.addEventListener('change', () => V8.storage.setHardcore(hcCheck.checked));
    }

    boot();
  });

  // Expose jump globally (called by button onclick)
  window.jump = jump;
  window.giveUp = giveUp;
  V8._fitVP = V8.ui.fitVP;
  V8._gameState = GS;
})(window.V8 = window.V8 || {});
