# CET-6 单词跑酷博客版 v13

这是可直接部署到 Hexo `source/cet6-game/` 的完整词表游戏。入口为 `index.html`，包含 5523 词、111 个 50 词窗口、九个世界、龙伙伴、本地 BGM 和共享解锁表，不依赖服务器接口。

## 部署

在 Hexo `_config.yml` 中保留：

```yaml
skip_render:
  - "cet6-game/**"
```

Hexo 会原样复制本目录的 HTML、JavaScript、CSS、图片与音频。构建部署后访问 `/cet6-game/`。

## 词表与进度

- `data/words.js`：由 CET-6 工作簿 B（英文）、C（音标）、E（重点释义）生成。
- `data/progress.js`：可随代码跨设备同步的共享解锁基线，目前开放至第 10 关。
- 设备上的后续记录保存在 `localStorage`。v13 首次读取时会迁移旧博客版和 v12 的同词表进度及偏好，并兼容 v11 的开始皮肤与通用偏好；之后统一写入 `cet6_v13_` 键。
- 要跨设备同步新增进度，请更新 `data/progress.js` 的 `completed`，再重新部署本目录。

挑战顺序为英译汉正序、英译汉逆序；完成两项后开放英译汉随机和汉译英正序；随后依次开放汉译英逆序与随机。

## 本地检查

直接打开 `index.html`，或在本目录运行：

```bash
python3 -m http.server 8123
```

修改后检查桌面 1440x900、手机 390x844、开始页、选关、复习、世界转场、结算及 BGM。v12 审计项的修复和回归结果见 `PROBLEM.md`；规范版本保存在 `tasks/cet6/templates/game_v13/`。
