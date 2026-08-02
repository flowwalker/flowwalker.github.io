/**
 * GameState — finite state machine for game flow control.
 *
 * States:
 *   IDLE → READY → PLAYING → CORRECT_ANIM → NEXT_WORD → PLAYING
 *                               ↘ WRONG → HP_CHECK → (hp>0) CORRECT_ANIM
 *                                                    ↘ (hp=0) DYING → GAME_OVER
 *                               ↘ LEVEL_DONE → VICTORY
 *   REVIEW (orthogonal state)
 *
 * Each state defines: enter/exit hooks, allowed transitions, blocked actions.
 */
(function(V8) {
  'use strict';

  const STATES = {
    IDLE:           'idle',
    READY:          'ready',        // READY→GO countdown
    PLAYING:        'playing',      // normal gameplay
    CORRECT_ANIM:   'correct_anim', // answer correct → animation playing
    NEXT_WORD:      'next_word',    // brief pause before next word
    WRONG:          'wrong',        // answer wrong → HP check
    DYING:          'dying',        // death animation
    GAME_OVER:      'game_over',    // game over overlay showing
    VICTORY:        'victory',      // level complete overlay
    REVIEW:         'review',       // flashcard review mode
  };

  const TRANSITIONS = {
    [STATES.IDLE]:          [STATES.READY, STATES.REVIEW],
    [STATES.READY]:         [STATES.PLAYING],
    [STATES.PLAYING]:       [STATES.CORRECT_ANIM, STATES.WRONG, STATES.LEVEL_DONE],
    [STATES.CORRECT_ANIM]:  [STATES.NEXT_WORD],
    [STATES.NEXT_WORD]:     [STATES.PLAYING, STATES.VICTORY],
    [STATES.WRONG]:         [STATES.DYING, STATES.CORRECT_ANIM], // CORRECT_ANIM only if HP>0
    [STATES.DYING]:         [STATES.GAME_OVER],
    [STATES.GAME_OVER]:     [STATES.IDLE],
    [STATES.VICTORY]:       [STATES.IDLE],
    [STATES.REVIEW]:        [STATES.IDLE],
  };

  /** Actions blocked in each state. */
  const BLOCKED = {
    [STATES.IDLE]:          [],
    [STATES.READY]:         ['submit', 'skill'],
    [STATES.PLAYING]:       [],
    [STATES.CORRECT_ANIM]:  ['submit', 'skill'],
    [STATES.NEXT_WORD]:     ['submit', 'skill'],
    [STATES.WRONG]:         ['submit', 'skill', 'timer'],
    [STATES.DYING]:         ['submit', 'skill', 'timer', 'input'],
    [STATES.GAME_OVER]:     ['submit', 'skill', 'timer', 'input'],
    [STATES.VICTORY]:       ['submit', 'skill', 'timer', 'input'],
    [STATES.REVIEW]:        ['submit', 'skill', 'timer'],
  };

  class GameState {
    constructor() {
      this._state = STATES.IDLE;
      this._prev = null;
      this._hooks = { enter: {}, exit: {} };
    }

    get current() { return this._state; }
    get prev() { return this._prev; }

    /** Register enter/exit hooks. */
    onEnter(state, fn) {
      if (!this._hooks.enter[state]) this._hooks.enter[state] = [];
      this._hooks.enter[state].push(fn);
    }
    onExit(state, fn) {
      if (!this._hooks.exit[state]) this._hooks.exit[state] = [];
      this._hooks.exit[state].push(fn);
    }

    /** Attempt transition. Returns true if allowed. */
    transition(newState) {
      if (newState === this._state) return false;
      const allowed = TRANSITIONS[this._state] || [];
      if (!allowed.includes(newState)) {
        console.warn(`[GameState] Invalid transition: ${this._state} → ${newState}`);
        return false;
      }

      // Exit hooks
      (this._hooks.exit[this._state] || []).forEach(fn => fn(newState));
      this._prev = this._state;
      this._state = newState;

      // Enter hooks
      (this._hooks.enter[newState] || []).forEach(fn => fn(this._prev));

      V8.bus.emit('state:change', { from: this._prev, to: newState });
      return true;
    }

    /** Check if a given action is currently allowed. */
    allows(action) {
      const blocked = BLOCKED[this._state] || [];
      return !blocked.includes(action);
    }

    is(state) { return this._state === state; }
    isOneOf(...states) { return states.includes(this._state); }

    reset() { this._state = STATES.IDLE; this._prev = null; }
  }

  V8.STATES = STATES;
  V8.state = new GameState();
})(window.V8 = window.V8 || {});
