/**
 * Particle system — coin bursts, fireworks, impact rings, floating text effects.
 */
(function(V8) {
  'use strict';

  const { R } = V8.render;
  const COIN_COLS = [[255, 215, 0], [255, 236, 138], [248, 184, 0], [255, 246, 200], [255, 179, 71]];
  const FW_COLS = [[255, 80, 80], [80, 200, 255], [255, 215, 0], [200, 120, 255], [120, 255, 160], [255, 140, 200]];

  /** Spawn coin particle burst at (cx, cy) in CSS pixels. juice = intensity multiplier. */
  function coinBurst(cx, cy, juice) {
    juice = juice || 1;
    const n = Math.round((9 + Math.random() * 6) * juice);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, sp = (2 + Math.random() * 5) * (0.8 + juice * .25);
      R.parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 3, g: .22, sz: 2 + Math.random() * 3.4,
        col: COIN_COLS[Math.floor(Math.random() * 5)], life: 450 + Math.random() * 350, max: 800, kind: 'coin' });
    }
    for (let i = 0; i < Math.round(5 * juice); i++) {
      const a = Math.random() * 6.283, sp = 4 + Math.random() * 7;
      R.parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: .05, sz: 1.5 + Math.random() * 2,
        col: [255, 255, 255], life: 280 + Math.random() * 200, max: 480, kind: 'spark' });
    }
  }

  /** Firework at normalized (fx, fy). */
  function firework(fx, fy) {
    const col = FW_COLS[Math.floor(Math.random() * FW_COLS.length)];
    const col2 = FW_COLS[Math.floor(Math.random() * FW_COLS.length)];
    const n = 44 + Math.floor(Math.random() * 34), cx = fx * R.w, cy = fy * R.h;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + Math.random() * .2, sp = 2.8 + Math.random() * 4.2;
      R.parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: .045, sz: 2 + Math.random() * 2.4,
        col: Math.random() < .75 ? col : col2, life: 1000 + Math.random() * 1000, max: 2000, kind: 'fw' });
    }
    R.shake = Math.max(R.shake, 2.5);
  }

  /** Impact ring effect. */
  function ringFX(cssCol, cx, cy) {
    R.rings.push({ r: 12, a: 1, col: cssCol.replace(')', ',A)').replace('rgb', 'rgba'),
      x: cx === undefined ? R.w / 2 : cx, y: cy === undefined ? R.h * .38 : cy, dr: 13 });
  }

  /** Layered, skin-owned landing burst used by slope and wave plugins. */
  function terrainLandingFX(options) {
    options = options || {};
    const cx = Number.isFinite(options.x) ? options.x : R.w * .17 + 24;
    const cy = Number.isFinite(options.y) ? options.y : R.h * .72;
    const rings = Array.isArray(options.rings) && options.rings.length ? options.rings : ['rgb(255,255,255)'];
    const colors = Array.isArray(options.colors) && options.colors.length ? options.colors : [[255,255,255]];
    const ringScaleY = Number.isFinite(options.ringScaleY) ? options.ringScaleY : 1;
    const ringCount = Math.min(5, Math.max(1, options.ringCount || 3));
    const ringStep = Number.isFinite(options.ringStep) ? options.ringStep : 8;
    for (let i = 0; i < ringCount; i++) {
      const color = rings[i % rings.length];
      const rgba = Array.isArray(color)
        ? `rgba(${color.join(',')},A)`
        : String(color).replace(')', ',A)').replace('rgb', 'rgba');
      R.rings.push({
        r: (options.ringStart || 8) + i * ringStep,
        a: Math.max(.42, .98 - i * .13),
        col: rgba, x: cx, y: cy,
        dr: (options.ringSpeed || 11) + i * 2,
        sy: ringScaleY,
      });
    }

    const count = Math.min(42, Math.max(0, options.count || 22));
    const spread = Number.isFinite(options.spread) ? options.spread : 4.8;
    const lift = Number.isFinite(options.lift) ? options.lift : 4.2;
    const gravity = Number.isFinite(options.gravity) ? options.gravity : .08;
    const life = Number.isFinite(options.life) ? options.life : 860;
    for (let i = 0; i < count; i++) {
      const color = colors[i % colors.length];
      const angle = (Math.random() - .5) * Math.PI * .92;
      const speed = spread * (.48 + Math.random() * .72);
      const actualLife = life * (.72 + Math.random() * .42);
      R.parts.push({
        x: cx + (Math.random() - .5) * 8,
        y: cy - Math.random() * 4,
        vx: Math.sin(angle) * speed,
        vy: -(lift * (.52 + Math.random() * .82)),
        g: gravity,
        sz: .9 + Math.random() * 2.35,
        col: color,
        life: actualLife,
        max: actualLife,
        kind: 'terrain',
      });
    }
    R.shake = Math.max(R.shake || 0, Number.isFinite(options.shake) ? options.shake : 2.4);
  }

  /** Milestone burst: rings + particles + screen shake. */
  function burstFX(x, y) {
    ringFX('rgb(255,215,0)', x, y); ringFX('rgb(125,249,255)', x, y);
    R.shake = Math.max(R.shake, 7);
    coinBurst(x, y, 2);
  }

  /** DOM floating text "+N" style. */
  function floatText(txt, col, top) {
    const f = document.createElement('div'); f.className = 'float-text'; f.textContent = txt;
    f.style.color = col; f.style.top = top || '24%'; document.body.appendChild(f);
    setTimeout(() => f.remove(), 980);
  }

  /** DOM big centered text. */
  function bigText(txt, col) {
    const f = document.createElement('div'); f.className = 'big-text'; f.textContent = txt;
    f.style.color = col; document.body.appendChild(f);
    setTimeout(() => f.remove(), 1280);
  }

  /** Coin fly from brick to score display (DOM animation). */
  function coinFlyFX(brickEl, scoreEl) {
    const from = brickEl.getBoundingClientRect(), to = scoreEl.getBoundingClientRect();
    const gem = Math.random() < .10;
    const c = document.createElement('div'); c.className = gem ? 'gem' : 'coin';
    const cx = from.left + from.width / 2 - 11, cy = from.top - 8;
    c.style.left = cx + 'px'; c.style.top = cy + 'px';

    if (!gem && Math.random() < .05) {
      c.classList.add('drop');
      c.style.setProperty('--gy', Math.max(40, (V8.render.groundY(cx + 11) - 22) - cy) + 'px');
      document.body.appendChild(c);
      V8.sfx.bonus(1);
      setTimeout(() => { c.remove(); scorePopFX(scoreEl); }, 1120);
      return;
    }
    c.style.setProperty('--fx', (to.left + to.width / 2 - cx - 11) + 'px');
    c.style.setProperty('--fy', (to.top + to.height / 2 - cy - 11) + 'px');
    document.body.appendChild(c);
    if (gem) { V8.sfx.gem(); bigText('💎 RAINBOW GEM!!', '#7df9ff'); ringFX('rgb(255,255,255)', R.w / 2, R.h * .4); for (let i = 0; i < 3; i++) coinBurst(R.w * (.22 + Math.random() * .56), R.h * (.18 + Math.random() * .4), 1.6); }
    setTimeout(() => c.remove(), 700);
    setTimeout(() => scorePopFX(scoreEl), 600);
  }

  function scorePopFX(el) {
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
  }

  /** Qt I-key fire projectiles, transformed from the two runtime GIF sources. */
  function qtFireBurstFX(cx, cy) {
    const effects = V8.ASSETS && V8.ASSETS.effects;
    if (!effects || !effects.flyFireRight || !effects.flyFireLeftDown) return;

    const diag = Math.SQRT1_2;
    const distance = Math.min(220, Math.max(128, Math.min(window.innerWidth, window.innerHeight) * .25));
    const directions = [
      { x: 1, y: 0, src: effects.flyFireRight, orient: 'none' },
      { x: diag, y: -diag, src: effects.flyFireLeftDown, orient: 'rotate(180deg)' },
      { x: 0, y: 1, src: effects.flyFireRight, orient: 'rotate(90deg)' },
      { x: diag, y: diag, src: effects.flyFireLeftDown, orient: 'scaleX(-1)' },
      { x: -1, y: 0, src: effects.flyFireRight, orient: 'scaleX(-1)' },
      { x: -diag, y: diag, src: effects.flyFireLeftDown, orient: 'none' },
      { x: 0, y: -1, src: effects.flyFireRight, orient: 'rotate(-90deg)' },
      { x: -diag, y: -diag, src: effects.flyFireLeftDown, orient: 'scaleY(-1)' },
    ];
    const stamp = Math.round(performance.now());

    directions.forEach((dir, index) => {
      const projectile = document.createElement('div');
      projectile.className = 'qt-fire-projectile';
      projectile.style.left = cx + 'px';
      projectile.style.top = cy + 'px';
      projectile.style.setProperty('--dx', (dir.x * distance) + 'px');
      projectile.style.setProperty('--dy', (dir.y * distance) + 'px');

      const img = document.createElement('img');
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      img.style.setProperty('--orientation', dir.orient);
      img.src = dir.src + '#burst=' + stamp + '-' + index;
      projectile.appendChild(img);
      document.body.appendChild(projectile);
      setTimeout(() => projectile.remove(), 920);
    });
  }

  function qtImpactFX(kind, cx, cy, extraClass) {
    const src = V8.ASSETS && V8.ASSETS.effects && V8.ASSETS.effects[kind];
    if (!src) return null;
    const img = document.createElement('img');
    img.className = 'qt-impact ' + (kind === 'fireHit' ? 'fire-hit' : 'bomb');
    if (extraClass) img.classList.add(extraClass);
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.style.left = cx + 'px';
    img.style.top = cy + 'px';
    // A cache-busting fragment restarts the animated WebP for each impact.
    img.src = src + '#t=' + Math.round(performance.now());
    document.body.appendChild(img);
    if (kind === 'bomb') {
      setTimeout(() => {
        if (img.isConnected) qtFireBurstFX(cx, cy);
      }, 900);
    }
    setTimeout(() => img.remove(), kind === 'bomb' && extraClass ? 1320 : kind === 'bomb' ? 1060 : 720);
    return img;
  }

  /**
   * Evolution fanfare: two or three compact Qt bombs orbit the player and
   * each one releases the same eight-direction fly-fire burst as Qt's I key.
   * The optional game state guard prevents delayed bombs from appearing after
   * the run has been abandoned.
   */
  function qtEvolutionBombFX(charEl, gameState) {
    if (!charEl) return;
    const r = charEl.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height * .42;
    const spread = Math.max(48, Math.min(92, r.width * .52));
    const positions = [
      { x: -spread, y: 8 },
      { x: spread, y: -4 },
      { x: 0, y: -Math.max(42, r.height * .52) },
    ];
    const count = Math.random() < .58 ? 3 : 2;
    const stateIsLive = () => !gameState ||
      (V8._gameState === gameState && gameState.started && !gameState.over);

    R.shake = Math.max(R.shake || 0, 7);
    R.flashA = Math.max(R.flashA || 0, .22);
    positions.slice(0, count).forEach((point, index) => {
      setTimeout(() => {
        if (!stateIsLive()) return;
        qtImpactFX('bomb', cx + point.x, cy + point.y, 'evolution-bomb');
      }, index * 135);
    });
  }

  /** Hit FX pool: magic/flame/bolt/frost, weighted by combo tier. */
  function hitFX(brickEl, comboCount) {
    const tier = comboCount >= 15 ? 3 : comboCount >= 10 ? 2 : comboCount >= 5 ? 1 : 0;
    const WTS = [[4, 2, 1, 1], [2, 3, 2, 2], [1, 3, 3, 2], [1, 2, 4, 3]][tier];
    let r = Math.random() * 8, i = 0;
    while (r >= WTS[i]) { r -= WTS[i]; i++; }
    const rc = brickEl.getBoundingClientRect(), cx = rc.left + rc.width / 2, cy = rc.top + rc.height / 2;
    const juice = 1 + tier * .45, t = performance.now();
    qtImpactFX(comboCount >= 15 && comboCount % 5 === 0 ? 'bomb' : 'fireHit', cx, cy);

    if (i === 0) { // Magic burst
      ringFX('rgb(210,160,255)', cx, cy); ringFX('rgb(255,255,255)', cx, cy);
      R.flashA = Math.max(R.flashA, .16 + .07 * tier);
      for (let k = 0; k < Math.round(12 * juice); k++) {
        const a = Math.random() * 6.283, sp = 2 + Math.random() * 4.5;
        R.parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: .03, sz: 1.4 + Math.random() * 2,
          col: Math.random() < .5 ? [220, 170, 255] : [255, 255, 255], life: 320 + Math.random() * 260, max: 580, kind: 'spark' });
      }
    } else if (i === 1) { // Fire
      for (let k = 0; k < Math.round(13 * juice); k++) {
        R.parts.push({ x: cx + (Math.random() * 20 - 10), y: cy, vx: (Math.random() - .5) * 3.4, vy: -(2.5 + Math.random() * 4.5), g: .1,
          sz: 1.8 + Math.random() * 2.6, col: Math.random() < .6 ? [255, 140, 40] : [255, 210, 60], life: 340 + Math.random() * 260, max: 600, kind: 'spark' });
      }
      R.shake = Math.min(9, R.shake + 1 + tier * .5);
      V8.sfx.boom();
    } else if (i === 2) { // Bolt
      const pts = [], ty = cy / R.h;
      let bx = cx / R.w + (Math.random() - .5) * .06, by = 0; pts.push([bx, by]);
      while (by < ty * .92) { bx += (Math.random() - .5) * .07; by += ty * (.18 + Math.random() * .2); pts.push([bx, Math.min(by, ty)]); }
      pts.push([cx / R.w, ty]);
      R.events.push({ kind: 'bolt', pts, life: 300, born: t });
      R.flashA = .5; V8.sfx.bolt();
    } else { // Frost
      for (let k = 0; k < Math.round(11 * juice); k++) {
        const a = Math.random() * 6.283, sp = 1.5 + Math.random() * 3.5;
        R.parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, g: .05, sz: 1.4 + Math.random() * 2,
          col: Math.random() < .5 ? [140, 220, 255] : [220, 245, 255], life: 360 + Math.random() * 240, max: 600, kind: 'spark' });
      }
      document.body.classList.add('frost'); setTimeout(() => document.body.classList.remove('frost'), 400);
      V8.sfx.freeze();
    }
  }

  /** Skill: daolang (blade wave) sweeps across screen. */
  function daolangFX(targetEl) {
    if (!targetEl) return;
    const r = targetEl.getBoundingClientRect();
    const wave = document.createElement('div');
    wave.className = 'skill-slash';
    wave.innerHTML = '<span></span><b>跳过</b>';
    wave.style.left = (r.left - 14) + 'px';
    wave.style.top = (r.top - 8) + 'px';
    wave.style.width = (r.width + 28) + 'px';
    wave.style.height = (r.height + 16) + 'px';
    document.body.appendChild(wave);
    targetEl.classList.add('skipping');
    R.shake = Math.max(R.shake, 5);
    V8.sfx.daolang();
    setTimeout(() => { wave.remove(); targetEl.classList.remove('skipping'); }, 650);
  }

  /** Skill: time freeze vortex. */
  function vortexFX() {
    const w = R.w || window.innerWidth, h = R.h || window.innerHeight;
    const v = document.createElement('div');
    v.style.cssText = `position:fixed;left:50%;top:50%;width:0;height:0;border-radius:50%;background:radial-gradient(circle,rgba(100,180,255,.4),rgba(40,80,200,.15),transparent 70%);z-index:45;pointer-events:none;transform:translate(-50%,-50%);animation:vortexExpand 1.5s ease-out forwards`;
    document.body.appendChild(v);
    document.body.classList.add('frost');
    V8.sfx.vortex();
    setTimeout(() => { v.remove(); document.body.classList.remove('frost'); }, 1550);
    setTimeout(() => {
      // Edge frost effect
      const edges = document.createElement('div');
      edges.style.cssText = `position:fixed;inset:0;z-index:44;pointer-events:none;border:8px solid rgba(140,200,255,.5);border-radius:0;box-shadow:inset 0 0 60px rgba(100,180,255,.3);animation:edgeFrost 2.5s ease-out forwards`;
      document.body.appendChild(edges);
      setTimeout(() => edges.remove(), 2600);
    }, 200);
  }

  /** Skill: coin rain for double-score. */
  function coinRainFX(scoreEl) {
    const w = R.w || window.innerWidth;
    for (let i = 0; i < 20; i++) {
      setTimeout(() => {
        const coin = document.createElement('div');
        coin.className = 'coin';
        coin.style.cssText = `position:fixed;left:${Math.random() * w}px;top:-30px;z-index:46;pointer-events:none;animation:coinRainFall 1.2s ease-in forwards`;
        document.body.appendChild(coin);
        setTimeout(() => coin.remove(), 1250);
      }, i * 60);
    }
    if (scoreEl) { scoreEl.classList.remove('pop'); void scoreEl.offsetWidth; scoreEl.classList.add('pop'); }
    V8.sfx.bonus(3);
  }

  // ── Expose ────────────────────────────────────────────
  V8.coinBurst = coinBurst;
  V8.firework = firework;
  V8.ringFX = ringFX;
  V8.terrainLandingFX = terrainLandingFX;
  V8.burstFX = burstFX;
  V8.floatText = floatText;
  V8.bigText = bigText;
  V8.coinFlyFX = coinFlyFX;
  V8.scorePopFX = scorePopFX;
  V8.qtFireBurstFX = qtFireBurstFX;
  V8.qtImpactFX = qtImpactFX;
  V8.qtEvolutionBombFX = qtEvolutionBombFX;
  V8.hitFX = hitFX;
  V8.daolangFX = daolangFX;
  V8.vortexFX = vortexFX;
  V8.coinRainFX = coinRainFX;
})(window.V8 = window.V8 || {});
