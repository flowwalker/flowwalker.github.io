/**
 * Timer system — 45s countdown per word with visual feedback.
 */
(function(V8) {
  'use strict';

  const TIME_LIMIT = V8.CFG.TIME_LIMIT;
  let tickInterval = null;

  function timerPaused(gameState) {
    return !gameState.started || gameState.over || gameState.lock || gameState.rdy || gameState.flying || gameState.dead ||
      gameState._timerFrozen || gameState._timerExpired || document.hidden;
  }

  /**
   * Exact active countdown time consumed by the current word.
   * The interval paints every 100ms; include the not-yet-painted fraction so
   * speed-streak thresholds are measured accurately. Frozen/hidden time is
   * intentionally excluded because it does not consume the 45s countdown.
   */
  function elapsedForWord(gameState) {
    if (!gameState) return 0;
    let elapsed = TIME_LIMIT - Math.max(0, Math.min(TIME_LIMIT, Number(gameState.timeLeft) || 0));
    if (!timerPaused(gameState) && gameState.lastTick) {
      elapsed += Math.max(0, performance.now() - gameState.lastTick) / 1000;
    }
    return Math.max(0, Math.min(TIME_LIMIT, elapsed));
  }

  function updateTimerDisplay(gameState) {
    const t = Math.max(0, gameState.timeLeft);
    const fill = document.getElementById('timerFill');
    const num = document.getElementById('timerNum');
    const tw = document.getElementById('timerWrap');
    const status = document.getElementById('timerStatus');
    const vgn = document.getElementById('vgnDanger');
    if (fill) fill.style.width = (t / TIME_LIMIT * 100) + '%';
    if (num) num.textContent = Math.ceil(t) + 's';

    const frozen = Boolean(gameState._timerFrozen);
    if (tw) tw.classList.toggle('frozen', frozen);
    if (status) {
      const remaining = Math.max(0, (gameState._freezeUntil || 0) - performance.now());
      status.textContent = frozen ? `❄ 冻结 ${(remaining / 1000).toFixed(1)}s` : '';
      status.classList.toggle('on', frozen);
    }

    const warn = t <= 10 && t > 0 && !gameState.over && gameState.started;
    if (tw) { tw.classList.toggle('warn', warn); tw.classList.toggle('max', warn && t <= 3); }
    if (vgn) { vgn.classList.toggle('on', warn); vgn.classList.toggle('max', warn && t <= 3); }
    gameState.warn = warn;

    const ch = document.getElementById('char');
    if (ch) ch.classList.toggle('panic', warn && !gameState.jumping && !gameState.flying);
    V8.brick.updateFace(gameState);
  }

  function startTickLoop(gameState) {
    clearInterval(tickInterval);
    const id = gameState.runId;

    tickInterval = setInterval(() => {
      if (gameState.runId !== id) { clearInterval(tickInterval); return; }
      gameState.sleepy = gameState.started && !gameState.over && !gameState.lock && (performance.now() - gameState.lastAct > 8000);
      V8.brick.updateFace(gameState);

      if (timerPaused(gameState)) {
        gameState.lastTick = performance.now();
        if (gameState._timerFrozen) updateTimerDisplay(gameState);
        return;
      }
      const now = performance.now(), dt = (now - (gameState.lastTick || now)) / 1000;
      gameState.lastTick = now;
      const prev = Math.ceil(gameState.timeLeft);
      gameState.timeLeft = Math.max(0, gameState.timeLeft - dt);
      updateTimerDisplay(gameState);

      // Heartbeat sfx when ≤10s
      if (gameState.timeLeft <= 10 && gameState.timeLeft > 0 && Math.ceil(gameState.timeLeft) < prev) V8.sfx.heart();

      if (gameState.timeLeft <= 0) {
        gameState._timerExpired = true;
        V8.bus.emit('timer:expire');
      }
    }, 100);
  }

  function stop() { clearInterval(tickInterval); }

  function resetWord(gameState) {
    gameState.timeLeft = TIME_LIMIT;
    gameState.lastTick = performance.now();
    gameState._timerExpired = false;
    updateTimerDisplay(gameState);
  }

  /** Pause timer for skill (e.g. freeze). Returns resume function. */
  function freezeFor(ms, gameState) {
    if (typeof gameState._cancelFreeze === 'function') gameState._cancelFreeze();
    // Preserve the active fraction since the last 100ms paint tick before
    // entering the frozen state, so speed-streak timing cannot gain free time.
    const freezeStarted = performance.now();
    if (!timerPaused(gameState) && gameState.lastTick) {
      const pending = Math.max(0, freezeStarted - gameState.lastTick) / 1000;
      gameState.timeLeft = Math.max(0, gameState.timeLeft - pending);
    }
    gameState._timerFrozen = true;
    gameState._freezeUntil = freezeStarted + ms;
    gameState.lastTick = freezeStarted;
    updateTimerDisplay(gameState);

    const id = setTimeout(() => {
      gameState._timerFrozen = false;
      gameState._freezeUntil = 0;
      gameState._cancelFreeze = null;
      gameState.lastTick = performance.now();
      updateTimerDisplay(gameState);
      document.body.classList.remove('frost');
    }, ms);

    document.body.classList.add('frost');
    V8.sfx.freeze();
    const cancel = () => {
      clearTimeout(id);
      gameState._timerFrozen = false;
      gameState._freezeUntil = 0;
      if (gameState._cancelFreeze === cancel) gameState._cancelFreeze = null;
      gameState.lastTick = performance.now();
      updateTimerDisplay(gameState);
      document.body.classList.remove('frost');
    };
    gameState._cancelFreeze = cancel;
    return cancel;
  }

  function isTimerFrozen(gameState) { return gameState._timerFrozen || false; }

  V8.timer = {
    startTickLoop, stop, resetWord, updateTimerDisplay, timerPaused,
    freezeFor, isTimerFrozen, elapsedForWord, TIME_LIMIT,
  };
})(window.V8 = window.V8 || {});
