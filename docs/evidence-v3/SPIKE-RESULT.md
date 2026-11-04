# P0 Spike 结论（DSH 承载面验证）

> 状态：**通过（无降级）** · 日期：2026-11-04 · 环境：隔离 `DSH_HOME` + 独立端口 3091，真实 Chrome，真实模型回合
> 插件：一次性 mock `@local/wb-spike`（**已删除，不进入发布物**） · 记录：[`probe-result.json`](probe-result.json)
> 复现：无法原样复现（一次性插件/脚本已删）；等价的承载面验证见 `test/e2e/v3.mjs`（用真实插件）。

## 1. 结论

v3 依赖的全部 DSH 承载面均可用，**不需要回退到 `conversation.view`，也不需要 typed `insertText` 降级**：

| # | 检查项 | 结果 | 关键证据 |
|---|---|---|---|
| 1 | 右栏 tab 注册/打开/`keepMounted` | 通过 | `sidebarRightTabs.register({id,kind,priority:'extension',keepMounted:true,title})` + keyed `sidebar.right.pane.tab`（及 `.title`）注册成功；dock 按钮打开 tab；切到内置 files tab 后本 tab body 仍挂载（`mounted:true, visible:false, preview state 保留`），切回后状态仍在 → `shots/inspect-keep.png`、`probe.keepMounted` |
| 2 | 默认宽度可用 | 通过（带注） | 1280×800 下默认 575px，1280×720 下同为 575px；原生“全屏”后 1279px → `probe.width`、`shots/01-tab-open.png`（条目见表下注 A） |
| 3 | composer dock 可达会话输入 | 通过 | `conversation.input.dock` 注册后空白态与会话内都渲染；拿到 `sessionId`，经 `sessions.scope(id).get('conversation').input.for(scope)` 得到 shell；`captureInsertion()` 可用 → `shots/01-tab-open.png`、`probe.chipInsert` |
| 4 | 引用 chip 插入 | 通过 | `shell.insertReference(ref, span)` 返回 true；DOM 为原生 `span[data-composer-chip="wb-spike"]` 内含 `q44v1G_reference` chip（marker `@` + label）→ `probe.chipInsert`、`shots/02-preview.png`（注 B） |
| 5 | 序列化（codec） | 通过（端到端） | `inputTriggers.registerSource({trigger,name,codec:{clipboardText,serialize}})` 生效；发送含 chip 的消息后模型原样回显 `【画板选区引用】默认画板 · 3 个对象 · rev 7` + 对象行 → `probe.send.modelEchoedHeader`、`shots/04-sent.png`（注 C） |
| 6 | 已发送消息 userText 渲染 | 通过 | `uiConversation.userText.register({match})` 整块匹配（header + 连续 `- ` 对象行）→ 会话里显示单个 `◈ 画板选区 · 3 个对象` 标签，无原文/对象行泄漏（`chips:1, rawHeader:false`）→ `shots/inspect-block-chip.png` |
| 7 | 图片附件 | 通过 | `conversation.createDrafts(sessionId,[File])` + `shell.actions.addAttachments(ids)`；发送后 transcript 出现 1 个 `img`（blob: URL）→ `probe.image`、`shots/inspect-image-sent.png` |
| 8 | `replace_selection` 原子写 + stale | 通过 | 同一回合两次调用：第一次 `ok:true rev:1 applied e1.x`；第二次同参 `stale_revision rev:1` → `probe.tool.calls`、`shots/05-tool.png` |
| 9 | per-(canvas×session) AI 开关（Host 强制） | 通过 | 关掉后 Host 对 `wb_spike_status` / `wb_spike_replace` 均返回 `ai_disabled`，模型只能转述错误 → `probe.aiSwitch`、`shots/06-ai-off.png`（注 D） |
| 10 | 停止回合 `remote.session.cancel` | 通过 | `cancel({sessionId})` → `{ok:true,value:{accepted:true}}`；原生停止按钮 `[aria-label="停止生成"]` 在 89ms（inspect7）/432ms（final probe）内消失，正文不再增长 → `probe.cancel`、`shots/inspect-keep-cancel.png` |
| 11 | 模型视角调试面板可读 | 通过 | tab body 实时显示 host `rev/elements/aiEnabled` 与最近工具调用结果（人工可读，无控制台错误）→ `shots/01..07` |

全程 0 `pageerror`、0 console error。

## 2. 对决策的影响

- **B1/B2 保持**：右栏 tab 是承载面，单一会话入口不动；无需临时会话/会话卡片。
- **B7 保持**：原子写由 Host 内部 claim 完成，模型只传 `expectRev`；stale 返回可读错误（已验证）。
- **B11 保持（不启用降级）**：原生 chip 插入可用；`codec.serialize` 在提交路径被调用（模型回显为证）。
- **B12 保持**：`userText` 规则可用；**规则需匹配整块**（header + 对象行），只匹配首行会把对象行留在会话里（spike 第一版即如此，已修）。
- **S1 保持**：`keepMounted: true` 生效，切 tab 不丢画布状态。
- **S6 保持**：默认 575px 偏窄但可读；全屏 1279px 作为原生逃生口。M1 里画布按窄栏优先设计，同时保留“全屏”入口。
- **C2 完成**：以上 11 项即 C2 退出标准（多出 keepMounted/模型视角两项）。

## 3. 注意 / 交接到 M1 的事项

- **注 A（宽度）**：575px 画布需要 M1 视觉验收（工具栏是否溢出、缩放手感）；全屏按钮的 aria-label 在展开后可能变化，e2e 不要按固定 label 反复点。
- **注 B（chip marker）**：原生 chip 的 marker 由 `appearance` 决定，未知来源默认渲染 `@`。M1 需给画板引用选一个 `appearance`（或接受 `@`）；label 已正确（`画板选区 · N 个对象`）。
- **注 C（内部 API）**：`inputTriggers` 公共服务只暴露 `registerSource`，**没有** `serializeReference`；序列化只发生在提交路径。不要写“直接调 serializeReference”的单测，用“发送 + 模型回显/消息 DOM”验证。
- **注 D（开关粒度）**：spike 的开关是全局 mock；M1 必须按 (canvasId, sessionId) 存 `session_pref`，Host 工具入口校验，UI 与 Host 双端一致。
- **注 E（userText 规则边界）**：规则基于 `【画板选区引用】` 头 + 连续 `- ` 行；用户手工编辑/模型复述不匹配时回退原文（可接受）。
- **注 F（tab 切换测试手法）**：侧栏 tab 无 `role=tab`，按可见 title 文本点击；e2e 里优先用 `data-sidebar-right-tab` DOM 或 dock 按钮，避免依赖内部 class。

## 4. 证据文件

- `01-tab-open.png` … `07-cancel.png`：probe 各阶段截图
- `inspect-block-chip.png`：userText 整块渲染
- `inspect-image-sent.png`：图片附件发送后（会话里是一条 img）
- `probe-result.json`：结构化结果（宽度链、keepMounted、工具调用、AI 开关、取消时序）——
  keepMounted 的“body 在 files tab 下仍 mounted”以该 JSON 的 `probe.keepMounted` 为准（对应截图未随归档保留）

## 5. 清理

- 隔离实例已停止；一次性 spike 插件、probe 脚本与临时 home 已删除。
- `scripts/spike-env.ps1` 保留（手工隔离排查用）；v3 的自动化端到端见 `test/e2e/v3.mjs`。

## 6. 真实 3080 实机审查（2026-11-04，用户重启后授权 agent 全权自查）

用户反馈「引用没有和对话框对齐」，用 ego-browser 在真实 3080 上复现并修复，再走查其余验收项。

| 检查 | 结果 | 证据 |
|---|---|---|
| dock chip 与输入框左边缘 | 第一轮窄栏修复前 chipLeft=282 / editorLeft=296（差 14px），固定 16px 后两者 296；用户随后指出宽窗口仍错位，第二轮改为动态测量卡片 inset | `live-before-alignment.png` / `live-after-alignment.png` |
| 历史消息显示输入指令 | 修复前用户气泡只渲染「◈ 画板选区 · 1 个对象」，输入指令被规则吞掉；严格文法后旧消息即时重渲染为 chip + 「改成黑色」/「改成红色」，新消息的指令另起一行 | `live-instruction.png` / `v3-05-sent.png` |
| 文字内容变化后的选区范围 | 模型把「你好世界」改成 Hello World 后，存储的 w 仍是中文宽度 88；修复后选区/命中/框选按当前文字实时测量，选中框紧贴 Hello World（点击文字右侧不再误选外层矩形） | `live-text-selection.png` |
| 品牌色色板 | 修复前「品牌色」解析为 DSH 品牌文字色 #0f1115（与墨色几乎一样）；改用 business-primary 后实测色板 rgb(65,118,230)=#4176e6，与墨色明显区分 | `live-brand-swatch.png` |
| 引用插入 → 发送 → 消息渲染 | 原生 chip 插入成功；发送后用户消息只显示紧凑标签「◈ 画板选区 · 3 个对象」，无 `【画板选区引用】` 原文；模型回复正常 | `live-sent-chip.png` |
| 快照开关 + 插入 | 开启后插入，输入框出现 1 张 62×62 选区预览（含 3 个矩形），状态「已插入引用，已附带快照」；预览在输入框卡片内对齐 | 实机 DOM 断言（imgs=1, x=307） |
| AI 修改 + 撤销 | 模型调用 `whiteboard_replace_selection` 把 3 个矩形改 `accent`，Host rev 3→4；`Ctrl+Z` 后 rev 4→5、颜色回 `ink` | 实机 `fetch('/api/whiteboard/v2/canvas')` 前后读取 |
| AI 关拒绝写入 | AI 开关关闭后，模型两次调用均返回 `ai_disabled`，画布保持 rev 4 蓝色不变 | `live-ai-disabled.png` |
| 刷新恢复 | reload 后画板 tab、AI 开关、历史消息引用 chip 全部恢复 | 实机 DOM 断言 |
| 原生停止 | 长文生成中点「停止生成」→ 显示「已停止」，无半截画板修改 | `live-stop.png` |
| 画板删除 | 下拉 → 删除 → 原生 confirm 确认后画板消失，自动回退默认画板、画布正常 | 实机 fetch 列表前后对比 |
| 宽栏布局（右栏收起） | 1264×805 收起右栏后输入框卡片居中：修复前 chipLeft=296 / cardLeft=413（差 117px，复现用户截图）；动态 inset 后 chipLeft=cardLeft=413，**delta=0**；随后展开右栏回到 296/296，delta=0 | `live-wide-column.png` / `v3-03b-wide-column.png` |
| 窄窗布局 | 884×687（右栏仅 352px）：dock chip 与输入框左缘仍 delta=0，工具栏 `scrollWidth=clientWidth=352` 自动换行、无横向溢出，页面无横向滚动 | `live-narrow-viewport.png` |
| 导出 JSON / PNG | 实机点击后客户端分别生成 blob（`whiteboard-20261104-0946.json`）与 data:image/png（`whiteboard-2026-11-04-09-46-15.png`）下载，不写 store | 拦截 `HTMLAnchorElement.click` 验证 |
| 文档/磁盘一致性 | 包名 `@local/whiteboard` / 版本 3.0.0、README/STATUS/ACCEPTANCE/DECISIONS/ADR 与磁盘一致；`client.js` 无 `conversation.view`、无旧画布 AI 卡片/输入框标识；guide/dock/`REF_FULL_LIMIT=20` 均在；证据 JSON `delta=0`、`zeroWrite.ok=true` | 28 项脚本检查全 PASS |

备注：画板删除使用原生 `window.confirm`；自动化验收需先把 `window.confirm` 覆盖为 `() => true`，否则 Playwright 的 evaluate 会被对话框阻塞。自查产生的临时画板已删除、临时会话已归档（用户旧测试残留清理仍待确认）。








