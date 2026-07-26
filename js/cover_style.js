/**
 * Cover style toggle - nature (default) vs anime
 * Switches cover images on all pages between nature scenery and anime/manga style
 */

;(function () {
  'use strict'

  var STORAGE_KEY = 'coverStyle'
  var DEFAULT_STYLE = 'nature'
  var ANIME_STYLE = 'anime'

  // Get current style preference
  function getCoverStyle() {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_STYLE
  }

  // Save style preference
  function setCoverStyle(style) {
    localStorage.setItem(STORAGE_KEY, style)
  }

  // Preload a single image URL into browser cache
  function preloadImage(url) {
    if (!url) return
    var img = new Image()
    img.src = url
  }

  // Preload all alternative cover images on the page
  function preloadAllAnimeCovers() {
    var covers = document.querySelectorAll('img[data-cover-anime]')
    for (var i = 0; i < covers.length; i++) {
      var animeUrl = covers[i].getAttribute('data-cover-anime')
      if (animeUrl) {
        preloadImage(animeUrl)
      }
    }
  }

  // Apply cover style to all cover images on the page
  function applyCoverStyle(style) {
    var covers = document.querySelectorAll('img[data-cover-anime]')
    for (var i = 0; i < covers.length; i++) {
      var img = covers[i]
      var animeUrl = img.getAttribute('data-cover-anime')
      var natureUrl = img.getAttribute('data-cover-nature') || img.src

      if (style === ANIME_STYLE && animeUrl) {
        // Store nature URL before swapping
        if (!img.getAttribute('data-cover-nature')) {
          img.setAttribute('data-cover-nature', natureUrl)
        }
        if (img.src !== animeUrl) {
          img.src = animeUrl
        }
      } else if (style === DEFAULT_STYLE) {
        // Restore nature URL
        var storedNature = img.getAttribute('data-cover-nature')
        if (storedNature && img.src !== storedNature) {
          img.src = storedNature
        }
        // For initial load (nature is default), nature URL is already in src
      }
    }

    // Update body class for potential CSS styling
    document.body.classList.remove('cover-style-nature', 'cover-style-anime')
    document.body.classList.add('cover-style-' + style)
  }

  // Update the toggle button tooltip
  function updateToggleButton(style) {
    var btn = document.getElementById('coverStyle_button')
    if (!btn) return

    if (style === ANIME_STYLE) {
      btn.setAttribute('title', '切换自然风景封面')
    } else {
      btn.setAttribute('title', '切换动漫风格封面')
    }
  }

  // Main toggle function - exposed globally for button onclick and keyboard shortcut
  window.toggleCoverStyle = function () {
    var current = getCoverStyle()
    var next = current === DEFAULT_STYLE ? ANIME_STYLE : DEFAULT_STYLE
    setCoverStyle(next)
    applyCoverStyle(next)
    updateToggleButton(next)

    // Show snackbar notification
    var msg = next === ANIME_STYLE ? '已进入柯南次元 ✨' : '已返回主空间 🌿'
    if (typeof anzhiyu !== 'undefined' && anzhiyu.snackbarShow) {
      anzhiyu.snackbarShow(msg)
    }

    // Navigate between dimensions on index pages
    var path = window.location.pathname
    var isConanIndex = /^\/conan\//.test(path) || path === '/conan'
    var isNatureIndex = !isConanIndex && (path === '/' || /^\/page\/\d+\/$/.test(path))

    if (next === ANIME_STYLE && isNatureIndex) {
      window.location.href = '/conan/'
    } else if (next === DEFAULT_STYLE && isConanIndex) {
      window.location.href = '/'
    }
  }

  // Detect which dimension the current URL belongs to
  function detectPageDimension() {
    var path = window.location.pathname
    if (path === '/conan' || /^\/conan\//.test(path)) return ANIME_STYLE
    if (path === '/' || /^\/page\/\d+\/$/.test(path)) return DEFAULT_STYLE
    return null // other pages (post, archive, tag, etc.) — don't force
  }

  // Initialize on page load
  function init() {
    var pageDimension = detectPageDimension()

    // Sync cover style with URL: nature home → nature, conan home → anime
    if (pageDimension) {
      setCoverStyle(pageDimension)
      applyCoverStyle(pageDimension)
      updateToggleButton(pageDimension)
    } else {
      var savedStyle = getCoverStyle()
      // Preload alternative covers first (so they're ready when user toggles)
      preloadAllAnimeCovers()
      applyCoverStyle(savedStyle)
      updateToggleButton(savedStyle)
    }
  }

  // Run on initial page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }

  // Re-run after pjax navigation (SPA page transitions)
  document.addEventListener('pjax:complete', function () {
    var currentStyle = getCoverStyle()
    preloadAllAnimeCovers()
    applyCoverStyle(currentStyle)
    updateToggleButton(currentStyle)
  })

  // Keyboard shortcut: Shift+C (keyCode 67)
  // Hooked in main.js executeShortcutKeyFunction, but also listen directly as fallback
  document.addEventListener('keydown', function (event) {
    // Only if keyboard shortcuts are enabled
    if (typeof anzhiyu_keyboard === 'undefined' || !anzhiyu_keyboard) return
    // Skip if user is typing in an input
    if (typeof anzhiyu_intype !== 'undefined' && anzhiyu_intype) return

    if (event.keyCode === 67 && event.shiftKey) {
      event.preventDefault()
      window.toggleCoverStyle()
    }
  })

})()
