# 画板插件决策日志（Canvas v3）

- 更新：2026-11-04（M1 实现完成；末尾新增实现期发现 S9/B14/B15/C8）
- 状态：**本文件是产品/交互/契约决策的唯一权威来源**。与旧文档冲突时，以本文件为准；
  旧文档中已过时的段落都在文首加了“已被取代”的标注。
- 维护规则：只追加、只改状态，不删除历史；被否决的方案保留在 §4，避免重复讨论。
- 架构说明见 [`adr/0003-canvas-agent-bridge.md`](adr/0003-canvas-agent-bridge.md)。

## 0. 一句话

画板是右侧栏里的一个**独立产物**；AI 桥接只做一件事——把选区**翻译**成一条正常的用户消息
（文字，必要时一张图片），模型用工具读写画板；**没有第二输入框、没有临时会话、没有自定义消息节点**。

## 1. 画板本体（第一部分）

| 编号 | 决策 | 状态 |
|---|---|---|
| S1 | 承载面 = **DSH 原生右侧栏 tab**：`ctx.sidebarRightTabs.register({ id, kind: 'whiteboard', priority: 'extension', title, keepMounted: true, guide: [...] })` + keyed `sidebar.right.pane.tab` 页面；一个 tab 内部切换画板。 | 生效（已实现；`guide` 见 S9） |
| S2 | **移除** `conversation.view` 注册：画板不再作为会话视图 tab，不再与对话互斥。回滚靠 `scripts/rollback-v1.ps1`。 | 生效（已实现；e2e 断言无旧视图 tab） |
| S3 | 画板数据层沿用 v2，不动：Host 权威文档 `{id,name,rev,elements,changes}`、元素级 `rev`/`fieldRevs`、字段级合并（人类胜）、append-only 变更、600ms `/sync` 轮询、350ms 防抖落盘。 | 生效 |
| S4 | 人类撤销 = 操作级 undo/redo；AI 撤销 = 每轮一个逆字段补丁（字段已被人类改过则跳过并提示）。入口：画板头栏 + `Ctrl/Cmd+Z`。 | 生效 |
| S5 | 画板列表沿用 v2：每会话 `lastCanvasId`（`session_pref`），头栏下拉切换/新建/重命名/删除。未记录 `lastCanvasId` 的新会话打开 Host 的**默认画板**（默认画板跨会话共享，属 v2 既有行为）。 | 生效（已实现） |
| S6 | AI 开关：**（画板 × 会话）粒度**，画板头栏可见，标签明确写「本会话」，默认开；关闭 = 完全禁用（不读不改，入口收起，Host 侧也拒绝工具调用）。状态存 `session_pref.aiByCanvas[canvasId]`，客户端读回。 | 生效（已实现；e2e 断言写读一致） |
| S7 | 画板本身的视觉/反馈在画板内完成（对象描边闪烁、头栏 toast、撤销按钮、AI 处理中指示）；**不在会话里加任何卡片或标记**。 | 生效 |
| S8 | 右侧栏默认较窄：必须验证默认宽度下可用，并提供“放大/全屏”入口（原生 sidebar 的 expanded/fullscreen）。默认宽度可用性是 spike 的退出条件之一。 | 生效（spike：默认 575px，全屏 1279px） |
| S9 | **实现期发现**：右侧栏为空时显示原生引导页（guide），引导页只列出 tab 注册时声明了 `guide: [{ id, title, description }]` 的类型；只注册 tab 不声明 guide，用户无法发现画板。M1 必须给画板 tab 加 guide 条目。 | 生效 |
| S10 | **实机 bug 修复（2026-11-04，两轮）**：`conversation.input.dock` 槽位宽度 = 整个 composer stack，而输入框卡片并不总是贴 stack 左缘：①窄栏时卡片内缩固定 16px，dock 只给 2px padding 会让 chip 左移 14px；②宽栏/右栏收起时，卡片有 `--dsh-composer-card-max-width`（当前 712px）并在 stack 内**居中**，固定 16px 仍会错位（用户 1908px 窗口截图：卡片左缘比 chip 多 82px）。最终修复：dock 用 ref 实测“输入框左缘 − dock 左缘”并把该 inset 同步为左右 padding，且用 ResizeObserver 观察 composerStack + window resize 重算；e2e 断言默认视口、900×700 窄窗、收起右栏后的宽栏三种情况 `chipLeft ≈ editorLeft`（均 delta=0）。同时隐藏“已插入引用”这类成功状态在 dock 已隐藏时的残留文本（失败状态仍显示）。 | 生效（实机 + e2e 三态断言） |
| S11 | **实机 bug 修复（2026-11-04）**：历史用户消息只显示引用 chip、输入指令消失。根因是用户文字紧贴 chip 序列化，聊天记录里指令被追加到最后一个对象字段的同一行（例 `- el-… · 矩形 · … · 填充 #1f2329 改成红色`），旧规则 `- [^\n]*` 把整行吞进 chip。修复：userText 规则改为按生成字段的严格文法匹配（矩形/椭圆/箭头/文本/大于 20 个对象的短标记等），只匹配到最后一个字段为止，行尾用户文字留给普通文本节点；同时 codec.serialize 在翻译块前后各加换行，避免新消息再粘连。旧消息无需迁移，刷新即重新渲染出指令；e2e 新增 `transcriptHasInstruction` 断言。 | 生效（实机历史消息 + e2e） |
| S12 | **实机 bug 修复（2026-11-04）**：模型把文字对象「你好世界」改成 Hello World 后，选中框/命中范围仍是旧中文宽度。根因：文字用真实字体绘制、不裁剪到存储框，但选区/命中/框选读的是提交时缓存的 `w/h`（88px），内容变化后不再更新。修复：`boundsOf` 对 text 始终用 `measuredTextMetrics`（与绘制同字体、带缓存）实时测量，忽略过期 `w/h`；`drawSelection`/AI 溯源高亮传 `look.font`。已有旧数据无需迁移，刷新后选中框即贴合新文字；client-smoke 增加旧框不生效、英文变宽、锚点不变 3 条断言。 | 生效（实机 + client-smoke） |
| S13 | **实机 bug 修复（2026-11-04）**：用户反馈「品牌色用着还是黑色」。根因是 DSH 的 `--dsw-alias-brand-primary` 是**品牌文字色**（亮色主题 #0f1115 近黑，暗色 #f9fafb 近白），不是品牌蓝；色板 + 选中框都映射到它，导致品牌色与墨色几乎一样。修复：UI 色板/选中框改用 `--dsw-alias-state-business-primary`（亮 #4176e6 / 暗 #7aaaff），模型侧规范 hex 仍保持 Host 当前的 `#2f6fed`（同为蓝色，且无需为本次修复重启 Host）；旧画板里的 `accent` 元素按新语义渲染为蓝色。 | 生效（实机色板 rgb(65,118,230) + smoke/e2e） |

## 2. 桥接层（第二部分）

| 编号 | 决策 | 状态 |
|---|---|---|
| B1 | 引用入口 = **主输入框上方（`conversation.composer.dock`/`conversation.input.dock`）的引用 chip**；选区非空且画板 tab 挂载时出现。 | 生效 |
| B2 | 引用形态 = **DSH 原生引用 chip**（`$createReferenceChipNode` 同体系），**不可编辑、只能删除**；不是可编辑文字块。用户命令仍写在正常输入框里。 | 生效 |
| B3 | 发送时序列化：小选区（≤20 个对象）把**完整翻译**序列化进 prompt；大选区只序列化短标记，由模型调用 `whiteboard_read_selection` 取翻译。阈值可配置。 | 生效 |
| B4 | 引用语义：**冻结对象 id 集合**；发送时读画布当前字段；对象被删 → 标 `invalid` 并告知模型；一次只允许一个画板引用 chip，再次引用替换旧的（提示“引用已更新”）。 | 生效 |
| B5 | 翻译格式：一行表头（画板名 · 对象数 · rev · **canvasId**）+ 每对象一行（id · 类型 · 位置/尺寸 · 颜色（hex + 调色板名）/描边/圆角 · 文本/端点）；颜色用 hex，坐标整数，文本超长截断并标注。canvasId 必须在表头，否则模型拿不到工具参数。 | 生效（已实现；client-smoke 覆盖） |
| B6 | 图片：默认不附；画板头栏提供「附带选区快照」开关（默认关，按页面挂载态保留、不持久化），开启后引用时把选区渲染成 PNG 作为**原生图片附件**加入草稿（会话里就是一条 image，与引用 chip 并存）。 | 生效（已实现；e2e 断言预览、发送后 image、模型看到图片） |
| B7 | 工具契约：`whiteboard_read_selection(canvasId, ids?, expectRev?)` → 翻译 + lossless JSON；`whiteboard_replace_selection(canvasId, expectRev, patches, inserts?)` → **原子写**：Host 内部自建/校验 claim、字段级合并、stale/conflict 检测，返回可读错误。模型不需要显式传 claimId。read 会为（session × canvas）记录短时效字段 basis 用于人类胜冲突检测，但不注册进公开 claim 表、不出现在 `/sync`。 | 生效（已实现；host smoke 覆盖） |
| B8 | 模型汇报：工具描述要求模型改完用一句话汇报（“已把 o1 改成 #4A90D9”），对话里自然可读。 | 生效 |
| B9 | 停止 = 真取消当前 turn（`remote.session.cancel({ sessionId })`）+ 放弃未提交 claim；已应用的修改保留、可撤销。v3 不覆盖原生停止 UI，原生「停止生成」按钮走的就是该 API；原子写保证停止时不会出现半截修改。AI 修改进入 undo 历史（Ctrl+Z 可撤），provenance toast 持续 8s 且带「撤销」按钮。 | 生效（spike 验证 cancel；e2e 验证 AI 修改→toast 撤销；原生停止按钮） |
| B10 | 会话内容只有文字与图片：**不做** conversation 定义、turnTail 卡片、操作卡、系统消息注入、第二个聊天框、临时会话/浮窗/折叠卡/promote/队列、better-sidebar 依赖。 | 生效 |
| B11 | 引用 chip 的插入使用 DSH 引用体系（`conversation.input.shell(sessionId)` 的 `insertReference`/`insertFileReferences` 或 `slash/input-insert-reference` 事件）；spike 验证；失败则降级为 typed `inputActions.insertText` 的**一行短标记**（`[画板选区 · N 个对象]`），交互不变。 | 生效（已实现；原生 chip 可用，未启用降级） |
| B12 | 已发送消息里的引用渲染走 `uiConversation.userText.register(rule)`，显示为紧凑标签；规则失败时回退为可读原文。**规则必须匹配整块**（表头 + 连续对象行），只匹配表头会把对象行留在会话里。 | 生效（已实现；e2e 断言 `rawHeaderVisible=false`） |
| B13 | 大选区的 `read_selection` 翻译同样有字节/对象上限；超限时分页/要求用户缩小选区。 | 生效 |
| B14 | **实现期发现**：颜色契约要闭环——翻译给模型的是 hex，Host `sanitizeColor` 必须接受 hex 并归一化到最近的调色板 id（精确 fallback 优先，其次 RGB 最近距离），否则模型回传 hex 会被静默降级成 ink；同时接受中/英颜色词（如 蓝/蓝色/blue → accent），避免模型先失败一次再改用 hex。 | 生效（host smoke：hex/颜色词 patch → 调色板 id；e2e 用「蓝色」真模型写回） |

## 3. 交付与验收（第三部分）

| 编号 | 决策 | 状态 |
|---|---|---|
| C1 | 顺序：**spike（约 1 天，隔离 DSH_HOME + 独立端口）→ M1 实现 → 人因验收**；spike 不通过不开工正式代码。 | 生效 |
| C2 | spike 退出标准：右栏 tab 注册/打开/keepMounted、默认宽度可用、composer chip 出现、引用 chip 插入与序列化、userText 渲染、图片附件、`replace_selection` 原子写与 stale 冲突、`remote.session.cancel`、模型视角调试面板可读。 | 完成（2026-11-04，11/11 通过、无降级；结论与截图见 [`evidence-v3/SPIKE-RESULT.md`](evidence-v3/SPIKE-RESULT.md)） |
| C3 | M1 范围：拆 `conversation.view` 与画布内 AI 卡片 → 画板搬入右栏 → composer 引用 chip + 序列化 → 工具契约改造 → AI 开关（客户端 + Host）→ 撤销/状态/i18n → 移除死代码。 | 完成（2026-11-04，3.0.0；见 README / ACCEPTANCE-v3） |
| C4 | 验收门槛：隔离 profile 冷启动、首 5 分钟人工走查、3 视口 × 缩放 × 明暗主题、真实 store 零写入、旧测试残留清理、更新 ADR/ACCEPTANCE/STATUS/README；最后用户重启 3080。 | 生效（自动化 + agent 实机自查已完成：含 1264×805 与 884×687 窄窗、跨 tab、刷新、停止、删除画板；用户抽验待确认） |
| C5 | 版本：M1 完成后升 `3.0.0`；保留 v1 回滚脚本；数据无需迁移（canvas doc schema 不变，`session_pref` 加字段）。 | 完成（package.json = 3.0.0） |
| C6 | 决策分级：成败级（S1/S2/S6、B2/B7/B10、C4）开工前冻结；权衡级按本表执行并允许分期；特性级（配色/动画/文案/浮窗细节）由实现按 v3 原型默认迭代。 | 生效 |
| C7 | 原型 v4 不再单独做；「模型视角」做成插件内的 debug 面板（显示发给模型的序列化文本、工具调用与结果），供 spike/验收使用。 | 生效（spike 阶段实现并验证；M1 不随产品发布，模型视角由工具结果 + host smoke 覆盖） |
| C8 | **实现期发现**：v2 e2e 直接在真实 `DSH_HOME` 上创建/删除会话，违反“真实 store 零写入”。v3 e2e 必须用独立 `DSH_HOME`（`<workspace>\.spike-e2e`，每次跑前清空），并在跑前/跑后对真实 store 的 sessions/whiteboard/workspace.json 做 size+mtime 快照比对，断言零差异。 | 生效（v3 e2e 已通过零写入断言） |
| C9 | **真实 GUI 自查（2026-11-04，用户授权 ego-browser 全权）**：在用户重启后的 3080 上用真实会话走查：dock 对齐实测 delta=0、引用插入→发送→紧凑标签渲染、AI 修改→`Ctrl+Z` 回退（rev 4→5）、AI 关→模型两次调用被 `ai_disabled` 拒绝、reload 后 tab/AI/消息 chip 恢复、原生停止生成、画板删除后回退默认画板。画板删除走原生 `window.confirm`（Playwright 验收时需先覆盖 `window.confirm=()=>true`，否则对话框会阻塞脚本）。自查产生的临时画板已删除、临时会话已归档；用户旧测试残留清理仍待确认。 | 完成 |

## 4. 已否决 / 被取代（不再讨论）

| 方案 | 结论 | 原因 |
|---|---|---|
| 画板作为 `conversation.view` 会话视图 | 否决 | 与对话互斥；且整幅视图继承会话滚动容器，曾造成“上边栏消失”。 |
| 画布内「AI 修改」输入框 / 画布 AI 卡片 | 否决 | 被真实使用感知为“第二个聊天框”。 |
| 可编辑文字块引用（把翻译塞进输入框让人编辑） | 否决 | 没有参考产品这么做；引用应是不可编辑 chip，命令才可编辑。 |
| btw 临时会话（浮窗/多轮/折叠卡/promote） | 否决 | 用户决定 Q2=D；避免自造会话与卡片体系；Host 侧也无法隐藏主对话轮次。 |
| 复用 better-sidebar Side Chat（内部 sidechat 路由） | 否决 | 依赖可选插件的内部 API；语义重复。 |
| conversation 定义 + turnTail 操作卡片 | 否决 | 会话只保留文字/图片，避免自定义节点耦合。 |
| 会话里注入系统消息/汇总卡 | 否决 | 同上。 |
| 事件级同步/流式重写 | 延后（M2） | 600ms 轮询够用，数据模型不变。 |
| 视觉截图工具 / lint | 延后（M2） | M1 先把文本翻译与引用闭环做好。 |
| 多人协作 | 排除 | ADR-0002 D1 已确认单用户。 |

## 5. 下一步（M1 之后的观察项）

- 视觉工具 `whiteboard_screenshot`（选区/整板，返回图片内容）是否值得默认开启。
- 引用 chip 是否支持一次消息内多组引用（当前只允许一个）。
- 选区 lint（重叠/越界/文本溢出）是否进入 read 结果。
- 流式同步替换轮询。











## 6. 发布与下一阶段（2026-11-04 记录）

| 编号 | 决策 | 状态 |
|---|---|---|
| R1 | **首次发布物 = 本目录 3.0.0**。按推荐采用**源码 GitHub 仓库 + MIT**：已发布 <https://github.com/JusticeSc/whiteboard-plugin>（`main` + `v3.0.0` tag + Release）；保留 `@local/whiteboard`/`private: true`，本次不走 npm；DSH 兼容声明待定。详见 [`RELEASE-v3.0.0.md`](RELEASE-v3.0.0.md) §4。 | 已发布 |
| R2 | **下一阶段方向 = canvas-first**：在保留选区编辑路径的基础上，增加整板引用、画板级“让 AI 画”入口、`whiteboard_create_diagram`（语义 nodes/edges + 自动布局）与生成预览/接受拒绝；先做 v3.1 最小闭环，再做 v4。详见 [`ROADMAP-v4.md`](ROADMAP-v4.md)。 | 方向已确认，待实施 |
| R3 | 版本策略：首次发布保持 `3.0.0`（包含验收后修复）；发布后的 bugfix 升 `3.0.x`，功能升级升 `3.x`，破坏式升级升 `4.0`。 | 生效 |

## 7. 文档入口

- 项目上下文：[`PROJECT-CONTEXT.md`](PROJECT-CONTEXT.md)
- 文档索引：[`INDEX.md`](INDEX.md)
- 发布说明：[`RELEASE-v3.0.0.md`](RELEASE-v3.0.0.md)
- 变更日志：[`../CHANGELOG.md`](../CHANGELOG.md)
