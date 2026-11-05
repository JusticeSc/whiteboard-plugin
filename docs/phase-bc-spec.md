# Phase B/C 实施规格（Canvas v2 客户端）

状态：**Canvas v2 实施规格的历史记录**（2026-11-03）。

> **v3 适用范围**：Host 权威、版本和字段级合并仍适用；下文的显式 claim 流程、按 AI 轮次提交或撤销、以及旧承载面描述不是当前 v3 工具契约。v3 每次有效写入单独提交并可按该变更撤销；一次轮次中的多次调用不合并。当前工具和承载见 [ADR-0003](adr/0003-canvas-agent-bridge.md)、[DECISIONS.md](DECISIONS.md) 与 [项目上下文](PROJECT-CONTEXT.md)。

## 0. 显示层解耦原则

- `CanvasCore`：数据/同步/claim/undo/provenance，只认 `{sessionId, canvasId}`，**不知道自己和谁一起显示**。
- `CanvasView`：渲染 + 交互的 React 组件，输入 props `{core, sessionId}`，输出用户手势。
- `Carrier`：适配器（约 100–150 行），把 `CanvasView` 挂到某个宿主面并把 `sessionId` 传进来。
  主承载体 = **右侧栏原生 tab**（`ctx.sidebarRightTabs.register` + `sidebar.right.pane.tab`；
  v3 决策见 ADR-0003）。`conversation.view` 承载已移除；同一 `CanvasCore` 仍与载体解耦，
  **换载体不触碰数据层**。

## 1. 元素模型（客户端与服务端同一形状）

```js
{ id, type, x, y, w, h, color, text?, points?,   // 权威字段
  rev, fieldRevs, origin, turnId, sessionId, parentSessionId, updatedAt }
```

- `rect / ellipse`：`x,y` 左上角，`w,h ≥ 0`；创建时按拖拽两点归一化。
- `arrow`：`x,y` = 起点，`w,h` **有符号**（终点 = x+w, y+h），保留任意方向。
- `text`：`x,y` 左上角，`w,h` = `measureText` 实测；渲染不得再回写 w/h。
- `pen`：只有 `points` 是权威（`REV_FIELDS.pen = color, points`）；`x,y` 记起点，`w,h = 0`。
- `seed`（手绘抖动）不落库：由 `id` 做稳定哈希派生，刷新不闪。
- 描边宽度固定 2.2（v1 无 UI 调整），不落库。

## 2. 必需的 Host 增量

1. **箭头有符号尺寸**：`sanitizeSize` 目前夹紧到 `[0, COORD_LIMIT]`，会把箭头方向吃掉。
   改为：`type === 'arrow'` 时允许 `[-COORD_LIMIT, COORD_LIMIT]`（插入、人类 replace、模型 patch 三处）。
2. **画板列表 / 改名 / 删除**（多画板切换器需要；ADR-D15 只定义了新建/导入）：
   - `GET /api/whiteboard/v2/canvases` → `{ ok, canvases: [{id,name,rev,elementCount,updatedAt}] }`
   - `POST /api/whiteboard/v2/canvas/rename` `{canvasId, name}` → `{ok, canvas}`
   - `POST /api/whiteboard/v2/canvas/delete` `{canvasId}` → `{ok, defaultCanvasId}`
   - store 增加对应能力（canvas 表枚举/改记录/删记录）；删除后若删的是默认板，重新选一块或新建。
3. `GET /session-pref` / `POST /session-pref` 已存在（`sessionId` 必填）。

## 3. 客户端使用的 HTTP 面（全部同源、`ok:false` + HTTP 状态）

| 调用 | 方法/路径 | 说明 |
|---|---|---|
| 载入 | `GET /canvas?canvasId=` | 全量 elements + rev + claims；无 canvasId → 默认板 |
| 增量 | `GET /sync?canvasId=&sinceRev=` | `{rev, changes, claims, serverTime}`，changes 全量 append-only |
| 人类 op | `POST /op` | `{canvasId, sessionId, ops, requestId}`；幂等 |
| 撤销 | `POST /undo` | `{canvasId, sessionId, seq, requestId}`；返回 `{rev, applied, skipped, changeSeq, change}` |
| 建板 | `POST /canvas` | `{name}` → doc |
| 认领 | `POST /claim` | `{canvasId, sessionId, ids}` → `{claim}`；409 = claim_conflict |
| 心跳 | `POST /claim/heartbeat` | `{claimId, sessionId}` |
| 取消 | `POST /claim/abort` | `{claimId, sessionId, reason}` |
| 会话偏好 | `GET/POST /session-pref` | `{sessionId, lastCanvasId}` |
| 导出 | `GET /export?canvasId=` | JSON |
| 导入 | `POST /import` | `{payload}` → 新板 |

op 形状（服务端 model.js）：
```js
{ kind:'insert', id, element:{...} }
{ kind:'replace', id, fields:{ x: 12, color: 'red', ... } }   // 字段值，不是 {from,to}
{ kind:'delete', id }
```

## 4. 同步与写回

- 载入：`/canvas` 全量替换本地元素；`cursor = rev`。
- 轮询：600ms `GET /sync?sinceRev=cursor`；按 `changes` 顺序应用（seq 必须连续递增），
  `cursor = rev`；同时刷新 `claims`（用于"AI 处理中"徽标）。
- 本机也每 600ms 一次；页面不可见（`document.hidden` 或 carrier `visible=false`）时暂停，
  重新可见时立即补一次。
- **单一写者**：本地修改先在内存生效（乐观），350ms 防抖后用"差分"生成 ops：
  - 维护 `base`（服务端已确认的元素快照）。对每个 id：新增 → insert；消失 → delete；
    字段不同 → replace（只带变化字段）。
  - 一批 ops 一个 `requestId`；失败重试复用同一 requestId（服务端幂等）；4xx 语义错误则
    重拉 `/canvas` 对账（本地覆盖回权威值）。
  - 手势结束、文字提交、删除、清空、微调、复制等**所有** `commit()` 调用点统一走这里，
    不在每个手势里手写 op 分类。
- 卸载/切换会话/页面隐藏前 `flush()` 一次（同步尽力而为；失败留下次）。

## 5. 撤销 / 重做

- 本地维护 `undoStack`：每批成功返回的 `changeSeq`（人类操作）。
- `undo`：`POST /undo {seq}`；响应里的 `change` 立即本地应用（服务端也会通过 sync 补一次，
  用 seq 去重）；冲突字段被跳过时显示提示（"部分字段已被修改，已跳过"）。
- `redo`：把被撤销的 change.ops 重新作为新 op 批提交（`replace` 用 `to` 值；
  `delete` 用旧 element；`insert` 用 element），成功后重新入栈。
- AI 修改：sync 收到 `author.kind==='ai'` 的 change → 画布应用 + 2s 高亮 + 提示条
  「AI 修改了 N 处」+ 撤销按钮（撤销即 `POST /undo {seq: change.seq}`，每轮一个逆补丁）。
- 快捷键：`Ctrl/Cmd+Z` / `Shift+Ctrl/Cmd+Z`、`Ctrl/Cmd+Y`。

## 6. Claim + 一步发送（v2，**已由 ADR-0003 的引用 chip + 原子写取代**）

> v3 不再有“画布内 AI 输入框 / 一步发送”。交互为：选区 → 主输入框原生引用 chip → 发送时序列化 →
> 模型调用 `whiteboard_replace_selection(canvasId, expectRev, patches)` 原子写。本节保留作 v2 参考。

1. 选中对象 → 浮动工具条「AI 修改」→ 画布内就地输入要求 → 发送。
2. 发送前 `POST /claim {canvasId, sessionId, ids}`；409 时提示"这些对象正被另一个会话处理"。
3. `remote.session.prompt({requestId, sessionId, mode:'queue',
   content:[{type:'text', text: 用户原话}], clientTimeZone})`；失败（`ok:false`）→ 释放 claim + 提示。
4. 发送后画布对 claim.ids 显示"AI 处理中"徽标（**不硬冻结**，ADR-D6 允许强接管）；
   每 60s 心跳一次；用户可"取消"（abort）。
5. sync 出现该 claim 的 AI change：
   - claim 消失 + change 到达 → 应用 + 高亮 + 撤销条；
   - claim 消失 + 无 change → 提示「AI 本轮没有修改画板」；
   - claim 消失但画板被别人改 → 正常应用其他 change。
6. 宿主 turn-stopping 提交，客户端无感；关闭画板视图/切会话不影响提交（服务端权威）。

## 7. provenance

- 元素原始 `origin/turnId/sessionId/parentSessionId` 由服务端在 change 里给出；
  客户端应用 AI change 时把元素标记为 `origin:'ai'`。
- 展示：AI change 应用后 2s 高亮（描边/底色 glow）；hover tooltip = 「AI / 你 · 会话短 id · 时间」；
  尚未知标题时用 id 前 6 位，不阻塞。

## 8. 承载面（v2 历史，**已由 ADR-0003 取代**）

> v3 主承载面 = 原生右侧栏 tab（`sidebarRightTabs.register` + `sidebar.right.pane.tab`），
> 不再使用 `conversation.view` 或 better-sidebar。以下为 v2 记录。

- 主：`ctx.slots.inject('conversation.view', cb)` 注册 `{name:'conversation.view', id:'whiteboard',
  order, label}`；组件 props 里取 `sessionId`。
- 旁挂（可选，Phase D）：`ctx.inject(['betterSidebar'], …)` → `registerTab({id:'whiteboard:tab',
  title, order, component})`；`openTab({type:'whiteboard:tab'}, {sessionId})`。
- 键盘：**只**在画布容器内部焦点时响应（`container.contains(document.activeElement)` 或
  pointer 进入后标记），不要挂 `window`；输入框/可编辑区一律让行。
- 生命周期：`visible=false` / 卸载时暂停 rAF 与轮询、flush 一次；恢复时立刻 sync。

## 9. 包与开发循环

- 包名与 client bundle id 统一为 `@local/whiteboard`（开发期曾用 `-v2` 后缀，已改名）。
- `package.json` 增加 `exports["./client"]`、`dsh.client = {platform:'web', inject:[...]}`，
  `files` 加 `client.js`。
- 改 `client.js` 走 SSE 热更新（~500ms）+ 硬刷新；改 Host 必须重启 `dsh web`。
- 先在 3081 隔离实例验证，再在 3080 并行安装（独立 tab/视图），最后翻转。

## 10. 测试

- `node test/smoke.mjs`（Host 现状 94 项）+ 新增客户端纯函数单测
  （元素形状/差分/变更应用/undo-redo 栈/claim 状态机），不依赖浏览器。
- e2e（真实 Chrome + 真实模型）：画 → 选区 → 一步发送 → 模型读/改 → turn 结束 →
  画布应用 + 高亮 + 撤销 → 刷新恢复 → 双标签页同步 → `pageerror` 为空 → exit 0。

## 11. 已知待办

- Host：箭头有符号尺寸、画板列表/改名/删除（见 §2）。
- ADR-0002 D19 已被 ADR-0003 取代：v3 承载面 = 原生右侧栏 tab；ADR-0002 头部已加取代标注。
- 旧 v1 localStorage 不迁移、不读取；破坏式更新。
