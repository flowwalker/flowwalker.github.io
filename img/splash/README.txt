欢迎浮层风景图存放目录
========================

风景图放在本目录（/img/splash/），按「时段名 + 序号 .jpg」命名：

  morning1.jpg ~ morning5.jpg       清晨   5:00 – 11:00
  afternoon1.jpg ~ afternoon6.jpg   午后  11:00 – 17:00
  dusk1.jpg ~ dusk12.jpg            黄昏  17:00 – 19:00
  evening1.jpg ~ evening6.jpg       傍晚  19:00 – 22:00
  night1.jpg ~ night16.jpg          深夜  22:00 – 次日 5:00

新增图片：把文件按规则命名后放入本目录，然后打开
/source/js/welcome-splash.js，把 IMAGES 里对应时段的
pool('时段名', 数量) 的数量改大即可，每时段随机抽一张。

说明：
- 若某时段图片缺失或加载失败，会自动回退为该时段的
  渐变色背景，不会裂图、不会报错。
- 建议图片宽度 ≥ 1200px，横向构图。
- 时段划分可在 welcome-splash.js 的 currentPeriod() 中调整。
