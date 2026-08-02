/** Cyber Rain Night bonus world. */
(function(V8) {
  'use strict';

  const TAU = Math.PI * 2;
  const SIGN_TEXT = ['NOVA', '雨', '24H', '電脳', 'VOID', '夜行'];
  const NEON = [
    { rgb: '54,229,255', solid: '#36e5ff' },
    { rgb: '255,60,174', solid: '#ff3cae' },
    { rgb: '155,103,255', solid: '#9b67ff' },
    { rgb: '255,190,72', solid: '#ffbe48' },
  ];
  const STREET_PERIOD = 2050;
  const STREET_LIP = 920;
  let terrainOrigin = 0;

  function noise(n) {
    const value = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  function clamp(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function mod(value, period) {
    return ((value % period) + period) % period;
  }

  function smoothstep(value) {
    const p = clamp(value, 0, 1);
    return p * p * (3 - 2 * p);
  }

  function terrain(ctx) {
    const distance = ctx.wx - terrainOrigin;
    const u = mod(distance, STREET_PERIOD);
    let overpass;
    if (u < 650) overpass = 3 + 43 * smoothstep(u / 650);
    else if (u < STREET_LIP) overpass = 46 + Math.sin((u - 650) / (STREET_LIP - 650) * Math.PI) * 2.5;
    else if (u < 1110) overpass = 46 + (-20 - 46) * smoothstep((u - STREET_LIP) / 190);
    else if (u < 1640) overpass = -20 + Math.sin((u - 1110) / 530 * Math.PI) * 5;
    else overpass = -20 + 23 * smoothstep((u - 1640) / (STREET_PERIOD - 1640));
    const phase = u / STREET_PERIOD * TAU;
    return Math.round((overpass + Math.sin(phase * 4 + .7) * 2.8) * 2) / 2;
  }

  function makeBuildings(seed, period, minW, maxW, minH, maxH, signChance) {
    const items = [];
    let px = -24;
    let index = 0;
    while (px < period) {
      const width = minW + noise(seed + index * 17) * (maxW - minW);
      const gap = 5 + noise(seed + index * 19 + 3) * 17;
      items.push({
        x: px,
        w: width,
        h: minH + noise(seed + index * 23 + 5) * (maxH - minH),
        seed: seed * 101 + index * 47,
        roof: Math.floor(noise(seed + index * 29 + 7) * 4),
        tone: Math.floor(noise(seed + index * 31 + 11) * 3),
        district: Math.floor(noise(seed + index * 37 + 13) * 4),
        sign: noise(seed + index * 41 + 17) < signChance,
        signSide: noise(seed + index * 43 + 19) > .5 ? 1 : -1,
        neon: Math.floor(noise(seed + index * 53 + 23) * NEON.length),
        label: SIGN_TEXT[Math.floor(noise(seed + index * 59 + 29) * SIGN_TEXT.length)],
      });
      px += width + gap;
      index++;
    }
    return { items, period: px + 24 };
  }

  function init(ctx) {
    terrainOrigin = ctx.R.scroll;
    const rain = [];
    for (let i = 0; i < 230; i++) {
      const depth = noise(i + 420);
      rain.push({
        x: noise(i + 2),
        y: noise(i + 90),
        d: depth,
        v: .35 + depth * 1.45 + noise(i + 190) * .24,
        l: 4 + depth * 22 + noise(i + 280) * 5,
        phase: noise(i + 370) * TAU,
      });
    }

    const puddles = [];
    for (let i = 0; i < 16; i++) {
      puddles.push({
        x: noise(i + 700),
        y: .14 + noise(i + 730) * .70,
        w: 16 + noise(i + 760) * 58,
        p: noise(i + 790) * TAU,
      });
    }

    const cars = [];
    for (let i = 0; i < 8; i++) {
      cars.push({
        x: noise(i + 820),
        lane: i % 3,
        speed: .014 + noise(i + 850) * .018,
        phase: noise(i + 880) * 9000,
        neon: i % NEON.length,
      });
    }

    let reduceMotion = false;
    try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}

    return {
      rain,
      puddles,
      cars,
      far: makeBuildings(601, 1560, 34, 76, .11, .27, .06),
      mid: makeBuildings(907, 1840, 54, 112, .20, .43, .38),
      ripples: [],
      visibleNeons: [],
      bolt: null,
      flashUntil: 0,
      surgeUntil: 0,
      outageDistrict: -1,
      outageFrom: 0,
      outageUntil: 0,
      restoreUntil: 0,
      reduceMotion,
      origin: terrainOrigin,
      launchActive: false,
      launchVelocity: 0,
      launchCycle: null,
      lastDistance: null,
    };
  }

  function update(ctx) {
    const state = ctx.state;
    const motion = state.reduceMotion ? .28 : 1;
    for (const drop of state.rain) {
      const oldY = drop.y;
      drop.y += drop.v * ctx.k * .0051 * motion;
      drop.x -= (.00035 + drop.d * .00105) * ctx.k * motion;
      if (oldY < .855 && drop.y >= .855 && drop.d > .52 && state.ripples.length < 28) {
        state.ripples.push({ x: drop.x, born: ctx.t, d: drop.d, p: drop.phase });
      }
      if (drop.y > 1.08) {
        drop.y = -.08 - noise(drop.phase + ctx.t * .001) * .16;
        drop.x = Math.random() * 1.12;
      }
      if (drop.x < -.08) drop.x = 1.08;
    }
    state.ripples = state.ripples.filter(ripple => ctx.t - ripple.born < 900);
    if (state.bolt && ctx.t - state.bolt.born > 760) state.bolt = null;
    if (state.restoreUntil && ctx.t > state.restoreUntil) {
      state.outageDistrict = -1;
      state.restoreUntil = 0;
    }
  }

  function crossedMarker(previous, current, period, marker) {
    if (!Number.isFinite(previous) || current <= previous) return null;
    let target = Math.floor(previous / period) * period + marker;
    if (target <= previous) target += period;
    return current >= target ? Math.floor(target / period) : null;
  }

  function landOnStreet(ctx, player, state, gameState, playerX, landingBottom) {
    gameState.airB = landingBottom;
    gameState.airborne = false;
    gameState.gstate = 'ground';
    gameState.landN = 3;
    state.launchActive = false;
    player.classList.remove('terrain-flight');
    player.classList.add('terrain-landing');
    setTimeout(() => player.classList.remove('terrain-landing'), 420);
    if (V8.terrainLandingFX) V8.terrainLandingFX({
      x: playerX, y: ctx.groundY(playerX), ringCount: 4,
      rings: ['rgb(75,239,255)', 'rgb(255,64,179)', 'rgb(157,103,255)'],
      colors: [[75,239,255], [255,64,179], [174,128,255]],
      count: 28, spread: 6.1, lift: 4.7, gravity: .065, life: 820,
      ringScaleY: .24, ringStart: 7, ringStep: 8, ringSpeed: 13, shake: 3.2,
    });
    const landSfx = V8.sfx && (V8.sfx.terrainLand || V8.sfx.thud);
    if (landSfx) landSfx();
  }

  function updatePlayer(ctx) {
    const gameState = ctx.gameState;
    const player = ctx.playerEl;
    const state = ctx.state;
    if (!gameState || !player || !state) return;

    const playerX = ctx.w * .17 + 24;
    const distance = ctx.R.scroll + playerX - state.origin;
    const previous = state.lastDistance;
    state.lastDistance = distance;

    if (gameState.over || gameState.dead || !gameState.started) {
      state.launchActive = false;
      player.classList.remove('terrain-flight');
      return;
    }
    if (state.launchActive && gameState.gstate !== 'cyberSlope') {
      state.launchActive = false;
      player.classList.remove('terrain-flight');
      return;
    }
    if (state.launchActive) {
      const step = Math.min(40, Math.max(0, ctx.dt || 0)) / 1000;
      state.launchVelocity -= 500 * step;
      gameState.airB += state.launchVelocity * step;
      const landingBottom = ctx.h - ctx.groundY(playerX);
      if (state.launchVelocity < 0 && gameState.airB <= landingBottom) {
        landOnStreet(ctx, player, state, gameState, playerX, landingBottom);
      }
      player.style.bottom = gameState.airB + 'px';
      return;
    }

    const blocked = state.reduceMotion || gameState.lock || gameState.rdy || gameState.airborne || gameState.jumping || gameState.flying ||
      player.classList.contains('v8-streak-airborne') || player.classList.contains('v8-streak-overdrive');
    const cycle = crossedMarker(previous, distance, STREET_PERIOD, STREET_LIP - 10);
    if (blocked || cycle === null || state.launchCycle === cycle) return;

    state.launchCycle = cycle;
    state.launchActive = true;
    state.launchVelocity = 175 + Math.min(38, Math.max(0, ctx.R.ts - 1) * 20);
    gameState.gstate = 'cyberSlope';
    gameState.airborne = true;
    gameState.airB = parseFloat(player.style.bottom) || (ctx.h - ctx.groundY(playerX));
    player.classList.add('terrain-flight');
    const launchSfx = V8.sfx && (V8.sfx.terrainJump || V8.sfx.jump);
    if (launchSfx) launchSfx();
  }

  function teardown(ctx) {
    const state = ctx.state;
    const gameState = ctx.gameState;
    const player = ctx.playerEl;
    if (state) state.launchActive = false;
    if (player) player.classList.remove('terrain-flight', 'terrain-landing');
    if (gameState && gameState.gstate === 'cyberSlope') {
      gameState.gstate = 'ground'; gameState.airborne = false; gameState.jumping = false;
    }
  }

  function makeBolt() {
    const main = [];
    let x = .16 + Math.random() * .68;
    let y = -.03;
    main.push([x, y]);
    while (y < .66) {
      x = clamp(x + (Math.random() - .5) * .105, .04, .96);
      y += .045 + Math.random() * .064;
      main.push([x, y]);
    }

    const branches = [];
    const branchCount = 3 + Math.floor(Math.random() * 3);
    for (let b = 0; b < branchCount; b++) {
      const startIndex = 2 + Math.floor(Math.random() * Math.max(2, main.length - 5));
      const points = [main[startIndex]];
      let bx = main[startIndex][0];
      let by = main[startIndex][1];
      const direction = b % 2 ? 1 : -1;
      const steps = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < steps; i++) {
        bx += direction * (.025 + Math.random() * .055) + (Math.random() - .5) * .025;
        by += .025 + Math.random() * .055;
        points.push([bx, by]);
      }
      branches.push(points);
    }
    return { main, branches };
  }

  function spawnEvent(ctx) {
    const state = ctx.state;
    if (Math.random() < .68) {
      const paths = makeBolt();
      state.bolt = {
        main: paths.main,
        branches: paths.branches,
        born: ctx.t,
        strength: .78 + Math.random() * .22,
      };
      state.flashUntil = ctx.t + 620;
      state.outageDistrict = Math.floor(Math.random() * 4);
      state.outageFrom = ctx.t + 90;
      state.outageUntil = ctx.t + 900 + Math.random() * 420;
      state.restoreUntil = state.outageUntil + 1250;
      ctx.R.neonBoost = ctx.t + 1450;
      ctx.R.flashA = .58;
      if (V8.sfx && V8.sfx.bolt) V8.sfx.bolt();
    } else {
      state.surgeUntil = ctx.t + 1750;
      ctx.R.neonBoost = ctx.t + 1900;
    }
    return true;
  }

  function flashLevel(state, t) {
    if (!state.bolt) return 0;
    const age = t - state.bolt.born;
    if (age < 0 || age > 620) return 0;
    if (age < 58) return .82;
    if (age < 104) return .14;
    if (age < 164) return .50;
    if (age < 235) return .10;
    return .10 * (1 - (age - 235) / 385);
  }

  function outageLevel(state, district, t, seed) {
    if (district !== state.outageDistrict || t < state.outageFrom) return 1;
    if (t < state.outageUntil) {
      return noise(seed + Math.floor(t / 90)) > .88 ? .34 : .035;
    }
    if (t < state.restoreUntil) {
      const progress = (t - state.outageUntil) / (state.restoreUntil - state.outageUntil);
      const unstable = noise(seed + Math.floor(t / 135)) > (.70 - progress * .35) ? .36 : 0;
      return clamp(.10 + progress * .90 + unstable, .10, 1);
    }
    return 1;
  }

  function drawRainBand(ctx, low, high, alphaScale) {
    const x = ctx.x;
    x.save();
    x.lineCap = 'round';
    for (const drop of ctx.state.rain) {
      if (drop.d < low || drop.d >= high) continue;
      const px = drop.x * ctx.w;
      const py = drop.y * ctx.h;
      const shimmer = .82 + Math.sin(ctx.t * .004 + drop.phase) * .18;
      const alpha = (.08 + drop.d * .52) * alphaScale * shimmer;
      x.strokeStyle = `rgba(145,223,255,${alpha.toFixed(3)})`;
      x.lineWidth = .42 + drop.d * 1.08;
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px - drop.l * .34, py + drop.l);
      x.stroke();
    }
    x.restore();
  }

  function drawBackdrop(ctx) {
    const x = ctx.x;
    const flash = flashLevel(ctx.state, ctx.t);

    const upperHaze = x.createRadialGradient(ctx.w * .72, ctx.h * .31, 8, ctx.w * .72, ctx.h * .31, ctx.h * .62);
    upperHaze.addColorStop(0, `rgba(84,62,180,${.16 + flash * .10})`);
    upperHaze.addColorStop(.46, 'rgba(18,69,117,.07)');
    upperHaze.addColorStop(1, 'rgba(2,6,18,0)');
    x.fillStyle = upperHaze;
    x.fillRect(0, 0, ctx.w, ctx.h * .78);

    const cyanHaze = x.createRadialGradient(ctx.w * .14, ctx.h * .58, 4, ctx.w * .14, ctx.h * .58, ctx.w * .42);
    cyanHaze.addColorStop(0, 'rgba(36,205,235,.11)');
    cyanHaze.addColorStop(1, 'rgba(20,130,190,0)');
    x.fillStyle = cyanHaze;
    x.fillRect(0, ctx.h * .20, ctx.w * .58, ctx.h * .67);

    // Low storm clouds use overlapping translucent bands instead of a black lid.
    for (let layer = 0; layer < 3; layer++) {
      const y0 = ctx.h * (.16 + layer * .085);
      x.fillStyle = `rgba(${9 + layer * 3},${16 + layer * 4},${37 + layer * 8},${.13 + layer * .04})`;
      x.beginPath();
      x.moveTo(-30, y0);
      for (let px = -30; px <= ctx.w + 40; px += 55) {
        const py = y0 + Math.sin(px / (116 + layer * 33) + layer * 1.8 + ctx.t * .000025) * (12 + layer * 5);
        x.quadraticCurveTo(px + 28, py - 10, px + 55, py);
      }
      x.lineTo(ctx.w + 40, y0 + ctx.h * .20);
      x.lineTo(-30, y0 + ctx.h * .20);
      x.closePath();
      x.fill();
    }

    drawRainBand(ctx, 0, .32, .45);
  }

  function visibleCopies(layer, scroll, speed, width, callback) {
    const offset = ((scroll * speed % layer.period) + layer.period) % layer.period;
    for (let repeat = -1; repeat * layer.period - offset < width + layer.period; repeat++) {
      for (let index = 0; index < layer.items.length; index++) {
        const building = layer.items[index];
        const bx = building.x - offset + repeat * layer.period;
        if (bx + building.w < -35 || bx > width + 35) continue;
        callback(building, bx, index + repeat * layer.items.length);
      }
    }
  }

  function buildingPath(x, bx, by, bw, base, building) {
    x.beginPath();
    x.moveTo(bx, base);
    x.lineTo(bx, by + (building.roof === 3 ? 10 : 0));
    if (building.roof === 1) {
      x.lineTo(bx + bw * .24, by);
      x.lineTo(bx + bw * .76, by);
      x.lineTo(bx + bw, by + 9);
    } else if (building.roof === 2) {
      x.lineTo(bx + bw * .18, by);
      x.lineTo(bx + bw * .18, by - 8);
      x.lineTo(bx + bw * .66, by - 8);
      x.lineTo(bx + bw * .66, by);
      x.lineTo(bx + bw, by);
    } else if (building.roof === 3) {
      x.lineTo(bx + bw * .48, by - 8);
      x.lineTo(bx + bw, by + 3);
    } else {
      x.lineTo(bx, by);
      x.lineTo(bx + bw, by);
    }
    x.lineTo(bx + bw, base);
    x.closePath();
  }

  function drawRoofDetails(x, bx, by, bw, building, alpha) {
    x.strokeStyle = `rgba(88,164,207,${alpha})`;
    x.fillStyle = `rgba(15,28,52,${Math.min(1, alpha + .36)})`;
    if (building.roof === 0) {
      x.fillRect(bx + bw * .12, by - 5, Math.max(8, bw * .22), 5);
      x.strokeRect(bx + bw * .12, by - 5, Math.max(8, bw * .22), 5);
    }
    if (noise(building.seed + 91) > .48) {
      const antennaX = bx + bw * (.22 + noise(building.seed + 97) * .56);
      const antennaH = 7 + noise(building.seed + 101) * 16;
      x.beginPath();
      x.moveTo(antennaX, by);
      x.lineTo(antennaX, by - antennaH);
      x.stroke();
      x.fillStyle = `rgba(255,70,156,${.35 + alpha})`;
      x.beginPath();
      x.arc(antennaX, by - antennaH, 1.2, 0, TAU);
      x.fill();
    }
  }

  function drawWindows(ctx, building, bx, by, base, far) {
    const x = ctx.x;
    const marginX = far ? 5 : 8;
    const marginY = far ? 8 : 12;
    const cellW = far ? 11 : 15;
    const cellH = far ? 15 : 19;
    const cols = Math.max(1, Math.floor((building.w - marginX * 2) / cellW));
    const rows = Math.max(1, Math.floor((base - by - marginY * 1.5) / cellH));
    const outage = outageLevel(ctx.state, building.district, ctx.t, building.seed);
    const surge = ctx.t < ctx.state.surgeUntil ? 1.38 : 1;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const seed = building.seed + row * 47 + col * 19;
        const cycle = ctx.state.reduceMotion ? 0 : Math.floor(ctx.t / (1050 + (seed % 5) * 230));
        if (noise(seed + cycle * 13) < (far ? .58 : .43)) continue;
        const px = bx + marginX + col * (building.w - marginX * 2) / cols;
        const py = by + marginY + row * cellH;
        const warm = noise(seed + 63) > .78;
        const alpha = (far ? .15 : .34) * outage * surge * (.70 + noise(seed + 81) * .30);
        x.fillStyle = warm ? `rgba(255,188,92,${alpha})` : `rgba(87,206,236,${alpha})`;
        x.fillRect(px, py, far ? 2 : 3, far ? 3 : 5);
      }
    }
  }

  function drawSign(ctx, building, bx, by, base) {
    if (!building.sign || base - by < 76) return;
    const x = ctx.x;
    const color = NEON[building.neon];
    const outage = outageLevel(ctx.state, building.district, ctx.t, building.seed + 700);
    if (outage < .08) return;
    const vertical = building.label.length <= 2 || noise(building.seed + 211) > .62;
    const sw = vertical ? 15 : clamp(building.w * .48, 31, 55);
    const sh = vertical ? 35 : 17;
    const sx = building.signSide > 0 ? bx + building.w - sw - 5 : bx + 5;
    const sy = by + clamp((base - by) * .28, 22, 60);
    const power = outage * (ctx.t < ctx.state.surgeUntil ? 1.35 : 1);

    x.save();
    x.shadowColor = color.solid;
    x.shadowBlur = 7 * power;
    x.fillStyle = 'rgba(4,8,22,.78)';
    x.strokeStyle = `rgba(${color.rgb},${.68 * power})`;
    x.lineWidth = .9;
    x.fillRect(sx, sy, sw, sh);
    x.strokeRect(sx + .5, sy + .5, sw - 1, sh - 1);
    x.fillStyle = `rgba(${color.rgb},${.92 * power})`;
    x.font = `${vertical ? 10 : 8}px "Courier New", sans-serif`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    if (vertical) {
      const chars = Array.from(building.label).slice(0, 3);
      chars.forEach((char, index) => x.fillText(char, sx + sw / 2, sy + 9 + index * 10));
    } else {
      x.fillText(building.label, sx + sw / 2, sy + sh / 2 + .5);
    }
    x.restore();

    ctx.state.visibleNeons.push({ x: sx + sw / 2, y: sy + sh, w: sw, rgb: color.rgb, power });
  }

  function drawCityLayer(ctx, layer, options) {
    const x = ctx.x;
    const base = ctx.h * options.base;
    const fill = x.createLinearGradient(0, ctx.h * .40, 0, base);
    fill.addColorStop(0, options.top);
    fill.addColorStop(1, options.bottom);

    // Keep each building's roof geometry while sharing gradients and detail rules.
    visibleCopies(layer, ctx.R.scroll, options.speed, ctx.w, (building, bx) => {
      const by = base - building.h * ctx.h;
      x.fillStyle = fill;
      buildingPath(x, bx, by, building.w, base + 3, building);
      x.fill();
      x.strokeStyle = options.edge;
      x.lineWidth = options.far ? .55 : .8;
      x.stroke();
      drawRoofDetails(x, bx, by, building.w, building, options.far ? .10 : .18);
      drawWindows(ctx, building, bx, by, base, options.far);
      if (!options.far) drawSign(ctx, building, bx, by, base);
    });
  }

  function drawSkyway(ctx) {
    const x = ctx.x;
    const y = ctx.h * .51;
    x.save();
    const rail = x.createLinearGradient(0, 0, ctx.w, 0);
    rail.addColorStop(0, 'rgba(58,220,255,0)');
    rail.addColorStop(.18, 'rgba(58,220,255,.26)');
    rail.addColorStop(.63, 'rgba(255,65,174,.30)');
    rail.addColorStop(1, 'rgba(255,65,174,0)');
    x.strokeStyle = rail;
    x.lineWidth = 1.1;
    x.beginPath();
    x.moveTo(-30, y + 15);
    x.bezierCurveTo(ctx.w * .24, y - 17, ctx.w * .68, y + 20, ctx.w + 30, y - 8);
    x.stroke();
    x.setLineDash([3, 13]);
    x.lineDashOffset = ctx.state.reduceMotion ? 0 : -(ctx.t * .018 % 16);
    x.strokeStyle = 'rgba(170,240,255,.34)';
    x.beginPath();
    x.moveTo(-30, y + 18);
    x.bezierCurveTo(ctx.w * .24, y - 14, ctx.w * .68, y + 23, ctx.w + 30, y - 5);
    x.stroke();
    x.setLineDash([]);

    for (const car of ctx.state.cars) {
      const direction = car.lane === 1 ? -1 : 1;
      const travel = ctx.state.reduceMotion ? car.x : car.x + direction * (ctx.t + car.phase) * car.speed * .001;
      const px = ((travel % 1.16) + 1.16) % 1.16 * ctx.w - ctx.w * .08;
      const curve = Math.sin((px / ctx.w) * Math.PI) * (car.lane - 1) * 9;
      const py = y + 4 + curve + car.lane * 8;
      const color = NEON[car.neon];
      const dir = direction > 0 ? 1 : -1;
      x.shadowColor = color.solid;
      x.shadowBlur = 9;
      x.strokeStyle = `rgba(${color.rgb},.33)`;
      x.lineWidth = 1.3;
      x.beginPath();
      x.moveTo(px - dir * 8, py);
      x.lineTo(px - dir * 42, py + dir * 1.5);
      x.stroke();
      x.fillStyle = `rgba(${color.rgb},.88)`;
      x.beginPath();
      x.moveTo(px - 6, py - 2);
      x.lineTo(px + 6, py - 2);
      x.lineTo(px + 9, py + 2);
      x.lineTo(px - 8, py + 2);
      x.closePath();
      x.fill();
    }
    x.restore();
  }

  function drawStreetDetails(ctx) {
    const x = ctx.x;
    const spacing = Math.max(230, Math.min(360, ctx.w * .32));
    const offset = ((ctx.R.scroll * .84 % spacing) + spacing) % spacing;
    for (let index = -1; index * spacing - offset < ctx.w + spacing; index++) {
      const px = index * spacing - offset + spacing * .46;
      const gy = ctx.groundY(px);
      const color = NEON[Math.abs(index) % 2];
      x.strokeStyle = 'rgba(31,60,78,.88)';
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(px, gy);
      x.lineTo(px, gy - 54);
      x.quadraticCurveTo(px, gy - 62, px + 9, gy - 62);
      x.lineTo(px + 25, gy - 62);
      x.stroke();
      x.strokeStyle = `rgba(${color.rgb},.62)`;
      x.shadowColor = color.solid;
      x.shadowBlur = 12;
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(px + 10, gy - 62);
      x.lineTo(px + 26, gy - 62);
      x.stroke();
      x.shadowBlur = 0;
      ctx.state.visibleNeons.push({ x: px + 18, y: gy - 59, w: 18, rgb: color.rgb, power: .72 });
    }
  }

  function drawMidground(ctx) {
    const x = ctx.x;
    ctx.state.visibleNeons.length = 0;

    // Atmospheric repaint hides the generic block-city layer while preserving its
    // soft silhouette at the horizon. It also gives the custom city real depth.
    const veil = x.createLinearGradient(0, ctx.h * .43, 0, ctx.h * .87);
    veil.addColorStop(0, 'rgba(7,12,29,.10)');
    veil.addColorStop(.19, 'rgba(7,13,31,.94)');
    veil.addColorStop(.55, 'rgba(5,9,23,.99)');
    veil.addColorStop(1, 'rgba(3,6,16,1)');
    x.fillStyle = veil;
    x.fillRect(0, ctx.h * .43, ctx.w, ctx.h * .45);

    const horizon = x.createLinearGradient(0, 0, ctx.w, 0);
    horizon.addColorStop(0, 'rgba(29,190,223,.05)');
    horizon.addColorStop(.38, 'rgba(46,115,190,.12)');
    horizon.addColorStop(.74, 'rgba(225,47,157,.11)');
    horizon.addColorStop(1, 'rgba(225,47,157,.02)');
    x.fillStyle = horizon;
    x.fillRect(0, ctx.h * .57, ctx.w, ctx.h * .28);

    drawCityLayer(ctx, ctx.state.far, {
      base: .82, speed: .10, far: true,
      top: 'rgba(16,29,55,.90)', bottom: 'rgba(8,17,38,.98)',
      edge: 'rgba(83,148,187,.13)',
    });
    drawSkyway(ctx);
    drawCityLayer(ctx, ctx.state.mid, {
      base: .865, speed: .38, far: false,
      top: 'rgba(12,22,45,.96)', bottom: 'rgba(4,9,23,.99)',
      edge: 'rgba(87,156,204,.19)',
    });
    drawStreetDetails(ctx);
    drawRainBand(ctx, .32, .69, .64);
  }

  function traceTerrain(ctx) {
    const x = ctx.x;
    x.beginPath();
    x.moveTo(-20, ctx.h + 20);
    for (let px = -20; px <= ctx.w + 24; px += 7) x.lineTo(px, ctx.groundY(px));
    x.lineTo(ctx.w + 24, ctx.h + 20);
    x.closePath();
  }

  function drawReflections(ctx) {
    const x = ctx.x;
    const sources = ctx.state.visibleNeons.slice(0, ctx.w < 600 ? 8 : 14);
    x.save();
    x.globalCompositeOperation = 'screen';
    for (let index = 0; index < sources.length; index++) {
      const source = sources[index];
      if (source.x < -30 || source.x > ctx.w + 30) continue;
      const gy = ctx.groundY(source.x) + 3;
      const reach = Math.min(ctx.h - gy, 32 + source.w * .72);
      const gradient = x.createLinearGradient(0, gy, 0, gy + reach);
      gradient.addColorStop(0, `rgba(${source.rgb},${.19 * source.power})`);
      gradient.addColorStop(.45, `rgba(${source.rgb},${.08 * source.power})`);
      gradient.addColorStop(1, `rgba(${source.rgb},0)`);
      x.fillStyle = gradient;
      const bands = 5;
      for (let band = 0; band < bands; band++) {
        const py = gy + band * reach / bands + noise(index * 31 + band) * 4;
        const width = source.w * (.58 - band * .055);
        const shift = (noise(index * 71 + band * 13) - .5) * 13;
        x.fillRect(source.x - width / 2 + shift, py, width, Math.max(1, reach / bands * .42));
      }
    }
    x.restore();
  }

  function drawTerrain(ctx) {
    const x = ctx.x;
    traceTerrain(ctx);
    const asphalt = x.createLinearGradient(0, ctx.h * .83, 0, ctx.h);
    asphalt.addColorStop(0, 'rgba(13,27,40,.98)');
    asphalt.addColorStop(.18, 'rgba(8,20,33,.99)');
    asphalt.addColorStop(1, 'rgba(2,7,17,1)');
    x.fillStyle = asphalt;
    x.fill();

    x.save();
    traceTerrain(ctx);
    x.clip();

    const wetSheen = x.createLinearGradient(0, ctx.h * .84, ctx.w, ctx.h);
    wetSheen.addColorStop(0, 'rgba(48,222,244,.07)');
    wetSheen.addColorStop(.42, 'rgba(78,89,164,.025)');
    wetSheen.addColorStop(.78, 'rgba(247,48,159,.065)');
    wetSheen.addColorStop(1, 'rgba(18,34,60,.02)');
    x.fillStyle = wetSheen;
    x.fillRect(0, ctx.h * .82, ctx.w, ctx.h * .20);

    drawReflections(ctx);

    for (const puddle of ctx.state.puddles) {
      const px = puddle.x * ctx.w;
      const gy = ctx.groundY(px);
      const py = gy + puddle.y * Math.max(20, ctx.h - gy - 4);
      const shimmer = .60 + Math.sin(ctx.t * .0015 + puddle.p) * .18;
      x.strokeStyle = `rgba(111,211,236,${.07 * shimmer})`;
      x.lineWidth = .65;
      x.beginPath();
      x.ellipse(px, py, puddle.w, Math.max(1.2, puddle.w * .055), -.05, 0, TAU);
      x.stroke();
    }

    // Broken road glints read as wet asphalt without turning into a neon grid.
    const glintOffset = ((ctx.R.scroll * 1.6 % 72) + 72) % 72;
    for (let px = -glintOffset; px < ctx.w + 72; px += 72) {
      const gy = ctx.groundY(px);
      x.fillStyle = Math.floor((px + glintOffset) / 72) % 2
        ? 'rgba(48,229,255,.11)'
        : 'rgba(255,65,170,.075)';
      x.fillRect(px, gy + 12, 21, 1.2);
    }
    x.restore();

    x.save();
    x.strokeStyle = 'rgba(109,238,255,.56)';
    x.shadowColor = 'rgba(52,221,255,.72)';
    x.shadowBlur = 7;
    x.lineWidth = 1.25;
    x.beginPath();
    for (let px = -20; px <= ctx.w + 24; px += 7) {
      const py = ctx.groundY(px);
      if (px === -20) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.stroke();
    x.restore();
    return true;
  }

  function drawGround(ctx) {
    const x = ctx.x;
    for (const ripple of ctx.state.ripples) {
      const age = ctx.t - ripple.born;
      const progress = age / 900;
      const px = ripple.x * ctx.w;
      const py = ctx.groundY(px) + 5 + ripple.d * 14;
      const alpha = (1 - progress) * (.18 + ripple.d * .22);
      x.strokeStyle = `rgba(178,238,255,${alpha})`;
      x.lineWidth = .7 + ripple.d * .6;
      x.beginPath();
      x.ellipse(px, py, 3 + progress * (12 + ripple.d * 15), 1 + progress * 3.3, 0, 0, TAU);
      x.stroke();
      if (age < 180 && ripple.d > .72) {
        x.strokeStyle = `rgba(216,249,255,${alpha * .8})`;
        x.beginPath();
        x.moveTo(px, py);
        x.quadraticCurveTo(px - 3, py - 8 * (1 - age / 180), px - 5, py - 1);
        x.moveTo(px + 1, py);
        x.quadraticCurveTo(px + 4, py - 10 * (1 - age / 180), px + 7, py - 1);
        x.stroke();
      }
    }
  }

  function strokeBoltPath(x, points, w, h) {
    x.beginPath();
    points.forEach((point, index) => {
      const px = point[0] * w;
      const py = point[1] * h;
      if (index) x.lineTo(px, py); else x.moveTo(px, py);
    });
    x.stroke();
  }

  function drawThunder(ctx) {
    const bolt = ctx.state.bolt;
    const flash = flashLevel(ctx.state, ctx.t);
    if (flash > 0) {
      const wash = ctx.x.createLinearGradient(0, 0, ctx.w, ctx.h);
      wash.addColorStop(0, `rgba(170,213,255,${flash * .15})`);
      wash.addColorStop(.52, `rgba(200,184,255,${flash * .09})`);
      wash.addColorStop(1, `rgba(112,180,255,${flash * .04})`);
      ctx.x.fillStyle = wash;
      ctx.x.fillRect(0, 0, ctx.w, ctx.h);
    }
    if (!bolt) return;
    const age = ctx.t - bolt.born;
    if (age < 0 || age > 500 || (age > 245 && Math.sin(age * .067) < .60)) return;
    const flicker = age < 175 ? 1 : .34 * (1 - (age - 175) / 325);
    const x = ctx.x;
    x.save();
    x.globalCompositeOperation = 'screen';
    x.lineJoin = 'round';
    x.lineCap = 'round';
    x.strokeStyle = `rgba(80,185,255,${.36 * flicker})`;
    x.shadowColor = 'rgba(87,192,255,.95)';
    x.shadowBlur = 22;
    x.lineWidth = 5.8;
    strokeBoltPath(x, bolt.main, ctx.w, ctx.h);
    x.strokeStyle = `rgba(237,248,255,${.96 * flicker})`;
    x.shadowBlur = 9;
    x.lineWidth = 1.45;
    strokeBoltPath(x, bolt.main, ctx.w, ctx.h);
    x.lineWidth = .78;
    x.strokeStyle = `rgba(213,238,255,${.72 * flicker})`;
    for (const branch of bolt.branches) strokeBoltPath(x, branch, ctx.w, ctx.h);
    x.restore();
  }

  function drawForeground(ctx) {
    drawThunder(ctx);
    drawRainBand(ctx, .69, 1.01, ctx.t < ctx.state.surgeUntil ? 1.28 : 1);

    // A soft near-lens bloom keeps the rain luminous without flattening the UI.
    const lens = ctx.x.createRadialGradient(ctx.w * .76, ctx.h * .72, 2, ctx.w * .76, ctx.h * .72, ctx.w * .23);
    lens.addColorStop(0, 'rgba(255,57,169,.035)');
    lens.addColorStop(1, 'rgba(255,57,169,0)');
    ctx.x.fillStyle = lens;
    ctx.x.fillRect(ctx.w * .48, ctx.h * .45, ctx.w * .52, ctx.h * .55);
  }

  V8.worlds.register('cyber', {
    terrain,
    init,
    update,
    spawnEvent,
    drawBackdrop,
    drawMidground,
    drawTerrain,
    drawGround,
    drawForeground,
    updatePlayer,
    teardown,
  });
})(window.V8 = window.V8 || {});
