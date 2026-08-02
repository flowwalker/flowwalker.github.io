/** Deep Sea Maze bonus world — a surfable wave surface and aligned wake cone. */
(function(V8) {
  'use strict';

  const TAU = Math.PI * 2;
  const SURFACE_RATIO = .755;
  const WAVE_PERIOD = 2600;
  const WAVE_LIP = 1160;
  const MAX_FLIGHT_MS = 2100;
  let waveOrigin = 0;

  function noise(n) {
    const value = Math.sin(n * 31.414 + 4.9) * 19087.41;
    return value - Math.floor(value);
  }

  function wrap(value, span) {
    return ((value % span) + span) % span;
  }

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  function smoothstep(value) {
    const p = clamp01(value);
    return p * p * (3 - 2 * p);
  }

  function terrain(ctx) {
    // The terrain itself is the sea surface, so the player, board, foam and
    // wake all share the renderer's single ground coordinate system.
    const wx = ctx.wx;
    const distance = wx - waveOrigin;
    const u = wrap(distance, WAVE_PERIOD);
    const baseLift = ctx.R.h * (.86 - SURFACE_RATIO);
    let swell;
    if (u < 920) swell = -8 + 58 * smoothstep(u / 920);
    else if (u < WAVE_LIP) swell = 50 + Math.sin((u - 920) / (WAVE_LIP - 920) * Math.PI) * 4;
    else if (u < 1370) swell = 50 + (-32 - 50) * smoothstep((u - WAVE_LIP) / 210);
    else swell = -32 + 24 * smoothstep((u - 1370) / (WAVE_PERIOD - 1370));
    const phase = u / WAVE_PERIOD * TAU;
    // Weather can brighten and aerate the wake, but it must not move the
    // collision surface under an airborne rider.
    const waveHeight = swell + 14 * Math.sin(phase * 3 + .55) + 6 * Math.sin(phase * 7 - .8);
    const viewWidth = Math.max(1, ctx.R.w);
    const screenX = wx - ctx.R.scroll - (viewWidth * .17 + 24);
    const screenDrop = Math.max(24, Math.min(44, viewWidth * .042));
    const downhill = -screenX / viewWidth * screenDrop;
    return baseLift + waveHeight + downhill;
  }

  function init(ctx) {
    waveOrigin = ctx.R.scroll;
    const fish = [];
    const bubbles = [];
    for (let i = 0; i < 48; i++) {
      fish.push({
        x: noise(i + 2),
        depthY: .038 + noise(i + 80) * .155,
        size: .48 + noise(i + 160) * 1.32,
        phase: noise(i + 240) * TAU,
        depth: i % 3,
        dir: noise(i + 310) > .24 ? -1 : 1,
        speed: 10 + noise(i + 390) * 20,
      });
    }
    for (let i = 0; i < 38; i++) {
      bubbles.push({
        x: noise(i + 470),
        depthY: .025 + noise(i + 540) * .19,
        size: .7 + noise(i + 610) * 2.2,
        phase: noise(i + 680) * TAU,
        speed: .35 + noise(i + 750) * .9,
      });
    }
    const gulls = [];
    for (let i = 0; i < 6; i++) {
      gulls.push({
        x: noise(i + 830),
        y: .13 + noise(i + 900) * .22,
        scale: .52 + noise(i + 970) * .62,
        speed: .8 + noise(i + 1040) * 1.1,
        dir: noise(i + 1110) > .22 ? 1 : -1,
        phase: noise(i + 1180) * TAU,
        drift: 2.5 + noise(i + 1250) * 3.5,
      });
    }
    let reduceMotion = false;
    try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) {}
    return {
      fish, bubbles, gulls, surgeStarted: -1, shoalStarted: -1,
      origin: waveOrigin,
      launchActive: false,
      launchVelocity: 0,
      launchStarted: -Infinity,
      launchCycle: null,
      lastDistance: null,
      landingUntil: 0,
      cachedAnchorT: -1,
      cachedAnchor: null,
      reduceMotion,
    };
  }

  function envelope(t, started, duration) {
    if (started < 0) return 0;
    const age = t - started;
    if (age < 0 || age > duration) return 0;
    if (age < 260) return age / 260;
    if (age > duration - 520) return (duration - age) / 520;
    return 1;
  }

  function spawnEvent(ctx) {
    if (ctx.random < .58) ctx.state.surgeStarted = ctx.t;
    else ctx.state.shoalStarted = ctx.t;
    return true;
  }

  function crossedMarker(previous, current, period, marker) {
    if (!Number.isFinite(previous) || current <= previous) return null;
    let target = Math.floor(previous / period) * period + marker;
    if (target <= previous) target += period;
    return current >= target ? Math.floor(target / period) : null;
  }

  function stopFlightVisuals(state, player) {
    if (state) {
      state.launchActive = false;
      state.launchVelocity = 0;
      state.launchStarted = -Infinity;
      state.cachedAnchorT = -1;
      state.cachedAnchor = null;
    }
    if (player) player.classList.remove('terrain-flight');
  }

  function clearSeaMotion(state, gameState, player) {
    stopFlightVisuals(state, player);
    if (state) state.landingUntil = 0;
    if (player) player.classList.remove('terrain-landing');
    if (!gameState || gameState.gstate !== 'seaWave') return;
    if (gameState.dead) {
      gameState.gstate = 'dead';
      gameState.airborne = true;
      return;
    }
    gameState.gstate = 'ground';
    gameState.airborne = false;
    gameState.jumping = false;
    gameState.landN = Math.max(2, gameState.landN || 0);
  }

  function expireLandingClass(state, player, t) {
    if (!state || !state.landingUntil || t < state.landingUntil) return;
    state.landingUntil = 0;
    if (player) player.classList.remove('terrain-landing');
  }

  function cleanInactiveRun(ctx) {
    const gameState = V8._gameState;
    const player = document.getElementById('char');
    expireLandingClass(ctx.state, player, ctx.t);
    if (!ctx.state || !ctx.state.launchActive) return;
    if (!gameState || !gameState.started || gameState.over || gameState.dead) {
      clearSeaMotion(ctx.state, gameState, player);
    }
  }

  function emitLandingFX(ctx, playerX) {
    const options = {
      x: playerX, y: ctx.groundY(playerX), ringCount: 5,
      rings: ['rgb(229,255,251)', 'rgb(107,245,238)', 'rgb(56,183,224)'],
      colors: [[233,255,252], [107,245,238], [66,198,232]],
      count: 36, spread: 6.8, lift: 6.1, gravity: .15, life: 800,
      ringScaleY: .18, ringStart: 7, ringStep: 8, ringSpeed: 14, shake: 3.8,
    };
    if (V8.terrainLandingFX) {
      V8.terrainLandingFX(options);
      return;
    }

    // Keep the sea plugin complete when the shared particle helper is absent.
    for (let i = 0; i < options.ringCount; i++) {
      const color = options.rings[i % options.rings.length];
      ctx.R.rings.push({
        r: options.ringStart + i * options.ringStep,
        a: Math.max(.42, .98 - i * .13),
        col: color.replace(')', ',A)').replace('rgb', 'rgba'),
        x: options.x, y: options.y,
        dr: options.ringSpeed + i * 2,
        sy: options.ringScaleY,
      });
    }
    for (let i = 0; i < options.count; i++) {
      const angle = (Math.random() - .5) * Math.PI * .92;
      const speed = options.spread * (.48 + Math.random() * .72);
      const actualLife = options.life * (.72 + Math.random() * .42);
      ctx.R.parts.push({
        x: options.x + (Math.random() - .5) * 8,
        y: options.y - Math.random() * 4,
        vx: Math.sin(angle) * speed,
        vy: -(options.lift * (.52 + Math.random() * .82)),
        g: options.gravity,
        sz: .9 + Math.random() * 2.35,
        col: options.colors[i % options.colors.length],
        life: actualLife,
        max: actualLife,
        kind: 'terrain',
      });
    }
    ctx.R.shake = Math.max(ctx.R.shake || 0, options.shake);
  }

  function landOnWave(ctx, player, state, gameState, playerX, landingBottom) {
    gameState.airB = landingBottom;
    gameState.airborne = false;
    gameState.gstate = 'ground';
    gameState.landN = 3;
    stopFlightVisuals(state, player);
    state.landingUntil = ctx.t + 480;
    player.classList.add('terrain-landing');
    emitLandingFX(ctx, playerX);
    ctx.R.flashA = Math.max(ctx.R.flashA || 0, .10);
    const landSfx = V8.sfx && (V8.sfx.terrainLand || V8.sfx.thud);
    if (landSfx) landSfx();
  }

  function updatePlayer(ctx) {
    const gameState = ctx.gameState;
    const player = ctx.playerEl;
    const state = ctx.state;
    if (!gameState || !player || !state) return;
    expireLandingClass(state, player, ctx.t);

    const playerX = ctx.w * .17 + 24;
    const distance = ctx.R.scroll + playerX - state.origin;
    const previous = state.lastDistance;
    state.lastDistance = distance;

    if (gameState.over || gameState.dead || !gameState.started) {
      clearSeaMotion(state, gameState, player);
      return;
    }
    if (state.launchActive && gameState.gstate !== 'seaWave') {
      // A manual/skill animation has taken ownership; only clear sea visuals.
      stopFlightVisuals(state, player);
      return;
    }
    if (state.launchActive) {
      const step = Math.min(40, Math.max(0, ctx.dt || 0)) / 1000;
      state.launchVelocity -= 510 * step;
      gameState.airB += state.launchVelocity * step;
      const landingBottom = ctx.h - ctx.groundY(playerX);
      const flightExpired = ctx.t - state.launchStarted >= MAX_FLIGHT_MS;
      if ((state.launchVelocity < 0 && gameState.airB <= landingBottom) || flightExpired) {
        landOnWave(ctx, player, state, gameState, playerX, landingBottom);
      }
      player.style.bottom = gameState.airB + 'px';
      state.cachedAnchorT = -1;
      return;
    }

    const blocked = state.reduceMotion || gameState.lock || gameState.rdy || gameState.gstate !== 'ground' ||
      gameState.airborne || gameState.jumping || gameState.flying ||
      player.classList.contains('v8-streak-airborne') || player.classList.contains('v8-streak-overdrive');
    const cycle = crossedMarker(previous, distance, WAVE_PERIOD, WAVE_LIP - 12);
    if (blocked || cycle === null || state.launchCycle === cycle) return;

    state.launchCycle = cycle;
    state.launchActive = true;
    state.launchVelocity = 210 + Math.min(42, Math.max(0, ctx.R.ts - 1) * 22);
    state.launchStarted = ctx.t;
    gameState.gstate = 'seaWave';
    gameState.airborne = true;
    gameState.airB = parseFloat(player.style.bottom) || (ctx.h - ctx.groundY(playerX));
    state.landingUntil = 0;
    player.classList.remove('terrain-landing');
    player.classList.add('terrain-flight');
    state.cachedAnchorT = -1;
    const launchSfx = V8.sfx && (V8.sfx.terrainJump || V8.sfx.jump);
    if (launchSfx) launchSfx();
  }

  function teardown(ctx) {
    const state = ctx.state;
    const gameState = ctx.gameState;
    const player = ctx.playerEl;
    clearSeaMotion(state, gameState, player);
  }

  function traceSurface(ctx, yOffset) {
    ctx.x.beginPath();
    for (let px = -24; px <= ctx.w + 24; px += 8) {
      const py = ctx.groundY(px) + (yOffset || 0);
      if (px === -24) ctx.x.moveTo(px, py); else ctx.x.lineTo(px, py);
    }
  }

  function drawSky(ctx) {
    const x = ctx.x;
    const moonX = ctx.w * .82;
    const moonY = ctx.h * .20;
    const moonR = Math.max(23, Math.min(43, ctx.h * .045));
    const glow = x.createRadialGradient(moonX, moonY, 0, moonX, moonY, moonR * 4.2);
    glow.addColorStop(0, 'rgba(225,254,251,.34)');
    glow.addColorStop(.30, 'rgba(129,224,230,.12)');
    glow.addColorStop(1, 'rgba(82,185,207,0)');
    x.fillStyle = glow;
    x.fillRect(moonX - moonR * 4.3, moonY - moonR * 4.3, moonR * 8.6, moonR * 8.6);
    x.fillStyle = 'rgba(217,245,239,.73)';
    x.beginPath();
    x.arc(moonX, moonY, moonR, 0, TAU);
    x.fill();

    const horizonY = ctx.groundY(ctx.w * .5);
    // Fade the atmospheric glow on both sides so its canvas bounds never
    // become a second straight waterline when the wave drops below it.
    const horizon = x.createLinearGradient(0, horizonY - ctx.h * .28, 0, horizonY + ctx.h * .34);
    horizon.addColorStop(0, 'rgba(74,166,181,0)');
    horizon.addColorStop(.46, 'rgba(84,178,185,.055)');
    horizon.addColorStop(.66, 'rgba(136,222,214,.10)');
    horizon.addColorStop(.84, 'rgba(84,178,185,.045)');
    horizon.addColorStop(1, 'rgba(136,222,214,0)');
    x.fillStyle = horizon;
    x.fillRect(0, horizonY - ctx.h * .29, ctx.w, ctx.h * .63);

    // Thin, low clouds keep the upper half atmospheric without becoming a
    // second hard divider above the actual water line.
    for (let layer = 0; layer < 2; layer++) {
      const baseY = ctx.h * (.34 + layer * .075);
      x.fillStyle = `rgba(12,43,65,${.13 + layer * .055})`;
      x.beginPath();
      x.moveTo(-30, baseY + 24);
      for (let px = -30; px <= ctx.w + 50; px += 80) {
        const py = baseY + Math.sin(px / (155 + layer * 40) + ctx.t * .00004 + layer) * 13;
        x.quadraticCurveTo(px + 40, py - 13, px + 80, py);
      }
      x.lineTo(ctx.w + 50, baseY + 60);
      x.lineTo(-30, baseY + 60);
      x.closePath();
      x.fill();
    }

    drawGulls(ctx);
  }

  function drawGull(ctx, px, py, scale, flap, alpha) {
    const x = ctx.x;
    const wing = 3.1 + flap * 2.1;
    x.save();
    x.translate(px, py);
    x.scale(scale, scale);
    x.strokeStyle = `rgba(235,253,255,${alpha})`;
    x.lineWidth = 1.65;
    x.lineCap = 'round';
    x.lineJoin = 'round';
    x.shadowColor = 'rgba(125,218,235,.4)';
    x.shadowBlur = 5;
    x.beginPath();
    x.moveTo(-11, 1);
    x.quadraticCurveTo(-6, -wing, -1.1, .4);
    x.quadraticCurveTo(0, 1.9, 1.4, .4);
    x.quadraticCurveTo(6, -wing, 11, 1);
    x.stroke();
    x.shadowBlur = 0;
    x.beginPath();
    x.moveTo(-2.1, .8);
    x.quadraticCurveTo(.2, 2.5, 3.3, 1);
    x.stroke();
    x.fillStyle = `rgba(235,253,255,${Math.min(1, alpha + .12)})`;
    x.beginPath();
    x.arc(3.6, .8, .75, 0, TAU);
    x.fill();
    x.restore();
  }

  function drawGulls(ctx) {
    const gulls = ctx.state && ctx.state.gulls;
    if (!gulls || !gulls.length) return;
    const now = Number(ctx.t) || 0;
    const motion = ctx.state.reduceMotion ? 0 : now;
    const span = ctx.w + 320;
    for (const gull of gulls) {
      const travel = motion * gull.speed * .075 * gull.dir;
      const px = wrap(gull.x * span + travel - 160 - ctx.R.scroll * .012, span) - 160;
      if (px < -90 || px > ctx.w + 90) continue;
      const py = ctx.h * gull.y + Math.sin(motion * .0015 + gull.phase) * gull.drift;
      const flap = ctx.state.reduceMotion ? .5 : Math.sin(motion * .0042 + gull.phase);
      const alpha = .38 + gull.scale * .22;
      drawGull(ctx, px, py, gull.scale, flap, alpha);
    }
  }

  function drawBackdrop(ctx) {
    const x = ctx.x;
    drawSky(ctx);

    // Fill from the exact surfable wave path downward. There is no detached
    // horizontal boundary: this same path also positions the board and wake.
    traceSurface(ctx, 0);
    x.lineTo(ctx.w + 24, ctx.h + 24);
    x.lineTo(-24, ctx.h + 24);
    x.closePath();
    const water = x.createLinearGradient(0, ctx.h * .67, 0, ctx.h);
    water.addColorStop(0, 'rgba(30,139,158,.78)');
    water.addColorStop(.16, 'rgba(8,89,124,.91)');
    water.addColorStop(.58, 'rgba(3,47,88,.97)');
    water.addColorStop(1, 'rgba(1,20,48,.99)');
    x.fillStyle = water;
    x.fill();

    // Moonlit shafts refract from local points on the moving wave surface.
    x.save();
    x.globalCompositeOperation = 'screen';
    for (let i = 0; i < 7; i++) {
      const topX = wrap(i * 229 - ctx.R.scroll * .035, ctx.w + 250) - 125;
      const topY = ctx.groundY(topX) + 5;
      const ray = x.createLinearGradient(topX, topY, topX + 90, ctx.h * .94);
      ray.addColorStop(0, 'rgba(143,245,235,.14)');
      ray.addColorStop(1, 'rgba(71,177,206,0)');
      x.fillStyle = ray;
      x.beginPath();
      x.moveTo(topX, topY);
      x.lineTo(topX + 38, ctx.groundY(topX + 38) + 5);
      x.lineTo(topX + 150, ctx.h * .94);
      x.lineTo(topX + 78, ctx.h * .94);
      x.closePath();
      x.fill();
    }
    x.restore();

    for (const bubble of ctx.state.bubbles) {
      const px = wrap(bubble.x * (ctx.w + 100) - ctx.R.scroll * .018 + Math.sin(ctx.t * .0005 + bubble.phase) * 9, ctx.w + 100) - 50;
      const rise = wrap(bubble.depthY - ctx.t * bubble.speed * .000025, .20);
      const py = Math.min(ctx.h * .89, ctx.groundY(px) + ctx.h * (.025 + rise));
      x.strokeStyle = `rgba(184,249,245,${.09 + bubble.size * .025})`;
      x.lineWidth = .7;
      x.beginPath();
      x.arc(px, py, bubble.size, 0, TAU);
      x.stroke();
    }
  }

  function drawFish(x, px, py, size, direction, alpha, phase, near) {
    const tail = Math.sin(phase) * size * .36;
    x.save();
    x.translate(px, py);
    x.scale(direction, 1);
    x.rotate(Math.sin(phase * .37) * .045);
    x.globalAlpha = alpha;

    const body = x.createLinearGradient(-size, -size, size, size);
    body.addColorStop(0, near ? '#9bfff1' : '#5ac6d0');
    body.addColorStop(.52, near ? '#45c3cf' : '#307f9a');
    body.addColorStop(1, '#174e6b');
    x.fillStyle = body;
    x.beginPath();
    x.moveTo(size * 1.45, 0);
    x.bezierCurveTo(size * .65, -size * .72, -size * .82, -size * .67, -size * 1.25, 0);
    x.bezierCurveTo(-size * .72, size * .66, size * .66, size * .70, size * 1.45, 0);
    x.fill();

    x.fillStyle = near ? 'rgba(81,215,222,.90)' : 'rgba(54,143,165,.82)';
    x.beginPath();
    x.moveTo(-size * 1.05, 0);
    x.lineTo(-size * 2.03, -size * .82 + tail);
    x.lineTo(-size * 1.76, 0);
    x.lineTo(-size * 2.03, size * .82 + tail);
    x.closePath();
    x.fill();

    x.fillStyle = 'rgba(220,255,248,.86)';
    x.beginPath();
    x.arc(size * .82, -size * .14, Math.max(.55, size * .095), 0, TAU);
    x.fill();
    x.restore();
  }

  function drawMidground(ctx) {
    const shoal = envelope(ctx.t, ctx.state.shoalStarted, 3200);
    const bedY = ctx.h * .90;
    for (const fish of ctx.state.fish) {
      const depthScale = [.62, .88, 1.2][fish.depth];
      const speedBoost = 1 + shoal * .85;
      const span = ctx.w + 180;
      const travel = ctx.t * fish.speed * .001 * speedBoost * fish.dir;
      const px = wrap(fish.x * span + travel - ctx.R.scroll * (.018 + fish.depth * .016), span) - 90;
      const formation = shoal * Math.sin(fish.phase * .7) * 12;
      const py = Math.min(
        bedY - 8,
        ctx.groundY(px) + fish.depthY * ctx.h + Math.sin(ctx.t * .0018 + fish.phase) * (3 + fish.depth * 2) + formation
      );
      const size = fish.size * 5.4 * depthScale;
      drawFish(ctx.x, px, py, size, fish.dir, .19 + fish.depth * .14 + shoal * .10, ctx.t * .014 + fish.phase, fish.depth === 2);
    }
  }

  function drawTerrain(ctx) {
    const x = ctx.x;

    // A translucent rolling face below the crest gives each wave thickness.
    traceSurface(ctx, 0);
    for (let px = ctx.w + 24; px >= -24; px -= 8) x.lineTo(px, ctx.groundY(px) + 28);
    x.closePath();
    const face = x.createLinearGradient(0, ctx.h * .70, 0, ctx.h * .80);
    face.addColorStop(0, 'rgba(179,248,238,.20)');
    face.addColorStop(.38, 'rgba(55,174,188,.13)');
    face.addColorStop(1, 'rgba(23,112,143,0)');
    x.fillStyle = face;
    x.fill();

    // Shadow, luminous crest and broken foam all follow groundY exactly.
    traceSurface(ctx, 5);
    x.strokeStyle = 'rgba(2,35,61,.62)';
    x.lineWidth = 9;
    x.lineJoin = 'round';
    x.stroke();

    traceSurface(ctx, 0);
    const crest = x.createLinearGradient(0, 0, ctx.w, 0);
    crest.addColorStop(0, 'rgba(185,255,245,.78)');
    crest.addColorStop(.38, 'rgba(107,236,229,.92)');
    crest.addColorStop(.70, 'rgba(224,255,247,.86)');
    crest.addColorStop(1, 'rgba(99,225,229,.72)');
    x.strokeStyle = crest;
    x.shadowColor = 'rgba(104,239,232,.62)';
    x.shadowBlur = 10;
    x.lineWidth = 2.3;
    x.stroke();
    x.shadowBlur = 0;

    traceSurface(ctx, -1.8);
    x.setLineDash([27, 13, 7, 20]);
    x.lineDashOffset = -(ctx.R.scroll * .21 % 67);
    x.strokeStyle = 'rgba(239,255,249,.70)';
    x.lineWidth = 1.35;
    x.stroke();
    x.setLineDash([]);

    // Repeating curled caps make the former divider unmistakably wave-like.
    const firstWorld = Math.floor((ctx.R.scroll - 120) / 238) * 238;
    for (let wx = firstWorld; wx < ctx.R.scroll + ctx.w + 160; wx += 238) {
      const sx = wx - ctx.R.scroll;
      const sy = ctx.groundY(sx);
      const scale = .72 + noise(wx * .013) * .48;
      x.strokeStyle = `rgba(236,255,250,${.34 + scale * .25})`;
      x.lineWidth = 1.25 + scale * .45;
      x.beginPath();
      x.moveTo(sx - 29 * scale, ctx.groundY(sx - 29 * scale));
      x.quadraticCurveTo(sx - 5 * scale, sy - 12 * scale, sx + 14 * scale, sy - 3 * scale);
      x.quadraticCurveTo(sx + 23 * scale, sy + 1, sx + 37 * scale, ctx.groundY(sx + 37 * scale));
      x.stroke();
      for (let dot = 0; dot < 3; dot++) {
        x.fillStyle = `rgba(238,255,251,${.28 + dot * .10})`;
        x.beginPath();
        x.arc(sx + 11 * scale + dot * 7, sy - 4 - dot * 2, 1 + dot * .35, 0, TAU);
        x.fill();
      }
    }
    return true;
  }

  function drawRock(x, px, py, w, h, tone) {
    x.fillStyle = tone;
    x.beginPath();
    x.moveTo(px - w * .55, py);
    x.quadraticCurveTo(px - w * .48, py - h * .7, px - w * .12, py - h);
    x.quadraticCurveTo(px + w * .3, py - h * .85, px + w * .55, py);
    x.closePath();
    x.fill();
  }

  function drawGround(ctx) {
    const x = ctx.x;
    const bedY = ctx.h * .895;
    // Tint the lower water column from the actual wave path. A fixed-height
    // rectangle leaves a visible horizontal seam whenever the surface rises.
    const bed = x.createLinearGradient(0, bedY - 35, 0, ctx.h);
    bed.addColorStop(0, 'rgba(11,58,73,0)');
    bed.addColorStop(.38, 'rgba(7,43,61,.18)');
    bed.addColorStop(.72, 'rgba(7,43,61,.48)');
    bed.addColorStop(1, 'rgba(1,17,38,.92)');
    x.fillStyle = bed;
    traceSurface(ctx, 8);
    x.lineTo(ctx.w + 24, ctx.h + 24);
    x.lineTo(-24, ctx.h + 24);
    x.closePath();
    x.fill();

    for (let i = 0; i < 18; i++) {
      const px = wrap(i * 127 - ctx.R.scroll * .38, ctx.w + 180) - 90;
      const py = bedY + 13 + (i % 3) * 5;
      const scale = .65 + noise(i + 810) * .9;
      if (i % 3 === 0) {
        drawRock(x, px, py, 25 * scale, 13 * scale, i % 2 ? '#123f51' : '#0d3448');
      } else {
        x.strokeStyle = i % 2 ? 'rgba(38,151,131,.72)' : 'rgba(34,129,119,.60)';
        x.lineWidth = 2.2 * scale;
        for (let blade = 0; blade < 3; blade++) {
          const sway = Math.sin(ctx.t * .0018 + i + blade) * 5;
          x.beginPath();
          x.moveTo(px + blade * 4 - 4, py);
          x.quadraticCurveTo(px + sway, py - 13 * scale, px + sway * .55 + blade * 3, py - 28 * scale);
          x.stroke();
        }
      }
    }

    x.globalCompositeOperation = 'screen';
    for (let i = 0; i < 9; i++) {
      const px = wrap(i * 181 - ctx.R.scroll * .22, ctx.w + 220) - 110;
      x.strokeStyle = 'rgba(84,205,204,.08)';
      x.lineWidth = 1;
      x.beginPath();
      x.ellipse(px, bedY + 22 + (i % 3) * 8, 35 + (i % 4) * 8, 4 + (i % 2) * 2, -.08, 0, TAU);
      x.stroke();
    }
  }

  function surfAnchor(ctx) {
    if (ctx.state && ctx.state.cachedAnchorT === ctx.t && ctx.state.cachedAnchor) {
      return ctx.state.cachedAnchor;
    }
    const player = document.getElementById('char');
    const board = player && player.querySelector('.board');
    if (board) {
      const rect = board.getBoundingClientRect();
      if (rect.width && rect.height) {
        // Read the animated board itself instead of estimating from the
        // character box. This keeps the wake attached through bob and tilt.
        const tailX = rect.left + 2;
        const surfaceY = ctx.groundY(tailX);
        const boardTailY = rect.top + rect.height * .52;
        const separation = Math.abs(boardTailY - surfaceY);
        const strength = Math.max(0, Math.min(1, 1 - Math.max(0, separation - 7) / 22));
        const anchor = {
          x: tailX,
          y: separation < 18 ? Math.min(boardTailY, surfaceY + 4) : boardTailY,
          strength,
        };
        if (ctx.state) {
          ctx.state.cachedAnchorT = ctx.t;
          ctx.state.cachedAnchor = anchor;
        }
        return anchor;
      }
    }
    const x = ctx.w * .17 - 21;
    const anchor = { x, y: ctx.groundY(x) + 2, strength: 1 };
    if (ctx.state) {
      ctx.state.cachedAnchorT = ctx.t;
      ctx.state.cachedAnchor = anchor;
    }
    return anchor;
  }

  function wakeSurfaceY(ctx, px, depth) {
    return ctx.groundY(px) + depth;
  }

  function drawAirMist(ctx, anchor) {
    const x = ctx.x;
    const age = Math.max(0, ctx.t - ctx.state.launchStarted);
    const strength = smoothstep(Math.min(1, age / 120));
    const velocity = Math.max(-80, Math.min(260, ctx.state.launchVelocity));
    const lift = Math.max(-7, Math.min(9, velocity * .035));
    x.save();
    x.globalCompositeOperation = 'screen';

    // Two soft streams preserve a clear connection to the board tail without
    // drawing a rigid line through open air.
    for (let rail = 0; rail < 2; rail++) {
      x.strokeStyle = `rgba(${rail ? '118,235,238' : '231,255,252'},${(.20 - rail * .055) * strength})`;
      x.lineWidth = 3.2 - rail * 1.3;
      x.lineCap = 'round';
      x.setLineDash(rail ? [9, 8] : [4, 7]);
      x.lineDashOffset = -(ctx.t * (.032 + rail * .008) % 40);
      x.beginPath();
      x.moveTo(anchor.x - 2, anchor.y + rail * 2);
      x.bezierCurveTo(
        anchor.x - 30, anchor.y - lift + 4 + rail * 2,
        anchor.x - 69, anchor.y + 11 + rail * 5,
        anchor.x - 112, anchor.y + 19 + rail * 7
      );
      x.stroke();
    }
    x.setLineDash([]);

    for (let i = 0; i < 22; i++) {
      const cycle = 220 + (i % 4) * 18;
      const particleAge = wrap(age * (1.12 + (i % 3) * .08) + i * 31, cycle);
      const p = particleAge / cycle;
      const px = anchor.x - 5 - p * (48 + i * 2.8);
      const py = anchor.y + p * (12 + i % 4 * 2) - Math.sin(Math.PI * p) * (8 + i % 6 * 2.2) - lift * p;
      const alpha = (1 - p) * (.62 - (i % 4) * .055) * strength;
      x.fillStyle = `rgba(225,255,251,${alpha})`;
      x.beginPath();
      x.arc(px, py, 1.1 + (i % 4) * .48, 0, TAU);
      x.fill();
    }
    x.restore();
  }

  function drawForeground(ctx) {
    cleanInactiveRun(ctx);
    const x = ctx.x;
    const anchor = surfAnchor(ctx);
    const surge = envelope(ctx.t, ctx.state.surgeStarted, 2500);
    const speed = Math.max(.75, ctx.R.ts);
    const desiredReach = Math.min(142, 101 + speed * 25 + surge * 18);
    const reach = Math.max(34, Math.min(desiredReach, anchor.x - 4));
    const open = Math.min(18 + surge * 5, reach * .28);
    const wakeAlpha = anchor.strength * (.72 + surge * .28);

    if (ctx.state.launchActive) {
      drawAirMist(ctx, anchor);
      return;
    }

    if (wakeAlpha <= .02) return;

    // A shallow wedge follows the rolling water surface. Keeping nearly all
    // of it below the crest avoids the old wire-like ray floating in the air.
    const wake = x.createLinearGradient(anchor.x, anchor.y, anchor.x - reach, anchor.y);
    wake.addColorStop(0, `rgba(224,255,250,${(.25 + surge * .13) * wakeAlpha})`);
    wake.addColorStop(.42, `rgba(86,226,228,${(.13 + surge * .08) * wakeAlpha})`);
    wake.addColorStop(1, 'rgba(25,139,182,0)');
    x.fillStyle = wake;
    x.beginPath();
    x.moveTo(anchor.x, anchor.y);
    for (let d = 8; d <= reach; d += 8) {
      const p = d / reach;
      x.lineTo(anchor.x - d, wakeSurfaceY(ctx, anchor.x - d, -Math.min(3, p * 3.5)));
    }
    for (let d = reach; d >= 8; d -= 8) {
      const p = d / reach;
      x.lineTo(anchor.x - d, wakeSurfaceY(ctx, anchor.x - d, 3 + p * open));
    }
    x.lineTo(anchor.x, anchor.y);
    x.closePath();
    x.fill();

    // Two broken foam rails describe the expanding cone without drawing a
    // perfectly straight line from the board to the edge of the screen.
    x.save();
    x.globalCompositeOperation = 'screen';
    x.setLineDash([12, 8, 5, 9]);
    x.lineDashOffset = -(ctx.t * .028 % 34);
    for (const side of [-1, 1]) {
      x.strokeStyle = `rgba(218,255,250,${(.32 + surge * .16) * wakeAlpha})`;
      x.lineWidth = side < 0 ? 1.25 : 1.05;
      x.beginPath();
      x.moveTo(anchor.x, anchor.y);
      for (let d = 7; d <= reach; d += 7) {
        const p = d / reach;
        const depth = side < 0 ? -Math.min(3.2, p * 3.8) : 2.5 + p * open;
        x.lineTo(anchor.x - d, wakeSurfaceY(ctx, anchor.x - d, depth));
      }
      x.stroke();
    }
    x.setLineDash([]);

    // Short travelling crests read as water rings rather than guide lines.
    for (let i = 0; i < 4; i++) {
      const phase = wrap(ctx.t * (.065 + i * .004) + i * 31, reach - 20) / (reach - 20);
      const distance = 14 + phase * (reach - 20);
      const px = anchor.x - distance;
      const half = 5 + phase * 10;
      const baseY = wakeSurfaceY(ctx, px, 3 + phase * open * .42);
      const alpha = (.42 + surge * .18) * (1 - phase) * wakeAlpha;
      x.strokeStyle = `rgba(225,255,251,${alpha})`;
      x.lineWidth = 1 + (1 - phase) * .65;
      x.beginPath();
      x.moveTo(px + half, wakeSurfaceY(ctx, px + half, 1.5 + phase * 2));
      x.quadraticCurveTo(px, baseY + 3 + phase * 3, px - half, wakeSurfaceY(ctx, px - half, 3 + phase * open * .62));
      x.stroke();
    }
    x.restore();

    // Spray also leaves from the same tail coordinate and arcs upward.
    for (let i = 0; i < 13; i++) {
      const age = wrap(ctx.t * (.082 + (i % 3) * .006) + i * 31, 190);
      const p = age / 190;
      const px = anchor.x - 3 - p * (34 + noise(i + 70) * 55);
      const py = anchor.y - Math.sin(Math.PI * p) * (7 + noise(i + 90) * 18) + p * 4;
      const alpha = (1 - p) * (.38 + surge * .26) * wakeAlpha;
      x.fillStyle = `rgba(225,255,251,${alpha})`;
      x.beginPath();
      x.arc(px, py, 1 + noise(i + 120) * 1.7, 0, TAU);
      x.fill();
    }
  }

  function drawSceneFX(ctx) {
    const anchor = surfAnchor(ctx);
    const surge = envelope(ctx.t, ctx.state.surgeStarted, 2500);
    if (anchor.strength <= .02) return;
    for (let i = 0; i < 8; i++) {
      const age = wrap(ctx.t * (.055 + i * .003) + i * 43, 240);
      const p = age / 240;
      const px = anchor.x - p * (26 + i * 5);
      const py = anchor.y - Math.sin(Math.PI * p) * (9 + i * 1.7);
      ctx.x.strokeStyle = `rgba(232,255,252,${(1 - p) * (.17 + surge * .12) * anchor.strength})`;
      ctx.x.lineWidth = .8;
      ctx.x.beginPath();
      ctx.x.arc(px, py, 1.2 + (i % 3) * .65, 0, TAU);
      ctx.x.stroke();
    }
  }

  V8.worlds.register('sea', {
    terrain, init, spawnEvent, drawBackdrop, drawMidground,
    drawTerrain, drawGround, drawForeground, drawSceneFX,
    updatePlayer, teardown,
  });
})(window.V8 = window.V8 || {});
