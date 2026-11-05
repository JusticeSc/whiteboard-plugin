# ADR-0002：画板作为独立产物 + 会话作为操作者（Canvas v2）

- 状态：**已接受并实现（v2.0.0）的历史设计记录**
- 日期：2026-11-03
- 取代：ADR-0001（v1 的"全局面板 + 全局 aiStore + 画布级单锁"实现，见 `../whiteboard-plugin-v1/docs/agent-bridge.md` §12–13）

> **v3 适用范围（[ADR-0003](0003-canvas-agent-bridge.md)）**：D12（AI 入口）、D18（工具契约）、D19（承载面）和 D20（实施顺序）已被取代。Host 权威、版本和字段级合并仍是 v3 的基础，但下文的公开 claim 流程与“AI 每轮一次撤销”是 v2 历史设计，不是当前工具保证。
> v3 模型写入不注册公开 claim；每次有效工具调用单独原子提交并可按该变更撤销，多个调用不合并为整轮事务。当前契约见 [`../DECISIONS.md`](../DECISIONS.md) 和 [`../PROJECT-CONTEXT.md`](../PROJECT-CONTEXT.md)。

## 1. 背景

v1 的画板是**全局面板**：画布数据在 localStorage，AI 发布状态在页面级模块内存 `aiStore`，
Host 只有一把画布级内存锁。这导致：选中/发布状态"泄漏"到所有会话、AI 提交依赖面板打开、
撤销是整板快照（并发下会毁别人的改动）、没有作者信息与变更历史。

本 ADR 把模型改成：**画板 = 独立产物（文档）**，**会话 = 操作者（actor）**，AI 交互期用
**元素级软认领（claim）** 绑定"一次会话 × 一组元素"。这也是 Figma/tldraw（服务端权威文档 +
细粒度合并）与 Perforce（锁只用于不可合并资产）两条历史路线在"可合并画布元素"上的交集。

## 2. 决策（前端已逐条确认）

| # | 决策 | 结论 |
|---|---|---|
| D1 | 参与者范围 | v1 = 单用户、单浏览器、多会话/多标签；数据模型按"单用户跨设备"预留；**排除多人协作** |
| D2 | 画板身份 | 画板是独立文档 `{id, name, rev, elements, changes}`，不属于任何会话；会话只是打开者 |
| D3 | 文档权威 | **Host 域存储权威 + 服务端定序 + 客户端乐观渲染 + 权威 diff 对账**（Figma/tldraw 模式） |
| D4 | 历史 | **append-only 变更日志全量保留**，压缩 = 检查点 + 其后增量，仅显式触发 |
| D5 | 版本粒度 | 画板 `rev`（同步游标）+ 元素 `rev` + **字段级 `fieldRevs`**（冲突判定到字段） |
| D6 | 认领 | **软认领**：客户端在用户手势时创建 claim，Host 记 ids/basis/TTL；UI 显示"谁在处理"；**允许强接管**（人类可继续编辑，AI 提交时逐字段校验、冲突字段丢弃） |
| D7 | 冲突 | **部分应用 + 逐字段冲突清单 + 局部重试**；同字段冲突**人类胜出** |
| D8 | 同步通道 | v1 轮询（400–800ms）+ `subscribe(canvasId, sinceRev)` 适配器；v2 换 `mode:'stream'` Remote，数据模型不变 |
| D9 | 耐久 | **AI 提交：Host 落盘后才 ack；人类绘制：300–500ms 批量落盘，卸载前 flush**（最多丢半秒） |
| D10 | 撤销 | 人类：操作级 undo/redo；AI：**每轮一个逆字段补丁**撤销，字段已被改过则跳过并提示；AI 无 redo |
| D11 | 分支 | 共享画板 + **显式"复制为实验画板"**；分支对比/合并放 v2 |
| D12 | AI 入口（**已被 ADR-0003 取代**） | ~~画布内选区浮出「AI 修改」→ 就地输入要求 → 直接发送到当前会话（一步）~~；v3 改为「选区 → 主输入框原生引用 chip」 |
| D13 | provenance | 元素级 `origin(user\|ai) + turnId + sessionId + parentSessionId`；人类操作也记来源会话；v1 展示 = AI 改动高亮 2s + 悬停 tooltip |
| D14 | 导入导出 | JSON 含 `schemaVersion/id/name/elements/rev/changes`；导入**总是生成新画板**；版本主号不兼容 → 拒绝并提示；未知字段往返保留 |
| D15 | 多画板 v1 | 数据支持多板，UI 只暴露"新建/导入"；每会话记住上次打开的板（`sessionPref`） |
| D16 | 规模上限 | 画板 ≤2000 元素；单次 claim ≤40 选区；单轮补丁 ≤200；文本 ≤2000 字符；单板 JSON ≈2MB |
| D17 | 升级 | 可破坏升级；旧 v1 localStorage **不自动迁移**、不删除（保留作导出保险） |
| D18 | 工具契约（**已被 ADR-0003 取代**） | ~~参数改 `claimId`、模型不传 rev~~；v3 改为 `replace_selection(canvasId, expectRev, patches)` 原子写，claim 内部化 |
| D19 | 承载面（**已被 ADR-0003 取代**） | ~~better-sidebar 右侧会话 tab / `conversation.view`~~；v3 = 原生右侧栏 tab（`sidebarRightTabs`） |
| D20 | 实施顺序（**已被 ADR-0003 取代**） | v3 顺序 = spike → M1（右栏承载 + 引用 chip + 工具契约）→ 人因验收 |

## 3. 数据模型

### 3.1 存储域（`ctx.storage.domain`，名 `whiteboard`，per-record）

- `global`：`{ schemaVersion: 2, defaultCanvasId }`
- 表 `canvas`（键 `canvasId`）→ CanvasDoc
- 表 `sessionPref`（键 `sessionId`）→ `{ lastCanvasId, updatedAt }`

> 具体 `defineDomain` 的 layout/字段形状在 Phase A 以真实 API 为准；本 ADR 只锁语义。

### 3.2 CanvasDoc

```json
{
  "schemaVersion": 2,
  "id": "cv-…",
  "name": "画板",
  "rev": 42,
  "createdAt": "…",
  "updatedAt": "…",
  "elements": {
    "el-…": {
      "id": "el-…",
      "type": "rect|ellipse|arrow|text|pen",
      "x": 0, "y": 0, "w": 0, "h": 0,
      "color": "ink",
      "text": "…",
      "points": [[0, 0]],
      "rev": 7,
      "fieldRevs": { "x": 2, "y": 2, "w": 1, "h": 1, "color": 3, "text": 1 },
      "origin": "user|ai",
      "turnId": null,
      "sessionId": null,
      "parentSessionId": null,
      "updatedAt": "…"
    }
  },
  "changes": [
    {
      "seq": 41,
      "patchId": "pt-…",
      "claimId": "lk-…",
      "author": { "kind": "ai|user", "sessionId": "…", "turnId": "…", "parentSessionId": null },
      "baseRev": 40,
      "ops": [
        { "kind": "replace", "id": "el-…", "fields": { "color": { "from": "ink", "to": "red" } } },
        { "kind": "insert", "id": "el-ai-…", "element": { "type": "text", "x": 0, "y": 0, "w": 88, "h": 22, "color": "accent", "text": "hello" } },
        { "kind": "delete", "id": "el-…", "element": { "…完整旧值…" } }
      ],
      "result": "applied|partial",
      "conflicts": [ { "id": "el-…", "field": "color", "reason": "stale_base", "winner": "user" } ],
      "at": "…"
    }
  ]
}
```

规则：
- 每次成功写入 `rev += 1`、追加一条 change；`fields` 里 `from` 取写入前的值（供逆补丁）。
- `fieldRevs[field] += 1` 仅对实际变更的字段递增。
- 笔迹 `pen` 只读（AI 不可改），人类可增删；`delete` 只能来自人类操作。
- 未知字段在读写往返中保留；`schemaVersion` 主号不兼容时拒绝读取并提示导出。

## 4. 协议（插件路由 `/api/whiteboard/*`，沿用同源校验）

| 方法 | 路径 | 语义 |
|---|---|---|
| GET | `/canvas?id=` | 取文档；`?sinceRev=` 返回增量 |
| POST | `/canvas` | 新建画板 `{name}` |
| POST | `/op` | 人类操作批量 `{canvasId, baseRev, ops, requestId}`；幂等；返回 `{rev, applied, conflicts}` |
| POST | `/claim` | 创建认领 `{canvasId, ids, sessionId}`；重叠 → 409 `{conflicts:[{id, ownerSessionId}]}` |
| POST | `/claim/heartbeat` | `{claimId}` 续期 |
| POST | `/claim/abort` | `{claimId}` 取消 |
| GET | `/state?canvasId=&sinceRev=` | 轮询：`{rev, claims:[{claimId, ids, ownerSessionId, expiresAt}], changes}` |
| GET | `/export?canvasId=` | 下载 JSON |
| POST | `/import` | 上传 JSON → 新画板 |

**提交链路**：`POST /claim` 时记录 `basis`（每个元素每个字段的 rev）与 staged 补丁；
`whiteboard_replace_selection` 只写 staged；`agent/turn-stopping` 时 Host 计算合并：
逐字段比较 `basis[field]` 与当前 `fieldRevs[field]` → 相等则应用（人类未动），不相等则冲突
（人类胜，记 `conflicts`，部分应用）。`agent/error`、`idle` 中止、claim TTL 过期 → 丢弃 staged、标记 aborted。

**工具 v2**：
- `whiteboard_read_selection({ claimId })` → `{ claimId, canvasId, rev, objects:[{id,type,x,y,w,h,color,text,rev}] }`；
  校验 `exec.agent.id === claim.ownerSessionId`，否则 403。
- `whiteboard_replace_selection({ claimId, replace:[{id, fields}], insert:[{type,x,y,text,…}] })` →
  `{ claimId, staged, accepted:[{id, fields}], ignored:[{id, reason}], warnings:[] }`；字段白名单按类型；超限拒绝。

## 5. 客户端模型（CanvasCore）

- 加载：`GET /canvas`（或 `sinceRev`）→ 本地文档；渲染以本地文档为准（乐观）。
- 人类操作：手势结束生成 op 批次（debounce 300–500ms）→ `POST /op`；返回冲突字段 → 用服务端值回滚该字段 + toast。
- 同步：`subscribe(canvasId, sinceRev)` 适配器（v1 轮询 600ms）→ 应用增量 + claims；AI 改动到达时高亮 2s。
- 撤销：人类操作栈（操作级 undo/redo，字段 rev 校验，跳过冲突字段）；AI 每轮一个逆补丁（同一机制）。
- 认领展示：其他会话的 claim 显示为"处理中"标记；人类编辑被 claim 覆盖的元素时提示"会与 AI 冲突"。
- 入口：选区浮层「AI 修改」→ 输入要求 → `POST /claim` → `remote.session.prompt({sessionId: 当前, mode:'queue', content:[用户要求], requestId})`。

## 6. 承载面（D19 修订：`conversation.view`，不是 better-sidebar tab）— **已被 ADR-0003 取代，以下为历史**

> v3 承载面 = 原生右侧栏 tab（`ctx.sidebarRightTabs.register` + `sidebar.right.pane.tab`）；
> 本节描述的是 v2 的 `conversation.view` 方案，保留作决策考古。

原提案（D19）用 `ctx.betterSidebar.registerTab` 挂 tab。实装时改为 **Harness 内置
`conversation.view` 槽位**，原因：

- `betterSidebar.registerTab` 是第三方 bundle 的私有表面，形状不稳定；而 `conversation.view`
  是 Harness 官方注册面（`ctx.slots.register({name, id, order, label, locale, store, inject})`），
  组件按 `sessionId` 实例化，天然满足"无活动会话不渲染"。
- 画板是"会话的视图"而不是全局工具；放进会话视图 tab 后与"对话 / 轨迹"并列，语义一致。
- 数据层与展示层完全解耦：`CanvasCore` 只认 `plan`（画板 id、会话 id、HTTP 客户端），
  不认会话 UI；`WhiteboardView` 只是把 `{sessionId}` 转给 `WhiteboardPage` 的适配器。
  Phase C 换承载面时数据层不需要改动。

实现：

```
Carrier (WhiteboardView)  →  ctx.slots.register({name:'conversation.view', id:'whiteboard', order:30})
  └─ WhiteboardPage({sessionId})   →  仅接收 sessionId
       └─ CanvasCore（纯函数）/ CanvasView（绘制、指针、键盘、工具栏）
```

- 挂载时读该会话的 `lastCanvasId`（`GET /session-pref`），无记录用 `defaultCanvasId`；
  切换画板写回会话偏好，重载后仍回到同一张板。
- 工具栏含画板下拉（列表/新建/重命名/删除）、工具、颜色、AI、撤销/重做/清空、缩放、
  JSON 导出/导入、PNG 导出；键盘绑定在画面元素上（不监听 window）。
- 旧 v1 的 better-sidebar tab、`conversation.input.left` 席位、页面级 `aiStore` 全部不再存在。

## 7. 迁移与兼容

- **破坏式更新，不做数据迁移**（用户已确认）：旧 `localStorage` key（`dsh-whiteboard:v1` /
  `pending` / `applied`）保留不删、不读、不写。v2 的文档在 Host 存储域（`whiteboard` 单元）。
- 工具名不变（`whiteboard_read_selection` / `whiteboard_replace_selection`），但语义改为
  "claim 作用域"：没有活动 claim 时返回 `no_active_selection`；旧提示词不兼容。
- 安装方式是**替换**而不是并存：profile 的 `@local/whiteboard` 链接指向 v2 目录即可，
  回滚只需把链接指回 v1 目录并重启（v1 目录原样保留）。
- Host 改动需重启 3080 才生效；重启前 3080 仍跑 v1。

## 8. 验收（已执行）

| 项 | 结果 |
|---|---|
| `node test/smoke.mjs`（Host 单测/冒烟） | **114 checks passed / SMOKE OK**（含工具输出 lossless JSON 回归） |
| `node test/client-smoke.mjs`（客户端核心） | **52 checks passed / CLIENT SMOKE OK** |
| `node test/e2e/run.mjs`（真实 Chrome + 真实模型；**v2 脚本已删除，v3 为 `test/e2e/v3.mjs`**） | **E2E OK**：新建会话 → 画板 tab → 画两个矩形 → 服务端 flush → undo/redo → 刷新恢复（含会话画板偏好）→ 画板切换 → AI 一步发送（claim）→ 模型 read/replace → 轮末提交为一处变更 → provenance toast → 撤销 AI 变更 → `pageerror` 0 / console error 0 |
| 安装式验证（profile 链接指向 v2，无 patch） | `/api/whiteboard/v2/health` 200；`dsh web` 正常启动、v2 bundle 激活 |
| 回滚验证 | 链接指回 v1 → `dsh web` 启动、v1 路由与 UI 恢复；再指回 v2 验证（脚本化，见 README） |
| 3080 正式切换 | 等用户确认后执行（重启会结束当前会话，故由用户触发） |

验收覆盖面：两会话并发 claim（Host smoke）、字段级冲突/人类胜（Host smoke）、AI 逆补丁
撤销、Host 重启后文档/rev/changes 保留（smoke + 安装式启动）、旧 v1 数据不被读取。

## 9. 实施阶段（全部完成，仅差 3080 重启）

- **A（Host）**：域存储、CanvasDoc/日志、claim 引擎、提交合并、路由、工具 v2、单测/smoke。✅
- **B（客户端数据层）**：CanvasCore（加载/乐观 op/对账/undo 日志/轮询适配器）+ e2e。✅
- **C（承载面）**：`conversation.view` tab、一步发送、删除席位/aiStore/旧 localStorage 路径。✅
- **D（打磨/验收）**：provenance 高亮 2s + tooltip、导入导出 UI、多画板切换、错误文案、
  全量 e2e、安装式与回滚验证、文档更新。✅

## 10. 风险与限制

- **AI 请求应在会话空闲时发送**：Host 在每次 `agent/turn-stopping` 提交该会话的全部 claim；
  若用户在助手正在回复时提交 AI 请求，claim 可能被上一轮结束事件提前提交/作废，模型随后
  拿到 `no_active_selection`。客户端会显示"AI 本轮没有修改画布"，重试即可。彻底修复需要
  把 claim 绑定到具体 turn（Host 需要 turn 身份），留待 v2.1。
- 模型工具的返回值必须是 **lossless JSON**：`undefined` 字段会让 Host 报
  `returned invalid output`（已修：只对有 text 的元素带 `text` 键；smoke 回归覆盖）。
- 轮询 600ms 的流量与延迟可接受；v2.1 可换 `mode:'stream'`，数据模型不变。
- 单用户、本机范围（D1），不做多人同步；跨设备仅数据模型预留。
- 画板规模受 `LIMITS` 约束（元素数/文本长度/change 日志），超限拒绝并提示。

