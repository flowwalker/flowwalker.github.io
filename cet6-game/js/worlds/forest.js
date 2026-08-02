/** Magic Forest bonus world — isolated canvas renderer. */
(function(V8) {
  'use strict';

  const TAU = Math.PI * 2;
  const RIDGE_PERIOD = 2380;
  const RIDGE_LIP = 1080;
  let terrainOrigin = 0;
  let CANOPY_SPRITES = null;

  function noise(n) {
    const value = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return value - Math.floor(value);
  }

  function mod(value, period) {
    return ((value % period) + period) % period;
  }

  function smoothstep(value) {
    const p = Math.max(0, Math.min(1, value));
    return p * p * (3 - 2 * p);
  }

  function terrain(ctx) {
    const distance = ctx.wx - terrainOrigin;
    const u = mod(distance, RIDGE_PERIOD);
    let ridge;
    if (u < 760) ridge = 8 + 46 * smoothstep(u / 760);
    else if (u < RIDGE_LIP) ridge = 54 + Math.sin((u - 760) / (RIDGE_LIP - 760) * Math.PI) * 3;
    else if (u < 1240) ridge = 54 + (4 - 54) * smoothstep((u - RIDGE_LIP) / 160);
    else ridge = 4 + 4 * smoothstep((u - 1240) / (RIDGE_PERIOD - 1240));
    const phase = u / RIDGE_PERIOD * TAU;
    return ridge + Math.sin(phase * 2 + .45) * 6.5 + Math.sin(phase * 5 - .7) * 2.8;
  }

  function makeTree(seed, period, depth) {
    return {
      wx: noise(seed + 3) * period,
      h: .72 + noise(seed + 11) * .63,
      w: .70 + noise(seed + 23) * .62,
      phase: noise(seed + 37) * TAU,
      lean: (noise(seed + 41) - .5) * .13,
      crown: noise(seed + 53),
      depth,
    };
  }

  function makeLayer(index, count, period, speed) {
    const trees = [];
    for (let i = 0; i < count; i++) trees.push(makeTree(1100 + index * 211 + i * 17, period, index));
    return { trees, period, speed, index };
  }

  function makeCanopySprite(layerIndex, variant) {
    const canvas = document.createElement('canvas');
    canvas.width = 260;
    canvas.height = 170;
    const x = canvas.getContext('2d');
    const colors = layerIndex === 0
      ? ['rgba(6,45,35,.62)', 'rgba(14,75,52,.58)', 'rgba(38,106,70,.34)']
      : layerIndex === 1
        ? ['rgba(5,51,37,.80)', 'rgba(10,82,53,.76)', 'rgba(31,119,70,.52)']
        : ['rgba(4,43,29,.96)', 'rgba(7,70,42,.91)', 'rgba(28,126,68,.65)'];
    const shift = (variant - 1) * 5;
    function blob(cx, cy, rx, ry, color) {
      x.fillStyle = color;
      x.beginPath();
      x.ellipse(cx, cy, rx, ry, 0, 0, TAU);
      x.fill();
    }
    blob(130, 105, 73, 54, colors[0]);
    blob(86 + shift, 101, 45, 41, colors[1]);
    blob(174 + shift, 104, 48, 42, colors[1]);
    blob(120 - shift, 67, 54, 42, colors[1]);
    blob(162, 74, 38, 33, colors[2]);
    blob(82, 80, 32, 28, colors[2]);
    if (layerIndex === 2) {
      x.fillStyle = 'rgba(139,238,130,.19)';
      for (let i = 0; i < 9; i++) {
        const angle = noise(variant * 41 + i * 7) * TAU;
        const radius = 23 + noise(variant * 17 + i) * 57;
        x.beginPath();
        x.arc(130 + Math.cos(angle) * radius, 88 + Math.sin(angle) * 35, 1.4 + noise(i + 5) * 2, 0, TAU);
        x.fill();
      }
    }
    return canvas;
  }

  function getCanopySprites() {
    if (!CANOPY_SPRITES) {
      CANOPY_SPRITES = [0, 1, 2].map(layer => [0, 1, 2].map(variant => makeCanopySprite(layer, variant)));
    }
    return CANOPY_SPRITES;
  }

  function init(ctx) {
    terrainOrigin = ctx.R.scroll;
    const fireflies = [];
    for (let i = 0; i < 72; i++) {
      fireflies.push({
        wx: noise(i + 19) * 1320,
        y: .34 + noise(i + 67) * .45,
        size: .55 + noise(i + 103) * 1.35,
        phase: noise(i + 149) * TAU,
        depth: noise(i + 181),
      });
    }
    let reduceMotion = false;
    try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}

    return {
      layers: [
        makeLayer(0, 12, 1180, .16),
        makeLayer(1, 10, 1320, .38),
        makeLayer(2, 8, 1460, .72),
      ],
      canopySprites: getCanopySprites(),
      fireflies,
      bloomStarted: -Infinity,
      bloomUntil: 0,
      meteors: [],
      origin: terrainOrigin,
      reduceMotion,
      launchActive: false,
      launchVelocity: 0,
      launchCycle: null,
      lastDistance: null,
    };
  }

  function spawnEvent(ctx) {
    if (Math.random() < .68) {
      ctx.state.bloomStarted = ctx.t;
      ctx.state.bloomUntil = ctx.t + 2700;
    } else {
      ctx.state.meteors.push({
        born: ctx.t,
        life: 1250,
        x: .62 + Math.random() * .32,
        y: .05 + Math.random() * .14,
        vx: -(.55 + Math.random() * .20),
        vy: .24 + Math.random() * .11,
        seed: Math.random() * 900,
      });
    }
    return true;
  }

  function update(ctx) {
    ctx.state.meteors = ctx.state.meteors.filter(meteor => ctx.t - meteor.born < meteor.life);
  }

  function crossedMarker(previous, current, period, marker) {
    if (!Number.isFinite(previous) || current <= previous) return null;
    let target = Math.floor(previous / period) * period + marker;
    if (target <= previous) target += period;
    return current >= target ? Math.floor(target / period) : null;
  }

  function landOnRidge(ctx, player, state, gameState, playerX, landingBottom) {
    gameState.airB = landingBottom;
    gameState.airborne = false;
    gameState.gstate = 'ground';
    gameState.landN = 3;
    state.launchActive = false;
    player.classList.remove('terrain-flight');
    player.classList.add('terrain-landing');
    setTimeout(() => player.classList.remove('terrain-landing'), 440);
    if (V8.terrainLandingFX) V8.terrainLandingFX({
      x: playerX, y: ctx.groundY(playerX), ringCount: 3,
      rings: ['rgb(176,255,159)', 'rgb(92,244,178)', 'rgb(255,225,119)'],
      colors: [[183,255,159], [77,238,168], [255,224,119]],
      count: 26, spread: 4.7, lift: 4.5, gravity: .035, life: 1080,
      ringScaleY: .30, ringStart: 8, ringStep: 9, ringSpeed: 10, shake: 2.5,
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
    if (state.launchActive && gameState.gstate !== 'forestSlope') {
      state.launchActive = false;
      player.classList.remove('terrain-flight');
      return;
    }
    if (state.launchActive) {
      const step = Math.min(40, Math.max(0, ctx.dt || 0)) / 1000;
      state.launchVelocity -= 438 * step;
      gameState.airB += state.launchVelocity * step;
      const landingBottom = ctx.h - ctx.groundY(playerX);
      if (state.launchVelocity < 0 && gameState.airB <= landingBottom) {
        landOnRidge(ctx, player, state, gameState, playerX, landingBottom);
      }
      player.style.bottom = gameState.airB + 'px';
      return;
    }

    const blocked = state.reduceMotion || gameState.lock || gameState.rdy || gameState.airborne || gameState.jumping || gameState.flying ||
      player.classList.contains('v8-streak-airborne') || player.classList.contains('v8-streak-overdrive');
    const cycle = crossedMarker(previous, distance, RIDGE_PERIOD, RIDGE_LIP - 12);
    if (blocked || cycle === null || state.launchCycle === cycle) return;

    state.launchCycle = cycle;
    state.launchActive = true;
    state.launchVelocity = 160 + Math.min(34, Math.max(0, ctx.R.ts - 1) * 18);
    gameState.gstate = 'forestSlope';
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
    if (state) {
      state.launchActive = false;
      state.launchVelocity = 0;
      state.launchCycle = null;
      state.lastDistance = null;
    }
    if (player) player.classList.remove('terrain-flight', 'terrain-landing');
    if (gameState && gameState.gstate === 'forestSlope') {
      gameState.gstate = 'ground'; gameState.airborne = false; gameState.jumping = false;
    }
  }

  function treeScreenPositions(ctx, layer, callback) {
    const offset = mod(ctx.R.scroll * layer.speed, layer.period);
    const firstRepeat = -1;
    const repeats = Math.ceil(ctx.w / layer.period) + 3;
    for (let repeat = firstRepeat; repeat < repeats; repeat++) {
      for (const tree of layer.trees) {
        const sx = tree.wx - offset + repeat * layer.period;
        if (sx > -150 && sx < ctx.w + 150) callback(tree, sx);
      }
    }
  }

  function drawTree(ctx, tree, sx, layerIndex) {
    const x = ctx.x;
    const near = layerIndex === 2;
    const middle = layerIndex === 1;
    const scale = (ctx.h < 650 ? .84 : 1) * tree.h;
    const height = (layerIndex === 0 ? 128 : layerIndex === 1 ? 176 : 226) * scale;
    const crownW = (layerIndex === 0 ? 74 : layerIndex === 1 ? 98 : 124) * tree.w * scale;
    const baseY = near ? ctx.groundY(sx) + 14 : ctx.h * (middle ? .87 : .80);
    const trunkW = Math.max(5, height * (near ? .075 : .055));
    const topX = sx + tree.lean * height;
    const sway = Math.sin(ctx.t * (.00075 + layerIndex * .00012) + tree.phase) * (2.2 + layerIndex * 1.8);
    const branchSway = sway * .92;
    const trunkAlpha = layerIndex === 0 ? .48 : layerIndex === 1 ? .72 : .96;

    x.save();
    x.globalAlpha = trunkAlpha;

    // The roots and lower trunk stay fixed. Only the upper trunk bends subtly.
    x.fillStyle = layerIndex === 0 ? '#071f19' : near ? '#123626' : '#0a291f';
    x.beginPath();
    x.moveTo(sx - trunkW * .64, baseY + 7);
    x.bezierCurveTo(sx - trunkW * .45, baseY - height * .34, topX - trunkW * .35, baseY - height * .73, topX + sway, baseY - height * .91);
    x.bezierCurveTo(topX + trunkW * .55 + sway, baseY - height * .70, sx + trunkW * .58, baseY - height * .30, sx + trunkW * .72, baseY + 7);
    x.closePath();
    x.fill();

    if (near) {
      x.strokeStyle = 'rgba(84,128,83,.22)';
      x.lineWidth = Math.max(1, trunkW * .12);
      x.beginPath();
      x.moveTo(sx - trunkW * .12, baseY - 3);
      x.bezierCurveTo(sx - trunkW * .28, baseY - height * .35, topX + 1, baseY - height * .67, topX + sway, baseY - height * .86);
      x.stroke();
    }

    // Branch anchors remain attached to the trunk; branch tips follow the crown sway.
    x.strokeStyle = near ? 'rgba(9,31,22,.96)' : 'rgba(5,28,22,.82)';
    x.lineCap = 'round';
    const branchCount = near ? 4 : 3;
    for (let i = 0; i < branchCount; i++) {
      const level = .50 + i * .12;
      const anchorX = sx + tree.lean * height * level;
      const anchorY = baseY - height * level;
      const direction = i % 2 ? 1 : -1;
      const length = crownW * (.33 + i * .025);
      x.lineWidth = Math.max(1.3, trunkW * (.34 - i * .045));
      x.beginPath();
      x.moveTo(anchorX, anchorY);
      x.quadraticCurveTo(anchorX + direction * length * .42, anchorY - height * .035, anchorX + direction * length + branchSway * level, anchorY - height * (.075 + i * .006));
      x.stroke();
    }

    const crownX = topX + sway;
    const crownY = baseY - height * .82;
    const variant = Math.min(2, Math.floor(tree.crown * 3));
    const sprite = ctx.state.canopySprites[layerIndex][variant];
    x.globalAlpha = 1;
    x.drawImage(sprite, crownX - crownW * .73, crownY - height * .35, crownW * 1.46, height * .68);
    x.restore();
  }

  function drawMeteor(ctx, meteor) {
    const age = ctx.t - meteor.born;
    const p = age / meteor.life;
    if (p < 0 || p >= 1) return;
    const x = ctx.x;
    const fade = Math.sin(Math.PI * p);
    const px = (meteor.x + meteor.vx * p) * ctx.w;
    const py = (meteor.y + meteor.vy * p) * ctx.h;
    const tailX = px - meteor.vx * ctx.w * .20;
    const tailY = py - meteor.vy * ctx.h * .20;
    x.save();
    x.globalCompositeOperation = 'lighter';
    x.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const offset = (i - 1) * 3.5;
      const gradient = x.createLinearGradient(tailX, tailY, px, py);
      gradient.addColorStop(0, 'rgba(46,255,210,0)');
      gradient.addColorStop(.48, `rgba(56,238,214,${.18 * fade})`);
      gradient.addColorStop(.82, `rgba(255,214,83,${.64 * fade})`);
      gradient.addColorStop(1, `rgba(244,255,220,${.95 * fade})`);
      x.strokeStyle = gradient;
      x.lineWidth = i === 1 ? 3.2 : 1.15;
      x.beginPath();
      x.moveTo(tailX + offset, tailY - offset * .3);
      x.quadraticCurveTo((tailX + px) * .5 + Math.sin(meteor.seed + i) * 8, (tailY + py) * .5, px, py);
      x.stroke();
    }
    const glow = x.createRadialGradient(px, py, 0, px, py, 18);
    glow.addColorStop(0, `rgba(255,255,228,${fade})`);
    glow.addColorStop(.25, `rgba(255,221,101,${.72 * fade})`);
    glow.addColorStop(1, 'rgba(62,255,218,0)');
    x.fillStyle = glow;
    x.fillRect(px - 20, py - 20, 40, 40);
    x.restore();
  }

  function drawBackdrop(ctx) {
    const x = ctx.x;
    const mist = x.createLinearGradient(0, ctx.h * .22, 0, ctx.h * .84);
    mist.addColorStop(0, 'rgba(36,132,100,0)');
    mist.addColorStop(.62, 'rgba(55,179,127,.075)');
    mist.addColorStop(1, 'rgba(143,221,154,.14)');
    x.fillStyle = mist;
    x.fillRect(0, ctx.h * .18, ctx.w, ctx.h * .69);

    // Soft moon shafts add depth without flattening the dark canopy.
    x.save();
    x.globalCompositeOperation = 'screen';
    for (let i = 0; i < 3; i++) {
      const shaftX = ctx.w * (.16 + i * .32) + Math.sin(ctx.t * .00018 + i) * 24;
      const beam = x.createLinearGradient(shaftX, ctx.h * .05, shaftX + 70, ctx.h * .76);
      beam.addColorStop(0, 'rgba(176,255,204,.075)');
      beam.addColorStop(1, 'rgba(112,241,167,0)');
      x.fillStyle = beam;
      x.beginPath();
      x.moveTo(shaftX - 18, ctx.h * .04);
      x.lineTo(shaftX + 25, ctx.h * .04);
      x.lineTo(shaftX + 145, ctx.h * .82);
      x.lineTo(shaftX + 28, ctx.h * .82);
      x.closePath();
      x.fill();
    }
    x.restore();

    treeScreenPositions(ctx, ctx.state.layers[0], (tree, sx) => drawTree(ctx, tree, sx, 0));
    for (const meteor of ctx.state.meteors) drawMeteor(ctx, meteor);
  }

  function drawMidground(ctx) {
    treeScreenPositions(ctx, ctx.state.layers[1], (tree, sx) => drawTree(ctx, tree, sx, 1));
    treeScreenPositions(ctx, ctx.state.layers[2], (tree, sx) => drawTree(ctx, tree, sx, 2));
  }

  function traceTerrain(ctx, yOffset) {
    const x = ctx.x;
    x.beginPath();
    x.moveTo(-20, ctx.h + 20);
    for (let px = -20; px <= ctx.w + 24; px += 6) x.lineTo(px, ctx.groundY(px) + (yOffset || 0));
    x.lineTo(ctx.w + 24, ctx.h + 20);
    x.closePath();
  }

  function drawTerrain(ctx) {
    const x = ctx.x;
    x.save();
    traceTerrain(ctx, 0);
    const earth = x.createLinearGradient(0, ctx.h * .70, 0, ctx.h);
    earth.addColorStop(0, '#102d20');
    earth.addColorStop(.16, '#091d14');
    earth.addColorStop(.58, '#04100c');
    earth.addColorStop(1, '#020806');
    x.fillStyle = earth;
    x.fill();

    // Thick moss lip replaces the shared neon road edge.
    x.strokeStyle = 'rgba(17,49,30,.96)';
    x.lineWidth = 10;
    x.lineJoin = 'round';
    x.beginPath();
    for (let px = -20; px <= ctx.w + 24; px += 6) {
      const py = ctx.groundY(px) + 4;
      if (px === -20) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.stroke();
    x.strokeStyle = 'rgba(111,205,93,.72)';
    x.lineWidth = 2.2;
    x.beginPath();
    for (let px = -20; px <= ctx.w + 24; px += 6) {
      const py = ctx.groundY(px);
      if (px === -20) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.stroke();

    // World-anchored roots, moss tufts and tiny fungi sell the moving terrain.
    const grassStart = Math.floor((ctx.R.scroll - 40) / 34) * 34;
    for (let wx = grassStart; wx < ctx.R.scroll + ctx.w + 60; wx += 34) {
      const sx = wx - ctx.R.scroll;
      const py = ctx.groundY(sx);
      const blade = 4 + noise(wx * .071) * 9;
      const lean = (noise(wx * .13 + 9) - .5) * 7;
      x.strokeStyle = `rgba(105,205,92,${.34 + noise(wx) * .32})`;
      x.lineWidth = .8 + noise(wx + 4) * .8;
      x.beginPath();
      x.moveTo(sx, py + 1);
      x.quadraticCurveTo(sx + lean * .25, py - blade * .65, sx + lean, py - blade);
      x.stroke();
      if (noise(wx * .19) > .86) {
        x.fillStyle = 'rgba(150,255,190,.52)';
        x.beginPath();
        x.ellipse(sx + 5, py - 2, 3.2, 1.6, -.25, 0, TAU);
        x.fill();
        x.fillStyle = 'rgba(226,255,215,.66)';
        x.fillRect(sx + 4.6, py - 1.5, 1, 4);
      }
    }

    const rootStart = Math.floor((ctx.R.scroll - 80) / 230) * 230;
    for (let wx = rootStart; wx < ctx.R.scroll + ctx.w + 120; wx += 230) {
      const sx = wx - ctx.R.scroll + (noise(wx * .07) - .5) * 72;
      const py = ctx.groundY(sx) + 3;
      const length = 54 + noise(wx + 3) * 48;
      x.strokeStyle = 'rgba(61,94,55,.45)';
      x.lineCap = 'round';
      x.lineWidth = 2.2 + noise(wx + 8) * 2.5;
      x.beginPath();
      x.moveTo(sx, py);
      x.bezierCurveTo(sx - length * .20, py + 9, sx - length * .55, py + 18, sx - length, py + 28 + noise(wx) * 18);
      x.stroke();
      x.lineWidth *= .58;
      x.beginPath();
      x.moveTo(sx - length * .45, py + 16);
      x.quadraticCurveTo(sx - length * .32, py + 34, sx - length * .58, py + 43);
      x.stroke();
    }
    x.restore();
    return true;
  }

  function drawFairyRing(ctx) {
    const x = ctx.x;
    const px = ctx.w * .17 + 18;
    const py = ctx.groundY(px) + 3;
    const bloom = ctx.t < ctx.state.bloomUntil;
    const pulse = .72 + .28 * Math.sin(ctx.t * .0032);
    const radius = Math.max(42, Math.min(68, ctx.w * .052));
    x.save();
    x.globalCompositeOperation = 'lighter';

    x.save();
    x.translate(px, py);
    x.scale(1, .27);
    const glow = x.createRadialGradient(0, 0, 2, 0, 0, radius * 1.55);
    glow.addColorStop(0, `rgba(196,255,193,${.12 + (bloom ? .10 : 0)})`);
    glow.addColorStop(.42, `rgba(76,255,184,${.10 * pulse})`);
    glow.addColorStop(.72, `rgba(94,227,255,${.055 * pulse})`);
    glow.addColorStop(1, 'rgba(80,255,187,0)');
    x.fillStyle = glow;
    x.fillRect(-radius * 1.6, -radius * 1.6, radius * 3.2, radius * 3.2);
    x.restore();

    x.lineWidth = 1.25;
    x.strokeStyle = `rgba(144,255,190,${.38 + pulse * .28})`;
    x.beginPath();
    x.ellipse(px, py, radius, 11, 0, 0, TAU);
    x.stroke();
    x.strokeStyle = `rgba(108,229,255,${.30 + pulse * .20})`;
    x.beginPath();
    x.ellipse(px, py, radius * .71, 7.3, 0, 0, TAU);
    x.stroke();

    // Rotating rune marks follow the projected ellipse.
    const rotation = ctx.t * .00032;
    for (let i = 0; i < 12; i++) {
      const angle = rotation + i / 12 * TAU;
      const rx = px + Math.cos(angle) * radius * .86;
      const ry = py + Math.sin(angle) * 9.2;
      const runeA = .40 + .34 * Math.sin(ctx.t * .004 + i * 1.7);
      x.strokeStyle = `rgba(218,255,189,${runeA})`;
      x.lineWidth = 1;
      x.beginPath();
      x.moveTo(rx - 2.5, ry + 1.5);
      x.lineTo(rx, ry - 2);
      x.lineTo(rx + 2.5, ry + 1.5);
      x.moveTo(rx, ry - 2);
      x.lineTo(rx, ry + 2.8);
      x.stroke();
    }

    for (let i = 0; i < 8; i++) {
      const angle = -ctx.t * .00072 + i / 8 * TAU;
      const dotX = px + Math.cos(angle) * radius * 1.08;
      const dotY = py + Math.sin(angle) * 12;
      x.fillStyle = `rgba(${i % 2 ? '255,225,119' : '126,255,220'},${.18 + pulse * .12})`;
      x.beginPath();
      x.arc(dotX, dotY, 4.6, 0, TAU);
      x.fill();
      x.fillStyle = `rgba(${i % 2 ? '255,238,168' : '196,255,237'},${.62 + pulse * .28})`;
      x.beginPath();
      x.arc(dotX, dotY, 1.35 + (i % 3) * .25, 0, TAU);
      x.fill();
    }
    x.restore();
  }

  function drawNormalFireflies(ctx) {
    const x = ctx.x;
    const period = 1320;
    const offset = mod(ctx.R.scroll * .24, period);
    const mobile = ctx.w < 620;
    const limit = mobile ? 32 : 56;
    x.save();
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < limit; i++) {
      const fly = ctx.state.fireflies[i];
      let sx = mod(fly.wx - offset, period);
      if (sx > ctx.w + 30) sx -= period;
      if (sx < -30 || sx > ctx.w + 30) continue;
      sx += Math.sin(ctx.t * (.00055 + fly.depth * .0004) + fly.phase) * (7 + fly.depth * 7);
      const sy = fly.y * ctx.h + Math.cos(ctx.t * .0009 + fly.phase) * (4 + fly.depth * 6);
      const blink = Math.pow(Math.max(0, Math.sin(ctx.t * .0022 + fly.phase)), 2);
      const alpha = (.10 + blink * .44) * (.55 + fly.depth * .45);
      const radius = fly.size * (.72 + fly.depth * .35);
      x.fillStyle = `rgba(160,255,94,${alpha * .20})`;
      x.beginPath();
      x.arc(sx, sy, radius * 3.4, 0, TAU);
      x.fill();
      x.fillStyle = `rgba(222,255,145,${alpha})`;
      x.beginPath();
      x.arc(sx, sy, radius, 0, TAU);
      x.fill();
    }
    x.restore();
  }

  function drawFireflyBurst(ctx) {
    const age = ctx.t - ctx.state.bloomStarted;
    if (age < 0 || ctx.t >= ctx.state.bloomUntil) return;
    const x = ctx.x;
    const duration = Math.max(1, ctx.state.bloomUntil - ctx.state.bloomStarted);
    const master = Math.sin(Math.PI * Math.min(1, age / duration));
    const cx = ctx.w * .17 + 20;
    const cy = ctx.groundY(cx) - 38;
    const count = ctx.w < 620 ? 34 : 52;
    x.save();
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < count; i++) {
      const delay = (i % 12) * 34;
      const local = Math.max(0, age - delay);
      const p = smoothstep(Math.min(1, local / 1900));
      if (p <= 0) continue;
      const angle = noise(i + 880) * TAU;
      const spread = (18 + noise(i + 910) * (ctx.w < 620 ? 92 : 145)) * p;
      const sx = cx + Math.cos(angle) * spread + Math.sin(ctx.t * .002 + i) * 6;
      const sy = cy + Math.sin(angle) * spread * .48 - p * (25 + noise(i + 930) * 70);
      const alpha = master * (.34 + noise(i + 960) * .66);
      const gold = i % 5 === 0;
      const radius = 1 + noise(i + 1020) * 1.8;
      x.fillStyle = gold ? `rgba(255,207,76,${alpha * .22})` : `rgba(126,255,92,${alpha * .20})`;
      x.beginPath();
      x.arc(sx, sy, radius * 3.6, 0, TAU);
      x.fill();
      x.fillStyle = gold ? `rgba(255,239,155,${alpha})` : `rgba(199,255,153,${alpha})`;
      x.beginPath();
      x.arc(sx, sy, radius, 0, TAU);
      x.fill();
    }
    x.restore();
  }

  function drawGround(ctx) {
    drawFairyRing(ctx);
  }

  function drawForeground(ctx) {
    drawNormalFireflies(ctx);
    drawFireflyBurst(ctx);
  }

  V8.worlds.register('forest', {
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
