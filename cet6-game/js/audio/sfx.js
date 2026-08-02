/**
 * SFX — Web Audio API synthesized sound effects.
 * Migrated from v7 with all original tone/noiseBurst functions preserved.
 */
(function(V8) {
  'use strict';

  let AC = null;

  function ac() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (AC && AC.state === 'suspended') AC.resume();
    return AC;
  }

  function tone(f, type, d, v, delay, slide) {
    if (V8.SFX_MUTED) return;
    const c = ac(); if (!c) return;
    try {
      const t0 = c.currentTime + (delay || 0), o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t0 + d);
      g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + .012); g.gain.exponentialRampToValueAtTime(.0001, t0 + d);
      o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + d + .05);
    } catch (e) {}
  }

  function noiseBurst(d, v, delay, fc) {
    if (V8.SFX_MUTED) return;
    const c = ac(); if (!c) return;
    try {
      const len = Math.floor(c.sampleRate * d), buf = c.createBuffer(1, len, c.sampleRate), ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource(); src.buffer = buf;
      const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = fc || 400;
      const g = c.createGain(); g.gain.value = v;
      src.connect(fl); fl.connect(g); g.connect(c.destination); src.start(c.currentTime + (delay || 0));
    } catch (e) {}
  }

  // ── SFX library (all v7 originals preserved) ──────────
  V8.sfx = {
    ui:     () => tone(700, 'square', .05, .05),
    ok:     () => { tone(880, 'square', .08, .09); tone(1320, 'square', .1, .09, .06); },
    bonus:  (n) => { tone(660, 'square', .1, .09); tone(880, 'square', .1, .09, .08); tone(1100 + n * 60, 'square', .16, .1, .16); },
    combo:  () => { tone(523, 'triangle', .09, .08); tone(784, 'triangle', .13, .08, .07); },
    combo_tier: (t) => { const b = [523, 587, 659, 740][Math.min(3, Math.max(0, t - 1))]; [1, 1.25, 1.5].forEach((m, i) => tone(b * m, 'triangle', .12, .08, i * .07)); },
    die:    () => { tone(320, 'sawtooth', .7, .14, 0, 55); noiseBurst(.5, .18, .1, 220); tone(90, 'sine', 1.1, .2, .35, 38); },
    riser:  () => { tone(220, 'sawtooth', .9, .06, 0, 1200); tone(440, 'square', .55, .045, .3, 1760); },
    thud:   () => { noiseBurst(.16, .24, 0, 150); tone(70, 'sine', .3, .2, 0, 42); },
    win:    () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 'square', .22, .09, i * .13)); tone(1568, 'square', .55, .08, .72); },
    boom:   () => noiseBurst(.4, .1, 0, 320),
    bolt:   () => noiseBurst(.3, .06, 0, 900),
    jump:   () => tone(280, 'square', .18, .07, 0, 760),
    dash:   () => { noiseBurst(.18, .085, 0, 1800); tone(150, 'sawtooth', .24, .065, 0, 660); },
    terrainJump: () => {
      noiseBurst(.09, .065, 0, 1500);
      tone(210, 'square', .22, .10, 0, 920);
      tone(430, 'triangle', .18, .07, .035, 1280);
    },
    terrainLand: () => {
      noiseBurst(.20, .28, 0, 260);
      tone(96, 'sine', .34, .24, 0, 42);
      tone(220, 'triangle', .16, .11, 0, 76);
      tone(620, 'square', .08, .05, .025, 360);
    },
    tick:   () => tone(880, 'square', .09, .07),
    go:     () => { tone(1047, 'square', .26, .08); tone(1568, 'square', .3, .07, .06); },
    heart:  () => { tone(65, 'sine', .12, .22); tone(55, 'sine', .14, .18, .16); },
    gem:    () => { [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 'square', .12, .08, i * .06)); },
    ding:   () => { tone(1500, 'square', .16, .08); tone(750, 'square', .24, .05, .05); },
    // Elegant navigation cues used by the start, transition, and result overlays.
    select: () => tone(620, 'sine', .055, .045, 0, 760),
    confirm: () => { tone(660, 'triangle', .075, .065); tone(990, 'triangle', .12, .055, .045, 1320); },
    back: () => tone(430, 'sine', .085, .05, 0, 250),
    transition: () => {
      tone(190, 'sine', 1.55, .042, 0, 820);
      tone(380, 'triangle', 1.35, .032, .12, 1380);
      tone(760, 'sine', .72, .018, .82, 1900);
      noiseBurst(.65, .012, .15, 1600);
    },
    portal: () => {
      tone(92, 'sine', .38, .15, 0, 42);
      tone(740, 'triangle', .24, .07, .015, 1760);
      tone(1110, 'sine', .18, .045, .07, 2220);
      noiseBurst(.22, .055, 0, 1150);
    },
    // New v8 sounds
    freeze: () => { tone(2000, 'sine', .4, .08, 0, 400); tone(1600, 'sine', .3, .06, .15, 300); },
    vortex: () => { for (let i = 0; i < 4; i++) tone(300 + i * 200, 'sine', .8, .04, i * .2, 80); },
    evolve: () => { [440, 554, 659, 880].forEach((f, i) => tone(f, 'triangle', .2, .07, i * .12)); },
    hp_loss: () => { tone(180, 'sawtooth', .35, .12, 0, 60); noiseBurst(.2, .08, .1, 200); },
    daolang:() => { tone(80, 'sawtooth', .5, .1, 0, 400); noiseBurst(.35, .15, .1, 600); },
  };

  V8.SFX_MUTED = false;
  V8.ac = ac; // expose for BGM system
})(window.V8 = window.V8 || {});
