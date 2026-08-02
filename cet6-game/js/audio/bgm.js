/**
 * BGM — one preloaded Audio element per menu/world track variant.
 * A skin change randomly selects a variant, rewinds it, then crossfades from
 * the old world only after the new file can play.
 */
(function(V8) {
  'use strict';

  const { BGM: TRACKS, BGM_GROUPS: GROUPS } = V8.CFG;
  const MENU_GROUP = 0;
  const BASE_VOLUME = .35;
  const FADE_MS = 850;
  const NAV_HANDOFF_KEY = 'cet6_v11_bgm_handoff';
  const NAV_HANDOFF_PARAM = '_v11bgm';
  const NAV_HANDOFF_TTL = 20000;
  const tracks = new Map();
  let activeIndex = null;
  let pendingRestore = null;
  let fadeToken = 0;
  let retryTimer = null;
  let warmScheduled = false;
  let bgmMuted = V8.storage.getBgmMuted();
  let bgmStopped = V8.storage.getBgmStopped ? V8.storage.getBgmStopped() : false;
  const lastPickByGroup = new Map();

  // Track-level gains keep louder theme songs from changing the mix for
  // every world. HTMLAudioElement.volume is capped at 1, so a requested 2x
  // multiplier on the .35 base mix becomes .70 in practice.
  function trackVolume(index) {
    const config = TRACKS[index];
    const gain = config && Number.isFinite(Number(config.gain)) ? Number(config.gain) : 1;
    return Math.min(1, Math.max(0, BASE_VOLUME * Math.max(0, gain)));
  }

  function pickTrack(group) {
    const configured = Array.isArray(GROUPS && GROUPS[group]) ? GROUPS[group] : [group];
    const choices = configured.filter(index => Number.isInteger(index) && TRACKS[index]);
    const available = choices.length ? choices : (TRACKS[0] ? [0] : []);
    if (!available.length) return 0;
    const previous = lastPickByGroup.get(group);
    const pool = available.length > 1 ? available.filter(index => index !== previous) : available;
    const selected = pool[Math.floor(Math.random() * pool.length)];
    lastPickByGroup.set(group, selected);
    return selected;
  }

  function trackForWorld(phase) {
    const worlds = V8.CFG.WORLDS || [];
    const world = worlds[phase];
    const group = world && Number.isInteger(world.bgm) ? world.bgm : phase + 1;
    return pickTrack(group);
  }

  function syncMuted() {
    bgmMuted = V8.storage.getBgmMuted();
    tracks.forEach(state => { state.audio.muted = bgmMuted; });
  }

  function handleError(state) {
    const config = TRACKS[state.index];
    if (pendingRestore && pendingRestore.state === state) pendingRestore = null;
    clearTimeout(retryTimer);
    if (!state.online && config && config.o) {
      state.online = true;
      state.audio.dataset.t = config.o;
      state.audio.src = config.o;
      state.audio.load();
      if (state.index === V8._bgmPhase) {
        retryTimer = setTimeout(() => transitionTo(state.index), 160);
      }
      return;
    }
    if (state.index === V8._bgmPhase) {
      retryTimer = setTimeout(() => {
        state.audio.load();
        transitionTo(state.index);
      }, 3000);
    }
  }

  function ensureTrack(index, eager) {
    if (tracks.has(index)) {
      const state = tracks.get(index);
      if (eager && state.audio.preload !== 'auto') {
        state.audio.preload = 'auto';
        state.audio.load();
      }
      return state;
    }
    const config = TRACKS[index] || TRACKS[0];
    const audio = new Audio();
    const state = { index, audio, online: false };
    audio.preload = eager ? 'auto' : 'metadata';
    audio.volume = 0;
    audio.muted = bgmMuted;
    audio.loop = true;
    audio.dataset.t = config.s;
    audio.src = config.s;
    audio.addEventListener('error', () => handleError(state));
    tracks.set(index, state);
    audio.load();
    return state;
  }

  function warmOtherTracks(currentIndex) {
    if (warmScheduled) return;
    warmScheduled = true;
    const warm = () => TRACKS.forEach((_, index) => {
      if (index !== currentIndex) ensureTrack(index, true);
    });
    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 1800 });
    else setTimeout(warm, 900);
  }

  function stopExcept(allowed) {
    tracks.forEach(state => {
      if (allowed.has(state.index)) return;
      state.audio.pause();
      state.audio.volume = 0;
    });
  }

  function crossfade(from, to, token) {
    const started = performance.now();
    const fromVolume = from ? from.audio.volume : 0;
    function frame(now) {
      if (token !== fadeToken) return;
      const p = Math.min(1, (now - started) / FADE_MS);
      const eased = p * p * (3 - 2 * p);
      to.audio.volume = trackVolume(to.index) * eased;
      if (from && from !== to) from.audio.volume = fromVolume * (1 - eased);
      if (p < 1) {
        requestAnimationFrame(frame);
      } else {
        to.audio.volume = trackVolume(to.index);
        if (from && from !== to) {
          from.audio.pause();
          from.audio.volume = 0;
        }
        stopExcept(new Set([to.index]));
      }
    }
    requestAnimationFrame(frame);
  }

  function transitionTo(index, restart) {
    syncMuted();
    pendingRestore = null;
    const next = ensureTrack(index, true);
    const sameTrack = activeIndex === index;
    warmOtherTracks(index);

    if (restart || !sameTrack) {
      next.audio.pause();
      next.audio.volume = 0;
      try { next.audio.currentTime = 0; } catch (e) {}
    }

    if (bgmStopped || document.hidden) {
      fadeToken++;
      tracks.forEach(state => {
        state.audio.pause();
        state.audio.volume = 0;
      });
      activeIndex = index;
      warmOtherTracks(index);
      return;
    }

    if (sameTrack) {
      fadeToken++;
      stopExcept(new Set([index]));
      next.audio.volume = trackVolume(index);
      if (next.audio.paused && !document.hidden) next.audio.play().catch(() => {});
      warmOtherTracks(index);
      return;
    }

    const previous = activeIndex === null ? null : tracks.get(activeIndex);
    const token = ++fadeToken;
    next.audio.volume = previous ? 0 : trackVolume(index);
    const started = next.audio.play();
    if (!started || typeof started.then !== 'function') return;
    started.then(() => {
      if (token !== fadeToken) {
        if (activeIndex !== index) {
          next.audio.pause();
          next.audio.volume = 0;
        }
        return;
      }
      activeIndex = index;
      stopExcept(new Set(previous ? [previous.index, next.index] : [next.index]));
      if (previous) crossfade(previous, next, token);
      else next.audio.volume = trackVolume(index);
      warmOtherTracks(index);
    }).catch(() => {
      // Autoplay denial or a pending fallback leaves the previous track
      // untouched. A later user action/successful source load retries it.
    });
  }

  function menuTrackForSkin() {
    const skin = (document.body && document.body.dataset.startSkin) || window.START_SKIN;
    // The blue start skin intentionally borrows the calm ocean theme. It is
    // a menu-only choice; gameplay still selects tracks from its world group.
    if (skin === 'blue' && TRACKS[8]) return 8;
    return pickTrack(MENU_GROUP);
  }

  function currentMenuSkin() {
    const skin = (document.body && document.body.dataset.startSkin) || window.START_SKIN;
    return skin === 'pink' ? 'pink' : 'blue';
  }

  function menuTracksForSkin(skin) {
    if (skin === 'blue' && TRACKS[8]) return [8];
    const configured = Array.isArray(GROUPS && GROUPS[MENU_GROUP]) ? GROUPS[MENU_GROUP] : [MENU_GROUP];
    return configured.filter(index => Number.isInteger(index) && TRACKS[index]);
  }

  function completePendingRestore() {
    const restore = pendingRestore;
    if (!restore || restore.state.audio.readyState < 1) return false;
    pendingRestore = null;
    const audio = restore.state.audio;
    let target = Math.max(0, restore.time);
    if (Number.isFinite(audio.duration) && audio.duration > .25) target %= audio.duration;
    try { audio.currentTime = target; } catch (e) {}
    audio.volume = trackVolume(restore.state.index);
    if (restore.shouldPlay && !bgmStopped && !document.hidden) audio.play().catch(() => {});
    return true;
  }

  function restoreNavigationState(handoff) {
    syncMuted();
    const state = ensureTrack(handoff.index, true);
    const elapsed = handoff.wasPlaying ? Math.max(0, (Date.now() - handoff.savedAt) / 1000) : 0;
    fadeToken++;
    activeIndex = handoff.index;
    V8._bgmPhase = handoff.index;
    state.audio.pause();
    state.audio.volume = 0;
    stopExcept(new Set([handoff.index]));
    pendingRestore = {
      state,
      time: handoff.time + elapsed,
      shouldPlay: handoff.wasPlaying,
    };
    state.audio.addEventListener('loadedmetadata', completePendingRestore, { once: true });
    completePendingRestore();
    warmOtherTracks(handoff.index);
  }

  function validNavigationState(raw) {
    if (!raw) return null;
    try {
      const handoff = JSON.parse(raw);
      const skin = currentMenuSkin();
      const age = Date.now() - Number(handoff.savedAt);
      const valid = handoff && handoff.v === 1 && handoff.path === window.location.pathname &&
        handoff.skin === skin && age >= 0 && age <= NAV_HANDOFF_TTL &&
        Number.isFinite(handoff.time) && handoff.time >= 0 &&
        menuTracksForSkin(skin).includes(handoff.index);
      return valid ? handoff : null;
    } catch (e) { return null; }
  }

  function takeNavigationState() {
    const candidates = [];
    try {
      const raw = window.sessionStorage.getItem(NAV_HANDOFF_KEY);
      if (raw) candidates.push(raw);
      window.sessionStorage.removeItem(NAV_HANDOFF_KEY);
    } catch (e) {}
    try {
      const current = new URL(window.location.href);
      const fallback = current.searchParams.get(NAV_HANDOFF_PARAM);
      if (fallback) candidates.push(fallback);
      if (current.searchParams.has(NAV_HANDOFF_PARAM)) {
        current.searchParams.delete(NAV_HANDOFF_PARAM);
        window.history.replaceState(window.history.state, '', current.toString());
      }
    } catch (e) {}
    for (const raw of candidates) {
      const handoff = validNavigationState(raw);
      if (handoff) return handoff;
    }
    return null;
  }

  function createNavigationState() {
    const skin = currentMenuSkin();
    const candidates = menuTracksForSkin(skin);
    const index = activeIndex !== null ? activeIndex : V8._bgmPhase;
    if (!Number.isInteger(index) || !candidates.includes(index)) return null;
    const state = tracks.get(index);
    const restore = pendingRestore && pendingRestore.state.index === index ? pendingRestore : null;
    const audioTime = state && Number.isFinite(state.audio.currentTime) ? state.audio.currentTime : 0;
    const time = restore ? restore.time : Math.max(0, audioTime);
    const wasPlaying = !bgmStopped && (restore ? restore.shouldPlay : Boolean(state && !state.audio.paused));
    return {
      v: 1,
      path: window.location.pathname,
      skin,
      index,
      time,
      wasPlaying,
      savedAt: Date.now(),
    };
  }

  function storeNavigationState(state) {
    if (!state) return false;
    try {
      window.sessionStorage.setItem(NAV_HANDOFF_KEY, JSON.stringify(state));
      return true;
    } catch (e) { return false; }
  }

  function saveNavigationState() {
    return storeNavigationState(createNavigationState());
  }

  function prepareNavigation(url) {
    const handoff = createNavigationState();
    if (!handoff) return String(url);
    storeNavigationState(handoff);
    try {
      const next = new URL(String(url), window.location.href);
      next.searchParams.set(NAV_HANDOFF_PARAM, JSON.stringify(handoff));
      return next.toString();
    } catch (e) { return String(url); }
  }

  function boot(restart) {
    if (activeIndex === null) {
      const handoff = takeNavigationState();
      if (handoff) {
        restoreNavigationState(handoff);
        return;
      }
    }
    const index = menuTrackForSkin();
    V8._bgmPhase = index;
    transitionTo(index, restart === true || activeIndex !== index);
  }

  function play() {
    if (bgmStopped || document.hidden) return;
    if (pendingRestore) {
      pendingRestore.shouldPlay = true;
      if (!completePendingRestore()) pendingRestore.state.audio.load();
      return;
    }
    if (activeIndex === null) {
      if (Number.isInteger(V8._bgmPhase)) transitionTo(V8._bgmPhase, false);
      else boot();
      return;
    }
    const state = tracks.get(activeIndex);
    if (state && state.audio.paused) {
      state.audio.volume = trackVolume(activeIndex);
      state.audio.play().catch(() => {});
    }
  }

  function switchTrack(phase) {
    const index = trackForWorld(phase);
    V8._bgmPhase = index;
    transitionTo(index, true);
  }

  function toggle() {
    bgmMuted = !bgmMuted;
    V8.storage.setBgmMuted(bgmMuted);
    tracks.forEach(state => { state.audio.muted = bgmMuted; });
    if (!bgmMuted && !bgmStopped) play();
    return bgmMuted;
  }

  function isMuted() { return bgmMuted; }

  function stop() {
    bgmStopped = true;
    if (pendingRestore) pendingRestore.shouldPlay = false;
    if (V8.storage.setBgmStopped) V8.storage.setBgmStopped(true);
    fadeToken++;
    clearTimeout(retryTimer);
    tracks.forEach(state => {
      state.audio.pause();
      state.audio.volume = 0;
    });
    return true;
  }

  function resume() {
    bgmStopped = false;
    if (V8.storage.setBgmStopped) V8.storage.setBgmStopped(false);
    play();
    return false;
  }

  function toggleStopped() {
    return bgmStopped ? resume() : stop();
  }

  function isStopped() { return bgmStopped; }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      fadeToken++;
      tracks.forEach(state => state.audio.pause());
      return;
    }
    if (activeIndex !== null && !bgmStopped) {
      const current = tracks.get(activeIndex);
      stopExcept(new Set([activeIndex]));
      current.audio.volume = trackVolume(activeIndex);
      current.audio.play().catch(() => {});
    }
  });

  // Autoplay may be denied on initial load. The first real interaction starts
  // the already-buffering menu track without requiring a second click.
  function unlockPlayback() {
    document.removeEventListener('pointerdown', unlockPlayback);
    document.removeEventListener('keydown', unlockPlayback);
    play();
  }
  document.addEventListener('pointerdown', unlockPlayback, { passive: true });
  document.addEventListener('keydown', unlockPlayback);

  V8.bgm = {
    boot, play, stop, resume, switchTrack, toggle, isMuted, toggleStopped, isStopped,
    saveNavigationState, prepareNavigation,
    get el() { return activeIndex === null ? null : tracks.get(activeIndex).audio; },
  };
})(window.V8 = window.V8 || {});
