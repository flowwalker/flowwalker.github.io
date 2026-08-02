/**
 * Environmental entities — cans, critters, UFOs.
 * Ambient loops that add life to the game world.
 */
(function(V8) {
  'use strict';

  const { R } = V8.render;
  let canTimer, critterTimer, ufoTimer, ambTimer;

  function clearAll() {
    clearTimeout(canTimer); clearTimeout(critterTimer); clearTimeout(ufoTimer); clearTimeout(ambTimer);
  }

  // ── Kickable cans (W1/W2) ─────────────────────────────
  function startCanLoop(gameState) {
    const id = gameState.runId;
    const step = () => {
      if (gameState.runId !== id) return;
      if (gameState.started && !gameState.over && (gameState.phase === 0 || gameState.phase === 1) && !R.cans.length) {
        const d = document.createElement('div'); d.className = 'can'; d.textContent = '🥫';
        document.body.appendChild(d);
        R.cans.push({ wx: R.scroll + R.w + 60, el: d, kicked: false, vy: 0, y: 0, bounces: 0, roll: 0, dead: 0 });
      }
      canTimer = setTimeout(step, 12000 + Math.random() * 14000);
    };
    canTimer = setTimeout(step, 8000);
  }

  function updateCans(k, gameState) {
    for (const c of R.cans) {
      const sx = c.wx - R.scroll;
      if (!c.kicked) {
        c.el.style.left = (sx - 8) + 'px'; c.el.style.top = (V8.render.groundY(sx) - 14) + 'px';
        c.el.style.transform = `rotate(${(R.scroll * 1.4) % 360}deg)`;
        if (sx < R.w * 0.17 + 34 && sx > R.w * 0.17 - 60 && gameState.started && !gameState.over && !gameState.dead) {
          c.kicked = true; c.vy = -5.5; c.y = 0; c.bounces = 0;
          V8.sfx.jump();
        }
      } else {
        c.wx += 2.2 * k; c.vy += .3 * k; c.y += c.vy * k;
        if (c.y > 0) { c.y = 0; c.vy *= -.42; if (++c.bounces >= 2) c.roll = 1; }
        c.el.style.left = (sx - 8) + 'px'; c.el.style.top = (V8.render.groundY(sx) - 14 + c.y) + 'px';
        c.el.style.transform = `rotate(${c.roll ? (R.scroll * 3) % 360 : c.y * -8}deg)`;
      }
      if (sx < -50) c.dead = 1;
    }
    R.cans = R.cans.filter(c => { if (c.dead) c.el.remove(); return !c.dead; });
  }

  // ── Critters (world-specific ambient animals) ─────────
  function startCritterLoop(gameState) {
    const id = gameState.runId;
    const step = () => {
      if (gameState.runId !== id) return;
      if (gameState.started && !gameState.over && !R.critters.length && Math.random() < .6) {
        const d = document.createElement('div'); let c;
        if (gameState.phase === 0) { d.textContent = '🐇'; d.className = 'critter sil'; c = { wx: R.scroll + R.w + 40, kind: 'hop', el: d }; }
        else if (gameState.phase === 1) { d.textContent = '🐈‍⬛'; d.className = 'critter sil'; c = { wx: R.scroll + R.w + 40, kind: 'walk', el: d }; }
        else if (gameState.phase === 2) { d.textContent = '🦇'; d.className = 'critter sil'; c = { sx: R.w + 40, sy: R.h * (.18 + Math.random() * .2), kind: 'flyL', el: d }; }
        else { d.textContent = '🛰️'; d.className = 'critter'; c = { sx: -50, sy: R.h * (.08 + Math.random() * .12), kind: 'flyR', el: d }; }
        document.body.appendChild(d); R.critters.push(c);
      }
      critterTimer = setTimeout(step, 16000 + Math.random() * 16000);
    };
    critterTimer = setTimeout(step, 12000);
  }

  function updateCritters(k) {
    for (const c of R.critters) {
      if (c.kind === 'hop' || c.kind === 'walk') {
        if (c.kind === 'hop') c.wx += 1.6 * k;
        const sx = c.wx - R.scroll;
        const hop = c.kind === 'hop' ? Math.abs(Math.sin(Date.now() * .011)) * 12 : 0;
        c.el.style.left = (sx - 9) + 'px'; c.el.style.top = (V8.render.groundY(sx) - 16 - hop) + 'px';
        if (sx < -60) c.dead = 1;
      } else if (c.kind === 'flyL') {
        c.sx -= 2.4 * k; c.sy += Math.sin(Date.now() * .006) * .4 * k;
        c.el.style.left = c.sx + 'px'; c.el.style.top = c.sy + 'px'; c.el.style.transform = 'scaleX(-1)';
        if (c.sx < -60) c.dead = 1;
      } else {
        c.sx += .9 * k;
        c.el.style.left = c.sx + 'px'; c.el.style.top = c.sy + 'px';
        if (c.sx > R.w + 60) c.dead = 1;
      }
    }
    R.critters = R.critters.filter(c => { if (c.dead) c.el.remove(); return !c.dead; });
  }

  // ── UFO easter egg ────────────────────────────────────
  function startUfoLoop(gameState) {
    const id = gameState.runId;
    const step = () => {
      if (gameState.runId !== id) return;
      if (gameState.started && !gameState.over && Math.random() < .10) {
        const d = document.createElement('div'); d.className = 'ufo'; d.textContent = '🛸';
        const top = 26 + Math.random() * 30;
        d.style.top = top + '%';
        document.body.appendChild(d);
        if (Math.random() < .2) {
          d.style.animationName = 'ufoFlyB'; d.style.animationDuration = '9.6s';
          setTimeout(() => {
            if (gameState.over) return;
            const bm = document.createElement('div'); bm.className = 'beam';
            document.body.appendChild(bm);
            const cw2 = document.createElement('div'); cw2.className = 'cow'; cw2.textContent = '🐄';
            document.body.appendChild(cw2);
            const beamHalf = bm.offsetWidth / 2;
            const cowHalf = cw2.offsetWidth / 2;
            let followFrame = 0;
            const followUfo = () => {
              if (!d.isConnected || !bm.isConnected || !cw2.isConnected) return;
              const ufoRect = d.getBoundingClientRect();
              const ufoCenterX = ufoRect.left + ufoRect.width / 2;
              const beamTop = ufoRect.bottom - 2;
              const cowTop = R.h * .8;
              bm.style.left = (ufoCenterX - beamHalf) + 'px';
              bm.style.top = beamTop + 'px';
              bm.style.height = Math.max(80, R.h - beamTop - 18) + 'px';
              cw2.style.left = (ufoCenterX - cowHalf) + 'px';
              cw2.style.top = cowTop + 'px';
              cw2.style.setProperty('--rise', (ufoRect.bottom - cowTop - 6) + 'px');
              followFrame = requestAnimationFrame(followUfo);
            };
            followUfo();
            V8.sfx.freeze();
            setTimeout(() => {
              cancelAnimationFrame(followFrame);
              bm.remove(); cw2.remove();
            }, 2500);
          }, 3400);
          setTimeout(() => d.remove(), 9800);
        } else { setTimeout(() => d.remove(), 7200); }
      }
      ufoTimer = setTimeout(step, 8000 + Math.random() * 8000);
    };
    ufoTimer = setTimeout(step, 10000);
  }

  // ── Ambient actions: balanced dash/somersault variation at a calmer cadence. ──
  function startAmbientLoop(gameState) {
    const id = gameState.runId;
    const step = () => {
      if (gameState.runId !== id) return;
      const charEl = document.getElementById('char');
      const streaking = charEl && (charEl.classList.contains('v8-streak-airborne') || charEl.classList.contains('v8-streak-overdrive'));
      if (gameState.started && !gameState.over && !gameState.lock && !gameState.rdy && !gameState.warn && !gameState.dead && !gameState.flying && !gameState.jumping && !streaking && gameState.gstate === 'ground') {
        if (Math.random() < .5) V8.player.doFlip(gameState, charEl);
        else V8.player.doDash(gameState, charEl);
      }
      // Ambient dashes/flips should punctuate the run rather than dominate it.
      ambTimer = setTimeout(step, 4400 + Math.random() * 3600);
    };
    ambTimer = setTimeout(step, 3200 + Math.random() * 2000);
  }

  V8.entities = {
    clearAll,
    startCanLoop, updateCans,
    startCritterLoop, updateCritters,
    startUfoLoop,
    startAmbientLoop,
  };
})(window.V8 = window.V8 || {});
