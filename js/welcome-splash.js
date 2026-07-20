/*!
 * Welcome Splash — 主博客进门欢迎浮层
 * ============================================================
 * 【开关】把下面 SPLASH_ENABLE 改为 false 即整体关闭；
 *         也可在 _config.anzhiyu.yml 的 inject 中注释掉
 *         welcome-splash.css 与本文件两行。
 * 【图片】把风景图放到 /img/splash/ 下，按时段命名
 *         （morning1.png、morning2.png …），并在下方 IMAGES
 *         对应数组里登记文件名。图片缺失时自动回退为时段渐变色。
 * 【时段】清晨 5–11 时 / 午后 11–17 时 / 黄昏 17–19 时 / 夜晚 19–5 时。
 * 【勾选】勾选“本次访问不再弹出”后：同一设备只要不整页刷新，
 *         本次访问内不再弹出；刷新后即恢复（与需求一致）。
 * ============================================================
 */
(function () {
  'use strict';

  /* =================== 配置区（可自由修改） =================== */
  var SPLASH_ENABLE = true;          // 总开关
  var ONLY_HOME = false;             // true = 只在首页弹出；false = 进入本站任意页面都弹出
  var IMG_BASE = '/img/splash/';     // 图片目录

  // 各时段图片池：把文件放进 /img/splash/ 后，在这里登记文件名
  var IMAGES = {
    morning:   ['morning1.png', 'morning2.png'],
    afternoon: ['afternoon1.png', 'afternoon2.png'],
    dusk:      ['dusk1.png', 'dusk2.png'],
    night:     ['night1.png', 'night2.png']
  };

  // 各时段古诗词风味欢迎语（随机抽取一条）
  var GREETINGS = {
    morning: [
      '晨光初破晓，清风翻书早。',
      '一日之计在于晨，愿君此行有所得。',
      '朝露未晞，山色入怀，且随我缓步登临。'
    ],
    afternoon: [
      '日长篱落无人过，惟有蜻蜓蛱蝶飞。',
      '午窗春睡足，起坐读残书。',
      '偷得浮生半日闲，正是开卷好时节。'
    ],
    dusk: [
      '山气日夕佳，飞鸟相与还。',
      '疏影横斜水清浅，暗香浮动月黄昏。',
      '夕阳无限好，暮至亦温柔。'
    ],
    night: [
      '夜静春山空，月出惊山鸟。',
      '吹灯窗更明，月照一天雪。',
      '星垂平野阔，愿君好梦长。'
    ]
  };

  // 结构说明语
  var STRUCTURE_HTML =
    '此地为笔者 flowwalker 主博客所在山：放眼人间，醉情天地；收录杂文，漫谈随记；每有会意，便欣然忘食～<br>' +
    '此外笔者另创学习专题博客，收录于上方标题栏「手札」——有悟道、格物、工巧、数术、码艺五录，敬请赏玩。';
  /* ============================================================ */

  if (!SPLASH_ENABLE) return;

  // 只在首页弹出（可选）
  if (ONLY_HOME) {
    var path = window.location.pathname;
    if (path !== '/' && path !== '/index.html') return;
  }

  // 本次访问内已勾选“不再弹出”
  if (window.__flowwalkerSplashNoMore) return;

  function currentPeriod() {
    var h = new Date().getHours();
    if (h >= 5 && h < 11) return 'morning';
    if (h >= 11 && h < 17) return 'afternoon';
    if (h >= 17 && h < 19) return 'dusk';
    return 'night';
  }
  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  var period = currentPeriod();
  var pool = IMAGES[period] || [];
  var imgFile = pool.length ? pickRandom(pool) : null;
  var greeting = pickRandom(GREETINGS[period]);

  // 构建浮层 DOM
  var overlay = document.createElement('div');
  overlay.id = 'welcome-splash';
  overlay.className = 'ws-period-' + period;
  overlay.innerHTML =
    '<div class="ws-card" role="dialog" aria-modal="true" aria-label="欢迎">' +
      '<div class="ws-hero">' +
        (imgFile ? '<img class="ws-hero-img" src="' + IMG_BASE + imgFile + '" alt="">' : '') +
        '<div class="ws-hero-mask"></div>' +
      '</div>' +
      '<div class="ws-body">' +
        '<h2 class="ws-title">Welcome to flowwalker&#39;s blog!</h2>' +
        '<p class="ws-greeting">' + greeting + '</p>' +
        '<p class="ws-structure">' + STRUCTURE_HTML + '</p>' +
        '<div class="ws-actions">' +
          '<button class="ws-go" type="button">Let&#39;s go!</button>' +
          '<label class="ws-never">' +
            '<input type="checkbox" id="ws-never-checkbox">' +
            '<span>本次访问不再弹出</span>' +
          '</label>' +
        '</div>' +
      '</div>' +
    '</div>';

  var closed = false;
  function dismiss() {
    if (closed) return;
    closed = true;
    var cb = overlay.querySelector('#ws-never-checkbox');
    if (cb && cb.checked) window.__flowwalkerSplashNoMore = true;
    overlay.classList.add('ws-hide');
    document.removeEventListener('keydown', onEsc);
    setTimeout(function () {
      overlay.remove();
      document.documentElement.style.overflow = '';
    }, 600);
  }
  function onEsc(e) { if (e.key === 'Escape') dismiss(); }

  overlay.querySelector('.ws-go').addEventListener('click', dismiss);
  document.addEventListener('keydown', onEsc);

  // 图片缺失 → 时段渐变回退
  var img = overlay.querySelector('.ws-hero-img');
  if (img) {
    img.addEventListener('error', function () { overlay.classList.add('ws-noimg'); });
    if (img.complete && img.naturalWidth === 0) overlay.classList.add('ws-noimg');
  } else {
    overlay.classList.add('ws-noimg');
  }

  document.body.appendChild(overlay);
  document.documentElement.style.overflow = 'hidden'; // 展示期间锁定滚动
  requestAnimationFrame(function () { overlay.classList.add('ws-show'); });
})();
