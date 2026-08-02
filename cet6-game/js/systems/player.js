/**
 * Player system — Qt-Gaming animation renderer with pixel-art fallback.
 */
(function(V8) {
  'use strict';

  const { PAL, CHAR_MAPS, charModeFor } = V8.CFG;
  const TERRAIN_FLIGHT_STATES = new Set(['forestSlope', 'iceCliff', 'cyberSlope', 'seaWave']);

  // Precompute box-shadow CSS for each character frame
  function charShadow(map) {
    let out = [];
    for (let y = 0; y < map.length; y++)
      for (let x = 0; x < map[y].length; x++)
        if (PAL[map[y][x]]) out.push((x * 4) + 'px ' + (y * 4) + 'px 0 0 ' + PAL[map[y][x]]);
    return out.join(',');
  }
  const CHAR_CSS = {};
  for (let k in CHAR_MAPS) CHAR_CSS[k] = charShadow(CHAR_MAPS[k]);

  let charFrame = 0;
  let playerMode = '';
  let qtPlayerReady = false;

  function setPlayerAsset(mode) {
    const assets = V8.ASSETS && V8.ASSETS.player;
    const img = document.getElementById('qtPlayer');
    const charEl = document.getElementById('char');
    if (!assets || !img || !charEl || !assets[mode]) return;
    if (mode === playerMode && qtPlayerReady) {
      charEl.classList.add('qt-ready');
      return;
    }
    playerMode = mode;
    img.onload = () => { qtPlayerReady = true; charEl.classList.add('qt-ready'); };
    img.onerror = () => { qtPlayerReady = false; charEl.classList.remove('qt-ready'); };
    if (img.getAttribute('src') !== assets[mode]) img.src = assets[mode];
    else if (img.complete && img.naturalWidth) img.onload();
  }

  function syncAsset(gameState) {
    if (!gameState) return;
    const enhanced = gameState.combo >= 5;
    const running = charModeFor(gameState.phase) === 'run';
    const standing = gameState.rdy || gameState.over || !running;
    setPlayerAsset(enhanced
      ? (standing ? 'enhancedIdle' : 'enhancedRun')
      : (standing ? 'idle' : 'run'));
  }

  /** Set the knight pixel art to a specific frame letter. */
  function setChar(frame) {
    const css = CHAR_CSS[frame];
    const px = document.getElementById('charPx');
    const g1 = document.getElementById('g1');
    const g2 = document.getElementById('g2');
    if (px) px.style.boxShadow = css;
    if (g1) g1.style.boxShadow = css;
    if (g2) g2.style.boxShadow = css;
  }

  /** Cycle animation frame for running. */
  function cycleFrame(phase, warn) {
    const mode = charModeFor(phase);
    if (warn) setChar('P');          // panic frame
    else if (mode === 'skate') setChar('S');  // skate frame
    else if (mode === 'glide') setChar('G');  // glide frame
    else { charFrame ^= 1; setChar(charFrame ? 'B' : 'A'); } // run cycle
  }

  /** Start character animation loop. */
  function startCharLoop(gameState) {
    const id = gameState.runId;
    const step = () => {
      if (gameState.runId !== id || V8._gameState !== gameState) return;
      if (gameState.started && !gameState.over && !gameState.jumping && !gameState.flying) {
        cycleFrame(gameState.phase, gameState.warn);
      }
      syncAsset(gameState);
      const spd = gameState.spd || 1;
      gameState._charT = setTimeout(step, Math.max(90, 180 / spd));
    };
    step();
  }

  /** Spawn dust/flame particles behind knight. */
  function spawnDust(gameState, charEl, phase) {
    if (!charEl) return;
    const r = charEl.getBoundingClientRect();
    if (gameState.flying) { spawnFlame(charEl, true); spawnFlame(charEl, false); return; }
    if (gameState.jumping || charModeFor(phase) === 'glide') return;

    const d = document.createElement('div'); d.className = 'dust';
    const sz = 3 + Math.random() * 4;
    d.style.cssText = `left:${r.left + 6}px;top:${r.bottom - 6}px;width:${sz}px;height:${sz}px`;
    document.body.appendChild(d); setTimeout(() => d.remove(), 560);

    if (phase === 1) {
      const s2 = document.createElement('div'); s2.className = 'flame';
      s2.style.cssText = `left:${r.left + 2}px;top:${r.bottom - 4}px;width:3px;height:3px;background:#ffe97a;box-shadow:0 0 8px 1px rgba(255,220,80,.9);--dx:${(-10 - Math.random() * 10)|0}px`;
      document.body.appendChild(s2); setTimeout(() => s2.remove(), 500);
    }
  }

  function spawnFlame(charEl, big) {
    const r = charEl.getBoundingClientRect();
    const d = document.createElement('div'); d.className = 'flame';
    const sz = (big ? 5 : 3) + Math.random() * 5;
    d.style.cssText = `left:${r.left + r.width / 2 - 4 + (Math.random() * 12 - 6)}px;top:${r.bottom - 8}px;width:${sz}px;height:${sz}px;background:${Math.random() < .5 ? '#ff9a3c' : '#ffd700'};box-shadow:0 0 10px 2px rgba(255,150,40,.8);--dx:${(Math.random() * 16 - 8)|0}px`;
    document.body.appendChild(d); setTimeout(() => d.remove(), 520);
  }

  /** Start dust/flame loop. */
  function startDustLoop(gameState) {
    const id = gameState.runId;
    const step = () => {
      if (gameState.runId !== id || V8._gameState !== gameState) return;
      if (gameState.started && !gameState.over) {
        spawnDust(gameState, document.getElementById('char'), gameState.phase);
      }
      gameState._dustT = setTimeout(step, Math.max(110, 340 / (gameState.spd || 1)));
    };
    step();
  }

  // ── Player jump initiation (called by word system on correct) ──
  function doJump(gameState, charEl) {
    // Terrain plugins own the vertical arc until they land. A correct answer
    // still advances the word, but must not replace the active parabola.
    if (TERRAIN_FLIGHT_STATES.has(gameState.gstate)) return false;
    syncAsset(gameState);
    setChar('J'); V8.sfx.jump();
    if (gameState.gstate === 'flight') return false;
    gameState.gstate = 'jump'; gameState.jumping = true;
    gameState.airborne = true;
    gameState.airB = parseFloat(charEl.style.bottom) || (window.innerHeight * .14);
    charEl.classList.remove('jump'); void charEl.offsetWidth; charEl.classList.add('jump');
    return true;
  }

  function clearTerrainMotion(charEl) {
    if (!charEl) return;
    charEl.classList.remove('terrain-flight', 'terrain-landing');
    const inner = charEl.querySelector('.char-inner');
    if (inner) inner.style.removeProperty('transform');
  }

  // ── Landing (called by animationend or timeout) ──
  function landFrom(gameState, charEl, g) {
    if (gameState.gstate !== g) return;
    const CLS = { jump: 'jump', flight: 'fly', flip: 'flip', djump: 'djump' };
    charEl.classList.remove(CLS[g]);
    if (g === 'flight') { gameState.flying = false; gameState.lastTick = performance.now(); }
    else gameState.jumping = false;
    gameState.gstate = 'ground';
    gameState.airborne = false;
    gameState.landN = 2;
  }

  // ── Ambient actions (dash/flip/djump, from v7 ambientLoop) ──
  function doDash(gameState, charEl) {
    gameState.gstate = 'dash';
    gameState.dashT0 = performance.now();
    // Keep the motion obvious without letting a narrow viewport fling the player off-screen.
    const viewport = Math.max(320, Number(window.innerWidth) || 1024);
    const minDist = Math.max(84, Math.min(132, viewport * .14));
    const maxDist = Math.max(minDist + 34, Math.min(280, viewport * .32));
    gameState.dashDist = minDist + Math.random() * (maxDist - minDist);
    if (charEl) { gameState._dashY = charEl.getBoundingClientRect().top + 18; }
    V8._dashY = gameState._dashY;
    V8._dashT0 = gameState.dashT0;
    charEl.classList.add('dash');
    setTimeout(() => { charEl.classList.remove('dash'); if (gameState.gstate === 'dash') gameState.gstate = 'ground'; }, 600);
  }

  function doFlip(gameState, charEl) {
    gameState.gstate = 'flip'; gameState.airborne = true;
    gameState.airB = parseFloat(charEl.style.bottom) || (window.innerHeight * .14);
    gameState.jumping = true; setChar('J'); V8.sfx.jump();
    charEl.classList.remove('flip'); void charEl.offsetWidth; charEl.classList.add('flip');
    setTimeout(() => landFrom(gameState, charEl, 'flip'), 830);
  }

  function doDjump(gameState, charEl) {
    gameState.gstate = 'djump'; gameState.airborne = true;
    gameState.airB = parseFloat(charEl.style.bottom) || (window.innerHeight * .14);
    gameState.jumping = true; setChar('J'); V8.sfx.jump();
    charEl.classList.remove('djump'); void charEl.offsetWidth; charEl.classList.add('djump');
    setTimeout(() => landFrom(gameState, charEl, 'djump'), 930);
  }

  function startFlight(gameState, charEl) {
    if (gameState.over || TERRAIN_FLIGHT_STATES.has(gameState.gstate)) return;
    if (gameState.gstate === 'flip' || gameState.gstate === 'djump') charEl.classList.remove('flip', 'djump');
    gameState.flying = true; gameState.gstate = 'flight';
    gameState.airborne = true;
    gameState.airB = parseFloat(charEl.style.bottom) || (window.innerHeight * .14);
    setChar('F');
    charEl.classList.remove('fly'); void charEl.offsetWidth; charEl.classList.add('fly');
    V8.sfx.riser();
    setTimeout(() => landFrom(gameState, charEl, 'flight'), 3450);
  }

  // ── Death animations ──────────────────────────────────
  /** Timeout death: petrify */
  function deathTimeout(gameState, charEl) {
    clearTerrainMotion(charEl);
    gameState.over = true; gameState.lock = true; gameState.dead = true; gameState.flying = false;
    gameState.sceneSpd = 0.001;
    document.body.classList.add('frozen');
    gameState.gstate = 'dead'; gameState.airborne = true;
    V8.sfx.die();
    setPlayerAsset(gameState.combo >= 5 ? 'enhancedIdle' : 'idle');
    // Petrify: freeze + gray
    setTimeout(() => {
      document.body.classList.remove('frozen');
      document.body.classList.add('dead-scene');
      charEl.classList.remove('fly', 'jump', 'flip', 'djump');
      gameState.jumping = true; setChar('J');
      charEl.classList.add('die');
      V8.sfx.thud();
      V8.render.R.shake = 6;
    }, 300);
  }

  /** Wrong answer death: spin out (v7 original) */
  function deathWrong(gameState, charEl) {
    clearTerrainMotion(charEl);
    gameState.over = true; gameState.lock = true; gameState.dead = true; gameState.flying = false;
    gameState.sceneSpd = 0.001;
    document.body.classList.add('frozen');
    document.getElementById('vignette').classList.add('on');
    gameState.gstate = 'dead'; gameState.airborne = true;
    V8.sfx.die();
    setPlayerAsset(gameState.combo >= 5 ? 'enhancedIdle' : 'idle');
    setTimeout(() => {
      document.body.classList.remove('frozen');
      document.body.classList.add('dead-scene');
      charEl.classList.remove('fly', 'jump', 'flip', 'djump');
      gameState.jumping = true; setChar('J');
      charEl.classList.add('die');
      V8.sfx.thud();
      V8.render.R.shake = 6;
    }, 240);
  }

  /** High-combo break death: explode */
  function deathExplode(gameState, charEl) {
    clearTerrainMotion(charEl);
    gameState.over = true; gameState.lock = true; gameState.dead = true; gameState.flying = false;
    V8.sfx.die();
    // Big explosion particles from knight position
    const r = charEl.getBoundingClientRect();
    V8.coinBurst(r.left + r.width / 2, r.top + r.height / 2, 4);
    V8.firework(.17, .6);
    V8.qtImpactFX && V8.qtImpactFX('bomb', r.left + r.width / 2, r.top + r.height / 2);
    gameState.sceneSpd = 0.001;
    document.body.classList.add('frozen');
    setTimeout(() => {
      document.body.classList.remove('frozen');
      document.body.classList.add('dead-scene');
      charEl.classList.add('die');
      V8.render.R.shake = 9;
      V8.sfx.thud();
    }, 200);
  }

  V8.player = {
    setChar, setPlayerAsset, syncAsset, CHAR_CSS, charFrame,
    startCharLoop, startDustLoop,
    doJump, landFrom,
    doDash, doFlip, doDjump, startFlight,
    deathTimeout, deathWrong, deathExplode,
    spawnDust, spawnFlame,
  };
})(window.V8 = window.V8 || {});
