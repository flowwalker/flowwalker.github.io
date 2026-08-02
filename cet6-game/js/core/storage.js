/**
 * Storage — localStorage wrapper for blog vocabulary progress.
 *
 * Progress is namespaced by the active word-pack fingerprint. A changed
 * workbook therefore starts with a clean unlock map while audio/preferences
 * remain shared. The public methods are deliberately small so the menu can
 * render without knowing localStorage's shape.
 */
(function(V8) {
  'use strict';

  const PREFIX = 'cet6_blog_v1_';
  function levelSize() {
    // storage.js is loaded before config.js by the legacy HTML shell, so read
    // the value lazily instead of capturing an empty V8.CFG object at boot.
    return (V8.CFG && Number(V8.CFG.LEVEL_SIZE)) || 50;
  }

  function wordPackKey(packOverride) {
    const pack = packOverride || V8.WORD_PACK || { id: 'words', words: [] };
    const source = JSON.stringify([pack.id || 'words', pack.words || []]);
    let hash = 2166136261;
    for (let i = 0; i < source.length; i++) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const id = String(pack.id || 'words').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '') || 'words';
    return id + '-' + (hash >>> 0).toString(36);
  }

  function safeNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function challengeDefinition(challengeId) {
    const cfg = V8.CFG || {};
    const list = Array.isArray(cfg.CHALLENGES) ? cfg.CHALLENGES : [];
    return list.find(challenge => challenge && challenge.id === challengeId) || null;
  }

  // Keep a fallback for old pages or partially cached config files. Once the
  // current config is loaded, its explicit prerequisites are authoritative.
  function challengePrerequisites(challengeId) {
    const definition = challengeDefinition(challengeId);
    if (definition && Array.isArray(definition.prerequisites)) return definition.prerequisites.slice();
    const fallback = {
      'en-forward': [],
      'en-reverse': ['en-forward'],
      'en-random': ['en-forward', 'en-reverse'],
      'cn-forward': ['en-forward', 'en-reverse'],
      'cn-reverse': ['en-forward', 'en-reverse', 'cn-forward'],
      'cn-random': ['en-forward', 'en-reverse', 'cn-forward', 'cn-reverse'],
    };
    return Object.prototype.hasOwnProperty.call(fallback, challengeId) ? fallback[challengeId] : null;
  }

  function hasEnglishPair(completed, level) {
    const list = completed[String(level)] || [];
    return list.includes('en-forward') && list.includes('en-reverse');
  }

  function deriveHighestUnlocked(completed, totalLevels) {
    let highest = 1;
    for (let level = 1; level < totalLevels; level++) {
      if (!hasEnglishPair(completed, level)) break;
      highest = level + 1;
    }
    return highest;
  }

  function emptyProgress() {
    return {
      schemaVersion: 2,
      // One entry per 1-based vocabulary level. Values are challenge IDs.
      completed: Object.create(null),
      // A level is selectable once its English forward/reverse pair is done.
      highestUnlockedLevel: 1,
      customRange: { start: 1, end: Math.min(levelSize(), (V8.WORD_PACK && V8.WORD_PACK.words || []).length) },
      updatedAt: 0,
    };
  }

  function normalizeProgress(value) {
    const progress = emptyProgress();
    if (!value || typeof value !== 'object') return progress;
    if (value.schemaVersion >= 2 && value.completed && typeof value.completed === 'object') {
      Object.keys(value.completed).forEach(level => {
        const ids = Array.isArray(value.completed[level]) ? value.completed[level] : [];
        progress.completed[String(Math.max(1, Math.floor(safeNumber(level, 1))))] = ids.filter(id => typeof id === 'string');
      });
    } else {
      // Migrate the old four-level counter conservatively. It represented an
      // unlocked count, not proof of a completed challenge, so level one only
      // remains available until the new pair-based records are earned.
      const legacy = Math.max(1, Math.floor(safeNumber(value.unlocked, 1)));
      progress.highestUnlockedLevel = legacy;
    }
    const totalLevels = Math.max(1, Math.ceil(((V8.WORD_PACK && V8.WORD_PACK.words) || []).length / levelSize()));
    progress.highestUnlockedLevel = Math.max(1, Math.min(totalLevels, Math.floor(safeNumber(value.highestUnlockedLevel, progress.highestUnlockedLevel))));
    if (value.customRange && typeof value.customRange === 'object') {
      progress.customRange.start = Math.max(1, Math.floor(safeNumber(value.customRange.start, progress.customRange.start)));
      progress.customRange.end = Math.max(progress.customRange.start, Math.floor(safeNumber(value.customRange.end, progress.customRange.end)));
      progress.customRange.end = Math.min(totalLevels * levelSize(), progress.customRange.end);
    }
    progress.updatedAt = safeNumber(value.updatedAt, 0);
    // Rebuild the level gate from the recorded English pair instead of
    // trusting a stale highestUnlockedLevel from an older build. This keeps
    // the sequential unlock rule intact across schema revisions.
    progress.highestUnlockedLevel = deriveHighestUnlocked(progress.completed, totalLevels);
    // Compatibility fields for the current transition UI. They are derived
    // from the challenge map and are not the source of truth.
    progress.completedWindows = Object.keys(progress.completed).map(Number).filter(level => {
      const done = progress.completed[level] || [];
      return ['en-forward', 'en-reverse'].every(id => done.includes(id));
    }).map(level => level - 1).sort((a, b) => a - b);
    return progress;
  }

  const Storage = {
    get(key, fallback) {
      try {
        const value = localStorage.getItem(PREFIX + key);
        return value === null ? fallback : JSON.parse(value);
      } catch (error) { return fallback; }
    },

    set(key, value) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (error) {}
    },

    remove(key) {
      try { localStorage.removeItem(PREFIX + key); } catch (error) {}
    },

    getWordPackKey: wordPackKey,

    getProgress(packOverride) {
      const key = 'progress_' + wordPackKey(packOverride);
      const progress = normalizeProgress(this.get(key, null));
      if (!progress.updatedAt) {
        progress.updatedAt = Date.now();
        this.set(key, progress);
      }
      return progress;
    },

    setProgress(value, packOverride) {
      return this.saveProgress(value, packOverride);
    },

    saveProgress(progress, packOverride) {
      const normalized = normalizeProgress(progress);
      normalized.updatedAt = Date.now();
      this.set('progress_' + wordPackKey(packOverride), normalized);
      return normalized;
    },

    /** Return completed challenge IDs for a 1-based vocabulary level. */
    getCompleted(levelNumber, packOverride) {
      const level = Math.max(1, Math.floor(safeNumber(levelNumber, 1)));
      const progress = this.getProgress(packOverride);
      return Array.isArray(progress.completed[level]) ? progress.completed[level].slice() : [];
    },

    // Legacy zero-based window helpers retained while the menu migrates to
    // the explicit 1-based level/challenge API above.
    isWindowUnlocked(windowIndex) {
      const index = Math.floor(safeNumber(windowIndex, -1));
      return index >= 0 && index < this.getHighestUnlockedLevel();
    },

    getWindowProgress(windowIndex) {
      const level = Math.floor(safeNumber(windowIndex, -1)) + 1;
      const completedModes = this.getCompleted(level);
      return {
        completedModes,
        randomEn: completedModes.includes('en-forward') && completedModes.includes('en-reverse'),
        randomCn: completedModes.includes('cn-forward') && completedModes.includes('cn-reverse'),
      };
    },

    /** Record one challenge completion, then advance the English unlock gate. */
    markChallengeComplete(levelNumber, challengeId, packOverride) {
      if (typeof challengeId !== 'string' || !challengeId) return this.getProgress(packOverride);
      const level = Math.max(1, Math.floor(safeNumber(levelNumber, 1)));
      const progress = this.getProgress(packOverride);
      // Do not let a forged route skip the sequential English unlock gate.
      if (level > progress.highestUnlockedLevel) return progress;
      const prerequisites = challengePrerequisites(challengeId);
      if (!prerequisites) return progress;
      const list = Array.isArray(progress.completed[level]) ? progress.completed[level].slice() : [];
      if (!prerequisites.every(id => list.includes(id))) return progress;
      if (!list.includes(challengeId)) list.push(challengeId);
      progress.completed[level] = list;

      // Completing English forward + reverse unlocks the next vocabulary
      // window. The last window has no successor, so the count is capped.
      const englishDone = list.includes('en-forward') && list.includes('en-reverse');
      const total = Math.max(1, Math.ceil(((packOverride || V8.WORD_PACK || {}).words || []).length / levelSize()));
      if (englishDone && level >= progress.highestUnlockedLevel && level < total) {
        progress.highestUnlockedLevel = Math.min(total, level + 1);
      }
      return this.saveProgress(progress, packOverride);
    },

    isChallengeComplete(levelNumber, challengeId, packOverride) {
      return this.getCompleted(levelNumber, packOverride).includes(challengeId);
    },

    /** Check whether a base or random challenge is playable. */
    isChallengeUnlocked(levelNumber, challengeId, packOverride) {
      const level = Math.max(1, Math.floor(safeNumber(levelNumber, 1)));
      const progress = this.getProgress(packOverride);
      if (level > progress.highestUnlockedLevel) return false;
      const prerequisites = challengePrerequisites(challengeId);
      return Boolean(prerequisites && prerequisites.every(id => {
        const list = progress.completed[level] || [];
        return list.includes(id);
      }));
    },

    /** Number of sequential windows currently selectable in the menu. */
    getUnlocked() {
      return this.getProgress().highestUnlockedLevel;
    },

    setUnlocked(level) {
      const progress = this.getProgress();
      const total = Math.max(1, Math.ceil(((V8.WORD_PACK || {}).words || []).length / levelSize()));
      progress.highestUnlockedLevel = Math.max(1, Math.min(total, Math.floor(safeNumber(level, 1))));
      this.saveProgress(progress);
    },

    getHighestUnlockedLevel() {
      return this.getProgress().highestUnlockedLevel;
    },

    /** Custom word-range helpers use inclusive 1-based workbook positions. */
    getCustomRange() {
      return Object.assign({}, this.getProgress().customRange);
    },

    setCustomRange(start, end) {
      const range = this.validateCustomRange(start, end);
      if (!range.valid) return false;
      const progress = this.getProgress();
      progress.customRange = { start: range.start, end: range.end };
      this.saveProgress(progress);
      return progress.customRange;
    },

    validateCustomRange(start, end, packOverride) {
      const source = packOverride || V8.WORD_PACK || { words: [] };
      const totalWords = Array.isArray(source.words) ? source.words.length : 0;
      const maxEnd = Math.min(totalWords, this.getHighestUnlockedLevel() * levelSize());
      const first = Math.floor(safeNumber(start, NaN));
      const last = Math.floor(safeNumber(end, NaN));
      const valid = totalWords > 0 && Number.isFinite(first) && Number.isFinite(last) && first >= 1 && last >= first && last <= maxEnd;
      return { valid, start: valid ? first : Math.max(1, Number.isFinite(first) ? first : 1), end: valid ? last : Math.min(maxEnd || totalWords, Math.max(1, Number.isFinite(last) ? last : 1)), min: 1, max: maxEnd };
    },

    getBgmMuted() { return this.get('bgm_muted', false); },
    setBgmMuted(value) { this.set('bgm_muted', Boolean(value)); },
    getBgmStopped() { return this.get('bgm_stopped', false); },
    setBgmStopped(value) { this.set('bgm_stopped', Boolean(value)); },
    getSfxMuted() { return this.get('sfx_muted', false); },
    setSfxMuted(value) { this.set('sfx_muted', Boolean(value)); },
    getHardcore() { return this.get('hardcore', false); },
    setHardcore(value) { this.set('hardcore', Boolean(value)); },
  };

  V8.storage = Storage;
})(window.V8 = window.V8 || {});
