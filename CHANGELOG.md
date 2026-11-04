# Changelog

本项目从 v3 开始维护 changelog。版本号遵循 SemVer；v3 为破坏式重写，
不读取 v1 的 localStorage 数据，数据层沿用 v2 canvas 文档（无迁移）。

## 3.0.0 — 2026-11-04

首次公开发布。包含 v3 重写、实机验收与验收后修复。

### Added

- 画板常驻 DSH Web 右侧栏 tab（`sidebar.right.pane.tab`，keepMounted）。
- 画笔/矩形/椭圆/箭头/文字/橡皮，选择/框选/拖动，缩放/重置视图。
- 5 色主题色板（墨色/品牌蓝/红/绿/琥珀）+ 撤销/重做/清空。
- 多画板：新建/切换/重命名/删除、JSON 导入/导出、PNG 导出。
- 选区 → 主输入框上方 dock chip → 原生引用 chip 的桥接。
- 模型工具 `whiteboard_read_selection` / `whiteboard_replace_selection`。
- `expectRev` 原子写、字段级冲突（人类优先）、可读冲突、单步撤销。
- 按（画板 × 会话）AI 开关，客户端 + Host 双侧执行（`ai_disabled`）。
- 可选选区快照图片；原生停止生成；刷新/重启持久化。
- Host 216 项、客户端 105 项自动化检查；隔离 e2e（真实 Chrome/模型）。

### Changed

- v3 重写取代 v1 的 `conversation.view` + 画布内 AI 卡片方案；会话只保留文字/图片。
- 「品牌色」使用主题业务蓝 `--dsw-alias-state-business-primary`
  （亮色 `#4176e6`），不再使用近黑的 `--dsw-alias-brand-primary`。
- 文字元素始终按当前文本实时测量，不再依赖提交时缓存的 `w/h`。

### Fixed

- 引用 chip 与主输入框卡片左缘对齐：窄栏、宽栏（卡片居中）、900×700 窄窗
  三态 `delta=0`。
- 历史用户消息不再只剩引用 chip：引用块按严格文法匹配，行尾指令保留为文本。
- 文字内容被模型改写后，选区框/点击命中/框选范围按新文字测量。
- 「品牌色」与「墨色」几乎相同的问题（近黑 token 改为品牌蓝）。

### Known limits

- 单用户、本机；无多人实时协作。
- 默认画板跨会话共享；600ms 轮询同步。
- 无连接线绑定、分组/帧/图层、图片对象、富文本。
- AI 为 selection-first：无整板引用/自动生成图表；路线见 `docs/ROADMAP-v4.md`。
- 仅在 DSH `0.2.1-rc.5` 实测。
