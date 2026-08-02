# CET-6 单词跑酷博客版

这是可直接放入 Hexo `source/cet6-game/` 的静态游戏。入口是 `index.html`，不再依赖 Day/Section 路由或服务器端接口；词表、音乐、图片和引擎都在本目录内。

## 词表与选关

`data/words.js` 是由 CET-6 工作簿 B（英文）、C（音标）、E（重点释义）生成的 JSON 风格词表。当前共 5523 词，按 50 词切成 111 个词窗，最后一窗为 5501-5523 的 23 词。开始页显示可解锁词窗：完成当前词窗的英译汉正序和逆序后，下一词窗开放，自定义范围上限同步增加（例如开放到第 3 窗即可选择 1-150）。

每个词窗提供英译汉/汉译英的正序和逆序；完成同一方向的正逆序后，对应随机挑战解锁。进度使用词表指纹隔离并保存于浏览器 `localStorage`，替换词表会自动得到独立进度。

## 本地检查

可直接双击 `index.html` 打开。模拟博客目录也可使用：

```bash
cd tasks/blog-cet6-source/cet6-game
python3 -m http.server 8123
```

修改词表后重新生成：

```bash
/Users/focus/miniconda3/bin/python tasks/cet6/scripts/gen_blog_words.py
```

## 部署到 Hexo

将整个 `cet6-game/` 复制到博客的 `source/`，并在 `_config.yml` 中加入：

```yaml
skip_render:
  - "cet6-game/**"
```

构建后访问 `/cet6-game/`。该配置让 Hexo 原样复制 HTML、JS、CSS、BGM 和 GIF，不会把它们当作文章渲染。

## 目录说明

- `index.html`：博客入口和选关界面。
- `data/words.js`：全量词表数据。
- `js/`：游戏引擎、世界皮肤、音频和进度逻辑。
- `css/`：开始页、选关页、游戏 HUD 与转场样式。
- `assets/`、`bgm/`：本地视觉与音频资源。
- `PROBLEM.md`：仅记录待实际体验确认的问题，不在本次部署中自动修复。
