/*!
 * Welcome Splash — 主博客进门欢迎浮层
 * ============================================================
 * 【开关】把下面 SPLASH_ENABLE 改为 false 即整体关闭；
 *         也可在 _config.anzhiyu.yml 的 inject 中注释掉
 *         welcome-splash.css 与本文件两行。
 * 【图片】风景图放在 /img/splash/ 下，按「时段名+序号.jpg」命名，
 *         例如 morning1.jpg、dusk3.jpg。
 *         新增图片后，只需把下方 IMAGES 对应时段的数量改大即可。
 * 【时段】清晨 5–11 / 午后 11–17 / 黄昏 17–19 / 傍晚 19–22 / 深夜 22–5。
 * 【兜底】某时段图片缺失或加载失败时，自动回退为该时段的渐变色。
 * ============================================================
 */
(function () {
  'use strict';

  /* =================== 配置区（可自由修改） =================== */
  var SPLASH_ENABLE = true;          // 总开关
  var ONLY_HOME = false;             // true = 只在首页弹出；false = 进入本站任意页面都弹出
  var IMG_BASE = '/img/splash/';     // 图片目录

  // 各时段图片池：pool('morning', 5) 表示 morning1.jpg ~ morning5.jpg
  function pool(prefix, count) {
    var arr = [];
    for (var i = 1; i <= count; i++) arr.push(prefix + i + '.jpg');
    return arr;
  }
  var IMAGES = {
    morning:   pool('morning', 5),
    afternoon: pool('afternoon', 6),
    dusk:      pool('dusk', 12),
    evening:   pool('evening', 6),
    night:     pool('night', 16)
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
    evening: [
      '月上柳梢头，人约黄昏后。',
      '华灯初上，夜色温柔，正宜把卷。'
    ],
    night: [
      '夜静春山空，月出惊山鸟。',
      '吹灯窗更明，月照一天雪。',
      '星垂平野阔，愿君好梦长。'
    ]
  };

  // 结构说明语
  var STRUCTURE_HTML =
    '⛰️ 此地为笔者 <span class="ws-em">主博客</span> 所在之山👇<br>' +
    '<span class="ws-blog-tags">' +
      '点击<a class="ws-blog-tag ws-blog-tag-enter" data-action="dismiss-splash">进入</a> ' + '<br>' +
    '</span>' +
    '📚 <span class="ws-em">更多专刊</span>请见顶部导航栏 <span class="ws-em">「手札」</span><br>或者<span class="ws-em">直接点击</span>下方按钮👇周游群山<br>' +
    '<span class="ws-blog-tags">' +
      '<a class="ws-blog-tag" href="https://flowwalker.github.io/flowwalker-wiki/">悟道Wiki</a> ' + '<br>' +
      '<a class="ws-blog-tag" href="https://flowwalker.github.io/physics-notes-blog/">格物Blog</a> ' + '<br>' +
      '<a class="ws-blog-tag" href="https://flowwalker.github.io/engineering-notes-blog/">工巧Blog</a> ' + '<br>' +
      '<a class="ws-blog-tag" href="https://flowwalker.github.io/math-notes-blog/">数术Blog</a> ' + '<br>' +
      '<a class="ws-blog-tag" href="https://flowwalker.github.io/coding-notes-blog/">码艺Blog</a>' +
    '</span>' +
    '敬请赏玩，㊗️愉快～💐';
  /* ============================================================ */

  // 等待页面完全加载后再展示浮层
  function initSplash() {
    if (!SPLASH_ENABLE) return;

    // 同一会话已关闭过则不再弹出
    if (sessionStorage.getItem('ws-dismissed')) return;

    // 只在首页弹出（可选）
    if (ONLY_HOME) {
      var path = window.location.pathname;
      if (path !== '/' && path !== '/index.html') return;
    }

    function currentPeriod() {
      var h = new Date().getHours();
      if (h >= 5 && h < 11) return 'morning';
      if (h >= 11 && h < 17) return 'afternoon';
      if (h >= 17 && h < 19) return 'dusk';
      if (h >= 19 && h < 22) return 'evening';
      return 'night';
    }
    function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    var period = currentPeriod();
    var files = IMAGES[period] || [];
    var imgFile = files.length ? pickRandom(files) : null;
    var greeting = pickRandom(GREETINGS[period]);

    // 构建浮层 DOM
    var overlay = document.createElement('div');
    overlay.id = 'welcome-splash';
    overlay.className = 'ws-period-' + period;
    overlay.innerHTML =
      '<div class="ws-card" role="dialog" aria-modal="true" aria-label="欢迎">' +
        '<div class="ws-hero">' +
          '<div class="ws-hero-mask"></div>' +
        '</div>' +
        '<div class="ws-body">' +
          '<h2 class="ws-title">Welcome to flowwalker&#39;s blog!</h2>' +
          '<p class="ws-greeting">' + greeting + '</p>' +
          '<p class="ws-structure">' + STRUCTURE_HTML + '</p>' +
        '</div>' +
      '</div>';

    var closed = false;
    function dismiss() {
      if (closed) return;
      closed = true;
      sessionStorage.setItem('ws-dismissed', '1');
      overlay.classList.add('ws-hide');
      document.removeEventListener('keydown', onEsc);
      setTimeout(function () {
        overlay.remove();
        document.documentElement.style.overflow = '';
      }, 600);
    }
    function onEsc(e) { if (e.key === 'Escape') dismiss(); }

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) dismiss();
    });

    // "进入"按钮：关闭浮层（底下就是首页，无需导航）
    var enterBtn = overlay.querySelector('[data-action="dismiss-splash"]');
    if (enterBtn) {
      enterBtn.addEventListener('click', function (e) {
        e.preventDefault();
        dismiss();
      });
    }

    document.addEventListener('keydown', onEsc);

    // 图片预加载：成功才插入 <img>，失败则回退为时段渐变
    var heroEl = overlay.querySelector('.ws-hero');
    if (imgFile) {
      var probe = new Image();
      probe.onload = function () {
        var img = document.createElement('img');
        img.className = 'ws-hero-img';
        img.src = IMG_BASE + imgFile;
        img.alt = '';
        heroEl.insertBefore(img, heroEl.firstChild);
      };
      probe.onerror = function () {
        overlay.classList.add('ws-noimg');
      };
      probe.src = IMG_BASE + imgFile;
    } else {
      overlay.classList.add('ws-noimg');
    }

    document.body.appendChild(overlay);
    document.documentElement.style.overflow = 'hidden'; // 展示期间锁定滚动
    requestAnimationFrame(function () { overlay.classList.add('ws-show'); });
  }

  if (document.readyState === 'complete') {
    initSplash();
  } else {
    window.addEventListener('load', initSplash);
  }
})();
