/**
 * Render System — four base worlds plus isolated optional world plugins.
 * Migrated from v7's B object with all original logic preserved.
 */
(function(V8) {
  'use strict';

  const { WORLDS } = V8.CFG;

  // ── Render state (was B object in v7) ─────────────────
  const R = {
    cv: null, cx: null, fcv: null, fx: null, w: 0, h: 0, dpr: 1,
    scroll: 0, vscroll: 0, ts: 1, tsT: 1, shake: 0,
    palSky: null, palRoad: null, palFrom: null, palTo: null, palT: 1, paling: false,
    phase: 0, stars: [], motes: [], layers: [], nebula: [], events: [], parts: [], rings: [],
    nextEvt: 0, warp: false, fw: 0, flashA: 0, neonBoost: 0, lastT: 0,
    terrMix: null, goldT: 0, cans: [], critters: [],
    worldPlugin: '', worldState: null,
  };

  // ── Utilities ─────────────────────────────────────────
  function seededRand(seed) { let s = seed * 9973 + 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
  function hash() { let x = 0; for (let i = 0; i < arguments.length; i++) { x = (x * 374761393 + arguments[i] * 668265263) | 0; x = (x ^ (x >> 13)) * 1274126177 | 0; } return ((x ^ (x >> 16)) >>> 0) / 4294967295; }
  function rgb(c, a) { return a === undefined ? `rgb(${c[0]|0},${c[1]|0},${c[2]|0})` : `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`; }
  function lerpC(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function copySky(w) { return w.sky.map(c => c.slice()); }

  // Bonus worlds are opt-in plugins. The original four phases never enter
  // this code path, and registry failures are quarantined by worlds/registry.
  function worldPluginId(phase) {
    const world = WORLDS[phase];
    return phase >= 4 && world && world.plugin ? world.plugin : '';
  }

  function callWorldPlugin(hook, extra) {
    if (!R.worldPlugin || !V8.worlds || typeof V8.worlds.call !== 'function') return undefined;
    const context = Object.assign({
      x: R.cx, w: R.w, h: R.h, R, phase: R.phase,
      world: WORLDS[R.phase], state: R.worldState,
      groundY, rgb, hash, seededRand,
    }, extra || {});
    return V8.worlds.call(R.worldPlugin, hook, context);
  }

  /** Keep optional plugin drawing state from leaking into the base renderer. */
  function drawWorldPlugin(hook, extra) {
    const context = extra && extra.x ? extra.x : R.cx;
    if (!context || typeof context.save !== 'function') return callWorldPlugin(hook, extra);
    context.save();
    try {
      return callWorldPlugin(hook, extra);
    } finally {
      context.restore();
    }
  }

  // ── Terrain (ground surface height) ───────────────────
  function terrainRaw(p, wx) {
    if (p >= 4) {
      const plugin = worldPluginId(p);
      if (plugin && V8.worlds && typeof V8.worlds.call === 'function') {
        const height = V8.worlds.call(plugin, 'terrain', { wx, phase: p, R, world: WORLDS[p] });
        if (Number.isFinite(height)) return height;
      }
    }
    if (p === 0) return 24 * Math.sin(wx / 380) + 10 * Math.sin(wx / 640 + 1.3);
    if (p === 1) return Math.round((30 * Math.sin(wx / 520)) / 12) * 12;
    if (p === 2) return Math.pow(Math.abs(Math.sin(wx / 150)), .6) * 30 + (hash(Math.floor(wx / 46), 7) * 7 - 3.5);
    return Math.min(26 * Math.sin(wx / 430) + 14 * Math.sin(wx / 970 + 2.1), 24);
  }

  function terrainAt(wx) {
    const m = R.terrMix;
    if (m && m.t < 1) return terrainRaw(m.from, wx) * (1 - m.t) + terrainRaw(m.to, wx) * m.t;
    return terrainRaw(R.phase, wx);
  }

  function groundY(xCss) { return R.h * .86 - terrainAt(xCss + R.scroll); }

  // ── Initialization ────────────────────────────────────
  function sizeCanvases() {
    const w = window.innerWidth, h = window.innerHeight;
    R.dpr = Math.min(2, window.devicePixelRatio || 1); R.w = w; R.h = h;
    [R.cv, R.fcv].forEach(c => { if (c) { c.width = w * R.dpr; c.height = h * R.dpr; } });
  }

  function initStars() {
    R.stars = []; const r = seededRand(42);
    for (let i = 0; i < 120; i++) R.stars.push({ x: r(), y: r() * .75, z: .3 + r() * .7, tw: r() * 6.28, sz: .6 + r() * 1.6 });
  }

  function genLayer(cfg) {
    const r = seededRand(cfg.seed);
    if (cfg.kind === 'hills') {
      const comps = []; for (let i = 0; i < 4; i++) comps.push({ a: .25 + r() * .75, k: 2 + Math.floor(r() * 5), p: r() * 6.28 });
      return Object.assign({ comps }, cfg);
    }
    if (cfg.kind === 'city') {
      const bl = []; let x = 0;
      while (x < 1500) { const bw = 46 + r() * 88; bl.push({ x, w: bw, h: .28 + r() * .72, ant: r() < .3, sign: r() < .3 ? Math.floor(r() * 3) : -1, seed: Math.floor(r() * 1e9) }); x += bw + 6 + r() * 22; }
      return Object.assign({ bl, T: x }, cfg);
    }
    const sp = []; let y = 0;
    while (y < 1400) { const hh = 34 + r() * 80; sp.push({ y, h: hh, w: 36 + r() * 95, side: Math.floor(r() * 3) }); y += hh * .72 + 8; }
    return Object.assign({ sp, T: y }, cfg);
  }

  function initNebula() {
    R.nebula = []; const r = seededRand(77); const cols = [[70, 40, 140], [30, 80, 160], [140, 40, 110], [40, 60, 170], [90, 50, 160]];
    for (let i = 0; i < 6; i++) R.nebula.push({ x: r(), y: r() * .7, rad: .18 + r() * .3, col: cols[i % 5], dr: .004 + r() * .01, ph: r() * 6.28 });
  }

  function initMotes(p) {
    R.motes = []; const r = seededRand(99 + p);
    const mir = (p === 1 || p === 3) ? -1 : 1;
    for (let i = 0; i < 14; i++) {
      if (p === 2) R.motes.push({ x: r(), y: r(), vy: -(.12 + r() * .3), vx: (r() - .5) * .08 * mir, sz: 1 + r() * 2.2, kind: 'ember', ph: r() * 6.28 });
      else R.motes.push({ x: r(), y: r(), vy: .02 + r() * .06, vx: -(.03 + r() * .08) * mir, sz: .8 + r() * 1.6, kind: 'dust', ph: r() * 6.28 });
    }
  }

  function initWorldStructs(p) {
    if (R.worldPlugin) {
      callWorldPlugin('teardown', {
        gameState: V8._gameState,
        playerEl: document.getElementById('char'),
      });
    }
    R.phase = p;
    R.worldPlugin = worldPluginId(p);
    R.worldState = {};
    const state = callWorldPlugin('init', { t: performance.now() });
    if (state && typeof state === 'object') R.worldState = state;
    R.layers = WORLDS[p].layers.map(genLayer);
    initMotes(p); if (p === 3) initNebula(); R.events = [];
    R.nextEvt = performance.now() + 1800 + Math.random() * 3000;
  }

  // ── World events (meteor, lightning, gust, neon) ──────
  function scheduleEvt() { R.nextEvt = performance.now() + 2600 + Math.random() * 5600; }

  function spawnEvt() {
    const p = R.phase, t = performance.now(), r = Math.random();
    if (p >= 4 && callWorldPlugin('spawnEvent', { t, random: r }) === true) return;
    if (p === 0) {
      r < .6 ? R.events.push({ kind: 'meteor', x: .15 + Math.random() * .8, y: Math.random() * .25, vx: -(.35 + Math.random() * .3), vy: .22 + Math.random() * .18, life: 900, born: t }) : R.events.push({ kind: 'gust', life: 1, born: t });
    } else if (p === 1) {
      if (r < .62) R.neonBoost = t + 900 + Math.random() * 800;
      else R.events.push({ kind: 'meteor', x: .3 + Math.random() * .7, y: Math.random() * .2, vx: -(.4 + Math.random() * .3), vy: .3, life: 800, born: t });
    } else if (p === 2) {
      if (r < .58) {
        const pts = []; let bx = .1 + Math.random() * .8, by = 0; pts.push([bx, by]);
        while (by < .62) { bx += (Math.random() - .5) * .09; by += .05 + Math.random() * .09; pts.push([bx, by]); }
        R.events.push({ kind: 'bolt', pts, life: 280, born: t }); R.flashA = .55; V8.sfx.bolt();
      } else {
        for (let i = 0; i < 6; i++) R.motes.push({ x: .2 + Math.random() * .6, y: 1.05, vy: -(.3 + Math.random() * .5), vx: (Math.random() - .5) * .15, sz: 1.4 + Math.random() * 2.6, kind: 'ember', ph: Math.random() * 6.28, xtra: 1 });
      }
    } else {
      r < .75 ? R.events.push({ kind: 'meteor', x: .1 + Math.random() * .85, y: Math.random() * .3, vx: -(.4 + Math.random() * .35), vy: .25 + Math.random() * .2, life: 900, born: t }) : R.events.push({ kind: 'gust', life: 1, born: t });
    }
  }

  // ── Drawing ───────────────────────────────────────────
  function drawBG(t) {
    const x = R.cx, w = R.w, h = R.h, wd = WORLDS[R.phase];
    if (!x) return;
    const shx = (Math.random() - .5) * R.shake, shy = (Math.random() - .5) * R.shake;
    x.setTransform(R.dpr, 0, 0, R.dpr, shx * R.dpr, shy * R.dpr);

    // Sky gradient
    const g = x.createLinearGradient(0, 0, 0, h);
    R.palSky.forEach((c, i) => g.addColorStop(i / 4, rgb(c)));
    x.fillStyle = g; x.fillRect(-20, -20, w + 40, h + 40);

    // Sun (W1)
    if (wd.sun) {
      const sg = x.createRadialGradient(w * .5, h * .84, 10, w * .5, h * .84, h * .5);
      const pu = .5 + .18 * Math.sin(t * .0012);
      sg.addColorStop(0, `rgba(255,190,90,${.5 * pu})`); sg.addColorStop(.35, `rgba(255,140,50,${.22 * pu})`); sg.addColorStop(1, 'rgba(255,120,40,0)');
      x.fillStyle = sg; x.fillRect(0, h * .3, w, h * .7);
    }

    // Lightning flash
    if (R.flashA > 0) { x.fillStyle = `rgba(230,225,255,${R.flashA * .4})`; x.fillRect(-20, -20, w + 40, h + 40); }

    drawWorldPlugin('drawBackdrop', { t });

    // Stars (parallax + twinkle; W4 speed lines)
    const starSpd = R.scroll * .02;
    for (const s of (wd.baseStars === false ? [] : R.stars)) {
      let sx = ((s.x * w - starSpd * s.z) % w + w) % w, sy = s.y * h;
      const a = wd.starA * (.35 + .65 * Math.abs(Math.sin(t * .0015 + s.tw))) * s.z;
      if (a < .02) continue;
      x.fillStyle = `rgba(255,255,255,${a})`;
      if (R.phase === 3) x.fillRect(sx, sy, s.sz + s.z * WORLDS[3].vSpeed * R.ts * 3.2, s.sz * .7);
      else { x.beginPath(); x.arc(sx, sy, s.sz * s.z, 0, 6.29); x.fill(); }
    }

    // Nebula (W4)
    if (wd.nebula) {
      for (const n of R.nebula) {
        const nx = (((n.x + Math.sin(t * .00004 + n.ph) * .03) * w - R.scroll * .008) % w + w) % w, ny = n.y * h, nr = n.rad * h;
        const ng = x.createRadialGradient(nx, ny, 0, nx, ny, nr);
        ng.addColorStop(0, `rgba(${n.col[0]},${n.col[1]},${n.col[2]},.16)`); ng.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = ng; x.fillRect(nx - nr, ny - nr, nr * 2, nr * 2);
      }
    }

    // Events: meteor, lightning
    for (const e of R.events) {
      const age = t - e.born;
      if (e.kind === 'meteor') {
        const p = age / e.life; if (p > 1) continue;
        const mx = (e.x + e.vx * p) * w, my = (e.y + e.vy * p) * h;
        const mg = x.createLinearGradient(mx, my, mx - e.vx * w * .09, my - e.vy * h * .09);
        mg.addColorStop(0, `rgba(255,255,255,${.9 * (1 - p)})`); mg.addColorStop(1, 'rgba(255,255,255,0)');
        x.strokeStyle = mg; x.lineWidth = 1.6; x.beginPath(); x.moveTo(mx, my); x.lineTo(mx - e.vx * w * .09, my - e.vy * h * .09); x.stroke();
      } else if (e.kind === 'bolt') {
        const fl = Math.sin(age * .06) > 0 ? 1 : .25;
        x.strokeStyle = `rgba(200,190,255,${.85 * fl})`; x.lineWidth = 2; x.shadowColor = 'rgba(180,160,255,.9)'; x.shadowBlur = 12;
        x.beginPath(); e.pts.forEach((p, i) => { const px = p[0] * w, py = p[1] * h; i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke(); x.shadowBlur = 0;
      }
    }

    // Parallax layers
    const base = h * .86;
    for (const L of R.layers) {
      if (L.kind === 'hills') {
        const off = R.scroll * L.spd, period = 1100;
        x.fillStyle = rgb(L.col); x.beginPath(); x.moveTo(-20, h + 20);
        for (let px = -20; px <= w + 24; px += 12) {
          const tt = (((px + off) % period) + period) % period / period * 6.2832;
          let y = 0; for (const c of L.comps) y += Math.sin(tt * c.k + c.p) * c.a;
          x.lineTo(px, base - ((y + 1.55) / 3.1) * L.hf * h - h * .02);
        }
        x.lineTo(w + 20, h + 20); x.closePath(); x.fill();
      } else if (L.kind === 'city') {
        const off = R.scroll * L.spd, T = L.T, o = ((off % T) + T) % T;
        const flick = Math.floor(t / 260);
        x.fillStyle = rgb(L.col);
        for (let rep = -1; rep * T - o < w + T; rep++) {
          for (const b of L.bl) {
            const bx = b.x - o + rep * T; if (bx + b.w < -30 || bx > w + 30) continue;
            const bh = b.h * L.hf * h, by = base - bh;
            x.fillRect(bx, by, b.w, bh + 4);
            if (b.ant) x.fillRect(bx + b.w * .45, by - bh * .14, 2, bh * .14);
            if (L.win > 0 && bh > 40) {
              const colsN = Math.max(1, Math.floor(b.w / 16)), rowsN = Math.max(1, Math.floor(bh / 22));
              for (let ci = 0; ci < colsN; ci++) for (let ri = 0; ri < rowsN; ri++) {
                const lit = hash(b.seed, ci, ri, flick) > .52;
                if (!lit) continue;
                const boost = t < R.neonBoost ? 1.6 : 1;
                const rawAlpha = (L.win === 2 ? .7 : .5) * boost;
                // Preserve the original four-world path exactly. Optional
                // city plugins clamp boosted alpha to a valid canvas colour.
                const windowAlpha = R.phase >= 4 ? Math.min(1, rawAlpha) : rawAlpha;
                x.fillStyle = L.win === 2 ? `rgba(${hash(b.seed, ci, 7) > .5 ? '255,45,149' : '45,230,255'},${windowAlpha})` : `rgba(255,190,90,${windowAlpha})`;
                x.fillRect(bx + 4 + ci * (b.w - 8) / colsN, by + 6 + ri * (bh - 12) / rowsN, 4, 6);
              }
              x.fillStyle = rgb(L.col);
            }
          }
        }
      } else if (L.kind === 'walls') {
        const off = R.vscroll * L.spd, T = L.T, o = ((off % T) + T) % T;
        x.fillStyle = rgb(L.col);
        for (let rep = -1; rep * T - o < h + T; rep++) {
          for (const s of L.sp) {
            const sy = s.y - o + rep * T, sh = s.h; if (sy + sh < -20 || sy > h + 20) continue;
            if (s.side !== 1) { x.beginPath(); x.moveTo(-4, sy); x.lineTo(s.w, sy + sh / 2); x.lineTo(-4, sy + sh); x.closePath(); x.fill(); }
            if (s.side !== 0) { x.beginPath(); x.moveTo(w + 4, sy); x.lineTo(w - s.w, sy + sh / 2); x.lineTo(w + 4, sy + sh); x.closePath(); x.fill(); }
          }
        }
      }
    }

    // W4 floating islands
    if (R.phase === 3) {
      const T = 760, o = ((R.scroll * .55 % T) + T) % T;
      for (let rep = -1; rep * T - o < w + T; rep++) {
        const bx = rep * T - o + 140 + hash(rep, 7) * 200, iw = 70 + hash(rep, 13) * 80, ih = iw * .5;
        if (bx + iw / 2 < -20 || bx - iw / 2 > w + 20) continue;
        const by = h * .40 + hash(rep, 29) * h * .16 + Math.sin(t * .0009 + rep * 2.1) * 6;
        x.fillStyle = 'rgba(13,17,42,.92)';
        x.beginPath(); x.moveTo(bx - iw / 2, by); x.lineTo(bx - iw * .3, by + ih); x.lineTo(bx + iw * .28, by + ih * .84); x.lineTo(bx + iw / 2, by); x.closePath(); x.fill();
        const ig = x.createLinearGradient(0, by + ih * .6, 0, by + ih + 22);
        ig.addColorStop(0, 'rgba(122,184,255,.34)'); ig.addColorStop(1, 'rgba(122,184,255,0)');
        x.fillStyle = ig;
        x.beginPath(); x.moveTo(bx - iw * .3, by + ih); x.lineTo(bx + iw * .28, by + ih * .84); x.lineTo(bx + iw * .14, by + ih + 22); x.lineTo(bx - iw * .16, by + ih + 22); x.closePath(); x.fill();
      }
    }

    drawWorldPlugin('drawMidground', { t });

    // Bonus worlds may fully paint their terrain. A missing/failed hook falls
    // back to the original neon road, keeping plugin failures isolated.
    const customTerrain = drawWorldPlugin('drawTerrain', { t }) === true;
    if (!customTerrain) {
      x.beginPath(); x.moveTo(-20, h + 20);
      for (let px = -20; px <= w + 24; px += 8) x.lineTo(px, groundY(px));
      x.lineTo(w + 20, h + 20); x.closePath();
      const gg = x.createLinearGradient(0, h * .7, 0, h);
      gg.addColorStop(0, 'rgba(10,10,24,.96)'); gg.addColorStop(.35, 'rgba(6,6,16,.94)'); gg.addColorStop(1, 'rgba(2,2,8,.98)');
      x.fillStyle = gg; x.fill();

      x.strokeStyle = rgb(R.palRoad, .9); x.lineWidth = 2.5; x.shadowColor = rgb(R.palRoad); x.shadowBlur = 12;
      x.beginPath();
      for (let px = -20; px <= w + 24; px += 8) { const y = groundY(px); if (px === -20) x.moveTo(px, y); else x.lineTo(px, y); }
      x.stroke(); x.shadowBlur = 0;

      const dashOff = ((R.scroll * 2.4) % 52 + 52) % 52;
      x.fillStyle = rgb(R.palRoad, .4);
      for (let dx = -dashOff; dx < w; dx += 52) x.fillRect(dx, groundY(dx + 9) + 8, 18, 3);
    }

    drawWorldPlugin('drawGround', { t });

    // Motes (dust/ember)
    for (const m of (wd.baseMotes === false ? [] : R.motes)) {
      const mx = m.x * w, my = m.y * h;
      if (m.kind === 'ember') {
        const fl = .4 + .6 * Math.abs(Math.sin(t * .004 + m.ph));
        x.fillStyle = `rgba(255,${100 + Math.floor(80 * fl)},40,${.5 * fl})`;
        x.beginPath(); x.arc(mx, my, m.sz, 0, 6.29); x.fill();
      } else {
        x.fillStyle = `rgba(255,255,255,${.10 + .08 * Math.sin(t * .002 + m.ph)})`;
        x.beginPath(); x.arc(mx, my, m.sz, 0, 6.29); x.fill();
      }
    }

    drawWorldPlugin('drawForeground', { t });

    x.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ── FX canvas (particles, rings, warp lines) ──────────
  function drawFX(t) {
    const x = R.fx, w = R.w, h = R.h;
    if (!x) return;
    x.setTransform(R.dpr, 0, 0, R.dpr, (Math.random() - .5) * R.shake * R.dpr, (Math.random() - .5) * R.shake * R.dpr);
    x.clearRect(-20, -20, w + 40, h + 40);

    // Warp speed lines
    if (R.warp) {
      const cx0 = w / 2, cy0 = h * .38;
      for (let i = 0; i < 42; i++) {
        const a = Math.random() * 6.283, r0 = 60 + Math.random() * 140, len = 50 + Math.random() * 220;
        x.strokeStyle = `rgba(255,255,255,${.12 + Math.random() * .4})`; x.lineWidth = 1 + Math.random() * 1.6;
        x.beginPath(); x.moveTo(cx0 + Math.cos(a) * r0, cy0 + Math.sin(a) * r0); x.lineTo(cx0 + Math.cos(a) * (r0 + len), cy0 + Math.sin(a) * (r0 + len)); x.stroke();
      }
    }

    // Dash speed lines
    if (V8._dashT0 && (t - V8._dashT0) / 600 < 1) {
      const dp = (t - V8._dashT0) / 600, y0 = V8._dashY || h * .6;
      for (let i = 0; i < 7; i++) {
        const yy = y0 + hash(i, Math.floor(t / 60)) * 36 - 8, xx = w * .17 - 30 - Math.random() * 160, len = 50 + Math.random() * 90;
        x.strokeStyle = `rgba(125,249,255,${.5 * (1 - dp)})`; x.lineWidth = 1.4;
        x.beginPath(); x.moveTo(xx, yy); x.lineTo(xx + len, yy); x.stroke();
      }
    }

    // Impact rings
    for (const r of R.rings) {
      x.strokeStyle = r.col.replace('A', (r.a * .8).toFixed(2)); x.lineWidth = 3 * r.a + .5;
      x.save();
      x.translate(r.x, r.y);
      x.scale(1, Number.isFinite(r.sy) ? r.sy : 1);
      x.beginPath(); x.arc(0, 0, r.r, 0, 6.29); x.stroke();
      x.restore();
    }

    // Particles
    for (const p of R.parts) {
      const a = Math.max(0, p.life / p.max);
      const col = t < R.goldT && p.kind !== 'terrain' ? [255, 215, 0] : (p.col || [255, 255, 255]);
      if (p.kind === 'fw') {
        x.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${a})`; x.lineWidth = p.sz * .6;
        x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(p.x - p.vx * 2.4, p.y - p.vy * 2.4); x.stroke();
      } else {
        x.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a})`;
        if (p.kind === 'terrain') { x.beginPath(); x.arc(p.x, p.y, Math.max(.45, p.sz * (.42 + a * .58)), 0, 6.29); x.fill(); }
        else if (p.kind === 'coin') { x.beginPath(); x.arc(p.x, p.y, p.sz * a + .6, 0, 6.29); x.fill(); }
        else x.fillRect(p.x, p.y, p.sz * 2.4 * a + .5, p.sz * .7 * a + .4);
      }
    }

    // Optional near-camera weather and particles, above the player canvas.
    drawWorldPlugin('drawSceneFX', { t, x });

    x.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ── Ground sync (player on terrain) ───────────────────
  function syncCharToGround(t, playerEl, charMode, airborne, airB, landN, dashT0, dashDist) {
    if (!R.h) return { bottom: 0, tilt: 0, dashX: 0, dashT0, dashDist };
    if (!playerEl) return { bottom: 0, tilt: 0, dashX: 0, dashT0, dashDist };
    const cx = R.w * 0.17 + 24;
    let ty;
    if (charMode === 'glide') {
      let peak = Infinity;
      for (let dx = 0; dx <= 120; dx += 12) { const y = groundY(cx + dx); if (y < peak) peak = y; }
      ty = R.h - peak + 36;
    } else {
      ty = R.h - groundY(cx) + (charMode === 'jet' ? 6 : 0);
    }

    if (airborne) {
      playerEl.style.bottom = airB + 'px';
    } else if (landN > 0) {
      const cur = parseFloat(playerEl.style.bottom) || ty;
      playerEl.style.bottom = (landN === 0 ? ty : cur + (ty - cur) * .5) + 'px';
    } else {
      playerEl.style.bottom = ty + 'px';
    }

    // Dash displacement
    let dashX = 0;
    if (dashT0) {
      const p = (performance.now() - dashT0) / 600;
      if (p >= 1) { dashT0 = 0; dashDist = 0; }
      else dashX = (dashDist || 46) * Math.sin(Math.PI * p);
    }

    // Slope tilt
    let tilt = 0;
    if (!airborne && (charMode === 'run' || charMode === 'skate')) {
      tilt = Math.atan2(groundY(cx + 14) - groundY(cx - 14), 28) * 180 / Math.PI;
      tilt = Math.max(-22, Math.min(22, tilt));
    }

    return { bottom: parseFloat(playerEl.style.bottom) || ty, tilt, dashX, dashT0, dashDist };
  }

  // ── Frame update (called from game loop) ──────────────
  function updateEffects(t, dt, k) {
    R.shake *= .86; if (R.shake < .1) R.shake = 0;
    R.flashA *= .9;

    for (const r of R.rings) { r.r += (r.dr || 13) * k; r.a -= .028 * k; }
    R.rings = R.rings.filter(r => r.a > 0 && r.r > 0);

    for (const p of R.parts) { p.x += p.vx * k; p.y += p.vy * k; p.vy += (p.g || 0) * k; p.life -= dt; }
    R.parts = R.parts.filter(p => p.life > 0);

    if (t < R.fw && Math.random() < .13) {
      V8.firework(.08 + Math.random() * .84, .1 + Math.random() * .5);
      if (Math.random() < .6) V8.sfx.boom();
    }
  }

  function update(t, dt, k) {
    if (!R.lastT) R.lastT = t;
    const spd = WORLDS[R.phase].vSpeed * R.ts;
    R.scroll += spd * 2.1 * k; R.vscroll += spd * 2.6 * k;

    // Terrain mix lerp
    if (R.terrMix && R.terrMix.t < 1) R.terrMix.t = Math.min(1, (t - R.terrMix.t0) / 800);

    // Palette transition
    if (R.paling) {
      R.palT = Math.min(1, R.palT + dt / 1300);
      for (let i = 0; i < 5; i++) R.palSky[i] = lerpC(R.palFrom.sky[i], R.palTo.sky[i], R.palT);
      R.palRoad = lerpC(R.palFrom.road, R.palTo.road, R.palT);
      if (R.palT >= 1) R.paling = false;
    }

    // Events
    if (t > R.nextEvt) { spawnEvt(); scheduleEvt(); }
    R.events = R.events.filter(e => t - e.born < (e.life || 400));

    // Motes drift
    for (const m of R.motes) {
      m.x += m.vx * k * .016; m.y += m.vy * k * .016;
      if (m.y < -.05 || m.y > 1.08 || m.x < -.05 || m.x > 1.05) {
        if (m.xtra) m.dead = 1;
        else { m.x = Math.random(); m.y = m.kind === 'ember' ? 1.05 : -.05; }
      }
    }
    R.motes = R.motes.filter(m => !m.dead);
    if (R.motes.length < 10 && !WORLDS[R.phase].vertical) {
      const mir = (R.phase === 1 || R.phase === 3) ? -1 : 1;
      R.motes.push({ x: Math.random(), y: -.02, vy: .02 + Math.random() * .06, vx: -(.03 + Math.random() * .08) * mir, sz: .8 + Math.random() * 1.6, kind: 'dust', ph: Math.random() * 6.28 });
    }

    callWorldPlugin('update', { t, dt, k });
    updateEffects(t, dt, k);
  }

  /** Optional world-owned player motion, such as the ice-cliff launch. */
  function updateWorldPlayer(gameState, playerEl, t, dt) {
    if (!R.worldPlugin) return;
    callWorldPlugin('updatePlayer', { gameState, playerEl, t, dt });
  }

  // ── Public API ────────────────────────────────────────
  function boot() {
    const bgCanvas = document.getElementById('bgCanvas');
    const fxCanvas = document.getElementById('fxCanvas');
    R.cv = bgCanvas; R.cx = bgCanvas ? bgCanvas.getContext('2d') : null;
    R.fcv = fxCanvas; R.fx = fxCanvas ? fxCanvas.getContext('2d') : null;
    R.palSky = copySky(WORLDS[0]); R.palRoad = WORLDS[0].road.slice();
    initStars(); initWorldStructs(0);
    sizeCanvases();
  }

  V8.render = {
    boot, update, updateEffects, drawBG, drawFX, sizeCanvases,
    groundY, syncCharToGround, terrainAt,
    initWorldStructs, copySky, updateWorldPlayer,
    // Expose R for particle/entity systems
    R,
    // Helpers
    rgb, lerpC, hash, seededRand, genLayer, initMotes, initNebula, initStars,
    scheduleEvt, spawnEvt,
  };
})(window.V8 = window.V8 || {});
