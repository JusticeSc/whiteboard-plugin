# ADR-0003：画板承载于右侧栏 + 选区引用桥接（Canvas v3）

- 状态：**已接受，M1 已实现（3.0.0）**（2026-11-04；实现证据见 `docs/evidence-v3/`）
- 日期：2026-11-04
- 取代：ADR-0002 的 **D12（AI 入口）**、**D18（工具契约）**、**D19（承载面）**、**D20（实施顺序）**。
  Host 权威、rev/fieldRevs 和字段级合并仍适用；v3 模型工具不注册公开 claim，每次有效写入单独提交并可按该变更撤销，多个调用不会合并为整轮事务。其他 v2 细节的适用范围见 [ADR-0002](0002-canvas-authority.md)。
- 决策明细（含已否决方案）见 [`../DECISIONS.md`](../DECISIONS.md)；本文件只讲架构与边界。

## 1. 背景与问题

v2 把画板做成 `conversation.view` 会话视图，AI 交互是画布内的一张“AI 修改”卡片。真实使用暴露出两类
问题（不是算法问题，是承载与交互问题）：

1. **上边栏消失**：整幅视图继承了会话滚动容器的 `scrollTop`，画布工具栏被裁掉；
2. **“新建对话框”的观感**：画布内 AI 卡片被读成第二个聊天框；它实际复用当前会话，但用户无法从界面
   区分“会话”和“卡片”。

同时，grilling 把产品形态收敛为：画板常驻右侧栏、与对话共存；选区通过**原生引用 chip**进入主输入框；
会话里只有文字/图片，没有自定义节点；模型用工具读写画板。参考系为 Cursor / VS Code Copilot 的
「选区 → 上下文 → 单一输入框」与 Figma/tldraw 的「服务端权威文档 + 工具读写」。

## 2. 设计分块（用户提出的两块，确认成立）

整个插件可以理解为**两块 + 一层薄承载**：

```
┌───────────────────────────────┐   ┌──────────────────────────────────────┐
│ ① 画板本体（Canvas）           │   │ ② 桥接层（Bridge）                    │
│                               │   │                                      │
│ - 绘制/选择/编辑（CanvasView） │   │ - 选区 → 引用 chip（输入框上方）      │
│ - 数据同步/撤销（CanvasCore）  │   │ - 发送时序列化“翻译”                 │
│ - 画板列表/切换/AI 开关        │   │ - 模型工具 read/replace              │
│ - 画布内状态与反馈             │   │ - Host：rev/字段 basis/合并          │
│                               │   │ - AI 开关的 Host 侧执行              │
└──────────────┬────────────────┘   └──────────────┬───────────────────────┘
               │                                   │
               └─────────── 共享 Host 数据层 ──────┘
                    CanvasDoc / changes / session_pref
               ┌────────────────────────────────────┐
               │ ③ 承载（薄层，只做挂载）             │
               │ 右侧栏 tab + composer dock chip     │
               └────────────────────────────────────┘
```

**关键边界**：桥接层不直接改画布像素，画板也不认识“模型/会话”概念；两者只通过
`CanvasDoc`（Host 权威状态）与 `whiteboard_*` 工具契约相连。桥接层不引入任何新的会话节点类型。

## 3. 运行时结构

```
右侧栏 tab (sidebarRightTabs, keepMounted)
  └─ WhiteboardPanel
       ├─ CanvasView（绘制/选择/工具条/画板切换/AI 开关）
       ├─ CanvasCore（load/op/sync/undo/provenance）
       └─ 画布内反馈（AI 处理中、应用闪烁、toast、撤销）

Conversation（DSH 原生）
  ├─ composer dock chip：◈ 画板选区 · N 个对象     ← 读取客户端选区 store
  ├─ 原生引用 chip（submit 时由 codec.serialize 生成翻译文本）
  └─ 用户消息（文字 [+ 可选图片]）→ 模型

Host
  ├─ /api/whiteboard/v2（文档、画板列表、pref、claim、undo）
  ├─ CanvasDoc（rev、fieldRevs、字段级合并、append-only changes）
  └─ tools：whiteboard_read_selection / whiteboard_replace_selection
```

## 4. 两条数据流

### 4.1 人类画图（不经过模型）

`CanvasView` 手势 → `CanvasCore` 乐观 op → `POST /op`（防抖 350ms）→ Host 定序、落盘、返回 rev →
其他客户端 `/sync` 对账。撤销走 Host `/undo`。

### 4.2 AI 修改（桥接主流程）

1. 用户在右侧栏画板选区；客户端把选区（ids + canvasId + rev）写入会话级引用状态；
2. 输入框上方出现 chip；点击后插入**原生引用 chip**（不可编辑、可删）；
3. 用户输入命令 → 正常发送；submit 时引用 chip 由 codec 序列化：
   - 小选区（≤20 对象）：完整翻译（表头 + 每对象一行字段）；
   - 大选区：短标记 + 提示模型调用 `whiteboard_read_selection`；
   - 若开启「附带选区快照」，同时附加一张原生图片附件；
4. 模型（同一会话、同一 turn）调用 `whiteboard_replace_selection(canvasId, expectRev, patches, inserts?)`；
5. Host 校验 `expectRev`，通过内部暂存和字段 basis 合并（人类胜），提交有效变更并返回结果与可读冲突信息；
6. 画板客户端 `/sync` 拿到新 rev → 应用 → 对象闪烁 + toast（撤销）+ 模型一句话汇报；
7. 用户可撤销（一次 AI 变更 = 一个逆补丁）。

### 4.3 AI 关闭

`s6` 开关关闭 → 客户端隐藏 chip/入口并取消排队；Host 工具检查 `session_pref.aiByCanvas[canvasId]`，
直接返回“本会话 AI 已关闭”；已应用的修改保留、可撤销。

## 5. 契约

### 5.1 翻译格式（写入 prompt 的文本）

```
【画板选区引用】默认画板 · 3 个对象 · rev 12
- o1 · 矩形 · 位置(120,80) · 200×120 · 填充 #FFF1B8 · 描边 #8A6D1F · 圆角 8 · 文本「入口」
- o2 · 箭头 · (320,140) → (520,140) · 描边 #333 · 线宽 2.2
- o3 · 文本 · 位置(120,240) · 字号 22 · 颜色 #333 · 内容「请求进入网关」
```

- 坐标整数、颜色 hex；文本截断并标注；删除/失效对象单独标注 `invalid`。
- 大选区只输出表头 + 类型统计 + id 列表 + “请调用 whiteboard_read_selection 读取字段”。

### 5.2 模型工具

| 工具 | 参数 | 返回 |
|---|---|---|
| `whiteboard_read_selection` | `canvasId`, `ids?`, `expectRev?` | 翻译文本 + lossless JSON；Host 记录短时字段 basis，不返回或注册公开 claim |
| `whiteboard_replace_selection` | `canvasId`, `expectRev`, `patches[{id,set}]`, `inserts?` | 应用结果、新 rev、冲突字段/失败原因（可读文本） |

- 模型不传 claimId；Host 在 replace 内部构造临时 claim 进行暂存与字段合并，但不把它注册为公开 claim。
- stale/conflict 返回可操作文本（“rev 已变为 13，请重新读取”），不返回裸错误码。
- 工具描述要求：改完用一句话汇报；禁止凭空编造 id；大选区先 read。

### 5.3 引用 chip

- 插入：`conversation.input.shell(sessionId)` 的 `insertReference` / `insertFileReferences`，或
  `slash/input-insert-reference` 事件；spike 验证，失败降级为 `inputActions.insertText` 的一行短标记。
- 序列化：注册引用 source 的 `codec.serialize(ref)`，按选区大小生成全量/短标记文本。
- 渲染：`uiConversation.userText.register(rule)` 把已发送消息中的引用渲染为紧凑标签。

## 6. 承载细节

- tab 注册：`id: '@local/whiteboard'`, `kind: 'whiteboard'`, `priority: 'extension'`,
  `keepMounted: true`, `title: () => t('panel')`；body 注册在 `sidebar.right.pane.tab`（key = id）。
- 一个 tab 内切换画板；不做“每画板一个 tab”。
- 默认宽度可用性 + “放大/全屏”入口是 spike 退出条件。
- 画板面板不注册 `conversation.view`；旧会话里已打开的 view 状态不再出现（无数据影响）。

## 7. M1 范围与非范围

**范围**：拆 `conversation.view` 与画布内 AI 卡片；右栏承载；composer chip；引用序列化；
工具契约改造；AI 开关（客户端 + Host）；撤销/状态/i18n；删除死代码；模型视角 debug 面板。

**非范围（M2+）**：视觉截图工具、lint、流式同步、多引用 chip、多人协作、better-sidebar 集成。

## 8. Spike（先于 M1，约 1 天，隔离环境）

隔离 `DSH_HOME` + 独立端口（不碰 3080），最小插件验证：

1. `sidebarRightTabs.register` + keyed body 能挂载，tab 能打开、能 keepMounted；
2. 默认右栏宽度下画布可用，expanded/fullscreen 可用；
3. `conversation.input.dock` / `composer.dock` 组件能拿到 `inputActions`；
4. 引用 chip 插入（两种路径）+ submit 序列化 + 已发送消息渲染；
5. 图片附件（`conversation.createDrafts` + `addAttachments`）能进 prompt；
6. `replace_selection` 原子写、stale/conflict、AI 关闭拒绝；
7. `remote.session.cancel` 真停；
8. 模型视角 debug 面板可读。

**结果（2026-11-04）**：全部通过，无降级；详细证据与被带入 M1 的注意事项见 [`evidence-v3/SPIKE-RESULT.md`](../evidence-v3/SPIKE-RESULT.md)。（一次性 spike 插件已删除）
关键结论：原生 chip 插入与 codec 序列化可用（`serializeReference` 非公开 API，只用“发送 + 模型回显”验证）；
`userText` 规则需整块匹配；`keepMounted` 生效；默认 575px 偏窄但全屏 1279px 可用。

spike 记录（截图 + 结论 + 降级决策）归档在 `docs/evidence-v3/`，通过后进入 M1；M1 已实现并通过隔离 e2e。

## 9. 风险与回滚

| 风险 | 缓解 |
|---|---|
| 引用 chip 插入/序列化依赖 DSH 内部引用接口 | spike 双向验证；失败降级为 typed `insertText` 短标记（交互不变） |
| 右栏默认宽度不适合画图 | 提供放大/全屏；验收包含窄宽度用例 |
| `keepMounted` 常驻内存 | 画板数据轻量；必要时改为可见时挂载 |
| 模型忽略短标记不调用 read | 工具描述 + 翻译文本内的明确指令；大选区才走该路径 |
| Host 侧 AI 开关与客户端状态不一致 | `session_pref` 单一来源 + 工具执行时校验 |

回滚：M1 完成后保留 v1 回滚脚本；v2 → v3 仅客户端承载与工具入口变化，数据格式不变；
必要时恢复 `conversation.view` 注册即可回到 v2 交互（代码保留一个版本）。

## 10. 后果

- 画板与对话真正共存：画板常驻右栏，对话是主列；不再有“画板视图/对话视图”互斥。
- 会话内容保持原生：文字 + 图片，模型行为可通过“模型视角”面板直接审计。
- 桥接层不引入新 UI 类型，减少与 DSH 会话渲染的耦合；代价是引用入口依赖 DSH 引用体系（有降级路径）。

