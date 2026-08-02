/**
 * Shared progress seed for the blog game.
 *
 * This file is intentionally plain data so it can be committed and copied to
 * another device with the rest of cet6-game. Local browser progress is merged
 * on top of this seed at runtime.
 */
(function(V8) {
  'use strict';

  V8.PROGRESS_PACK = {
    schemaVersion: 1,
    wordPackId: 'blog-cet6-all',
    note: '已完成第1-9关英译汉正序与逆序，因此第10关开放。',
    completed: {
      '1': ['en-forward', 'en-reverse'],
      '2': ['en-forward', 'en-reverse'],
      '3': ['en-forward', 'en-reverse'],
      '4': ['en-forward', 'en-reverse'],
      '5': ['en-forward', 'en-reverse'],
      '6': ['en-forward', 'en-reverse'],
      '7': ['en-forward', 'en-reverse'],
      '8': ['en-forward', 'en-reverse'],
      '9': ['en-forward', 'en-reverse'],
    },
  };
})(window.V8 = window.V8 || {});
