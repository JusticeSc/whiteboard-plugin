# 画板 v3（`@local/whiteboard` 3.0.0）

**v3 已实现**：画板常驻 DSH 原生右侧栏；选中对象后，主输入框上方出现引用 chip，
点一下把选区作为**原生引用**放进正常输入框；模型用 `whiteboard_read_selection` /
`whiteboard_replace_selection` 读写画板。会话里只有文字与图片——没有第二输入框、
没有临时会话、没有自定义会话卡片、没有 `conversation.view`。

决策见 [`docs/DECISIONS.md`](docs/DECISIONS.md)，架构见
[`docs/adr/0003-canvas-agent-bridge.md`](docs/adr/0003-canvas-agent-bridge.md)，
验收见 [`docs/ACCEPTANCE-v3.md`](docs/ACCEPTANCE-v3.md)。
v1（`../whiteboard-plugin`）原样保留，回滚只需把 profile 链接指回它并重启。

> **发布/交接入口**：[项目上下文](docs/PROJECT-CONTEXT.md) ·
> [发布说明与检查清单](docs/RELEASE-v3.0.0.md) ·
> [下一阶段路线（canvas-first）](docs/ROADMAP-v4.md) ·
> [文档索引](docs/INDEX.md) · [CHANGELOG](CHANGELOG.md)。
> 当前版本 `3.0.0`；源码 Git 基线（MIT + `v3.0.0` tag）已建立，远端仓库/npm 待定（见发布说明 §4）。

> **2026-11-04 实机修复**：① 主输入框上方的引用 chip 现在与输入框卡片左缘对齐——窄栏跟随 16px
> 内缩，宽栏（右栏收起/大窗口）跟随居中卡片（`max-width: var(--dsh-composer-card-max-width)`）的
> 实际内缩，由 dock 动态测量 + ResizeObserver 保持；② 聊天记录里的用户消息不再只剩引用 chip——
> 发送消息渲染规则只匹配引用块、把行尾输入指令留给文本节点，历史消息刷新后也会显示「chip + 指令」；
> ③ 文字对象内容被模型改写后，选中框/命中/框选按当前文字实时测量，不再沿用旧文字的宽度；
> ④ 「品牌色」改用主题的 business-primary 品牌蓝（亮色 #4176e6 / 暗色跟随主题），不再和墨色一样是近黑色。
> 刷新 3080 页面即加载新 client，无需重启。证据见 [`docs/evidence-v3/`](docs/evidence-v3/) 的
> `live-before/after-alignment.png`、`live-wide-column.png`、`live-instruction.png`、
> `live-text-selection.png`、`live-brand-swatch.png`、`v3-05-sent.png`。

## 两块 + 一个薄承载

**画板本体**（沿用 v2 数据层）：Host 权威文档 `{id, name, rev, elements, changes}`，
元素级 `rev`/`fieldRevs`，字段级合并（人类胜），append-only 历史，人类按操作撤销、
AI 按轮撤销；每个会话记住自己的 `lastCanvasId`，可切换/新建/重命名/删除画板。

**桥接**（v3 新增）：

1. 画板 tab 把「当前画板 + 非笔迹选区」发布到按会话隔离的桥接 store；
2. 主输入框上方出现 dock chip：「◈ 画板选区 · N 个对象」；
3. 点击 → `sessions.scope(id).get('conversation').input.for(scope)` 拿到输入框 shell（可选「附带选区快照」开启时，同时把选区渲染成 PNG 走 `conversation.createDrafts` + `addAttachments` 进草稿），
   `captureInsertion()` + `insertReference()` 插入**原生 chip**（失败则降级为 typed 短标记）；
4. 发送时 `inputTriggers` 的 `codec.serialize` 把引用翻译成模型可读文本：
   `【画板选区引用】<画板名> · N 个对象 · rev R · canvasId <id>` + 每对象一行
   （id/类型/位置/尺寸/颜色（hex+调色板名）/文本或端点；>20 个对象改为摘要 + 要求模型先 `read_selection`）；
5. `uiConversation.userText.register` 的规则把**整块**（表头 + 连续对象行）在已发送消息里
   渲染成一个紧凑 chip `◈ 画板选区 · N 个对象`；
6. 模型工具：`whiteboard_read_selection`（读翻译 + lossless JSON）与
   `whiteboard_replace_selection`（`expectRev` 原子写，patch/inserts，字段级人类胜冲突，`ai_disabled` 拒绝）。

**AI 开关**：画板头栏的「AI」按钮，粒度 =（画板 × 会话），默认开；关闭后入口收起，Host
对两个工具都返回 `ai_disabled`（关闭 = 不读不改）；状态存 Host `session_pref.aiByCanvas`，刷新仍在。

**可选快照**：画板头栏的图像按钮（默认关）开启后，插入引用时会把当前选区（不含笔迹）渲染成一张
PNG 作为原生图片附件加入同一草稿；会话里同时出现引用 chip 与图片，模型两者都能看到。

## 目录

```
index.js                     Host 入口：注入 tools + storage，挂 /api/whiteboard/v2，注册两个 v3 工具
host/constants.js            限制、枚举、存储单元描述符
host/model.js                CanvasDoc 纯模型 + sanitize/normalize + hex→调色板颜色归一化
host/claims.js               内存 claim 表（v2 兼容保留；v3 原子写内部使用）
host/store.js                storage hub 持久化：canvas / session_pref / global
host/engine.js               单写入者：默认画板、幂等 /op、模型读/写选区、session_pref 合并
host/routes.js               HTTP 面（画板 CRUD、导出、导入、健康检查、session-pref）
host/tools.js                模型工具 v3（无 claimId；read 翻译；replace 原子写 + AI 开关）
client.js                    浏览器端：Canvas 纯函数 + WhiteboardPage + 右侧栏 tab + 引用 chip 桥接
test/smoke.mjs               Host 单测/冒烟（216 项）
test/client-smoke.mjs        客户端纯逻辑 + 注册面（105 项）
test/e2e/v3.mjs              隔离 DSH_HOME 的真实 Chrome/模型端到端（不写真实 store）
test/e2e/install-rollback.mjs 安装/回滚探针（隔离 throwaway host）
cordis.patch.yml             安装为 bundle 时插入 id `whiteboard` / name `@local/whiteboard`
docs/ACCEPTANCE-v3.md        v3 人工验收清单（用户执行）
docs/ACCEPTANCE.md           v2 历史验收（已被 ADR-0003 取代）
docs/PROJECT-CONTEXT.md      一页式项目上下文（接手/发布必读）
docs/INDEX.md                文档索引（权威/历史/证据）
docs/RELEASE-v3.0.0.md       发布说明、发布前决策与检查清单
docs/ROADMAP-v4.md           下一阶段 canvas-first / 自动画图路线
docs/DECISIONS.md            v3 决策总表（唯一权威）
CHANGELOG.md                 版本变更记录
docs/adr/0003-canvas-agent-bridge.md   v3 架构：右侧栏承载 + 选区引用桥接
docs/evidence-v3/            P0 spike 结论/截图 + v3 e2e 结果/截图
scripts/install-v3.ps1       把 profile 的 @local/whiteboard 指向本目录（重启后生效）
scripts/rollback-v1.ps1      把 profile 指回 ../whiteboard-plugin（一步回滚）
scripts/spike-env.ps1        隔离 DSH_HOME + 端口起 dsh web（手工排查/复现 e2e 环境）
```

## 测试

```powershell
cd <path-to>\whiteboard-plugin-v2
npm test                      # = node test/smoke.mjs && node test/client-smoke.mjs
# 期望：216 checks passed / SMOKE OK；105 checks passed / CLIENT SMOKE OK
```

端到端（隔离，不碰 3080、不写真实 `DSH_HOME`）：

```powershell
cd <path-to>\whiteboard-plugin-v2
node test/e2e/v3.mjs
# 自起隔离 DSH_HOME（<workspace>\.spike-e2e，每次跑前清空）+ 端口 3092，
# 真实 Chrome，4 个真实模型回合（引用 / 快照 / 模型改画板+撤销 / AI 关拒绝）；结束时对比真实 store 快照（零写入）。
# 期望输出：E2E V3 OK（exit 0）
```

e2e 覆盖：新建会话 → 从右栏引导页打开「画板」→ 断言右栏只有一个画板根、无旧
`conversation.view` → 画两个矩形并在 Host 侧确认 2 个元素 → 框选 → dock chip（断言 chip 与输入框左缘对齐）→
插入原生 chip → 发送并确认「模型回复 + 会话里整块渲染为 chip、无原文泄漏」→
切到文件 tab 再切回画板（断言 keepMounted 且选区与画布仍在）→
AI 开关关闭/开启（断言按钮状态、dock 隐藏/恢复、`/session-pref` 写入与读回）→
模型 `whiteboard_replace_selection` 把两个矩形改成蓝色（断言 rev、颜色、provenance toast）→ 点 toast「撤销」回退（断言颜色恢复）→
关闭 AI 开关后让模型改画板（断言 Host 拒绝、画布颜色与 rev 不变）→ 重新开启 AI → 
删除输入框里的引用 chip（断言 dock 在 400ms 内重新可插入，再插一次仍只有 1 个 chip）→
刷新页面（断言画板 tab 仍挂载可见、画布重挂载、AI 开关保持开启、历史消息里的引用 chip 仍正常渲染）→
快照开关开启 → 插入引用 → 草稿出现图片预览 → 发送后消息里同时有 image 与引用 chip →
缩到 900×700 窄窗（断言 dock 仍对齐、画板工具栏换行无横向溢出）→
真实 store 零写入 → 0 pageerror/console error。

## 安装 / 切换 / 回滚

**切换（需用户重启 3080 后生效）**

```powershell
cd <path-to>\whiteboard-plugin-v2
powershell -ExecutionPolicy Bypass -File scripts\install-v3.ps1
# 确认输出 "installed @local/whiteboard -> ...whiteboard-plugin-v2"
# 然后由用户停掉旧 dsh web 进程并重新启动（会结束当前会话）
```

**回滚（一步）**

```powershell
powershell -ExecutionPolicy Bypass -File scripts\rollback-v1.ps1
# 把 profile 链接指回 ..\whiteboard-plugin，重启 3080 即回到 v1
```

两个脚本只改 profile 的 `node_modules/@local/whiteboard` 链接（junction），不删 v1 目录、
不动 3080 进程。脚本是幂等的，可反复执行。

## 在 GUI 里使用（v3）

1. 打开/新建会话，展开右侧栏；空右栏的引导页点「画板」（之后右栏 tab 会保留，切会话/切 tab 不丢）。
2. 画板：工具（选择/抓手/画笔/矩形/圆/箭头/文字）、颜色、撤销/重做/清空、缩放/适配、
   JSON 导入/导出、PNG 导出；左上画板下拉可新建/重命名/删除/切换（每个会话记住最后一张）。
3. 用「选择」框选对象 → 输入框上方出现「◈ 画板选区 · N 个对象」→ 点击插入引用 →
   在正常输入框里补一句话后发送。会话里显示为一个紧凑引用 chip；模型可读/改画板。
4. 画板头栏「AI」开关按（画板 × 会话）生效；关闭后不能再交给该会话的 AI。旁边的图像按钮是
   「附带选区快照」（默认关）：开启后插入引用会同时附一张选区图片（会话里是一条 image）。
5. 数据在 Host，刷新/重开浏览器后仍在；不依赖 localStorage。

## 限制与已知问题

- **单用户、本机**：没有账号/多人同步；跨设备只是数据模型预留。
- **默认画板共享**：新会话在未创建/切换自己的画板前打开 Host 默认画板（v2 起行为，S5）；
  会话通过 `lastCanvasId` 记住自己的画板。
- 右侧栏默认宽度约 575px（窄栏优先设计）；「全屏」为原生逃生口；极窄窗口 DSH 会收起右栏。
- 同步是 600ms 轮询（`/sync?canvasId&sinceRev`）；不是流式。
- 引用 chip 的 marker 为原生 `@`（扩展来源默认外观），label 正确。
- 「附带选区快照」开关默认关，只保留在当前页面挂载态（不持久化）；关闭后不再附图片。
- 规模上限见 `host/constants.js` 的 `LIMITS`；超限会被拒绝并提示。
- 旧 v1 的 `localStorage` key 保留但不再读取，不做迁移（用户已确认破坏式更新）。

## License

[MIT](LICENSE)。
