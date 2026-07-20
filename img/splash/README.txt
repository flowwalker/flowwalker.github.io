欢迎浮层风景图存放目录
========================

把风景图放进本目录（/img/splash/），按时间段命名，例如：

  morning1.png / morning2.png     清晨   5:00 – 11:00
  afternoon1.png / afternoon2.png 午后  11:00 – 17:00
  dusk1.png / dusk2.png           黄昏  17:00 – 19:00
  night1.png / night2.png         夜晚  19:00 – 次日 5:00

然后在 /source/js/welcome-splash.js 顶部的 IMAGES 配置里
把文件名登记到对应数组中即可（可放任意多张，随机抽取）。

说明：
- 若登记的图片不存在，或某时段没有登记图片，
  会自动回退为对应时段的渐变色背景，不会报错。
- 建议图片宽度 ≥ 1200px，横向构图，jpg / png 均可。
- 时段划分可在 welcome-splash.js 的 currentPeriod() 中调整。
