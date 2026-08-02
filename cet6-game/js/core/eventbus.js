/**
 * EventBus — lightweight pub/sub for decoupled module communication.
 * Inspired by Qt's signal/slot mechanism, but simpler.
 */
(function(V8) {
  'use strict';

  class EventBus {
    constructor() {
      this._listeners = new Map();
      this._once = new Map();
    }

    /** Subscribe to an event. Returns unsubscribe function. */
    on(event, fn) {
      if (!this._listeners.has(event)) this._listeners.set(event, []);
      this._listeners.get(event).push(fn);
      return () => this.off(event, fn);
    }

    /** Subscribe for a single fire. */
    once(event, fn) {
      if (!this._once.has(event)) this._once.set(event, []);
      this._once.get(event).push(fn);
    }

    /** Unsubscribe. */
    off(event, fn) {
      const arr = this._listeners.get(event);
      if (arr) {
        const i = arr.indexOf(fn);
        if (i >= 0) arr.splice(i, 1);
      }
    }

    /** Emit an event with optional data. */
    emit(event, data) {
      // Regular listeners
      const arr = this._listeners.get(event);
      if (arr) for (const fn of arr) fn(data);

      // Once listeners
      const onceArr = this._once.get(event);
      if (onceArr) {
        this._once.delete(event);
        for (const fn of onceArr) fn(data);
      }
    }

    /** Remove all listeners for an event (or all events). */
    clear(event) {
      if (event) {
        this._listeners.delete(event);
        this._once.delete(event);
      } else {
        this._listeners.clear();
        this._once.clear();
      }
    }
  }

  V8.bus = new EventBus();
})(window.V8 = window.V8 || {});
