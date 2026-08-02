/**
 * UI system — HUD, overlays (start/gameover/victory/review), input handling.
 */
(function(V8) {
  'use strict';

  const { WORLDS, LV_BTN, LV_DEF, WORDS_PER_LEVEL, charModeFor } = V8.CFG;
  const $ = id => document.getElementById(id);
  function liveRun(gameState, runId) {
    return Boolean(gameState) && V8._gameState === gameState && gameState.runId === runId;
  }

  function playSfx(name, fallback) {
    const fn = V8.sfx && typeof V8.sfx[name] === 'function'
      ? V8.sfx[name]
      : (fallback && V8.sfx && typeof V8.sfx[fallback] === 'function' ? V8.sfx[fallback] : null);
    if (fn) fn();
  }

  // Route changes share one guarded transition so a double-click cannot start
  // two runs or leave the previous run's timers behind the next scene.
  let routeBusy = false;
  let routeSeq = 0;
  let sectionSwitching = false;
  let activeSelection = { startIndex: 0, endIndex: WORDS_PER_LEVEL, challengeId: 'en-forward' };
  let selectionInitialized = false;
  let reviewWords = [];

  // In-game world changes use a separate, non-routing gate. It can briefly
  // pause answer input while the scenery plugin swaps, but never owns the
  // menu route lock used by the four-second navigation transition.
  let worldShiftSeq = 0;
  let worldShiftNode = null;
  let worldShiftState = null;
  let worldShiftCleanupTimer = null;

  // The menu skin is intentionally separate from the playable world plugins.
  // It only changes the start-page palette/background and its menu soundtrack.
  const START_SKIN_KEY = 'cet6_v13_start_skin';
  const LEGACY_START_SKIN_KEYS = ['cet6_v12_start_skin', 'cet6_v11_start_skin'];
  let startSkin = 'blue';

  function readStartSkin() {
    let saved = window.START_SKIN;
    try {
      let persisted = window.localStorage.getItem(START_SKIN_KEY);
      if (persisted !== 'blue' && persisted !== 'pink') {
        for (const legacyKey of LEGACY_START_SKIN_KEYS) {
          persisted = window.localStorage.getItem(legacyKey);
          if (persisted === 'blue' || persisted === 'pink') {
            window.localStorage.setItem(START_SKIN_KEY, persisted);
            break;
          }
        }
      }
      if (persisted === 'blue' || persisted === 'pink') saved = persisted;
    } catch (e) {}
    return saved === 'pink' ? 'pink' : 'blue';
  }

  function persistStartSkin(skin) {
    try { window.localStorage.setItem(START_SKIN_KEY, skin); } catch (e) {}
  }

  function applyStartSkin(skin, persist) {
    const next = skin === 'pink' ? 'pink' : 'blue';
    startSkin = next;
    window.START_SKIN = next;
    if (persist !== false) persistStartSkin(next);
    document.body.dataset.startSkin = next;
    document.body.classList.toggle('start-skin-blue', next === 'blue');
    document.body.classList.toggle('start-skin-pink', next === 'pink');

    const toggle = $('startSkinToggle');
    if (!toggle) return;
    const target = next === 'blue' ? 'pink' : 'blue';
    const targetLabel = target === 'blue' ? '湖山蓝' : '梦幻粉';
    const icon = toggle.querySelector('.skin-toggle-icon');
    const label = toggle.querySelector('.skin-toggle-label');
    toggle.dataset.currentSkin = next;
    toggle.dataset.targetSkin = target;
    toggle.title = `切换到${targetLabel}开始皮肤`;
    toggle.setAttribute('aria-label', `切换到${targetLabel}开始皮肤`);
    if (icon) icon.textContent = target === 'blue' ? '🌸' : '⛰️';
    if (label) label.textContent = targetLabel;
  }

  function initStartSkin() {
    applyStartSkin(readStartSkin(), false);
  }

  function playRouteTransition(options) {
    options = options || {};
    if (routeBusy) return false;
    routeBusy = true;
    const token = ++routeSeq;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const impactAt = reduced ? 70 : 1760;
    const midpoint = reduced ? 100 : 2000;
    const revealAt = reduced ? 120 : 2240;
    const total = reduced ? 220 : 4000;
    const chapter = String(options.chapter || '00').padStart(2, '0');
    const root = document.createElement('div');
    root.id = 'routeTransition';
    root.className = 'route-transition';
    root.dataset.kind = options.kind || 'enter';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-busy', 'true');
    root.setAttribute('aria-label', options.label || '正在切换场景');
    root.style.cssText = 'position:fixed;inset:0;z-index:420;display:grid;place-items:center;pointer-events:auto;color:#fff;';
    root.style.setProperty('--route-accent', options.accent || '#6f9fe8');
    const isReturn = root.dataset.kind === 'return';
    const isReview = root.dataset.kind === 'review';
    const isSkin = root.dataset.kind === 'skin';
    const routeKicker = isSkin ? 'MENU SKIN' : isReview ? 'MEMORY ATLAS' : isReturn ? 'RETURN VECTOR' : 'WORLD GATE';
    const routeGateLabel = isSkin ? 'STYLE' : isReview ? 'REVIEW' : isReturn ? 'HOME' : 'GATE';
    const speedLines = Array.from({ length: 12 }, (_, i) =>
      `<i style="--line-angle:${i * 30}deg;--line-delay:${i * 24}ms;--line-length:${38 + (i % 4) * 12}%"></i>`
    ).join('');
    root.innerHTML = `<div class="route-shutters" aria-hidden="true"><i class="route-shutter left"></i><i class="route-shutter right"></i></div>
      <div class="route-speedlines" aria-hidden="true">${speedLines}</div>
      <div class="route-gate" aria-hidden="true">
        <i class="route-ring outer"></i><i class="route-ring middle"></i><i class="route-ring inner"></i>
        <span class="route-core"><b>${chapter}</b><small>${routeGateLabel}</small></span>
      </div>
      <div class="route-copy"><small class="route-kicker">${routeKicker} // ${chapter}</small><strong class="route-label"></strong></div>
      <div class="route-progress" aria-hidden="true"><i></i><span></span><i></i></div>
      <div class="route-impact" aria-hidden="true"></div>`;
    const label = root.querySelector('.route-label');
    if (label) label.textContent = options.label || '准备下一段旅程';
    document.body.appendChild(root);
    document.body.setAttribute('aria-busy', 'true');
    document.body.classList.add('route-transitioning');
    V8.ac && V8.ac();
    playSfx('transition', 'riser');
    requestAnimationFrame(() => root.classList.add('is-active'));

    setTimeout(() => {
      if (token !== routeSeq) return;
      root.classList.add('is-impact');
      playSfx('portal', 'thud');
    }, impactAt);
    setTimeout(() => {
      if (token !== routeSeq) return;
      if (typeof options.onMidpoint === 'function') options.onMidpoint();
      root.classList.add('is-swap');
    }, midpoint);
    setTimeout(() => {
      if (token !== routeSeq) return;
      root.classList.add('is-out');
    }, revealAt);
    setTimeout(() => {
      if (token !== routeSeq) return;
      root.remove();
      routeBusy = false;
      document.body.removeAttribute('aria-busy');
      document.body.classList.remove('route-transitioning');
      if (typeof options.onComplete === 'function') options.onComplete();
    }, total);
    return true;
  }

  function worldShiftAccent(phase) {
    return ['#74d9ff', '#9a8dff', '#d98bff', '#8bb8ff', '#8effd0', '#b8e7ff', '#67e6ff', '#8ab4ff', '#ff9ccf'][phase] || '#8dbdff';
  }

  function restoreWorldShiftLock(state) {
    if (!state || !state._worldShiftLock) return;
    state.lock = Boolean(state._worldShiftPreviousLock);
    state._worldShiftLock = false;
    delete state._worldShiftPreviousLock;
    const canAnswer = V8._gameState === state && state.started && !state.over && !state.dead && !state.rdy && !state.lock;
    setInputEnabled(canAnswer);
    if (canAnswer) focusInput();
  }

  function clearWorldTransition(restoreLock) {
    worldShiftSeq++;
    clearTimeout(worldShiftCleanupTimer);
    worldShiftCleanupTimer = null;
    const state = worldShiftState;
    const runId = state && state.runId;
    const interrupted = Boolean(worldShiftNode || state);
    if (worldShiftNode) worldShiftNode.remove();
    worldShiftNode = null;
    worldShiftState = null;
    document.body.classList.remove('world-shifting');
    if (restoreLock !== false && state && V8._gameState === state) restoreWorldShiftLock(state);
    if (interrupted && V8.bus) V8.bus.emit('world:shift:cancel', { gameState: state, runId });
  }

  /**
   * Show a short world-only space-fold while a plugin and its palette settle.
   * This is deliberately pointer-transparent and independent of routeBusy.
   */
  function showWorldTransition(oldPhase, nextPhase, gameState) {
    if (!gameState || V8._gameState !== gameState || !gameState.started || gameState.over) return false;
    clearWorldTransition(true);

    const to = WORLDS[nextPhase] || {};
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const token = worldShiftSeq;
    const runId = gameState.runId;
    const root = document.createElement('div');
    root.id = 'worldShift';
    root.className = 'world-shift';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    root.setAttribute('aria-label', `世界切换：${to.name || '下一世界'}`);
    root.style.setProperty('--shift-from', worldShiftAccent(oldPhase));
    root.style.setProperty('--shift-to', worldShiftAccent(nextPhase));
    const streaks = Array.from({ length: 24 }, (_, i) =>
      `<i style="--shift-angle:${i * 15}deg;--shift-delay:${(i % 8) * 26}ms;--shift-length:${34 + (i % 5) * 13}%"></i>`
    ).join('');
    const spokes = Array.from({ length: 18 }, (_, i) =>
      `<i style="--rift-angle:${i * 20}deg;--rift-delay:${(i % 6) * 36}ms"></i>`
    ).join('');
    root.innerHTML = `<div class="world-shift-scan" aria-hidden="true"></div>
      <div class="world-shift-stars" aria-hidden="true">${streaks}</div>
      <div class="world-shift-rift" aria-hidden="true">${spokes}</div>
      <div class="world-shift-ripples" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="world-shift-orbit orbit-a" aria-hidden="true"></div>
      <div class="world-shift-orbit orbit-b" aria-hidden="true"></div>
      <div class="world-shift-core">
        <span class="world-shift-sigil" aria-hidden="true"></span>
        <strong class="world-shift-name"></strong>
        <small>WORLD SHIFT · 时空航道重定位</small>
      </div>
      <div class="world-shift-flare" aria-hidden="true"></div>`;
    root.querySelector('.world-shift-sigil').textContent = to.icon || '✦';
    root.querySelector('.world-shift-name').textContent = to.name || '下一世界';
    document.body.appendChild(root);
    worldShiftNode = root;
    worldShiftState = gameState;
    gameState._worldShiftPreviousLock = Boolean(gameState.lock);
    gameState._worldShiftLock = true;
    gameState.lock = true;
    setInputEnabled(false);
    document.body.classList.add('world-shifting');
    if (V8.bus) V8.bus.emit('world:shift:start', { gameState, runId });
    V8.ac && V8.ac();
    playSfx('transition', 'portal');
    requestAnimationFrame(() => {
      if (token === worldShiftSeq && worldShiftNode === root) root.classList.add('is-active');
    });

    // Let the world gate breathe: the normal transition is now twice as
    // long, while reduced-motion users keep the short accessibility path.
    const impactAt = reduced ? 45 : 600;
    const outAt = reduced ? 85 : 1520;
    const total = reduced ? 170 : 2320;
    setTimeout(() => {
      if (token === worldShiftSeq && worldShiftNode === root) root.classList.add('is-impact');
    }, impactAt);
    setTimeout(() => {
      if (token === worldShiftSeq && worldShiftNode === root) root.classList.add('is-out');
    }, outAt);
    worldShiftCleanupTimer = setTimeout(() => {
      if (token !== worldShiftSeq || worldShiftNode !== root) return;
      root.remove();
      worldShiftNode = null;
      worldShiftState = null;
      worldShiftCleanupTimer = null;
      document.body.classList.remove('world-shifting');
      if (V8._gameState === gameState && gameState.runId === runId && !gameState.over) {
        restoreWorldShiftLock(gameState);
        if (V8.bus) V8.bus.emit('world:shift:end', { gameState, runId });
      }
    }, total);
    return true;
  }

  function stopRunForMenu() {
    if (typeof V8._prepareQuit === 'function') V8._prepareQuit(V8._gameState);
    else if (typeof V8._stopRunForMenu === 'function') V8._stopRunForMenu();
    else {
      const state = V8._gameState;
      if (state) { state.started = false; state.over = true; state.lock = true; state.runId = Math.random(); }
      if (V8.timer) V8.timer.stop();
      if (V8.entities) V8.entities.clearAll();
      if (V8.streak) V8.streak.cleanup();
    }
  }

  // ── HUD refresh ───────────────────────────────────────
  function updateHUD(gameState) {
    const wd = WORLDS[gameState.phase];
    document.body.dataset.phase = gameState.phase;
    document.body.dataset.world = wd.plugin || ('base-' + gameState.phase);
    $('worldTag').textContent = `${wd.icon} ${gameState.mode === 0 ? '汉译英' : '英译汉'} · ${wd.name}`;
    $('scoreDisp').textContent = gameState.score;
    $('distNum').textContent = gameState.done + 'm';
    const runLength = Math.max(1, (gameState.words || []).length || WORDS_PER_LEVEL);
    $('progressBar').style.width = (gameState.done / runLength * 100) + '%';

    // Milestone distance pop
    if ([50, 100, 111, 123, 150].includes(gameState.done)) {
      const dn = $('distNum');
      if (dn) { dn.classList.remove('mile'); void dn.offsetWidth; dn.classList.add('mile'); V8.sfx.ok(); setTimeout(() => dn.classList.remove('mile'), 950); }
    }

    V8.combo.updateUI(gameState);

    // Sign hot/glow
    $('sign').classList.toggle('hot', gameState.combo >= 10);

    // Character mode & visual
    const ch = $('char');
    if (ch) {
      ch.classList.toggle('turbo', gameState.combo >= 10 && gameState.combo < 15);
      ch.classList.toggle('dark', gameState.combo >= 15);
      ch.dataset.mode = charModeFor(gameState.phase);
    }

    V8.brick.updateFace(gameState);
    V8.hp.updateHPUI(gameState);
    V8.timer.updateTimerDisplay(gameState);
  }

  function updateSpeed(gameState) {
    gameState.spd = V8.combo.calcSpeed(gameState);
    V8.render.R.tsT = gameState.sceneSpd * gameState.spd * (gameState.slowmo ? 0.22 : 1);
  }

  // ── Input bar management ──────────────────────────────
  function focusInput() {
    const i = $('answerIn');
    if (i) { i.focus({ preventScroll: true }); setTimeout(() => { i.scrollIntoView({ block: 'center' }); window.scrollTo(0, 0); }, 120); }
  }

  function setInputEnabled(enabled) {
    ['answerIn', 'jumpBtn', 'giveUpBtn', 'quitBtn'].forEach(id => {
      const node = $(id);
      if (node) node.disabled = !enabled;
    });
  }

  function syncSectionUI() {
    const pack = V8.WORD_PACK || { title: '全量词表', words: [] };
    document.body.classList.remove('section-selected');
    document.querySelectorAll('.section-btn').forEach(button => button.remove());
    const levels = $('lvBtns');
    const browse = $('btnBrowse');
    const help = $('sectionHelp');
    if (levels) levels.classList.remove('hidden');
    if (browse) browse.classList.remove('hidden');
    if (help) help.textContent = `共 ${pack.words.length} 词 · 每关 ${WORDS_PER_LEVEL} 词 · 完成英译汉正序与逆序后解锁下一词窗`;
    if ($('startSub')) $('startSub').textContent = `${pack.title} · ${pack.words.length} 词 · 每关 ${WORDS_PER_LEVEL} 词`;
    document.title = `⭐ CET-6 单词跑酷 v13 · ${pack.title}`;
  }

  // Kept as a compatibility no-op for old inline links/bookmarks.
  function switchSection() { return false; }

  // ── Start screen ──────────────────────────────────────
  function showStartScreen(options) {
    options = options || {};
    initStartSkin();
    $('startScreen').classList.remove('hidden');
    $('reviewPanel').classList.add('hidden');
    ['bgCanvas', 'fxCanvas', 'stage', 'wordStage', 'hud', 'distOverlay', 'inputBar', 'skillBar'].forEach(id => $(id).classList.add('hidden'));
    setInputEnabled(false);
    syncSectionUI();
    renderLevelButtons();
    if (V8.bgm && !options.preserveBgm) V8.bgm.boot(true);
  }

  function toggleStartSkin() {
    if (routeBusy) return false;
    const next = startSkin === 'blue' ? 'pink' : 'blue';
    V8.ac && V8.ac();
    playSfx('select', 'ui');
    return playRouteTransition({
      label: `切换至${next === 'blue' ? '湖山蓝' : '梦幻粉'}开始皮肤`,
      kind: 'skin',
      chapter: next === 'blue' ? 'BL' : 'PK',
      accent: next === 'blue' ? '#78c8ff' : '#e5a8cf',
      onMidpoint: () => {
        applyStartSkin(next);
        if (V8.bgm) V8.bgm.boot(true);
      },
    });
  }

  function renderLevelButtons() {
    const unlocked = V8.storage.getUnlocked();
    const box = $('lvBtns');
    if (!box) return;
    box.innerHTML = '';
    const total = V8.CFG.TOTAL_LEVELS || Math.ceil(V8.WORD_PACK.words.length / WORDS_PER_LEVEL);
    const max = Math.min(V8.WORD_PACK.words.length, unlocked * WORDS_PER_LEVEL);
    if (!selectionInitialized) {
      selectionInitialized = true;
      const saved = V8.storage.getCustomRange();
      const defaultEnd = Math.min(WORDS_PER_LEVEL, V8.WORD_PACK.words.length);
      const savedIsCustom = saved && saved.start >= 1 && saved.end >= saved.start && saved.end <= max
        && (saved.start !== 1 || saved.end !== defaultEnd);
      if (savedIsCustom) {
        activeSelection = {
          startIndex: saved.start - 1,
          endIndex: saved.end,
          windowIndex: Math.floor((saved.start - 1) / WORDS_PER_LEVEL),
          custom: true,
          challengeId: 'en-forward',
        };
      }
    }
    const windowButtons = document.createElement('div');
    windowButtons.className = 'window-levels';
    for (let i = 0; i < total; i++) {
      const available = i < unlocked;
      const b = document.createElement('button');
      b.className = `level-btn window-level ${available ? 'btn-start' : 'btn-ghost'}`;
      b.disabled = !available;
      b.setAttribute('aria-label', available ? `第 ${i + 1} 关` : `未解锁：第 ${i + 1} 关`);
      const start = i * WORDS_PER_LEVEL + 1;
      const end = Math.min(V8.WORD_PACK.words.length, (i + 1) * WORDS_PER_LEVEL);
      const completedModes = V8.storage.getCompleted(i + 1);
      const completed = ['en-forward', 'en-reverse'].every(id => completedModes.includes(id));
      b.innerHTML = `<span class="level-number">${String(i + 1).padStart(3, '0')}</span><span class="level-title">词窗 ${start}-${end}</span><span class="level-meta">${completed ? '英译汉主线已完成' : available ? '可开始 · 按顺序解锁' : '完成上一词窗英译汉正逆序后解锁'}</span><span class="level-state">${available ? '选择' : '🔒'}</span>`;
      if (available) b.onclick = () => selectWindow(i);
      windowButtons.appendChild(b);
    }
    box.appendChild(windowButtons);
    const custom = document.createElement('div');
    custom.className = 'custom-level-panel';
    custom.innerHTML = `<div class="custom-level-heading"><span>自定义词窗</span><small>当前可选 1-${max}</small></div><div class="custom-level-fields"><label>起始序号<input id="customStart" type="number" min="1" max="${max}" value="${Math.min(activeSelection.startIndex + 1, max)}"></label><span>至</span><label>结束序号<input id="customEnd" type="number" min="1" max="${max}" value="${Math.min(activeSelection.endIndex, max)}"></label><button class="btn-start custom-start" type="button" id="customStartBtn">应用范围</button></div><p class="custom-level-note">完成后续词窗的英译汉正序与逆序，可选范围会继续扩展。</p>`;
    box.appendChild(custom);
    custom.querySelector('#customStartBtn').onclick = () => applyCustomSelection(max);
    const customIsValid = Boolean(activeSelection.custom)
      && activeSelection.startIndex >= 0
      && activeSelection.endIndex > activeSelection.startIndex
      && activeSelection.endIndex <= max;
    if (customIsValid) {
      const index = Math.max(0, Math.min(total - 1, activeSelection.windowIndex || 0));
      activeSelection.windowIndex = index;
      document.querySelectorAll('.window-level').forEach((node, i) => node.classList.toggle('selected', i === index));
      renderChallengeButtons(index);
      updateReviewRange();
      const summary = $('selectionSummary');
      if (summary) summary.textContent = `自定义范围 ${activeSelection.startIndex + 1}-${activeSelection.endIndex} · 请选择挑战方向`;
    } else {
      selectWindow(Math.min(activeSelection.windowIndex || 0, Math.max(0, unlocked - 1)), true);
    }
  }

  function selectWindow(windowIndex, silent) {
    const total = V8.CFG.TOTAL_LEVELS || Math.ceil(V8.WORD_PACK.words.length / WORDS_PER_LEVEL);
    const index = Math.max(0, Math.min(total - 1, Number(windowIndex) || 0));
    const start = index * WORDS_PER_LEVEL;
    activeSelection = { startIndex: start, endIndex: Math.min(V8.WORD_PACK.words.length, start + WORDS_PER_LEVEL), windowIndex: index, challengeId: activeSelection.challengeId || 'en-forward' };
    // A deliberate standard-window click supersedes a persisted custom range.
    if (!silent) V8.storage.setCustomRange(1, Math.min(WORDS_PER_LEVEL, V8.WORD_PACK.words.length));
    const summary = $('selectionSummary');
    if (summary) summary.textContent = `第 ${index + 1} 关 · 单词 ${start + 1}-${activeSelection.endIndex} · 请选择挑战方向`;
    document.querySelectorAll('.window-level').forEach((node, i) => node.classList.toggle('selected', i === index));
    renderChallengeButtons(index);
    updateReviewRange();
    if (!silent) { V8.ac && V8.ac(); playSfx('select', 'ui'); }
  }

  function renderChallengeButtons(windowIndex) {
    const box = $('challengeBtns');
    if (!box) return;
    const levelNumber = Number(windowIndex) + 1;
    const unlockedWindow = levelNumber <= V8.storage.getUnlocked();
    const completedModes = V8.storage.getCompleted(levelNumber);
    box.innerHTML = '';
    LV_DEF.forEach(challenge => {
      const available = unlockedWindow && V8.storage.isChallengeUnlocked(levelNumber, challenge.id);
      const b = document.createElement('button');
      b.type = 'button'; b.className = `challenge-btn ${available ? 'btn-start' : 'btn-ghost'}`; b.disabled = !available;
      const lockHints = {
        'en-reverse': '先完成英译汉正序',
        'en-random': '先完成英译汉正序与逆序',
        'cn-forward': '先完成英译汉正序与逆序',
        'cn-reverse': '先完成汉译英正序',
        'cn-random': '先完成汉译英正序与逆序',
      };
      const lockedText = unlockedWindow ? (lockHints[challenge.id] || '完成前置挑战后解锁') : '先解锁当前词窗';
      b.innerHTML = `<span class="challenge-icon">${challenge.icon}</span><span><strong>${challenge.name}</strong><small>${available ? challenge.subtitle : lockedText}</small></span><em>${completedModes.includes(challenge.id) ? '✓' : available ? '开始' : '🔒'}</em>`;
      if (available) b.onclick = () => startLevel(windowIndex, challenge.id);
      box.appendChild(b);
    });
  }

  function applyCustomSelection(max) {
    const startNode = $('customStart'), endNode = $('customEnd');
    const start = Math.max(1, Math.min(max, Number(startNode && startNode.value) || 1));
    const end = Math.max(start, Math.min(max, Number(endNode && endNode.value) || start));
    activeSelection = { startIndex: start - 1, endIndex: end, windowIndex: Math.floor((start - 1) / WORDS_PER_LEVEL), custom: true, challengeId: 'en-forward' };
    V8.storage.setCustomRange(start, end);
    if (startNode) startNode.value = start;
    if (endNode) endNode.value = end;
    renderChallengeButtons(activeSelection.windowIndex);
    updateReviewRange();
    $('selectionSummary').textContent = `自定义范围 ${start}-${end} · 请选择挑战方向`;
    V8.sfx.confirm();
  }

  function updateReviewRange() {
    const start = activeSelection.startIndex ?? 0;
    const end = activeSelection.endIndex ?? WORDS_PER_LEVEL;
    setReviewWords(V8.WORD_PACK.words.slice(start, end), start, end);
  }

  function setReviewWords(words, startIndex, endIndex) {
    reviewWords = Array.isArray(words) ? words.slice() : [];
    // Keep the old public field as a read-only compatibility mirror. Review
    // rendering no longer reads it, so a previous route cannot override the
    // current menu/game selection.
    V8._reviewWords = reviewWords.slice();
    const count = reviewWords.length;
    const counter = $('reviewSelectionInfo');
    if (!counter) return;
    if (Number.isFinite(startIndex) && Number.isFinite(endIndex)) {
      counter.textContent = `当前复习 ${count} 词 · 序号 ${startIndex + 1}-${endIndex}`;
    } else {
      counter.textContent = `当前复习 ${count} 词`;
    }
  }

  function startLevel(windowIndex, challengeId) {
    if (routeBusy) return;
    const challenge = LV_DEF.find(item => item.id === challengeId);
    const levelNumber = Number(windowIndex) + 1;
    if (!challenge || !V8.storage.isChallengeUnlocked(levelNumber, challenge.id)) return false;
    const start = activeSelection.custom ? activeSelection.startIndex : windowIndex * WORDS_PER_LEVEL;
    const end = activeSelection.custom ? activeSelection.endIndex : Math.min(V8.WORD_PACK.words.length, start + WORDS_PER_LEVEL);
    activeSelection = { ...activeSelection, startIndex: start, endIndex: end, windowIndex, challengeId: challenge.id };
    V8.ac && V8.ac();
    if (V8.sfx.confirm) V8.sfx.confirm();
    let stagedRun = null;
    const accents = ['#6f9fe8', '#557ed0', '#7187d9', '#84c4ff', '#a67bff', '#6ac7ff'];
    playRouteTransition({
      label: `进入 ${challenge.name} · ${start + 1}-${end}`,
      kind: 'enter',
      chapter: String(windowIndex + 1).padStart(2, '0'),
      accent: accents[LV_DEF.indexOf(challenge)] || '#6f9fe8',
      onMidpoint: () => {
        stopRunForMenu();
        hideAllOverlays();
        ['bgCanvas', 'fxCanvas', 'stage', 'wordStage', 'hud', 'distOverlay', 'inputBar'].forEach(id => $(id).classList.remove('hidden'));
        // _startGame selects the level track before booting the Audio element.
        // Avoid briefly requesting the default W1 track for W2-W4.
        V8._startGame(windowIndex, { deferReady: true, challengeId: challenge.id, startIndex: start, endIndex: end, custom: Boolean(activeSelection.custom) });
        stagedRun = V8._gameState;
        V8.render.sizeCanvases();
        V8._fitVP();
      },
      onComplete: () => {
        if (stagedRun && V8._gameState === stagedRun && stagedRun.started && !stagedRun.over) V8.ui.readySeq(stagedRun);
      },
    });
  }

  function returnToMenu(targetWindowIndex) {
    if (routeBusy) return false;
    V8.ac && V8.ac();
    if (V8.sfx.back) V8.sfx.back();
    const accepted = playRouteTransition({
      label: '返回选关 · 整理这一程的记忆',
      kind: 'return',
      chapter: 'HM',
      accent: '#5d91e6',
      onMidpoint: () => {
        stopRunForMenu();
        hideAllOverlays();
        showStartScreen();
        if (Number.isFinite(targetWindowIndex)) selectWindow(targetWindowIndex, true);
      },
    });
    return accepted;
  }

  function quitRun() {
    const gameState = V8._gameState;
    if (!gameState || !gameState.started || gameState.over || gameState.dead || gameState.lock || routeBusy) return false;
    // Freeze and invalidate immediately; the visible curtain continues for
    // four seconds while no answer/timer/FX callback can touch this run.
    if (typeof V8._prepareQuit === 'function') V8._prepareQuit(gameState);
    else { gameState.lock = true; setInputEnabled(false); }
    return returnToMenu();
  }

  function hideAllOverlays() {
    clearWorldTransition(true);
    $('startScreen').classList.add('hidden');
    $('reviewPanel').classList.add('hidden');
    if (V8.streak) V8.streak.cleanup();
    if (V8.clearBigText) V8.clearBigText();
    document.querySelectorAll('.go-overlay,.vic-overlay,.title-card,#rdy,.coin,.gem,.dust,.flame,.ufo,.big-text,.float-text,.ghost-float,.kbubble,.can,.critter,.beam,.cow,.pet,.qt-impact,.qt-fire-projectile,.v8-streak-fx,.skip-answer-reveal').forEach(n => n.remove());
    $('vignette').classList.remove('on');
    $('vgnDanger').classList.remove('on', 'max');
    document.body.classList.remove('dead-scene', 'frozen', 'slowmo', 'frost', 'rewind');
  }

  // ── READY → GO sequence ───────────────────────────────
  function readySeq(gameState) {
    const runId = gameState.runId;
    gameState.rdy = true;
    setInputEnabled(false);
    const r = document.createElement('div'); r.id = 'rdy'; r.innerHTML = '<div class="rdy-t">READY?</div>';
    document.body.appendChild(r); V8.sfx.tick();

    gameState._readyGoT = setTimeout(() => {
      if (V8._gameState !== gameState || gameState.runId !== runId) return;
      const t = r.firstChild; if (!t) return;
      t.textContent = 'GO!'; t.className = 'rdy-t go'; void t.offsetWidth; V8.sfx.go();
    }, 560);
    gameState._readyDoneT = setTimeout(() => {
      if (V8._gameState !== gameState || gameState.runId !== runId) return;
      r.remove(); gameState.rdy = false;
      gameState._readyGoT = gameState._readyDoneT = null;
      V8.timer.resetWord(gameState);
      setInputEnabled(true);
      focusInput();
    }, 1050);
  }

  // ── Game Over screen ──────────────────────────────────
  function showGameOver(gameState, word, reason) {
    clearWorldTransition(true);
    if (V8.clearBigText) V8.clearBigText();
    $('vignette').classList.remove('on');
    gameState.sceneSpd = .35;
    updateSpeed(gameState);

    const isZE = gameState.mode === 0;
    const ansStr = isZE ? word.e : word.c.join('；');
    const d = document.createElement('div');
    d.className = 'full-overlay go-overlay';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'true');
    d.setAttribute('aria-labelledby', 'goTitle');
    d.setAttribute('aria-describedby', 'goSummary');
    const reasonLabel = reason === 'time' ? '⏰ 时 间 到' : reason === 'giveup' ? '暂 时 不 会' : '跑 酷 终 结';
    d.innerHTML = `<div class="go-card">
      <div class="go-mark" aria-hidden="true">✦</div>
      <div class="go-tag">${reasonLabel}</div><h1 id="goTitle">GAME OVER</h1>
      <p class="go-subtitle" id="goSummary">这一程先停在这里，记住答案，再把下一次跑得更远。</p>
      <div class="go-answer-panel">
        <div class="go-ans-label">正确答案</div>
        <div class="go-answer" aria-live="off"><span id="goTxt"></span><span class="caret" id="goCaret">▌</span></div>
      </div>
      <div class="go-info">📏 <b id="goDist">0</b> / ${(gameState.words || []).length}m · 🪙 <b id="goScore">0</b> · ❤️ ${gameState.hp}/${gameState.maxHp}<br>${isZE ? '汉译英' : '英译汉'} · 第 ${gameState.idx + 1} 词 · 🔥 最高连击 ×${gameState.maxCombo}</div>
      <div class="go-btns"><button class="btn-again" id="btnAgain">⚡ 再来一局</button><button class="btn-ghost" id="btnRev">📖 先去复习</button><button class="btn-ghost" id="btnHome">🗺 选关</button></div>
    </div>`;
    document.body.appendChild(d);

    // Typewriter answer reveal
    let i = 0; const id = gameState.runId;
    const tw = setInterval(() => {
      if (!liveRun(gameState, id)) { clearInterval(tw); return; }
      i++; const g = $('goTxt'); if (!g) { clearInterval(tw); return; }
      g.textContent = ansStr.slice(0, i);
      if (i >= ansStr.length) {
        clearInterval(tw); V8.sfx.ding();
        const c = $('goCaret'); if (c) c.remove();
        if (g) g.parentElement.setAttribute('aria-live', 'polite');
      }
    }, 60);

    // Animated score counting
    countUp($('goDist'), gameState.done, 700, gameState);
    countUp($('goScore'), gameState.score, 900, gameState);

    $('btnAgain').onclick = () => { if (routeBusy) return; if (V8.sfx.confirm) V8.sfx.confirm(); d.remove(); rewindStart(gameState); };
    $('btnRev').onclick = () => { if (routeBusy) return; d.remove(); openReview(true); };
    $('btnHome').onclick = () => { if (routeBusy) return; returnToMenu(); };
    $('btnAgain').focus();
  }

  function countUp(node, to, dur, gameState) {
    const t0 = performance.now();
    const id = gameState && gameState.runId;
    (function f(t) {
      if (!node || !node.isConnected || (gameState && !liveRun(gameState, id))) return;
      const p = Math.min(1, (t - t0) / dur);
      node.textContent = Math.round(to * (1 - (1 - p) * (1 - p)));
      if (p < 1) requestAnimationFrame(f);
    })(t0);
  }

  function rewindStart(gameState) {
    document.body.classList.add('rewind');
    V8.render.R.ts = -1.8; V8.render.R.tsT = -1.8;
    V8.render.R.rings.push({ r: 320, a: .9, dr: -24, col: 'rgba(255,255,255,A)', x: V8.render.R.w / 2, y: V8.render.R.h * .45 });
    V8.sfx.boom();
    const runId = gameState.runId;
    setTimeout(() => {
      if (!liveRun(gameState, runId)) return;
      // Death animations leave body.dead-scene behind. Clear the complete
      // transient scene before the fresh run so its grayscale filter cannot
      // leak into the READY sequence.
      hideAllOverlays();
      V8._resetRun(gameState);
    }, 540);
  }

  // ── Victory screen ────────────────────────────────────
  function showVictory(gameState, options) {
    options = options || {};
    // A normal world shift cannot reach the completion branch, but clearing
    // here makes the invariant explicit for debug/replay paths as well.
    clearWorldTransition(true);
    if (gameState.over) return;
    gameState.over = true; gameState.lock = true;
    const streakTier = Number(options.streakTier) || 0;
    if (typeof V8._stopRunLoops === 'function') V8._stopRunLoops(gameState, { preserveStreak: streakTier > 0 });
    const runId = gameState.runId;
    V8.sfx.win();
    gameState.sceneSpd = 1.25; updateSpeed(gameState);
    V8.render.R.fw = performance.now() + 9000;
    V8.render.R.shake = 5;
    V8.ringFX('rgb(255,215,0)'); V8.ringFX('rgb(125,249,255)');

    const rewardDuration = V8.streak && typeof V8.streak.durationForTier === 'function'
      ? V8.streak.durationForTier(streakTier) : 0;
    const resultDelay = Math.max(1100, rewardDuration + 120);
    setTimeout(() => {
      if (!liveRun(gameState, runId)) return;
      if (V8.clearBigText) V8.clearBigText();
      if (streakTier > 0 && V8.streak) V8.streak.cleanup();
      // Record this challenge. The next word window opens after this window's
      // English forward and reverse pair is complete.
      const progress = gameState.selection && gameState.selection.custom
        ? V8.storage.getProgress()
        : V8.storage.markChallengeComplete(gameState.windowIndex + 1, gameState.challengeId);

      const rank = V8.CFG.rankFromStats(gameState.score, gameState.maxCombo, gameState.mistakes || 0);
      const last = Boolean(gameState.selection && gameState.selection.custom) || gameState.windowIndex >= ((V8.CFG.TOTAL_LEVELS || 1) - 1);

      const d = document.createElement('div');
      d.className = 'full-overlay vic-overlay';
      d.setAttribute('role', 'dialog');
      d.setAttribute('aria-label', '通关结算');
      d.setAttribute('aria-modal', 'true');
      d.innerHTML = `<div class="vic-fireflies" aria-hidden="true">
          <i style="--x:8%;--y:72%;--d:0s"></i><i style="--x:17%;--y:28%;--d:.8s"></i>
          <i style="--x:29%;--y:58%;--d:1.6s"></i><i style="--x:42%;--y:20%;--d:2.2s"></i>
          <i style="--x:56%;--y:76%;--d:.4s"></i><i style="--x:68%;--y:34%;--d:1.2s"></i>
          <i style="--x:81%;--y:62%;--d:2.8s"></i><i style="--x:91%;--y:24%;--d:1.9s"></i>
        </div>
        <div class="vic-card" style="--rank-color:${rank.color}">
          <div class="vic-eyebrow">VOCABULARY TRIAL COMPLETE</div>
          <div class="vic-hero">
            <div class="vic-medallion" aria-label="评级 ${rank.grade}"><span class="vic-grade">${rank.grade}</span></div>
            <div class="vic-heading">
              <h1>${last ? '征途完成' : '试炼完成'}</h1>
              <div class="vic-rank">${rank.label}</div>
              <div class="vic-chapter">${last ? '全量词表征途完成' : `词窗 ${gameState.windowIndex + 1} 完成`} · ${V8.WORD_PACK.title}</div>
            </div>
          </div>
          <div class="vic-stats">
            <div class="vic-stat"><small>最终得分</small><strong>${gameState.score}</strong></div>
            <div class="vic-stat"><small>完成路程</small><strong>${gameState.done} / ${(gameState.words || []).length}m</strong></div>
            <div class="vic-stat"><small>最高连击</small><strong>×${gameState.maxCombo}</strong></div>
            <div class="vic-stat"><small>剩余生命</small><strong>${gameState.hp} / ${gameState.maxHp}</strong></div>
          </div>
          <div class="vic-stamp">${new Date().toLocaleDateString('zh-CN')} · 本次成绩已记录<br><b>截图即可保存这一程的通关凭证</b></div>
          <div class="go-btns vic-actions">${last ? '' : '<button class="btn-again" id="btnVicNext">继续选关 →</button>'}<button class="${last ? 'btn-again' : 'btn-ghost'}" id="btnVicAgain">再挑战</button><button class="btn-ghost" id="btnVicRev">复习词表</button><button class="btn-ghost" id="btnVicHome">返回选关</button></div>
        </div>`;
      document.body.appendChild(d);

      // S-rank: extra celebration
      if (rank.grade === 'S') {
        const badge = document.createElement('div');
        badge.className = 'vic-rank-burst';
        badge.textContent = 'S RANK';
        d.querySelector('.vic-card').appendChild(badge);
        setTimeout(() => badge.remove(), 1800);
        for (let i = 0; i < 5; i++) setTimeout(() => {
          if (liveRun(gameState, runId)) V8.firework(.2 + Math.random() * .6, .1 + Math.random() * .5);
        }, i * 200);
      }

      if (!last) $('btnVicNext').onclick = () => { if (routeBusy) return; returnToMenu(gameState.windowIndex); };
      $('btnVicAgain').onclick = () => { if (routeBusy) return; if (V8.sfx.confirm) V8.sfx.confirm(); d.remove(); rewindStart(gameState); };
      $('btnVicRev').onclick = () => { if (routeBusy) return; d.remove(); openReview(true); };
      $('btnVicHome').onclick = () => { if (routeBusy) return; returnToMenu(); };
      (last ? $('btnVicAgain') : $('btnVicNext')).focus();
    }, resultDelay);
  }

  // ── Review mode ────────────────────────────────────────
  let RI = 0, RM = 'en', RR = false;

  function renderReviewPanel(fromGame, playCue) {
    if (playCue !== false) {
      V8.ac && V8.ac();
      if (V8.sfx.select) V8.sfx.select();
    }
    // Opening review from the menu keeps its current soundtrack and position.
    // A review opened from gameplay first returns from the world track to menu music.
    if (fromGame && V8.bgm) V8.bgm.boot(true);
    if (fromGame) {
      const gameState = V8._gameState;
      const selection = gameState && gameState.selection || {};
      setReviewWords(gameState && gameState.words, selection.startIndex, selection.endIndex);
      stopRunForMenu();
      ['bgCanvas', 'fxCanvas', 'stage', 'wordStage', 'hud', 'distOverlay', 'inputBar', 'skillBar'].forEach(id => $(id).classList.add('hidden'));
      $('vignette').classList.remove('on'); $('vgnDanger').classList.remove('on', 'max');
      document.body.classList.remove('dead-scene', 'frozen', 'slowmo');
      V8.render.R.fw = 0;
    }
    $('startScreen').classList.add('hidden');
    $('reviewPanel').classList.remove('hidden');
    if (!fromGame) updateReviewRange();
    RI = 0; RR = false;
    updateReviewCard();
  }

  function openReview(fromGame) {
    if (!fromGame) {
      if (routeBusy) return false;
      V8.ac && V8.ac();
      if (V8.sfx.select) V8.sfx.select();
      return playRouteTransition({
        label: '进入单次浏览 · 先熟悉这一组词',
        kind: 'review',
        chapter: 'RV',
        accent: '#739be8',
        onMidpoint: () => renderReviewPanel(false, false),
      });
    }
    renderReviewPanel(true, true);
    return true;
  }

  function closeReview() {
    if (routeBusy) return;
    if (V8.sfx.back) V8.sfx.back();
    playRouteTransition({
      label: '回到选关 · 继续准备',
      kind: 'return',
      chapter: 'HM',
      accent: '#5d91e6',
      onMidpoint: () => {
        stopRunForMenu();
        $('reviewPanel').classList.add('hidden');
        showStartScreen({ preserveBgm: true });
        if (V8._gameState) V8._gameState.sceneSpd = 1;
      },
    });
  }

  function setReviewMode(m) {
    RM = m; RR = false;
    $('revEn').className = m === 'en' ? 'active' : '';
    $('revCn').className = m === 'cn' ? 'active' : '';
    $('revBoth').className = m === 'both' ? 'active' : '';
    [['revEn', 'en'], ['revCn', 'cn'], ['revBoth', 'both']].forEach(([id, mode]) => $(id).setAttribute('aria-pressed', mode === m ? 'true' : 'false'));
    updateReviewCard();
  }

  function updateReviewCard() {
    const words = reviewWords;
    const w = words[RI];
    if (!w) return;
    $('revMain').textContent = RM === 'cn' ? w.c[0] : (w.e + ' ' + w.p);
    $('revSub').textContent = RM === 'cn' ? (w.e + ' ' + w.p) : w.c.join('；');
    const open = RR || RM === 'both';
    $('revSub').style.display = open ? 'block' : 'none';
    $('revHint').style.display = open ? 'none' : 'block';
    $('revCounter').textContent = (RI + 1) + ' / ' + words.length;
    $('revPrev').disabled = RI === 0;
    $('revNext').disabled = RI === words.length - 1;
    const c = $('revCard');
    if (c) {
      c.setAttribute('aria-expanded', open ? 'true' : 'false');
      c.classList.remove('flip'); void c.offsetWidth; c.classList.add('flip');
    }
  }

  function revealCard() { RR = true; V8.sfx.ui(); updateReviewCard(); }
  function revNav(d) {
    const words = reviewWords;
    const next = Math.max(0, Math.min(words.length - 1, RI + d));
    if (next === RI) return false;
    RI = next;
    RR = false; V8.sfx.ui(); updateReviewCard();
    return true;
  }

  function handleReviewKeydown(e) {
    if (e.isComposing || routeBusy) return;
    const panel = $('reviewPanel');
    if (!panel || panel.classList.contains('hidden')) return;
    const target = e.target;
    if (target && target.closest && target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    revNav(e.key === 'ArrowLeft' ? -1 : 1);
  }

  // ── Debug mode ─────────────────────────────────────────
  let dbgBuf = '';
  function toggleDebug(gameState) {
    gameState.dbg = !gameState.dbg;
    $('dbgBadge').classList.toggle('hidden', !gameState.dbg);
    if (gameState.dbg) { gameState.dbgTainted = true; V8.bigText('DBG MODE ON', '#ffe97a'); }
    else V8.bigText('DBG MODE OFF', '#ffe97a');
    V8.sfx.ui();
  }

  function dbgKey(k, gameState) {
    V8.ac && V8.ac();
    if (k === '1') { if (gameState.lock || gameState.rdy) return; V8.bigText('DBG ⏭ WORLD', '#ffe97a'); gameState.idx = Math.max(0, (gameState.words || []).length - 1); V8.words.advance(gameState); }
    else if (k === '2') { gameState.combo += 5; gameState.maxCombo = Math.max(gameState.maxCombo, gameState.combo); updateHUD(gameState); V8.bigText('DBG 🔥+5', '#ffe97a'); }
    else if (k === '3') { if (gameState.flying) return; V8.bigText('DBG 🚀 FLY', '#ffe97a'); V8.player.startFlight(gameState, $('char')); }
    else if (k === '4') { gameState.timeLeft = 5; gameState.lastTick = performance.now(); V8.timer.updateTimerDisplay(gameState); V8.bigText('DBG ⏰ 5s', '#ffe97a'); }
    else if (k === '5') { V8.bigText('DBG 💀', '#ffe97a'); V8.bus.emit('word:wrong', { word: V8.words.currentWord(gameState) }); }
    else if (k === '6') { V8.bigText('DBG 🏆', '#ffe97a'); showVictory(gameState); }
  }

  // ── Mute buttons ──────────────────────────────────────
  function initMuteButtons() {
    const sfxMuted = V8.storage.getSfxMuted();
    const bgmMuted = V8.storage.getBgmMuted();
    V8.SFX_MUTED = sfxMuted;
    V8._bgmMuted = bgmMuted;
    updateMuteBtnDisplay();
  }

  function updateMuteBtnDisplay() {
    const bgmBtn = $('bgmBtn');
    const muteBtn = $('muteBtn');
    const startBgmBtn = $('startBgmBtn');
    const stopped = Boolean(V8.bgm && V8.bgm.isStopped());
    if (bgmBtn) bgmBtn.textContent = V8.storage.getBgmMuted() ? '🔕' : '🎵';
    if (muteBtn) muteBtn.textContent = (V8.storage.getBgmMuted() && V8.storage.getSfxMuted()) ? '🔇' : '🔊';
    if (startBgmBtn) {
      const icon = startBgmBtn.querySelector('.start-audio-icon');
      const label = startBgmBtn.querySelector('.start-audio-label');
      startBgmBtn.dataset.state = stopped ? 'stopped' : 'playing';
      startBgmBtn.setAttribute('aria-pressed', stopped ? 'true' : 'false');
      startBgmBtn.title = stopped ? '播放背景音乐' : '停止背景音乐';
      if (icon) icon.textContent = stopped ? '▶' : '⏹';
      if (label) label.textContent = stopped ? '播放音乐' : '停止音乐';
    }
  }

  function toggleAllMute() {
    const allMuted = V8.storage.getBgmMuted() && V8.storage.getSfxMuted();
    if (V8.bgm && typeof V8.bgm.setMuted === 'function') V8.bgm.setMuted(!allMuted);
    else V8.storage.setBgmMuted(!allMuted);
    V8.storage.setSfxMuted(!allMuted);
    V8.SFX_MUTED = !allMuted;
    updateMuteBtnDisplay();
    if (!V8.SFX_MUTED) V8.sfx.ui();
  }

  // ── Mobile viewport ────────────────────────────────────
  function fitVP() {
    const vv = window.visualViewport;
    let h = window.innerHeight, kb = 0;
    if (vv) { kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop); h = vv.height; }
    document.documentElement.style.setProperty('--kb', kb + 'px');
    document.documentElement.style.setProperty('--vvh', h + 'px');
    V8.render.sizeCanvases();
    window.scrollTo(0, 0);
  }

  // ── Export public API ──────────────────────────────────
  V8.ui = {
    updateHUD, updateSpeed, focusInput, setInputEnabled,
    showStartScreen, renderLevelButtons, startLevel, returnToMenu, quitRun, playRouteTransition, showWorldTransition, hideAllOverlays,
    toggleStartSkin, syncSectionUI, switchSection,
    readySeq, showGameOver, showVictory, rewindStart,
    openReview, closeReview, setReviewMode, updateReviewCard, revealCard, revNav,
    toggleDebug, dbgKey, dbgBuf,
    initMuteButtons, updateMuteBtnDisplay, toggleAllMute,
    fitVP,
  };

  // Attach onclick handlers globally
  window.openReview = () => V8.ui.openReview(false);
  window.closeReview = () => V8.ui.closeReview();
  window.setRevMode = (m) => V8.ui.setReviewMode(m);
  window.revealCard = () => V8.ui.revealCard();
  window.revNav = (d) => V8.ui.revNav(d);
  window.bgmToggle = () => { V8.bgm.toggle(); V8.ui.updateMuteBtnDisplay(); };
  window.bgmStopToggle = () => { V8.bgm.toggleStopped(); V8.ui.updateMuteBtnDisplay(); };
  window.toggleStartSkin = () => V8.ui.toggleStartSkin();
  window.toggleMute = () => V8.ui.toggleAllMute();
  document.addEventListener('keydown', handleReviewKeydown);
})(window.V8 = window.V8 || {});
