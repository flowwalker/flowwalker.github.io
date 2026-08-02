/**
 * Game configuration constants — worlds, levels, skills, scoring.
 */
(function(V8) {
  'use strict';

  // A blog run is a 50-word window from the full workbook. The last window
  // may contain fewer than 50 words (5,523 words currently produce 111).
  const LEVEL_SIZE = 50;
  const BASE_CHALLENGES = [
    { id: 'en-forward', mode: 1, dir: 1, order: 'normal', family: 'en', sequence: 'forward', name: '英译汉 · 正序', icon: '🚀', subtitle: '英文提示 · 正序推进', prerequisites: [] },
    { id: 'en-reverse', mode: 1, dir: -1, order: 'normal', family: 'en', sequence: 'reverse', name: '英译汉 · 逆序', icon: '🚀', subtitle: '英文提示 · 逆序回溯', prerequisites: ['en-forward'] },
    { id: 'cn-forward', mode: 0, dir: 1, order: 'normal', family: 'cn', sequence: 'forward', name: '汉译英 · 正序', icon: '🔥', subtitle: '中文提示 · 正序推进', prerequisites: ['en-forward', 'en-reverse'] },
    { id: 'cn-reverse', mode: 0, dir: -1, order: 'normal', family: 'cn', sequence: 'reverse', name: '汉译英 · 逆序', icon: '🌟', subtitle: '中文提示 · 逆序回溯', prerequisites: ['en-forward', 'en-reverse', 'cn-forward'] },
  ];
  const RANDOM_CHALLENGES = [
    { id: 'en-random', mode: 1, dir: 1, order: 'random', family: 'en', sequence: 'random', name: '英译汉 · 随机', icon: '🎲', subtitle: '英文提示 · 随机挑战', prerequisites: ['en-forward', 'en-reverse'] },
    { id: 'cn-random', mode: 0, dir: 1, order: 'random', family: 'cn', sequence: 'random', name: '汉译英 · 随机', icon: '🎲', subtitle: '中文提示 · 随机挑战', prerequisites: ['en-forward', 'en-reverse', 'cn-forward', 'cn-reverse'] },
  ];
  // Keep the optional English random branch beside the two challenges that
  // unlock it; the Chinese random branch remains after the four-step mainline.
  const CHALLENGES = [
    BASE_CHALLENGES[0], BASE_CHALLENGES[1], RANDOM_CHALLENGES[0],
    BASE_CHALLENGES[2], BASE_CHALLENGES[3], RANDOM_CHALLENGES[1],
  ];
  // Keep six challenge definitions for the existing loop; the blog UI pairs
  // each challenge with a selected 1-based vocabulary level.
  const LV_DEF = CHALLENGES;
  const LV_BTN = CHALLENGES.map(level => level.icon + ' ' + level.name);
  const SIGN_DIR = CHALLENGES.map(level => level.mode === 0 ? '汉 → 英' : '英 → 汉');
  const CHAR_MODE = ['run', 'skate', 'glide', 'run'];

  const TIME_LIMIT = 45;
  const pack = V8.WORD_PACK;
  if (!pack || !Array.isArray(pack.words) || !pack.words.length) {
    throw new Error('js/data/words.js must define a non-empty V8.WORD_PACK.words array');
  }
  const invalidWord = pack.words.find(word => !word || typeof word.e !== 'string' || !Array.isArray(word.c) || !word.c.length);
  if (invalidWord) throw new Error('Each word needs { e, p, c[] } fields in js/data/words.js');
  const TOTAL_LEVELS = Math.ceil(pack.words.length / LEVEL_SIZE);
  const WORDS_PER_LEVEL = LEVEL_SIZE;

  /** Return the zero-based slice and 1-based word range for a level. */
  function getLevelRange(levelNumber, sourcePack) {
    const source = sourcePack && Array.isArray(sourcePack.words) ? sourcePack : pack;
    const total = Math.max(1, Math.ceil(source.words.length / LEVEL_SIZE));
    const level = Math.max(1, Math.min(total, Math.floor(Number(levelNumber) || 1)));
    const start = (level - 1) * LEVEL_SIZE;
    const end = Math.min(source.words.length, start + LEVEL_SIZE);
    return { level, start, end, startWord: start + 1, endWord: end, count: Math.max(0, end - start) };
  }

  function getWordsForLevel(levelNumber, sourcePack) {
    const source = sourcePack && Array.isArray(sourcePack.words) ? sourcePack : pack;
    const range = getLevelRange(levelNumber, source);
    return source.words.slice(range.start, range.end);
  }

  function getChallenge(challengeId) {
    if (typeof challengeId === 'number') return CHALLENGES[challengeId] || null;
    return CHALLENGES.find(challenge => challenge.id === challengeId) || null;
  }

  function createRunDefinition(levelNumber, challengeId, sourcePack) {
    const challenge = getChallenge(challengeId) || BASE_CHALLENGES[0];
    const range = getLevelRange(levelNumber, sourcePack);
    return Object.assign({}, range, challenge, { words: getWordsForLevel(levelNumber, sourcePack) });
  }

  const LEVEL_CATALOG = Array.from({ length: TOTAL_LEVELS }, (_, index) => {
    const range = getLevelRange(index + 1);
    return Object.assign({}, range, { title: `第 ${index + 1} 关`, challenges: CHALLENGES.map(challenge => challenge.id) });
  });

  // ── World configs (canvas background) ──────────────────
  function hx(h) {
    return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
  }

  const WORLDS = [
    { // W0: 黎明冲刺
      name: '黎明冲刺', icon: '🚀', bgm: 1,
      sky: [hx('#020617'), hx('#0a1a3a'), hx('#1e3a5f'), hx('#6b3a24'), hx('#ff9a3c')],
      starA: .75, sun: 1, road: hx('#ffb347'), vSpeed: 1,
      layers: [
        { kind: 'hills', col: [9,16,40], spd: .12, hf: .10, seed: 11 },
        { kind: 'hills', col: [13,22,54], spd: .3, hf: .17, seed: 23 },
        { kind: 'hills', col: [5,8,20], spd: .62, hf: .26, seed: 37 },
      ],
    },
    { // W1: 霓虹都市
      name: '霓虹都市', icon: '🚀', bgm: 2,
      sky: [hx('#0d0218'), hx('#1a0b2e'), hx('#2b0f45'), hx('#3b1155'), hx('#12041f')],
      starA: .28, neon: 1, road: hx('#ff2d95'), vSpeed: 1.25,
      layers: [
        { kind: 'city', col: [26,10,48], spd: .14, hf: .30, win: 0, seed: 5 },
        { kind: 'city', col: [15,5,31], spd: .34, hf: .42, win: 1, seed: 9 },
        { kind: 'city', col: [7,2,15], spd: .7, hf: .58, win: 2, seed: 14 },
      ],
    },
    { // W2: 深渊坠落
      name: '深渊坠落', icon: '🔥', bgm: 3,
      sky: [hx('#0c020a'), hx('#1a0510'), hx('#2b0716'), hx('#3d0a1e'), hx('#12030c')],
      starA: .12, vertical: 1, bolt: 1, road: hx('#ff3b30'), vSpeed: 1.1,
      layers: [
        { kind: 'walls', col: [32,9,22], spd: .18, seed: 3 },
        { kind: 'walls', col: [21,5,14], spd: .42, seed: 7 },
        { kind: 'walls', col: [11,2,8], spd: .8, seed: 12 },
      ],
    },
    { // W3: 星空决胜
      name: '星空决胜', icon: '🌟', bgm: 4,
      sky: [hx('#01020a'), hx('#030512'), hx('#060a24'), hx('#0a1030'), hx('#02030f')],
      starA: 1, nebula: 1, road: hx('#7ab8ff'), vSpeed: 1.55, layers: [],
    },
    { // W4: 魔法森林 (optional plugin)
      name: '魔法森林', icon: '🍃', plugin: 'forest', charMode: 'run', bgm: 5,
      sky: [hx('#020c0d'), hx('#061d1b'), hx('#0b3429'), hx('#17513b'), hx('#427653')],
      starA: .08, baseStars: false, baseMotes: false, road: hx('#a7ff9a'), vSpeed: 1.08,
      layers: [
        { kind: 'hills', col: [6,31,28], spd: .13, hf: .08, seed: 101 },
      ],
    },
    { // W5: 极光冰原 (optional plugin)
      name: '极光冰原', icon: '❄️', plugin: 'ice', charMode: 'skate', bgm: 6,
      sky: [hx('#010b1d'), hx('#08253f'), hx('#124f68'), hx('#287c88'), hx('#8fc8d0')],
      starA: .42, baseMotes: false, road: hx('#d7fbff'), vSpeed: 1.34, layers: [],
    },
    { // W6: 赛博雨夜 (optional plugin)
      name: '赛博雨夜', icon: '💧', plugin: 'cyber', charMode: 'skate', bgm: 7,
      sky: [hx('#040812'), hx('#0a1025'), hx('#11183a'), hx('#1d1640'), hx('#080916')],
      starA: 0, baseStars: false, baseMotes: false, neon: 1, road: hx('#47efff'), vSpeed: 1.30,
      layers: [
        { kind: 'city', col: [10,18,40], spd: .14, hf: .30, win: 0, seed: 211 },
        { kind: 'city', col: [6,10,27], spd: .34, hf: .43, win: 1, seed: 223 },
        { kind: 'city', col: [3,5,17], spd: .70, hf: .58, win: 2, seed: 239 },
      ],
    },
    { // W7: 深海迷踪 (optional plugin)
      name: '深海迷踪', icon: '🕊', plugin: 'sea', charMode: 'skate', bgm: 8,
      sky: [hx('#010817'), hx('#06162d'), hx('#0a2d49'), hx('#155872'), hx('#4b8f98')],
      starA: 0, baseStars: false, baseMotes: false, road: hx('#bfffff'), vSpeed: 1.14, layers: [],
    },
    { // W8: 樱落庭院 (optional plugin)
      name: '樱落庭院', icon: '🌸', plugin: 'sakura', charMode: 'run', bgm: 9,
      sky: [hx('#1a1027'), hx('#4a3156'), hx('#8b6177'), hx('#d59bad'), hx('#f5c9ce')],
      starA: 0, baseStars: false, baseMotes: false, road: hx('#ffbad3'), vSpeed: 1.03,
      layers: [],
    },
  ];

  // Every ten answers can rotate through every available skin. Extra skins are
  // optional plugins; a missing plugin still falls back to the base renderer.
  const WORLD_ROTATION = WORLDS.map((world, index) => index);
  function charModeFor(phase) {
    const world = WORLDS[phase];
    return (world && world.charMode) || CHAR_MODE[phase] || 'run';
  }

  // ── BGM tracks ────────────────────────────────────────
  const configURL = document.currentScript && document.currentScript.src;
  const gameRoot = configURL ? new URL('../../', configURL).href : '../';
  const bgmRoot = gameRoot + 'bgm/';
  // The menu is group 0; each world owns a two-track group (1-9).
  const BGM = [
    { n: '忧郁 · 主页面', s: bgmRoot + 'menu-melancholy.mp3', gain: .75 },
    { n: '黎明之龙 · 黎明冲刺', s: bgmRoot + 'world-dawn.mp3' },
    { n: '嘻哈 · 霓虹都市', s: bgmRoot + 'world-neon.mp3' },
    { n: '地狱 · 深渊坠落', s: bgmRoot + 'world-abyss.mp3' },
    { n: '星空 · 星空决胜', s: bgmRoot + 'world-starfield.mp3' },
    { n: '静谧 · 魔法森林', s: bgmRoot + 'world-forest.mp3' },
    { n: 'Escaping the Collapsing Universe · 极光冰原', s: bgmRoot + 'Escaping_the_Collapsing_Universe.mp3' },
    { n: '阴雨之日 · 赛博雨夜', s: bgmRoot + 'world-cyber.mp3' },
    { n: '海洋 · 深海迷踪', s: bgmRoot + 'world-sea.mp3' },
    // The Sakura theme is the Conan/Haibara-flavored track requested for a
    // stronger presence. The audio engine caps the resulting volume at 1.0.
    { n: '樱花美好 · 樱落庭院', s: bgmRoot + 'world-sakura.m4a', gain: 2 },
    { n: '忧郁看透 · 主页面备用', s: bgmRoot + 'menu-melancholy-alt.m4a' },
    { n: '紧迫 · 黎明冲刺备用', s: bgmRoot + 'world-dawn-tense.mp3' },
    { n: '忍者逃跑 · 霓虹都市备用', s: bgmRoot + 'world-neon-ninja.mp3' },
    { n: '阴森可怖 · 深渊坠落备用', s: bgmRoot + 'world-abyss-scary.mp3' },
    { n: 'faded · 星空 / 冰原备用', s: bgmRoot + 'world-star-faded.mp3' },
    { n: '左窜右逃 · 赛博雨夜备用', s: bgmRoot + 'world-cyber-chase.m4a', gain: 2 },
    { n: 'Volatile Reaction · 未启用', s: bgmRoot + 'Volatile_Reaction.mp3' },
    { n: 'Overworld · 樱落庭院备用', s: bgmRoot + 'Overworld.mp3' },
  ];
  const BGM_GROUPS = [
    [0, 10], [1, 11], [2, 12], [3, 13], [4, 14],
    [5], [6, 14], [7, 15], [8, 5], [9, 17],
  ];

  // ── Pixel character palette & maps ─────────────────────
  const PAL = {
    H: '#45e6ff', D: '#101838', E: '#eaffff', A: '#2a6df4',
    G: '#ffd700', C: '#ff2d95', B: '#0a1440', W: '#bff6ff',
  };

  const CHAR_MAPS = {
    A: ["....HHHHHH..","...HHHHHHHH.","...HDDDDDEH.","...HDDDDDDH.","....HHHHHH..",".....GGGG...","...AAAAAA...","..AAAWAAA...","..AAGGGAAA..",".C.AAAA..A..",".CC.AAAAA...","..C.BBBB....","...BB..BB...","..BB....BB..","..B......B..","............"],
    B: ["....HHHHHH..","...HHHHHHHH.","...HDDDDDEH.","...HDDDDDDH.","....HHHHHH..",".....GGGG...","...AAAAAA...","..AAAWAAA...","..AAGGGAAA..",".C.AAAA..A..",".CC.AAAAA...","..C.BBBB....","...BBBBB....","....BBBB....",".....BB.....","....B..B...."],
    J: ["....HHHHHH..","...HDDDDDEH.","...HDDDDDDH.","....HHHHHH..",".....GGGG...","...AAAAAA...","..AAAWAAA...","..AAGGGAAA..",".CCAAAA..A..",".CC.AAAAA...","CC...BBB....",".....BB.B...","......B..B..",".......B....","............","............"],
    F: ["....HHHHHH..","...HDDDDDEH.","...HDDDDDDH.","....HHHHHH..",".....GGGG...","...AAAAAA...","..AAGGGAAA..",".CCAAAA..A..",".CC.AAAAA...","CC...BBB....",".....BB.B...","......B..B..",".......B....","............","............"],
    G: ["....HHHHHH..","...HDDDDDEH.","...HDDDDDDH.","....HHHHHH..",".....GGGG...","...AAAAAA...",".CAAWAAAAC..","CCAAGGGGACC.",".CCAAAAACC..","..CAAAAAC...","....BBBB....",".....BB.B...","......B..B..",".......B....","............"],
    P: ["....HHHHHH..","...HDDDDDEH.","...HDDDDDDH.","....HHHHHH..",".....GGGG...",".A.AAAAAA.A.",".A.AAWAAA.A.","..AAGGGAAA..","..CAAAAA....","..C.AAAAA...","...BBBBB....","....BBB.....","....B.B.....","...BB.BB....","............"],
    S: ["....HHHHHH..","...HDDDDDEH.","...HDDDDDDH.","....HHHHHH..",".....GGGG...","...AAAAAA...","..AAAWAAA...","..AAGGGAAA..",".CCAAAA..A..",".CC.AAAAA...","...BBBBB....","....B...B...","....B...B...","....B...B...","............"],
    H: ["....HHHHHH..","...HHHHHHHH.","...HDDDDDEH.","...HDDDDDDH.","....HHHHHH..",".....GGGG...","...AAAAAA...","..AAAWAAA...","..AAGGGAAA..",".C.AAAA..A..",".CC.AAAAA...","..C.BBBB....","...BBBBB....","....B..B....","............","............"],
  };

  // ── Skill definitions ──────────────────────────────────
  const SKILLS = [
    {
      id: 'freeze', name: '冻结', icon: '❄', comboReq: 5,
      desc: '暂停计时 3 秒', key: '1', duration: 3000,
      fx: 'vortex', // 时空漩涡
    },
    {
      id: 'double', name: '双倍', icon: '×2', comboReq: 10,
      desc: '下一词分数翻倍', key: '2', duration: 0,
      fx: 'coinRain',
    },
    {
      id: 'skip', name: '跳过', icon: '⏭', comboReq: 15,
      desc: '展示答案后跳过当前词', key: '3', duration: 0,
      fx: 'daolang',
    },
  ];

  // ── Rank thresholds ────────────────────────────────────
  function rankFromStats(score, maxCombo, mistakes) {
    let grade;
    if (mistakes === 0 && maxCombo >= 20 && score >= 400) grade = 'S';
    else if (mistakes <= 1 && maxCombo >= 15 && score >= 300) grade = 'A';
    else if (mistakes <= 2 && maxCombo >= 10 && score >= 200) grade = 'B';
    else if (mistakes <= 3 && maxCombo >= 5 && score >= 120) grade = 'C';
    else grade = 'D';

    const labels = { S: '完美通关', A: '优秀', B: '良好', C: '及格', D: '继续努力' };
    const colors = { S: '#ffd700', A: '#ff4444', B: '#45e6ff', C: '#aaa', D: '#666' };
    return { grade, label: labels[grade], color: colors[grade] };
  }

  V8.CFG = {
    LV_DEF, LV_BTN, SIGN_DIR, CHAR_MODE, charModeFor,
    BASE_CHALLENGES, RANDOM_CHALLENGES, CHALLENGES,
    TIME_LIMIT, LEVEL_SIZE, TOTAL_LEVELS, WORDS_PER_LEVEL,
    LEVEL_CATALOG, getLevelRange, getWordsForLevel, getChallenge, createRunDefinition,
    WORLDS, WORLD_ROTATION, BGM, BGM_GROUPS,
    PAL, CHAR_MAPS,
    SKILLS,
    rankFromStats,
  };
})(window.V8 = window.V8 || {});
