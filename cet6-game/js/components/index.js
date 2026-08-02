/**
 * Component factories — define all ECS component types.
 * Components are pure data containers (no methods).
 */
(function(V8) {
  'use strict';

  function registerComponents(world) {
    // Core
    world.component('Position',    { x: 0, y: 0 }); // normalized screen coords (0-1)
    world.component('Velocity',    { vx: 0, vy: 0 });
    world.component('Size',        { w: 0, h: 0 }); // in CSS px

    // Player
    world.component('Health',      { current: 3, max: 3 });
    world.component('Combo',       { count: 0, maxCount: 0, lastMilestone: 0 });
    world.component('Score',       { value: 100 });
    world.component('PlayerState', {
      mode: 'run',       // run/skate/glide/jet/jump/flip/djump/dash/die
      airborne: false,   // is in air?
      frame: 'A',        // current pixel-art frame letter
      frameTick: 0,      // animation frame counter
    });

    // Pet
    world.component('Pet', {
      mood: 'idle',      // idle/run/happy/scared
      evolution: 0,      // 0=egg, 1=chick, 2=dragon
      ownerId: null,     // entity ID of owner
    });

    // Brick
    world.component('Brick', {
      face: '?',         // current emoji face
      state: 'idle',     // idle/bump/danger/sweat
    });

    // Word
    world.component('ActiveWord', {
      word: null,        // current word object { e, p, c }
      idx: 0,            // 0-49 position in level
      mode: 0,           // 0=汉译英, 1=英译汉
      dir: 1,            // 1=正序, -1=逆序
      levelIdx: 0,       // 0-3 which level
    });

    // Timer
    world.component('Timer', {
      timeLeft: 45,
      lastTick: 0,
      paused: false,
      warnLevel: 0,      // 0=normal, 1=warn(≤10s), 2=max(≤3s)
    });

    // Skills
    world.component('SkillSet', {
      skills: null,       // Map<id, { unlocked, used }>
    });

    // Rank (post-game)
    world.component('Rank', {
      grade: 'S',
      label: '',
      color: '#fff',
    });

    // UI state (for reactive updates)
    world.component('UIState', {
      hudVisible: false,
      overlayVisible: false,
      reviewMode: 'en',   // en/cn/both
      reviewIdx: 0,
      hardcore: false,
      milestones: [],      // list of recent milestone events to display
    });
  }

  V8.registerComponents = registerComponents;
})(window.V8 = window.V8 || {});
