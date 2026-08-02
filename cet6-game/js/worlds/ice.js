/** Aurora Icefield bonus world — isolated canvas renderer. */
(function(V8) {
  'use strict';

  const TAU = Math.PI * 2;
  const TERRAIN_PERIOD = 4200;
  const SNOW_BUCKET_COUNT = 3;
  // Keep the long downhill run inside the lower viewport as the camera scrolls.
  // All ground-relative elements (skateboard, snow trail and cliff faces) use
  // groundY, so lifting the terrain here moves the complete playable surface.
  const TERRAIN_LIFT = 78;
  let terrainOrigin = 0;

  function noise(n) {
    const value = Math.sin(n * 43.145 + 12.77) * 15431.321;
    return value - Math.floor(value);
  }

  function mod(value, period) {
    return ((value % period) + period) % period;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function smoothstep(value) {
    const p = clamp01(value);
    return p * p * (3 - 2 * p);
  }

  function useLowDetail(ctx) {
    const width = Math.max(0, Number(ctx && ctx.w) || 0);
    const height = Math.max(0, Number(ctx && ctx.h) || 0);
    // Phones have a much smaller CSS canvas and already sustain full detail.
    if (Math.min(width, height) <= 640) return false;
    const dpr = Math.max(1, Number(ctx && ctx.R && ctx.R.dpr) || window.devicePixelRatio || 1);
    const cssPixels = width * height;
    return cssPixels >= 1200000 || cssPixels * dpr * dpr >= 3000000;
  }

  function terrainHeight(worldDistance) {
    const u = mod(worldDistance, TERRAIN_PERIOD);
    let height;
    if (u < 1100) {
      // The signature upper-left to lower-right downhill run.
      height = 112 - u * .063;
    } else if (u < 1370) {
      // A calm shelf telegraphs the approaching lip.
      height = 42.7 + Math.sin((u - 1100) / 270 * Math.PI) * 1.6;
    } else if (u < 1450) {
      // Short, steep but continuous cliff: visually clear and safe for ground sync.
      height = 42.7 + (-48 - 42.7) * smoothstep((u - 1370) / 80);
    } else if (u < 3400) {
      height = -48 - (u - 1450) * .009;
    } else {
      // A broad glacial wall reconnects the repeating landscape off in the distance.
      height = -65.6 + (112 + 65.6) * smoothstep((u - 3400) / 800);
    }
    const rolling = u > 1030 && u < 1490 ? 0 : Math.sin(worldDistance / 238 + .4) * 7.2;
    const texture = u > 1100 && u < 1450 ? 0 : Math.sin(worldDistance / 126) * 3.4 + Math.sin(worldDistance / 47) * 1.2;
    return height + rolling + texture;
  }

  function terrain(ctx) {
    return terrainHeight(ctx.wx - terrainOrigin) + TERRAIN_LIFT;
  }

  function makeMountain(seed, period, layer) {
    return {
      wx: noise(seed + 5) * period,
      width: (layer === 0 ? 260 : 205) * (.72 + noise(seed + 17) * .68),
      height: (layer === 0 ? 165 : 126) * (.72 + noise(seed + 29) * .60),
      skew: (noise(seed + 41) - .5) * .30,
      notch: noise(seed + 53),
    };
  }

  function makeMountainLayer(index, count, period, speed) {
    const items = [];
    for (let i = 0; i < count; i++) items.push(makeMountain(900 + index * 173 + i * 23, period, index));
    return { items, period, speed, index };
  }

  function makePine(seed, period, layer) {
    return {
      wx: noise(seed + 3) * period,
      scale: .66 + noise(seed + 13) * .78,
      phase: noise(seed + 27) * TAU,
      pale: noise(seed + 39),
      layer,
    };
  }

  function makePineLayer(index, count, period, speed) {
    const items = [];
    for (let i = 0; i < count; i++) items.push(makePine(1600 + index * 197 + i * 19, period, index));
    return { items, period, speed, index };
  }

  function init(ctx) {
    terrainOrigin = ctx.R.scroll;
    const lowDetail = useLowDetail(ctx);
    const snow = [];
    const snowTiers = Array.from({ length: 3 }, () =>
      Array.from({ length: SNOW_BUCKET_COUNT }, () => []));
    const snowCount = lowDetail ? 180 : 270;
    for (let i = 0; i < snowCount; i++) {
      const size = .55 + noise(i + 149) * 2.25;
      const tier = i % 3;
      const bucket = Math.min(SNOW_BUCKET_COUNT - 1, Math.floor((size - .55) / .75));
      const flake = {
        x: noise(i + 7),
        y: noise(i + 83),
        size,
        speed: .62 + noise(i + 211) * 1.35,
        phase: noise(i + 263) * TAU,
        tier,
        normal: Math.floor(i / 3) % 2 === 0,
      };
      snow.push(flake);
      snowTiers[tier][bucket].push(flake);
    }
    let reduceMotion = false;
    try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}

    return {
      origin: terrainOrigin,
      lowDetail,
      snow,
      snowTiers,
      terrainProfile: [],
      mountains: [
        makeMountainLayer(0, lowDetail ? 8 : 11, 1760, .075),
        makeMountainLayer(1, lowDetail ? 9 : 13, 1580, .15),
      ],
      pines: [
        makePineLayer(0, lowDetail ? 20 : 31, 1390, .19),
        makePineLayer(1, lowDetail ? 16 : 25, 1510, .38),
        makePineLayer(2, lowDetail ? 12 : 19, 1660, .72),
      ],
      blizzardStarted: -Infinity,
      blizzardUntil: 0,
      auroraStarted: -Infinity,
      auroraUntil: 0,
      reduceMotion,
      launchActive: false,
      launchVelocity: 0,
      launchCycle: null,
      lastDistance: null,
    };
  }

  function eventEnvelope(t, started, until) {
    if (t < started || t >= until) return 0;
    const p = clamp01((t - started) / Math.max(1, until - started));
    return Math.pow(Math.sin(Math.PI * p), .72);
  }

  function blizzardStrength(ctx) {
    return eventEnvelope(ctx.t, ctx.state.blizzardStarted, ctx.state.blizzardUntil);
  }

  function auroraStrength(ctx) {
    return eventEnvelope(ctx.t, ctx.state.auroraStarted, ctx.state.auroraUntil);
  }

  function spawnEvent(ctx) {
    if (Math.random() < .58) {
      ctx.state.blizzardStarted = ctx.t;
      ctx.state.blizzardUntil = ctx.t + 3000;
    } else {
      ctx.state.auroraStarted = ctx.t;
      ctx.state.auroraUntil = ctx.t + 2600;
    }
    return true;
  }

  function update(ctx) {
    const storm = blizzardStrength(ctx);
    for (const flake of ctx.state.snow) {
      const depth = .58 + flake.tier * .46;
      flake.y += flake.speed * depth * ctx.k * .00125 * (1 + storm * .72);
      flake.x -= (flake.speed * .00048 + .00018 * flake.tier) * ctx.k * (1 + storm * 3.4);
      flake.x += Math.sin(ctx.t * .0011 + flake.phase) * .000035 * ctx.k;
      if (flake.y > 1.07) {
        flake.y = -.06 - noise(flake.phase + ctx.t) * .05;
        flake.x = Math.random() * 1.10;
      }
      if (flake.x < -.09) flake.x = 1.09;
      if (flake.x > 1.10) flake.x = -.08;
    }
  }

  function crossedMarker(previous, current, period, marker) {
    if (!Number.isFinite(previous) || current <= previous) return null;
    let target = Math.floor(previous / period) * period + marker;
    if (target <= previous) target += period;
    return current >= target ? Math.floor(target / period) : null;
  }

  /** Launch the skater from the shelf lip and land on the lower snowfield. */
  function landIce(ctx, player, state, gameState, playerX, landingBottom) {
    gameState.airB = landingBottom;
    gameState.airborne = false;
    gameState.gstate = 'ground';
    gameState.landN = 3;
    state.launchActive = false;
    player.classList.remove('terrain-flight');
    player.classList.add('terrain-landing');
    setTimeout(() => player.classList.remove('terrain-landing'), 430);
    if (V8.terrainLandingFX) V8.terrainLandingFX({
      x: playerX, y: ctx.groundY(playerX), ringCount: 4,
      rings: ['rgb(226,255,255)', 'rgb(118,232,255)', 'rgb(142,168,255)'],
      colors: [[231,255,255], [139,238,255], [130,180,255]],
      count: 30, spread: 5.6, lift: 5.2, gravity: .075, life: 920,
      ringScaleY: .28, ringStart: 7, ringStep: 7, ringSpeed: 12, shake: 3.6,
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

    if (state.launchActive && gameState.gstate !== 'iceCliff') {
      state.launchActive = false;
      player.classList.remove('terrain-flight');
      return;
    }

    if (state.launchActive) {
      const step = Math.min(40, Math.max(0, ctx.dt || 0)) / 1000;
      state.launchVelocity -= 432 * step;
      gameState.airB += state.launchVelocity * step;
      const landingBottom = ctx.h - ctx.groundY(playerX);
      if (state.launchVelocity < 0 && gameState.airB <= landingBottom) {
        landIce(ctx, player, state, gameState, playerX, landingBottom);
      }
      player.style.bottom = gameState.airB + 'px';
      return;
    }

    const blocked = state.reduceMotion || gameState.lock || gameState.rdy || gameState.airborne || gameState.jumping || gameState.flying ||
      player.classList.contains('v8-streak-airborne') || player.classList.contains('v8-streak-overdrive');
    const cycle = crossedMarker(previous, distance, TERRAIN_PERIOD, 1368);
    if (blocked || cycle === null || state.launchCycle === cycle) return;

    state.launchCycle = cycle;
    state.launchActive = true;
    state.launchVelocity = 188 + Math.min(40, Math.max(0, ctx.R.ts - 1) * 20);
    gameState.gstate = 'iceCliff';
    gameState.airborne = true;
    gameState.airB = parseFloat(player.style.bottom) || (ctx.h - ctx.groundY(ctx.w * .17 + 24));
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
    if (gameState && gameState.gstate === 'iceCliff') {
      gameState.gstate = 'ground'; gameState.airborne = false; gameState.jumping = false;
    }
  }

  function drawAuroraRibbon(ctx, index, intensity, step) {
    const x = ctx.x;
    const w = ctx.w;
    const h = ctx.h;
    const phase = ctx.t * (.00020 + index * .000025) + index * 1.37;
    const baseY = h * (.095 + index * .060);
    const amplitude = h * (.045 + index * .010);
    const thickness = h * (.13 + index * .025) * (1 + intensity * .10);
    const colors = [
      ['rgba(75,255,202,0)', 'rgba(93,255,207,A)', 'rgba(105,176,255,A)', 'rgba(75,255,202,0)'],
      ['rgba(102,164,255,0)', 'rgba(137,117,255,A)', 'rgba(76,244,227,A)', 'rgba(102,164,255,0)'],
      ['rgba(82,255,207,0)', 'rgba(92,219,255,A)', 'rgba(205,126,255,A)', 'rgba(82,255,207,0)'],
      ['rgba(173,115,255,0)', 'rgba(125,255,225,A)', 'rgba(107,181,255,A)', 'rgba(173,115,255,0)'],
    ][index % 4];
    const alpha = (.075 + index * .012) * (1 + intensity * 1.55);
    const gradient = x.createLinearGradient(-w * .10, 0, w * 1.10, 0);
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(.25, colors[1].replace('A', (alpha * .78).toFixed(3)));
    gradient.addColorStop(.56, colors[2].replace('A', alpha.toFixed(3)));
    gradient.addColorStop(1, colors[3]);
    x.fillStyle = gradient;
    x.beginPath();
    for (let px = -30; px <= w + 30; px += step) {
      const top = baseY + Math.sin(px / (126 + index * 18) + phase) * amplitude + Math.sin(px / 47 - phase * .63) * amplitude * .18;
      if (px === -30) x.moveTo(px, top); else x.lineTo(px, top);
    }
    for (let px = w + 30; px >= -30; px -= step) {
      const top = baseY + Math.sin(px / (126 + index * 18) + phase) * amplitude + Math.sin(px / 47 - phase * .63) * amplitude * .18;
      const curtain = thickness * (.60 + .40 * Math.pow(Math.sin(px / 102 + phase + index), 2));
      x.lineTo(px, top + curtain);
    }
    x.closePath();
    x.fill();
  }

  function drawAurora(ctx) {
    const x = ctx.x;
    const event = auroraStrength(ctx);
    const breathe = .18 + .07 * Math.sin(ctx.t * .00075);
    const intensity = breathe + event;
    const lowDetail = ctx.state.lowDetail;
    const ribbonCount = lowDetail ? 3 : 4;
    const foldCount = lowDetail ? 5 : 9;
    const ribbonStep = lowDetail ? 24 : 16;
    x.save();
    x.globalCompositeOperation = 'screen';
    for (let i = 0; i < ribbonCount; i++) drawAuroraRibbon(ctx, i, intensity, ribbonStep);

    // Delicate vertical folds make the ribbons read as translucent curtains.
    for (let i = 0; i < foldCount; i++) {
      const sx = ctx.w * (i + .3) / foldCount + Math.sin(ctx.t * .00032 + i) * 22;
      const fold = x.createLinearGradient(sx, ctx.h * .08, sx + 18, ctx.h * .54);
      fold.addColorStop(0, `rgba(143,255,226,${.018 + event * .035})`);
      fold.addColorStop(.62, `rgba(120,185,255,${.030 + event * .050})`);
      fold.addColorStop(1, 'rgba(126,255,222,0)');
      x.fillStyle = fold;
      x.beginPath();
      x.moveTo(sx - 7, ctx.h * .08);
      x.lineTo(sx + 10, ctx.h * .08);
      x.lineTo(sx + 36, ctx.h * .56);
      x.lineTo(sx - 30, ctx.h * .56);
      x.closePath();
      x.fill();
    }
    x.restore();
  }

  function eachWorldItem(ctx, layer, callback) {
    const offset = mod(ctx.R.scroll * layer.speed, layer.period);
    const repeats = Math.ceil(ctx.w / layer.period) + 3;
    for (let repeat = -1; repeat < repeats; repeat++) {
      for (const item of layer.items) {
        const sx = item.wx - offset + repeat * layer.period;
        if (sx > -320 && sx < ctx.w + 320) callback(item, sx);
      }
    }
  }

  function drawMountain(ctx, mountain, sx, layerIndex) {
    const x = ctx.x;
    const baseY = ctx.h * (layerIndex === 0 ? .72 : .78);
    const width = mountain.width * (ctx.h < 650 ? .82 : 1);
    const height = mountain.height * (ctx.h < 650 ? .78 : 1);
    const peakX = sx + mountain.skew * width;
    const peakY = baseY - height;
    const leftShoulderX = sx - width * .23;
    const rightShoulderX = sx + width * .27;
    const leftShoulderY = peakY + height * (.31 + mountain.notch * .10);
    const rightShoulderY = peakY + height * (.22 + (1 - mountain.notch) * .13);
    const body = x.createLinearGradient(sx - width * .5, peakY, sx + width * .5, baseY);
    if (layerIndex === 0) {
      body.addColorStop(0, 'rgba(76,127,153,.46)');
      body.addColorStop(.52, 'rgba(32,80,112,.58)');
      body.addColorStop(1, 'rgba(15,53,81,.65)');
    } else {
      body.addColorStop(0, 'rgba(72,128,151,.68)');
      body.addColorStop(.50, 'rgba(24,69,98,.78)');
      body.addColorStop(1, 'rgba(8,39,66,.86)');
    }
    x.fillStyle = body;
    x.beginPath();
    x.moveTo(sx - width * .62, baseY + 8);
    x.lineTo(leftShoulderX, leftShoulderY);
    x.lineTo(peakX - width * .055, peakY + height * .055);
    x.lineTo(peakX, peakY);
    x.lineTo(peakX + width * .075, peakY + height * .075);
    x.lineTo(rightShoulderX, rightShoulderY);
    x.lineTo(sx + width * .64, baseY + 8);
    x.closePath();
    x.fill();

    // Jagged snow cap follows both sides of the irregular summit.
    x.fillStyle = layerIndex === 0 ? 'rgba(221,247,255,.42)' : 'rgba(232,251,255,.66)';
    x.beginPath();
    x.moveTo(peakX - width * .23, peakY + height * .27);
    x.lineTo(peakX - width * .055, peakY + height * .055);
    x.lineTo(peakX, peakY);
    x.lineTo(peakX + width * .075, peakY + height * .075);
    x.lineTo(peakX + width * .24, peakY + height * .24);
    x.lineTo(peakX + width * .14, peakY + height * .21);
    x.lineTo(peakX + width * .085, peakY + height * .30);
    x.lineTo(peakX + width * .018, peakY + height * .19);
    x.lineTo(peakX - width * .06, peakY + height * .29);
    x.lineTo(peakX - width * .13, peakY + height * .19);
    x.closePath();
    x.fill();

    x.strokeStyle = layerIndex === 0 ? 'rgba(174,225,241,.15)' : 'rgba(173,229,246,.25)';
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(peakX + width * .02, peakY + height * .15);
    x.lineTo(sx + width * .34, baseY);
    x.moveTo(peakX - width * .08, peakY + height * .20);
    x.lineTo(sx - width * .38, baseY);
    x.stroke();
  }

  function drawPine(ctx, pine, sx, layerIndex) {
    const x = ctx.x;
    const scale = pine.scale * (ctx.h < 650 ? .82 : 1);
    const height = (layerIndex === 0 ? 48 : layerIndex === 1 ? 72 : 108) * scale;
    const baseY = layerIndex === 2 ? ctx.groundY(sx) + 10 : ctx.h * (layerIndex === 0 ? .79 : .83);
    const width = height * (.43 + pine.pale * .06);
    const alpha = layerIndex === 0 ? .48 : layerIndex === 1 ? .70 : .92;
    const sway = Math.sin(ctx.t * .00065 + pine.phase) * (layerIndex + 1) * .45;
    x.save();
    x.globalAlpha = alpha;
    x.fillStyle = layerIndex === 0 ? '#153e52' : layerIndex === 1 ? '#0c3448' : '#062636';
    x.fillRect(sx - 1.5, baseY - height * .56, 3, height * .59);
    const tierCount = ctx.state.lowDetail ? 4 : 6;
    for (let tier = 0; tier < tierCount; tier++) {
      const p = tier / (tierCount - 1);
      const cy = baseY - height * (.88 - p * .135);
      const half = width * (.22 + p * .78);
      x.fillStyle = layerIndex === 0 ? '#1b5263' : layerIndex === 1 ? '#0e4557' : '#083748';
      x.beginPath();
      x.moveTo(sx + sway * (1 - p), cy - height * .16);
      x.quadraticCurveTo(sx - half * .24, cy, sx - half, cy + height * .16);
      x.quadraticCurveTo(sx, cy + height * .095, sx + half, cy + height * .16);
      x.quadraticCurveTo(sx + half * .20, cy, sx + sway * (1 - p), cy - height * .16);
      x.fill();
      x.strokeStyle = `rgba(225,250,255,${.30 + pine.pale * .20})`;
      x.lineWidth = Math.max(.8, height * .012);
      x.beginPath();
      x.moveTo(sx - half * .78, cy + height * .125);
      x.quadraticCurveTo(sx, cy + height * .06, sx + half * .73, cy + height * .125);
      x.stroke();
    }
    x.restore();
  }

  function drawSnowTier(ctx, tier) {
    const x = ctx.x;
    const storm = blizzardStrength(ctx);
    const stormActive = ctx.t >= ctx.state.blizzardStarted && ctx.t < ctx.state.blizzardUntil;
    const buckets = ctx.state.snowTiers[tier];
    x.save();
    x.lineCap = 'round';
    for (let bucketIndex = 0; bucketIndex < buckets.length; bucketIndex++) {
      const bucket = buckets[bucketIndex];
      const nominalSize = .925 + bucketIndex * .75;
      const alpha = (.17 + tier * .12 + nominalSize * .07) * (1 + storm * .42);
      x.strokeStyle = `rgba(239,252,255,${Math.min(.92, alpha)})`;
      x.lineWidth = Math.max(.55, nominalSize * (.24 + tier * .10));
      x.beginPath();
      let visible = 0;
      for (const flake of bucket) {
        // Every tier contains 60 low-detail flakes: 30 normal, 60 in storms.
        if (!stormActive && !flake.normal) continue;
        const sx = flake.x * ctx.w + Math.sin(ctx.t * .0008 + flake.phase) * (2 + tier * 2);
        const sy = flake.y * ctx.h;
        const length = flake.size * (.65 + tier * .72) * (1 + storm * (2.3 + tier * .55));
        x.moveTo(sx, sy);
        x.lineTo(sx - length * (1.1 + storm * 1.9), sy + length * (1.05 + storm * .54));
        visible++;
      }
      if (visible) x.stroke();
    }
    x.restore();
  }

  function drawBackdrop(ctx) {
    drawAurora(ctx);
    const polarHaze = ctx.x.createLinearGradient(0, ctx.h * .32, 0, ctx.h * .78);
    polarHaze.addColorStop(0, 'rgba(179,247,255,0)');
    polarHaze.addColorStop(.72, 'rgba(160,231,244,.09)');
    polarHaze.addColorStop(1, 'rgba(208,251,255,.16)');
    ctx.x.fillStyle = polarHaze;
    ctx.x.fillRect(0, ctx.h * .30, ctx.w, ctx.h * .50);
    drawSnowTier(ctx, 0);
  }

  function drawMidground(ctx) {
    for (const layer of ctx.state.mountains) {
      eachWorldItem(ctx, layer, (mountain, sx) => drawMountain(ctx, mountain, sx, layer.index));
    }
    eachWorldItem(ctx, ctx.state.pines[0], (pine, sx) => drawPine(ctx, pine, sx, 0));
    eachWorldItem(ctx, ctx.state.pines[1], (pine, sx) => drawPine(ctx, pine, sx, 1));
    drawSnowTier(ctx, 1);
    eachWorldItem(ctx, ctx.state.pines[2], (pine, sx) => drawPine(ctx, pine, sx, 2));
  }

  function sampleTerrain(ctx) {
    const profile = ctx.state.terrainProfile;
    profile.length = 0;
    for (let px = -20; px <= ctx.w + 24; px += 6) profile.push(ctx.groundY(px));
    return profile;
  }

  function traceTerrain(ctx, profile) {
    const x = ctx.x;
    x.beginPath();
    x.moveTo(-20, ctx.h + 20);
    for (let i = 0; i < profile.length; i++) x.lineTo(-20 + i * 6, profile[i]);
    x.lineTo(ctx.w + 24, ctx.h + 20);
    x.closePath();
  }

  function drawCliffFaces(ctx) {
    const x = ctx.x;
    const visibleWorldStart = ctx.R.scroll - 160;
    const visibleWorldEnd = ctx.R.scroll + ctx.w + 200;
    const firstCycle = Math.floor((visibleWorldStart - terrainOrigin - 1450) / TERRAIN_PERIOD) - 1;
    const lastCycle = Math.ceil((visibleWorldEnd - terrainOrigin - 1370) / TERRAIN_PERIOD) + 1;
    for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
      const cliffWorld = terrainOrigin + cycle * TERRAIN_PERIOD + 1370;
      const sx = cliffWorld - ctx.R.scroll;
      if (sx < -130 || sx > ctx.w + 100) continue;
      const lipY = ctx.groundY(sx - 3);
      const footX = sx + 82;
      const footY = ctx.groundY(footX);
      const face = x.createLinearGradient(sx, lipY, footX + 30, footY);
      face.addColorStop(0, 'rgba(224,253,255,.92)');
      face.addColorStop(.18, 'rgba(111,213,238,.83)');
      face.addColorStop(.58, 'rgba(39,132,180,.86)');
      face.addColorStop(1, 'rgba(12,67,116,.91)');
      x.fillStyle = face;
      x.beginPath();
      x.moveTo(sx - 4, lipY);
      x.bezierCurveTo(sx + 13, lipY + 9, sx + 38, footY - 14, footX, footY);
      x.lineTo(footX + 15, footY + 34);
      x.lineTo(sx - 7, lipY + 34);
      x.closePath();
      x.fill();

      x.strokeStyle = 'rgba(205,249,255,.47)';
      x.lineWidth = 1.2;
      for (let i = 0; i < 5; i++) {
        const crackX = sx + 10 + i * 13;
        x.beginPath();
        x.moveTo(crackX, lipY + 12 + i * 3);
        x.lineTo(crackX + (i % 2 ? -5 : 6), lipY + 30 + i * 7);
        x.lineTo(crackX + (i % 2 ? 3 : -2), Math.min(footY + 13, lipY + 49 + i * 9));
        x.stroke();
      }
      x.fillStyle = 'rgba(225,254,255,.92)';
      x.beginPath();
      x.moveTo(sx - 12, lipY - 1);
      x.quadraticCurveTo(sx + 26, lipY - 7, sx + 51, lipY + 10);
      x.quadraticCurveTo(sx + 24, lipY + 5, sx - 4, lipY + 5);
      x.closePath();
      x.fill();
    }
  }

  function drawTerrain(ctx) {
    const x = ctx.x;
    const profile = sampleTerrain(ctx);
    x.save();
    traceTerrain(ctx, profile);
    const snow = x.createLinearGradient(0, ctx.h * .68, 0, ctx.h);
    snow.addColorStop(0, '#e8fbff');
    snow.addColorStop(.075, '#bceaf4');
    snow.addColorStop(.24, '#5bb5d4');
    snow.addColorStop(.56, '#175b92');
    snow.addColorStop(1, '#07244f');
    x.fillStyle = snow;
    x.fill();

    // Broad buried bands show that this is a mass of translucent glacial ice.
    x.save();
    traceTerrain(ctx, profile);
    x.clip();
    const bandCount = ctx.state.lowDetail ? 3 : 5;
    const bandStep = ctx.state.lowDetail ? 24 : 18;
    for (let i = 0; i < bandCount; i++) {
      x.strokeStyle = `rgba(196,244,255,${.075 - i * .008})`;
      x.lineWidth = 1.2 + i * .35;
      x.beginPath();
      for (let px = -30; px <= ctx.w + 30; px += bandStep) {
        const py = ctx.groundY(px) + 34 + i * 31 + Math.sin((px + ctx.R.scroll * .18) / (73 + i * 14)) * 7;
        if (px === -30) x.moveTo(px, py); else x.lineTo(px, py);
      }
      x.stroke();
    }
    x.restore();

    drawCliffFaces(ctx);

    // Powder cap and a restrained blue glint replace the generic neon edge.
    x.strokeStyle = 'rgba(248,255,255,.94)';
    x.lineWidth = 7;
    x.lineJoin = 'round';
    x.beginPath();
    for (let i = 0; i < profile.length; i++) {
      const px = -20 + i * 6;
      const py = profile[i] - 1;
      if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.stroke();
    x.strokeStyle = 'rgba(121,229,255,.76)';
    x.shadowColor = 'rgba(108,229,255,.72)';
    x.shadowBlur = 9;
    x.lineWidth = 1.5;
    x.beginPath();
    for (let i = 0; i < profile.length; i++) {
      const px = -20 + i * 6;
      const py = profile[i] + 1;
      if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.stroke();
    x.shadowBlur = 0;

    // Fine wind-carved grooves are anchored to world coordinates.
    const grooveStart = Math.floor((ctx.R.scroll - 80) / 92) * 92;
    for (let wx = grooveStart; wx < ctx.R.scroll + ctx.w + 100; wx += 92) {
      const sx = wx - ctx.R.scroll;
      const py = ctx.groundY(sx) + 13 + noise(wx * .03) * 14;
      const length = 25 + noise(wx * .09) * 46;
      x.strokeStyle = `rgba(215,251,255,${.15 + noise(wx) * .16})`;
      x.lineWidth = .8;
      x.beginPath();
      x.moveTo(sx - length * .55, py + 2);
      x.quadraticCurveTo(sx, py - 2, sx + length * .45, py);
      x.stroke();
    }
    x.restore();
    return true;
  }

  function drawSkateTrail(ctx) {
    const x = ctx.x;
    const px = ctx.w * .17 + 16;
    const trailLength = Math.min(190, ctx.w * .26);
    x.save();
    const gradient = x.createLinearGradient(px - trailLength, 0, px, 0);
    gradient.addColorStop(0, 'rgba(190,246,255,0)');
    gradient.addColorStop(.36, 'rgba(204,251,255,.20)');
    gradient.addColorStop(1, 'rgba(248,255,255,.76)');
    x.strokeStyle = gradient;
    x.lineWidth = 1.1;
    for (let lane = -1; lane <= 1; lane += 2) {
      x.beginPath();
      for (let dx = -trailLength; dx <= 2; dx += 8) {
        const sx = px + dx;
        const py = ctx.groundY(sx) + 3 + lane * 2 + Math.sin((dx + ctx.t * .05) / 19) * .7;
        if (dx === -trailLength) x.moveTo(sx, py); else x.lineTo(sx, py);
      }
      x.stroke();
    }

    // Repeating crystal spray appears to peel away from the board's tail.
    x.globalCompositeOperation = 'lighter';
    x.shadowColor = '#a7f3ff';
    x.shadowBlur = ctx.state.lowDetail ? 0 : 5;
    for (let i = 0; i < 14; i++) {
      const age = mod(ctx.t * (.085 + (i % 3) * .009) + i * 31, 230);
      const p = age / 230;
      const sx = px - 12 - p * (46 + noise(i + 70) * 74);
      const baseY = ctx.groundY(sx);
      const sy = baseY - Math.sin(Math.PI * p) * (8 + noise(i + 90) * 22) + noise(i + 110) * 5;
      const alpha = (1 - p) * (.38 + noise(i + 130) * .42);
      const size = 1.1 + noise(i + 150) * 2.3;
      x.fillStyle = `rgba(209,252,255,${alpha})`;
      x.beginPath();
      x.moveTo(sx, sy - size);
      x.lineTo(sx + size * .65, sy);
      x.lineTo(sx, sy + size);
      x.lineTo(sx - size * .65, sy);
      x.closePath();
      x.fill();
    }
    x.shadowBlur = 0;
    x.restore();
  }

  function drawGround(ctx) {
    drawSkateTrail(ctx);
  }

  function drawForeground(ctx) {
    drawSnowTier(ctx, 2);
    const storm = blizzardStrength(ctx);
    if (storm > .04) {
      const veil = ctx.x.createLinearGradient(0, 0, ctx.w, ctx.h);
      veil.addColorStop(0, `rgba(225,250,255,${storm * .055})`);
      veil.addColorStop(.52, `rgba(227,250,255,${storm * .13})`);
      veil.addColorStop(1, 'rgba(220,248,255,0)');
      ctx.x.fillStyle = veil;
      ctx.x.fillRect(0, 0, ctx.w, ctx.h);
    }
  }

  V8.worlds.register('ice', {
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
