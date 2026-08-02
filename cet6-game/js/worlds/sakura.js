/** Sakura Courtyard bonus world — layered garden, full blossom crowns and petal weather. */
(function(V8) {
  'use strict';

  const TAU = Math.PI * 2;
  const PETALS_PER_LAYER = 76;

  function noise(n) {
    const value = Math.sin(n * 19.37 + 3.71) * 28934.42;
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

  // A calm stone courtyard should read as nearly level, not as another hill world.
  function terrain(ctx) {
    const wx = ctx.wx;
    return 2.6 * Math.sin(wx / 520) + 1.2 * Math.sin(wx / 173 + .8) + .6;
  }

  function makePetal(index, depth) {
    const seed = index + depth * 401;
    return {
      x: noise(seed + 11),
      y: noise(seed + 79) * 1.10 - .05,
      size: 1.18 + noise(seed + 151) * 2.72,
      fall: .68 + noise(seed + 223) * 1.18,
      phase: noise(seed + 307) * TAU,
      rotation: noise(seed + 379) * TAU,
      spin: (.010 + noise(seed + 443) * .029) * (noise(seed + 509) > .5 ? 1 : -1),
      drift: .72 + noise(seed + 571) * .72,
      flutter: .72 + noise(seed + 631) * 1.05,
      color: Math.floor(noise(seed + 701) * 5),
      depth,
    };
  }

  function makeTree(index, count, depth) {
    const seed = 1200 + depth * 307 + index * 29;
    return {
      u: (index + .16 + noise(seed) * .68) / count,
      scale: .83 + noise(seed + 17) * .34,
      lean: (noise(seed + 31) - .5) * .13,
      phase: noise(seed + 47) * TAU,
      crown: seed + noise(seed + 61) * 100,
      depth,
    };
  }

  function init() {
    const petals = [];
    const trees = [];
    const birds = [];

    for (let depth = 0; depth < 3; depth++) {
      for (let i = 0; i < PETALS_PER_LAYER; i++) petals.push(makePetal(i, depth));
    }

    [8, 6, 4].forEach(function(count, depth) {
      for (let i = 0; i < count; i++) trees.push(makeTree(i, count, depth));
    });

    for (let i = 0; i < 13; i++) {
      birds.push({
        row: Math.floor(i / 2),
        side: i % 2 ? 1 : -1,
        phase: i * .73,
        scale: .70 + noise(i + 811) * .38,
      });
    }

    return {
      petals,
      trees,
      birds,
      stormStarted: -Infinity,
      birdsStarted: -Infinity,
      gustSign: 1,
    };
  }

  function eventEnvelope(t, started, duration) {
    if (!Number.isFinite(started)) return 0;
    const age = t - started;
    if (age < 0 || age >= duration) return 0;
    const p = age / duration;
    const edge = smoothstep(Math.min(p / .12, (1 - p) / .18));
    return Math.pow(edge, .72);
  }

  function stormStrength(ctx) {
    return eventEnvelope(ctx.t, ctx.state.stormStarted, 4200);
  }

  function update(ctx) {
    const storm = stormStrength(ctx);
    const direction = ctx.state.gustSign || 1;

    for (const petal of ctx.state.petals) {
      const depthSpeed = [.58, .94, 1.38][petal.depth];
      petal.y += petal.fall * depthSpeed * ctx.k * (.00082 + storm * .00054);
      petal.x += direction * petal.drift * depthSpeed * ctx.k * (.00024 + storm * .00158);
      petal.rotation += petal.spin * ctx.k * (1 + storm * 2.2);

      if (petal.y > 1.08) {
        petal.y = -.08 - Math.random() * .10;
        petal.x = Math.random() * 1.12 - .06;
      }
      if (petal.x > 1.12) petal.x = -.11;
      if (petal.x < -.12) petal.x = 1.11;
    }
  }

  function spawnEvent(ctx) {
    if (ctx.random < .70) {
      ctx.state.gustSign *= -1;
      ctx.state.stormStarted = ctx.t;
    } else {
      ctx.state.birdsStarted = ctx.t;
    }
    return true;
  }

  function drawMoon(ctx) {
    const x = ctx.x;
    const mx = ctx.w * .79;
    const my = ctx.h * .18;
    const radius = Math.min(ctx.w, ctx.h) * (ctx.w < 620 ? .058 : .055);
    const glow = x.createRadialGradient(mx, my, radius * .12, mx, my, radius * 4.5);
    glow.addColorStop(0, 'rgba(255,250,236,.45)');
    glow.addColorStop(.22, 'rgba(255,226,220,.19)');
    glow.addColorStop(1, 'rgba(255,188,211,0)');
    x.fillStyle = glow;
    x.fillRect(mx - radius * 5, my - radius * 5, radius * 10, radius * 10);

    x.fillStyle = 'rgba(255,247,232,.88)';
    x.beginPath();
    x.arc(mx, my, radius, 0, TAU);
    x.fill();
    x.fillStyle = 'rgba(204,158,181,.15)';
    x.beginPath();
    x.arc(mx - radius * .29, my + radius * .15, radius * .23, 0, TAU);
    x.arc(mx + radius * .30, my - radius * .25, radius * .13, 0, TAU);
    x.arc(mx + radius * .12, my + radius * .34, radius * .09, 0, TAU);
    x.fill();
  }

  function drawPagoda(x, px, base, scale, alpha) {
    x.save();
    x.translate(px, base);
    x.globalAlpha = alpha;
    x.fillStyle = '#38273f';
    x.fillRect(-6 * scale, -112 * scale, 12 * scale, 114 * scale);

    for (let floor = 0; floor < 4; floor++) {
      const y = -22 * scale - floor * 25 * scale;
      const half = (37 - floor * 6) * scale;
      x.fillRect(-half * .54, y - 13 * scale, half * 1.08, 14 * scale);
      x.beginPath();
      x.moveTo(-half, y);
      x.quadraticCurveTo(-half * .54, y - 10 * scale, 0, y - 8 * scale);
      x.quadraticCurveTo(half * .54, y - 10 * scale, half, y);
      x.lineTo(half * .80, y + 5 * scale);
      x.lineTo(-half * .80, y + 5 * scale);
      x.closePath();
      x.fill();
    }

    x.fillRect(-1.2 * scale, -126 * scale, 2.4 * scale, 14 * scale);
    x.restore();
  }

  function drawTorii(x, px, base, scale, alpha) {
    x.save();
    x.translate(px, base);
    x.globalAlpha = alpha;
    x.fillStyle = '#9d4d58';
    x.fillRect(-31 * scale, -73 * scale, 7 * scale, 76 * scale);
    x.fillRect(24 * scale, -73 * scale, 7 * scale, 76 * scale);
    x.fillRect(-43 * scale, -75 * scale, 86 * scale, 7 * scale);
    x.fillRect(-36 * scale, -62 * scale, 72 * scale, 5 * scale);
    x.fillStyle = '#432b40';
    x.beginPath();
    x.moveTo(-48 * scale, -81 * scale);
    x.quadraticCurveTo(0, -75 * scale, 48 * scale, -81 * scale);
    x.lineTo(45 * scale, -74 * scale);
    x.quadraticCurveTo(0, -70 * scale, -45 * scale, -74 * scale);
    x.closePath();
    x.fill();
    x.restore();
  }

  function drawMistRibbon(ctx, yRatio, speed, alpha, width) {
    const x = ctx.x;
    const y = ctx.h * yRatio;
    const shift = wrap(ctx.R.scroll * speed, 420);
    const haze = x.createLinearGradient(0, y - width, 0, y + width);
    haze.addColorStop(0, 'rgba(255,228,233,0)');
    haze.addColorStop(.46, `rgba(255,224,232,${alpha})`);
    haze.addColorStop(1, 'rgba(255,226,233,0)');
    x.fillStyle = haze;
    x.beginPath();
    x.moveTo(-40, y + width);
    for (let px = -60; px <= ctx.w + 80; px += 70) {
      const wave = Math.sin((px + shift) / 145) * width * .22 + Math.sin((px + shift) / 57) * width * .07;
      x.lineTo(px, y + wave);
    }
    x.lineTo(ctx.w + 40, y + width);
    x.closePath();
    x.fill();
  }

  function drawCourtWall(ctx) {
    const x = ctx.x;
    const wallY = ctx.h * .695;
    const wallBottom = ctx.h * .815;
    const wall = x.createLinearGradient(0, wallY, 0, wallBottom);
    wall.addColorStop(0, 'rgba(213,173,185,.64)');
    wall.addColorStop(.58, 'rgba(153,112,139,.72)');
    wall.addColorStop(1, 'rgba(89,66,92,.86)');
    x.fillStyle = wall;
    x.fillRect(0, wallY, ctx.w, wallBottom - wallY);

    // Plaster panels and pillars keep the long wall architectural, not mountain-like.
    const panelOffset = wrap(ctx.R.scroll * .075, 132);
    for (let px = -panelOffset - 132; px < ctx.w + 132; px += 132) {
      x.fillStyle = 'rgba(67,45,69,.37)';
      x.fillRect(px, wallY - 2, 7, wallBottom - wallY + 5);
      x.strokeStyle = 'rgba(255,226,229,.09)';
      x.lineWidth = 1;
      x.strokeRect(px + 12, wallY + 14, 105, wallBottom - wallY - 27);
    }

    // A tiled eave replaces the old hard horizontal divider.
    x.fillStyle = 'rgba(49,33,54,.86)';
    x.fillRect(0, wallY - 10, ctx.w, 11);
    x.fillStyle = 'rgba(104,67,88,.82)';
    x.fillRect(0, wallY - 14, ctx.w, 5);
    x.strokeStyle = 'rgba(246,194,207,.25)';
    x.lineWidth = 1.2;
    for (let px = -24 - wrap(ctx.R.scroll * .075, 32); px < ctx.w + 30; px += 32) {
      x.beginPath();
      x.arc(px, wallY - 10, 18, Math.PI, 0);
      x.stroke();
    }
  }

  function responsiveScale(ctx) {
    return Math.max(.70, Math.min(1.08, ctx.w / 1050 + .34));
  }

  function treeScreenX(ctx, tree) {
    const scale = responsiveScale(ctx);
    const margin = [125, 205, 295][tree.depth] * scale;
    const span = ctx.w + margin * 2;
    const parallax = [.10, .31, .69][tree.depth];
    return wrap(tree.u * span - ctx.R.scroll * parallax, span) - margin;
  }

  function drawBlossom(x, px, py, size, rotation, alpha, pale) {
    x.save();
    x.translate(px, py);
    x.rotate(rotation);
    x.fillStyle = pale
      ? `rgba(255,230,236,${alpha})`
      : `rgba(247,174,204,${alpha})`;
    for (let i = 0; i < 5; i++) {
      x.rotate(TAU / 5);
      x.beginPath();
      x.ellipse(0, -size * .58, size * .42, size * .68, 0, 0, TAU);
      x.fill();
    }
    x.fillStyle = `rgba(255,226,143,${Math.min(1, alpha * 1.12)})`;
    x.beginPath();
    x.arc(0, 0, Math.max(.55, size * .18), 0, TAU);
    x.fill();
    x.restore();
  }

  function drawCanopyMass(x, cx, cy, rx, ry, seed, depth, alpha) {
    const shadows = ['103,71,98', '129,72,103', '143,66,104'];
    const mids = ['151,104,130', '192,107,143', '219,123,159'];
    const lights = ['199,151,172', '234,158,187', '250,174,201'];

    // Three joined shadow lobes form an irregular silhouette without the
    // transparent, balloon-like circles of the former crown treatment.
    x.fillStyle = `rgba(${shadows[depth]},${alpha * .94})`;
    x.beginPath();
    x.ellipse(cx, cy + ry * .06, rx * .79, ry * .89, 0, 0, TAU);
    x.ellipse(cx - rx * .42, cy + ry * .12, rx * .53, ry * .65, -.12, 0, TAU);
    x.ellipse(cx + rx * .42, cy + ry * .09, rx * .54, ry * .68, .10, 0, TAU);
    x.fill();

    // Smaller opaque blossom lobes give the crown a floral, granular edge.
    for (let i = 0; i < 13; i++) {
      const angle = noise(seed + i * 11) * TAU;
      const distance = .18 + noise(seed + i * 17 + 5) * .69;
      const px = cx + Math.cos(angle) * rx * distance;
      const py = cy + Math.sin(angle) * ry * distance * .72;
      const blobW = rx * (.18 + noise(seed + i * 23 + 9) * .21);
      const blobH = ry * (.24 + noise(seed + i * 31 + 13) * .24);
      const highlight = i > 7 || Math.sin(angle) < -.28;
      x.fillStyle = `rgba(${highlight ? lights[depth] : mids[depth]},${alpha * (highlight ? .91 : .96)})`;
      x.beginPath();
      x.ellipse(px, py, blobW, blobH, angle * .16, 0, TAU);
      x.fill();
    }

    // Dense speckles suggest hundreds of small flowers without expensive detail.
    x.fillStyle = `rgba(255,225,234,${alpha * .58})`;
    x.beginPath();
    const speckles = depth === 0 ? 7 : 13;
    for (let i = 0; i < speckles; i++) {
      const angle = noise(seed + i * 37 + 91) * TAU;
      const distance = Math.sqrt(noise(seed + i * 41 + 103)) * .82;
      const px = cx + Math.cos(angle) * rx * distance;
      const py = cy + Math.sin(angle) * ry * distance;
      const radius = .7 + noise(seed + i * 43 + 119) * (depth === 2 ? 1.6 : 1.0);
      x.moveTo(px + radius, py);
      x.arc(px, py, radius, 0, TAU);
    }
    x.fill();

    if (depth === 0) return;
    const flowerCount = depth === 2 ? 5 : 3;
    for (let i = 0; i < flowerCount; i++) {
      const angle = noise(seed + i * 53 + 173) * TAU;
      const distance = .16 + noise(seed + i * 59 + 181) * .64;
      const px = cx + Math.cos(angle) * rx * distance;
      const py = cy + Math.sin(angle) * ry * distance;
      const size = (depth === 2 ? 2.3 : 1.65) + noise(seed + i * 61 + 193) * 1.2;
      drawBlossom(x, px, py, size, angle, alpha * .78, i % 2 === 0);
    }
  }

  function drawTree(ctx, tree) {
    const x = ctx.x;
    const depth = tree.depth;
    const mobileScale = responsiveScale(ctx);
    const depthScale = [.66, .84, 1.02][depth];
    const scale = tree.scale * depthScale * mobileScale;
    const px = treeScreenX(ctx, tree);
    const baseY = depth === 2 ? ctx.groundY(px) + 7 : ctx.h * (depth === 0 ? .785 : .825);
    const height = ctx.h * [.235, .295, .370][depth] * scale;
    const width = [134, 190, 252][depth] * scale;
    const sway = Math.sin(ctx.t * (.00072 + depth * .00010) + tree.phase) * (1.2 + depth * 1.8);
    const topX = px + tree.lean * height + sway;
    const alpha = [.39, .73, .97][depth];
    const trunkWidth = Math.max(5, height * [.038, .050, .060][depth]);

    x.save();
    x.globalAlpha = alpha;

    const trunk = x.createLinearGradient(px - trunkWidth, 0, px + trunkWidth, 0);
    trunk.addColorStop(0, depth === 0 ? '#614056' : '#4a273e');
    trunk.addColorStop(.45, depth === 2 ? '#77435a' : '#684057');
    trunk.addColorStop(1, '#2e1a31');
    x.fillStyle = trunk;
    x.beginPath();
    x.moveTo(px - trunkWidth * .62, baseY + 9);
    x.bezierCurveTo(px - trunkWidth * .54, baseY - height * .34, topX - trunkWidth * .35, baseY - height * .71, topX - trunkWidth * .14, baseY - height * .92);
    x.bezierCurveTo(topX + trunkWidth * .32, baseY - height * .70, px + trunkWidth * .68, baseY - height * .32, px + trunkWidth * .74, baseY + 9);
    x.closePath();
    x.fill();

    // Major branches taper by level; paired twigs keep the silhouette organic.
    x.strokeStyle = depth === 2 ? 'rgba(63,31,50,.96)' : 'rgba(69,42,61,.90)';
    x.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const level = .43 + i * .067;
      const direction = i % 2 ? 1 : -1;
      const reach = width * (.23 + (i % 3) * .055);
      const anchorX = px + tree.lean * height * level;
      const anchorY = baseY - height * level;
      const endX = anchorX + direction * reach + sway * level;
      const endY = baseY - height * (.64 + i * .043);
      x.lineWidth = Math.max(1.2, trunkWidth * (.54 - i * .047));
      x.beginPath();
      x.moveTo(anchorX, anchorY);
      x.quadraticCurveTo(anchorX + direction * reach * .40, anchorY - height * .06, endX, endY);
      x.stroke();

      if (depth > 0 && i > 1) {
        x.lineWidth *= .48;
        x.beginPath();
        x.moveTo(endX - direction * reach * .24, endY + height * .025);
        x.quadraticCurveTo(endX - direction * reach * .04, endY - height * .035, endX + direction * reach * .13, endY - height * .08);
        x.stroke();
      }
    }

    const masses = [
      [-.32, .70, .34, .175],
      [.31, .69, .36, .185],
      [-.08, .86, .39, .195],
      [-.46, .59, .29, .155],
      [.47, .57, .30, .160],
      [.08, .62, .37, .185],
    ];
    const massCount = depth === 0 ? 5 : masses.length;
    for (let i = 0; i < massCount; i++) {
      const mass = masses[i];
      drawCanopyMass(
        x,
        topX + width * mass[0],
        baseY - height * mass[1],
        width * mass[2],
        height * mass[3],
        tree.crown + i * 71,
        depth,
        .90
      );
    }

    x.restore();
  }

  function drawTreesAtDepth(ctx, depth) {
    for (const tree of ctx.state.trees) {
      if (tree.depth === depth) drawTree(ctx, tree);
    }
  }

  function readabilityAlpha(ctx, px, py) {
    const inWordBand = py > ctx.h * .045 && py < ctx.h * .335;
    const central = ctx.w < 620
      ? px > ctx.w * .05 && px < ctx.w * .95
      : px > ctx.w * .28 && px < ctx.w * .72;
    return inWordBand && central ? .34 : 1;
  }

  function drawPetal(x, px, py, size, rotation, flip, color, alpha, vein) {
    const colors = ['255,222,231', '255,194,215', '244,158,197', '255,235,237', '237,178,209'];
    x.save();
    x.translate(px, py);
    x.rotate(rotation);
    x.scale(1, flip);
    x.fillStyle = `rgba(${colors[color]},${alpha})`;
    x.beginPath();
    x.moveTo(0, size);
    x.bezierCurveTo(-size * .92, size * .28, -size * .80, -size * .72, 0, -size);
    x.bezierCurveTo(size * .80, -size * .72, size * .90, size * .24, 0, size);
    x.fill();
    if (vein && size > 3.2) {
      x.strokeStyle = `rgba(170,90,137,${alpha * .42})`;
      x.lineWidth = .55;
      x.beginPath();
      x.moveTo(0, size * .68);
      x.lineTo(0, -size * .58);
      x.stroke();
    }
    x.restore();
  }

  function drawPetalLayer(ctx, depth, extraAlpha) {
    const storm = stormStrength(ctx);
    const direction = ctx.state.gustSign || 1;
    const scale = [.68, 1.02, 1.52][depth];
    const baseAlpha = [.24, .40, .58][depth];

    for (const petal of ctx.state.petals) {
      if (petal.depth !== depth) continue;
      const flutter = Math.sin(ctx.t * .0048 * petal.flutter + petal.phase);
      const px = petal.x * ctx.w
        + Math.sin(ctx.t * .00125 + petal.phase) * (8 + depth * 5)
        + direction * storm * Math.sin(petal.phase * 2.1) * 18;
      const py = petal.y * ctx.h + Math.sin(ctx.t * .0020 + petal.phase) * (3 + depth * 1.8);
      const flip = .16 + .84 * Math.abs(flutter);
      const alpha = (baseAlpha + storm * .13) * readabilityAlpha(ctx, px, py) * (extraAlpha || 1);
      drawPetal(
        ctx.x,
        px,
        py,
        petal.size * scale,
        petal.rotation + flutter * .34,
        flip,
        petal.color,
        alpha,
        depth === 2
      );
    }
  }

  function drawBackdrop(ctx) {
    const x = ctx.x;
    drawMoon(ctx);

    const distanceGlow = x.createLinearGradient(0, ctx.h * .30, 0, ctx.h * .82);
    distanceGlow.addColorStop(0, 'rgba(255,214,226,0)');
    distanceGlow.addColorStop(.54, 'rgba(255,205,217,.10)');
    distanceGlow.addColorStop(1, 'rgba(248,222,225,.29)');
    x.fillStyle = distanceGlow;
    x.fillRect(0, ctx.h * .28, ctx.w, ctx.h * .56);

    // One restrained pagoda and torii establish a courtyard without a skyline of peaks.
    const pagodaX = wrap(ctx.w * .73 - ctx.R.scroll * .015, ctx.w + 620) - 90;
    const toriiX = wrap(ctx.w * .24 - ctx.R.scroll * .030, ctx.w + 540) - 80;
    drawPagoda(x, pagodaX, ctx.h * .704, ctx.w < 620 ? .60 : .82, .30);
    drawTorii(x, toriiX, ctx.h * .704, ctx.w < 620 ? .78 : 1.02, .43);

    drawTreesAtDepth(ctx, 0);
    drawCourtWall(ctx);
    drawMistRibbon(ctx, .64, .018, .15, ctx.h * .085);
    drawMistRibbon(ctx, .76, .042, .12, ctx.h * .064);
    drawPetalLayer(ctx, 0, 1);
  }

  function drawLantern(ctx, px, py, scale, alpha) {
    const x = ctx.x;
    x.save();
    x.globalAlpha = alpha;
    x.fillStyle = '#3d3041';
    x.fillRect(px - 3 * scale, py - 37 * scale, 6 * scale, 38 * scale);
    x.fillRect(px - 11 * scale, py - 40 * scale, 22 * scale, 5 * scale);
    x.beginPath();
    x.moveTo(px - 14 * scale, py - 41 * scale);
    x.lineTo(px, py - 51 * scale);
    x.lineTo(px + 14 * scale, py - 41 * scale);
    x.closePath();
    x.fill();
    const glow = x.createRadialGradient(px, py - 31 * scale, 0, px, py - 31 * scale, 24 * scale);
    glow.addColorStop(0, 'rgba(255,218,151,.50)');
    glow.addColorStop(1, 'rgba(255,184,129,0)');
    x.fillStyle = glow;
    x.fillRect(px - 25 * scale, py - 56 * scale, 50 * scale, 50 * scale);
    x.fillStyle = 'rgba(255,218,157,.62)';
    x.fillRect(px - 5 * scale, py - 36 * scale, 10 * scale, 9 * scale);
    x.restore();
  }

  function drawMidground(ctx) {
    drawTreesAtDepth(ctx, 1);
    drawTreesAtDepth(ctx, 2);

    // Sparse lanterns act as garden accents rather than another row of spikes.
    const period = ctx.w < 620 ? 420 : 520;
    const offset = wrap(ctx.R.scroll * .44, period);
    for (let i = -1; i < Math.ceil(ctx.w / period) + 2; i++) {
      const px = i * period - offset + period * .62;
      drawLantern(ctx, px, ctx.groundY(px) + 4, ctx.w < 620 ? .78 : 1, .80);
    }

    drawPetalLayer(ctx, 1, 1);
  }

  function drawTerrain(ctx) {
    const x = ctx.x;
    x.beginPath();
    x.moveTo(-20, ctx.h + 20);
    for (let px = -20; px <= ctx.w + 24; px += 8) x.lineTo(px, ctx.groundY(px));
    x.lineTo(ctx.w + 20, ctx.h + 20);
    x.closePath();
    const garden = x.createLinearGradient(0, ctx.h * .84, 0, ctx.h);
    garden.addColorStop(0, 'rgba(72,60,72,.99)');
    garden.addColorStop(.18, 'rgba(53,44,57,.99)');
    garden.addColorStop(.56, 'rgba(31,27,39,1)');
    garden.addColorStop(1, 'rgba(16,14,24,1)');
    x.fillStyle = garden;
    x.fill();

    // Moss, dust and petals soften the playable edge without a neon divider.
    x.strokeStyle = 'rgba(183,172,143,.48)';
    x.lineWidth = 2.0;
    x.beginPath();
    for (let px = -20; px <= ctx.w + 24; px += 8) {
      const py = ctx.groundY(px);
      if (px === -20) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.stroke();
    x.strokeStyle = 'rgba(255,187,211,.18)';
    x.lineWidth = 5;
    x.beginPath();
    for (let px = -20; px <= ctx.w + 24; px += 12) {
      const py = ctx.groundY(px) + 3;
      if (px === -20) x.moveTo(px, py); else x.lineTo(px, py);
    }
    x.stroke();

    // Offset stone pavers retain perspective and move at the gameplay speed.
    const offset = ctx.R.scroll * 1.04;
    for (let row = 0; row < 4; row++) {
      const tileW = ctx.w < 620 ? 68 : 90;
      for (let i = -2; i < Math.ceil(ctx.w / tileW) + 3; i++) {
        const px = i * tileW - wrap(offset, tileW) + (row % 2) * tileW * .39;
        const py = ctx.groundY(px) + 13 + row * 25;
        const shade = 50 + ((i + row * 3) & 1) * 8;
        x.fillStyle = `rgba(${shade + 11},${shade},${shade + 10},.64)`;
        x.strokeStyle = 'rgba(242,208,215,.095)';
        x.lineWidth = 1;
        x.beginPath();
        x.moveTo(px - tileW * .42, py - 5);
        x.lineTo(px + tileW * .39, py - 3);
        x.lineTo(px + tileW * .34, py + 14);
        x.lineTo(px - tileW * .46, py + 12);
        x.closePath();
        x.fill();
        x.stroke();
      }
    }
    return true;
  }

  function drawGround(ctx) {
    // Fallen petals collect at the path edge and in paver seams.
    for (let i = 0; i < 72; i++) {
      const px = wrap(i * 61 - ctx.R.scroll * .91, ctx.w + 110) - 55;
      const py = ctx.groundY(px) + 6 + (i % 5) * 7;
      const size = 1.35 + noise(i + 911) * 1.8;
      drawPetal(ctx.x, px, py, size, noise(i + 973) * TAU, .42 + noise(i + 1019) * .5, i % 5, .31, false);
    }
  }

  function drawBird(x, px, py, scale, flap, alpha) {
    x.save();
    x.translate(px, py);
    x.globalAlpha = alpha;
    x.fillStyle = '#35283c';
    x.beginPath();
    x.ellipse(0, 0, 4.2 * scale, 1.9 * scale, 0, 0, TAU);
    x.fill();
    x.strokeStyle = '#35283c';
    x.lineWidth = 1.8 * scale;
    x.lineCap = 'round';
    x.beginPath();
    x.moveTo(-1, 0);
    x.quadraticCurveTo(-7 * scale, -7 * scale - flap, -12 * scale, -2 * scale + flap);
    x.moveTo(1, 0);
    x.quadraticCurveTo(7 * scale, -7 * scale - flap, 12 * scale, -2 * scale + flap);
    x.stroke();
    x.restore();
  }

  function drawBirdFlock(ctx) {
    const strength = eventEnvelope(ctx.t, ctx.state.birdsStarted, 4600);
    if (strength <= 0) return;
    const progress = clamp01((ctx.t - ctx.state.birdsStarted) / 4600);
    const direction = ctx.state.gustSign || 1;

    for (let i = 0; i < ctx.state.birds.length; i++) {
      const bird = ctx.state.birds[i];
      const lead = direction > 0 ? -ctx.w * .14 + progress * ctx.w * 1.38 : ctx.w * 1.14 - progress * ctx.w * 1.38;
      const px = lead - direction * bird.row * (ctx.w < 620 ? 20 : 31);
      const py = ctx.h * .29 + bird.row * (ctx.w < 620 ? 10 : 15) + bird.side * bird.row * 4 + Math.sin(ctx.t * .004 + bird.phase) * 3;
      const flap = Math.sin(ctx.t * .015 + bird.phase) * 4.2 * bird.scale;
      drawBird(ctx.x, px, py, bird.scale * (ctx.w < 620 ? .76 : 1), flap, strength * .78);
    }
  }

  function drawFramingBough(ctx, side) {
    const x = ctx.x;
    const mirror = side < 0;
    const scale = responsiveScale(ctx);
    const edge = mirror ? ctx.w : 0;
    const direction = mirror ? -1 : 1;
    const baseY = ctx.h * .12;
    const endX = edge + direction * ctx.w * (ctx.w < 620 ? .20 : .18);
    const endY = ctx.h * .34;

    x.save();
    x.strokeStyle = 'rgba(54,29,47,.88)';
    x.lineCap = 'round';
    x.lineWidth = 12 * scale;
    x.beginPath();
    x.moveTo(edge - direction * 24, baseY);
    x.bezierCurveTo(edge + direction * ctx.w * .05, ctx.h * .19, edge + direction * ctx.w * .11, ctx.h * .23, endX, endY);
    x.stroke();

    x.lineWidth = 4.5 * scale;
    for (let i = 0; i < 4; i++) {
      const bx = edge + direction * ctx.w * (.045 + i * .035);
      const by = ctx.h * (.185 + i * .035);
      x.beginPath();
      x.moveTo(bx, by);
      x.quadraticCurveTo(bx + direction * 18 * scale, by - 35 * scale, bx + direction * 45 * scale, by - 52 * scale);
      x.stroke();
    }

    const clusters = [
      [.020, .145, 58],
      [.067, .198, 61],
      [.114, .248, 57],
      [.164, .306, 51],
      [.096, .137, 46],
    ];
    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      const radius = cluster[2] * scale;
      drawCanopyMass(
        x,
        edge + direction * ctx.w * cluster[0],
        ctx.h * cluster[1],
        radius,
        radius * .58,
        3100 + (mirror ? 500 : 0) + i * 83,
        2,
        .92
      );
    }
    x.restore();
  }

  function drawForeground(ctx) {
    drawBirdFlock(ctx);
    drawFramingBough(ctx, 1);
    drawFramingBough(ctx, -1);
    drawPetalLayer(ctx, 2, 1);
  }

  function drawSceneFX(ctx) {
    const storm = stormStrength(ctx);
    if (storm <= 0) return;
    const x = ctx.x;
    const direction = ctx.state.gustSign || 1;

    // Broad, translucent wind curls make the gust legible without veiling text.
    x.save();
    x.strokeStyle = `rgba(255,222,232,${.105 * storm})`;
    x.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const y = ctx.h * (.16 + i * .105) + Math.sin(ctx.t * .0016 + i) * 18;
      const travel = wrap(ctx.t * (.13 + i * .006) + i * 193, ctx.w + 360) - 180;
      const startX = direction > 0 ? travel - 130 : ctx.w - travel + 130;
      x.lineWidth = .7 + (i % 3) * .45;
      x.beginPath();
      x.moveTo(startX, y);
      x.bezierCurveTo(startX + direction * 70, y - 18, startX + direction * 130, y + 17, startX + direction * 205, y - 3);
      x.stroke();
    }

    // A near-camera stream supplies the unmistakable petal-storm peak.
    for (let i = 0; i < 38; i++) {
      const travel = wrap(ctx.t * (direction > 0 ? .22 : -.22) + i * 127, ctx.w + 180) - 90;
      const px = travel;
      const py = wrap(i * 79 + ctx.t * (.028 + (i % 5) * .002), ctx.h + 120) - 60;
      const size = 3.1 + (i % 5) * .82;
      const flip = .18 + .82 * Math.abs(Math.sin(ctx.t * .008 + i * .91));
      const alpha = (.19 + (i % 3) * .035) * storm * readabilityAlpha(ctx, px, py);
      drawPetal(x, px, py, size, ctx.t * .004 * (i % 2 ? 1 : -1) + i, flip, i % 5, alpha, true);
    }
    x.restore();
  }

  V8.worlds.register('sakura', {
    terrain,
    init,
    update,
    spawnEvent,
    drawBackdrop,
    drawMidground,
    drawTerrain,
    drawGround,
    drawForeground,
    drawSceneFX,
  });
})(window.V8 = window.V8 || {});
