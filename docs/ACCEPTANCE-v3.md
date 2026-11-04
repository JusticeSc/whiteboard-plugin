# Canvas v3 人工验收清单（ACCEPTANCE-v3）

> 适用版本：`@local/whiteboard` 3.0.0（右侧栏承载 + 选区引用桥接）
> 决策依据：[`DECISIONS.md`](DECISIONS.md) · 架构：[`adr/0003-canvas-agent-bridge.md`](adr/0003-canvas-agent-bridge.md)
> 自检证据：[`evidence-v3/`](evidence-v3/)（P0 spike 全部通过、v3 e2e 结果 JSON 与截图）
> 证据隐私：真实会话截图 `live-*.png` 含真实对话上下文，已从公开 Git 排除，只在本机保留；
> 公开仓库使用隔离 e2e 证据，详见 [`evidence-v3/README.md`](evidence-v3/README.md)。

本清单给**用户**在真实 3080 上逐项确认；每项都对应一条自动化证据，用户只需确认“看起来/用起来对”。

## 0. 准备（当前状态：已完成）

1. profile 已指向本目录；3080 已于 **2026-11-04 08:50 由用户重启**，当前运行 v3.0.0。
   （首次安装才需要：`scripts\install-v3.ps1` + 重启 `dsh web`；重启会结束当前会话，必须由用户执行。）
2. 如果页面显示的仍是旧行为，**刷新一次 `http://127.0.0.1:3080`** 即可加载新 client（client 改动不需重启）。
   Host 侧（工具/API）的改动才需要重启，本次 v3 的 Host 已随用户重启生效。

## 1. 承载面（不再有“上边栏消失 / 第二对话框”）

- [ ] 会话页右侧栏可展开；空右栏的引导页里有**「画板」**入口（标题 + 一句描述“手绘草图，选中后可把引用交给 AI”）。
- [ ] 点「画板」后，画板作为**右侧栏 tab** 打开；会话顶部的「对话 / 轨迹」视图 tab 里**没有**「画板」（旧的 `conversation.view` 已移除）。
- [ ] 画板顶部工具栏完整可见、不被裁切；在窄栏（默认约 575px）与「全屏」两种宽度下都不溢出、不遮挡。
- [ ] 切到右栏的「文件 / 终端」tab 再切回「画板」，画布内容、选中状态仍在（`keepMounted`）。
- [ ] 关闭画板 tab 再重开，内容仍在（数据在 Host，不依赖页面内存）。
- [ ] 页面控制台无红色报错。

## 2. 选区 → 引用 chip（唯一入口 = 主输入框）

- [ ] 选择工具框选 2 个对象后，主输入框**上方**出现引用 chip：「◈ 画板选区 · 2 个对象」。
- [ ] dock chip 的左边缘**始终**与输入框卡片左边缘对齐：窄栏跟随 16px 内缩，宽栏（右栏收起/大窗口）跟随居中卡片的内缩；2026-11-04 两轮修复，见 §7 live 证据。
- [ ] 发送带引用的消息后，用户气泡同时显示引用 chip 和实际输入的指令文本（不能只剩 chip）；历史消息刷新后同样恢复显示指令。
- [ ] 文字对象内容被模型改写后，选中框、点击命中与框选范围按新文字测量（不沿用旧文字的宽度）；旧内容/旧消息无需迁移。
- [ ] 颜色板的「品牌色」显示为品牌蓝（与「墨色」明显不同），画出的 accent 对象也是蓝色；模型侧 accent 规范值仍是 `#2f6fed`（蓝色）。
- [ ] 点该 chip：主输入框内出现**原生引用 chip**（marker `@` + 「画板选区 · 2 个对象」），文字仍是可正常输入的文本。
- [ ] 删除输入框里的 chip 后，画板选区还在、dock chip 还在（可重新插入）。
- [ ] 再次框选（选区变化）后，dock chip 重置为可插入状态（不会卡在“已插入”）。
- [ ] 未选中任何对象时，dock chip 不出现。
- [ ] 输入框里的引用不会产生第二个输入框、浮动卡片或临时会话。

### 2.1 可选：附带选区快照（B6）

- [ ] 画板头栏图像按钮（「附带选区快照」）默认**关闭**；点一下开启（`aria-pressed=true`，高亮）。
- [ ] 开启后点 dock chip 插入引用：输入框里同时出现引用 chip 和一张选区图片预览；dock 状态显示「已插入引用，已附带快照」。
- [ ] 发送后用户消息里同时有**引用 chip 和 image**；模型能看到图片（可让它描述图里有什么）。
- [ ] 关闭开关后再插入引用，只插 chip、不附图。
- [ ] 快照只包含选中的对象（不含笔迹），背景跟主题一致。

## 3. 发送后的会话内容（只有文字 + 图片）

- [ ] 发送后，用户消息里显示为**一个紧凑标签**「◈ 画板选区 · 2 个对象」，**不出现** `【画板选区引用】` 原文或 `- id · 矩形 …` 对象行。
- [ ] 模型回复正常；需要时模型能读/改画板（见 §4）。
- [ ] 会话里没有额外注入的卡片、汇总卡、系统消息。
- [ ] 开启快照时，消息里的图片就是选区那张图（不是整块画布/截图）。

## 4. 模型读写画板（工具）

- [ ] 让模型“把选中的两个矩形改成蓝色，并向左移动 20”：本轮结束后两个矩形变蓝并左移，作为**一步可撤销**的修改。
- [ ] 画板头栏 toast 显示「AI 修改了 N 处」，点「撤销」可整轮回退（toast 约 8 秒；之后也可 `Ctrl/Cmd+Z` 撤销这轮 AI 修改）。
- [ ] 让模型读取选区：模型回复里能说出对象 id、类型、位置/尺寸、颜色（说明序列化里带了 `canvasId`，模型能直接调 `whiteboard_read_selection`）。
- [ ] AI 修改期间，被改对象有短暂的描边闪烁/高亮提示；人类随后改同一字段时以人类为准（不会闪回）。

## 5. AI 开关（画板 × 会话）

- [ ] 画板头栏的「AI」开关默认开启；点一下变为关闭（按钮 `aria-pressed=false`，文案“AI 关”）。
- [ ] 关闭时：dock chip 消失（入口收起）；让模型改画板时 Host 拒绝并回答 `ai_disabled`，模型无法读取或修改。
- [ ] 切到另一个会话、或另一块画板：开关状态各自独立（本会话关不影响别处）。
- [ ] 刷新页面后开关状态仍在（存在 Host `session_pref` 的 `aiByCanvas`）。
- [ ] 重新开启后 dock chip 恢复，工具可用。

## 6. 停止 / 撤销 / 持久化

- [ ] 让模型做一个多步画板操作，运行中点原生「停止生成」：回合立即停止，画板不会出现半截修改（原子写：要么整轮应用，要么没有）。
- [ ] 人类操作（画/移动/改色/删除）可用 `Ctrl/Cmd+Z` / 撤销按钮逐步回退；重做可用。
- [ ] 刷新页面/重开浏览器后：画板内容、画板名、当前画板选择都在。
- [ ] 画板下拉可切换/新建/重命名/删除画板；JSON 导入/导出、PNG 导出可用。

## 7. 自检证据（agent 已完成，用户可抽查）

| 证据 | 结果 |
|---|---|
| P0 spike（11 项承载面，真实 Chrome + 真实模型） | 全部通过、无降级；见 [`evidence-v3/SPIKE-RESULT.md`](evidence-v3/SPIKE-RESULT.md) 与截图 |
| Host 单测/冒烟 `node test/smoke.mjs` | **216 checks passed / SMOKE OK** |
| 客户端纯逻辑 + 注册面 `node test/client-smoke.mjs` | **105 checks passed / CLIENT SMOKE OK** |
| 隔离端到端 `node test/e2e/v3.mjs` | **E2E V3 OK**：右栏单画板、无旧视图 tab、切到文件 tab 后画板保持挂载（keepMounted）并可切回、画 2 矩形、dock chip 与输入框左边缘对齐断言（默认视口 delta=0；收起右栏的宽栏 chipLeft=editorLeft=cardLeft=421、delta=0）、900×700 窄窗复测（chipLeft=editorLeft=72、工具栏无横向溢出）、原生 chip 插入、发送后整块渲染且用户指令文本保留（`transcriptHasInstruction=true`，不再只剩 chip）、AI 开关持久化（`aiByCanvas` 写入并读回）、快照开关 → 草稿图片 → 发送后 image + chip、**模型 `whiteboard_replace_selection` 改两块矩形（rev 2→3、toast「AI 修改了 2 处」）→ 点撤销颜色恢复、AI 关时模型改画板被 Host 拒绝且画布 rev 不变、删除输入框 chip 后 dock 可再次插入、刷新后画板 tab/AI 开关/历史消息引用 chip 均恢复、零真实存储写入、0 page/console error；结果见 [`evidence-v3/v3-result.json`](evidence-v3/v3-result.json) 与 `v3-01…11` 截图 |
| 真实 3080 实机审查（2026-11-04，agent 用 ego-browser 全权自查） | 对齐修复前后截图 `live-before-alignment.png` / `live-after-alignment.png`（窄栏 chipLeft=editorLeft=296）与 `live-wide-column.png`（收起右栏的宽栏 card/chip left=413，均 delta=0）；实机发送后引用只显示紧凑标签 `live-sent-chip.png`；AI 关时模型两次调用被 `ai_disabled` 拒绝、画布 rev 不变 `live-ai-disabled.png`；原生「停止生成」立即停止且无半截画板改动 `live-stop.png`；另实测 reload 后 tab/AI 开关/消息 chip 恢复、画板删除后自动回退到默认画板、AI 修改可用 `Ctrl+Z` 回退（rev 4→5）；历史用户消息修复后同时显示引用 chip 与输入指令（`live-instruction.png`）；模型改文字内容后选中框贴合新文字（`live-text-selection.png`）；品牌色色板实测 rgb(65,118,230)（`live-brand-swatch.png`） |
| 真实 store 零写入 | e2e 前后对真实 `DSH_HOME` 的 sessions / whiteboard / workspace.json 做 size+mtime 快照比对，**无差异** |

## 8. 已知限制（v3.0）

- **默认画板是共享的**：新会话在未创建/切换自己的画板前，打开的是 Host 的默认画板（v2 起的行为，见 DECISIONS S5）；会话通过 `session_pref.lastCanvasId` 记住自己的最后一块画板。
- 右侧栏默认宽度约 575px，适合窄栏画板；「全屏」是原生逃生口。极窄窗口会由 DSH 自己收起右栏（原生行为）。
- 引用是**冻结 id 集合**：发送后模型按 id 读取当前字段；若对象在发送前被删除，模型会收到 `invalid` 并被告知。
- 引用 chip 使用原生 marker `@`（DSH 对扩展来源的默认外观），标签文字正确。
- 「附带选区快照」开关默认关，只保留在当前页面挂载态、不持久化；发送后想再次引用同一选区，点一下画布/重新框选即可重置 dock。
- 一次消息里放多个画板引用 chip 时，模型会看到多段翻译；UI 不阻止，但推荐一次一个（dock 在选区变化前不会重复插入）。
- 同步仍是 600ms 轮询；不是流式。
- 停止回合在 P0 spike 已验证（`remote.session.cancel`）；2026-11-04 实机 3080 也实测：长文生成中点原生「停止生成」立即停止（显示「已停止」），画板无半截修改；v3 隔离 e2e 不主动打断模型轮次（避免用例不稳定），停止由人工验收 §6 覆盖。

## 9. 回滚

```powershell
powershell -ExecutionPolicy Bypass -File scripts\rollback-v1.ps1
# 把 profile 链回 ../whiteboard-plugin，重启 3080 即回到 v1
```

v2 的 `/api/whiteboard/v2` 数据格式未变，v3 只是换了承载与入口；回滚 v1 不会读 v3 的 session_pref 新字段（`aiByCanvas` 被忽略），旧画板文档仍可被 v1 读取。
