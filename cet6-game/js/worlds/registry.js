/**
 * Optional world-plugin registry.
 * A failed bonus skin is quarantined so the base renderer and the original
 * four worlds remain playable.
 */
(function(V8) {
  'use strict';

  const plugins = Object.create(null);
  const failed = Object.create(null);

  function register(id, plugin) {
    if (!id || !plugin || typeof plugin !== 'object') return false;
    plugins[id] = plugin;
    return true;
  }

  function get(id) {
    return id && !failed[id] ? plugins[id] || null : null;
  }

  function call(id, hook, context) {
    const plugin = get(id);
    if (!plugin || typeof plugin[hook] !== 'function') return undefined;
    try {
      return plugin[hook](context);
    } catch (error) {
      failed[id] = true;
      if (window.console && console.warn) console.warn('[V8 world disabled]', id, error);
      return undefined;
    }
  }

  V8.worlds = { register, get, call, has: id => Boolean(get(id)) };
})(window.V8 = window.V8 || {});
