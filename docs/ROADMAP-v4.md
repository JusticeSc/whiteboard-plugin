# 路线图 v4：从「选区优先」到「画布优先」

> 状态：**方向已确认，未实施**（2026-11-04 记录）
> 背景：v3 的 AI 交互以选区引用为入口，适合“改已有内容”；用户指出“想让 agent
> 凭空画图”做不到。讨论结论：不是底层写不进去，而是缺少**画板级上下文入口**和
> **生成/布局能力**。详见 `PROJECT-CONTEXT.md` §10–§11。

## 1. 当前缺口（事实）

- `whiteboard_read_selection` 的 `ids` 可省略，理论上能读整板；但模型拿不到
  `canvasId/rev`，因为只有选中对象后 dock chip 才把引用送进对话。
- `whiteboard_replace_selection` 允许 `patches: []` + `inserts: [...]`，引擎层可以
  只插入新对象；但没有 UI/工具描述引导这种用法，也没有布局。
- 没有 `whiteboard_list_canvases` / 整板引用 / “让 AI 画”入口。
- 模型若自己算坐标，生成质量差；需要“语义结构 + 自动布局”。

## 2. 设计原则

1. **作用域分层**：canvas / viewport / selection / explicit ids；选区只是其中一种。
2. **创建与编辑分离**：create 工具不需要选区；update/delete 才需要目标。
3. **模型给结构，引擎算坐标**：nodes + edges + layout，而不是像素坐标。
4. **生成可审查**：预览/diff + 接受/拒绝 + 单步撤销。
5. **保留 v3 安全模型**：AI 开关、expectRev、原子写、字段级冲突、人类优先。
6. **上下文按需**：整板只给摘要/截图，不默认灌全量 JSON。

## 3. v3.1：canvas-first 最小闭环（先做）

目标：用户不选任何元素，也能让 agent 在当前画板上画东西。

### 交付

1. **整板引用 chip**
   - 画板打开且 AI 开启时，dock 始终显示 `◈ 画板`（无选区时）；
   - 序列化：`【画板引用】<name> · rev R · canvasId <id> · N 个对象` + 摘要
     （类型统计/画板尺寸），不展开对象；
   - 模型收到后调用 `whiteboard_read_selection({canvasId})` 读整板。

2. **画板工具栏「让 AI 画」**
   - 点击插入整板引用 + 预填输入（如“在这张画板上画一个登录流程”）；
   - 不要求预先选中对象。

3. **insert-only 正式化**
   - 工具描述/文档明确 `patches: [] + inserts: [...]` 是合法用法；
   - 生成对象标记 `origin=ai`，一次调用一个撤销步骤。

4. **`whiteboard_list_canvases`（可选但推荐）**
   - 返回 `[{canvasId,name,rev,isDefault}]`；解决“模型完全不知道有哪些画板”。

### 验收

- 新会话打开画板、不选中任何对象 → 出现整板 chip → 发送“画一个 3 节点流程” →
  模型能调用 read + replace，在空白处插入对象，刷新后仍在，可一步撤销；
- 不破坏现有选区路径、dock 对齐、历史消息渲染；
- 单测 + e2e 增加“无选区画图”用例。

## 4. v4：自动画图（真正的“凭空画图”）

### 4.1 `whiteboard_create_diagram`

输入建议：

```json
{
  "canvasId": "cv-...",
  "expectRev": 12,
  "nodes": [{ "id": "n1", "type": "rect|ellipse|text", "label": "登录" }],
  "edges": [{ "from": "n1", "to": "n2", "label": "成功" }],
  "layout": { "direction": "TB|LR", "gap": 48 }
}
```

- 布局：客户端或 Host 调 dagre/ELK，生成 rect/text/arrow；
- 写入：一次原子 insert，`origin=ai`，一个撤销步骤；
- 约束：节点/边数量上限、文本长度、画布边界；
- 兼容：保留 `whiteboard_replace_selection` 作为编辑路径。

### 4.2 生成预览 / 接受拒绝

- 先渲染 ghost/diff 层（accent 高亮），用户确认后提交；
- 支持逐项接受/拒绝（可选）；至少支持整次接受/拒绝；
- 与现有 claim/undo/conflict 模型对齐。

### 4.3 模板/输入

- Mermaid flowchart / sequence 文本 → 图；
- 代码/文档结构 → 架构图（后续）；
- 内置模板：流程图、时序、系统架构、会议/复盘。

## 5. 之后（P1/P2）

- **连接线绑定 + 帧/分组/图层/便签/图片/富文本**：让生成的图可维护。
- **画板作为记忆**：摘要、按会话/工作区检索、跨会话“上次那张架构图”。
- **实时协作**：SSE/WebSocket + 乐观更新；多人/多 agent 可考虑 CRDT。
- **性能**：脏矩形/离屏缓存/视口裁剪/空间索引/Worker。
- **互操作**：SVG/PDF/Mermaid/Excalidraw/tldraw JSON 导入导出。
- **可访问性**：键盘对象导航、屏幕阅读器摘要、触控/手写笔。

## 6. 非目标（现在不做）

- 不做 Miro 式的投票/计时器/workshop facilitation；
- 不做模板市场/复杂权限；
- 不让模型直接猜像素坐标替代布局引擎；
- 不为了“功能多”破坏引用 chip + Host 原子写的核心安全模型。

## 7. 开放问题

1. 整板引用默认展示还是手动点？（上下文体积 vs 可发现性）
2. 布局在客户端还是 Host？客户端有字体测量优势，Host 更一致。
3. 生成预览用 ghost canvas 还是 DOM overlay？撤销粒度如何暴露？
4. `whiteboard_replace_selection` 是否拆成 `create` / `update` 两个工具名？
5. 多画板时如何选择目标（当前画板 / 显式 list / 引用 chip）？

## 8. 下一步

1. 用户确认发布形态（与 v4 无关，先完成 v3.0.0 发布）；
2. 发布后开 v3.1 spike：整板 chip + 让 AI 画 + insert-only，不改 Host 核心；
3. spike 通过后再评估 dagre/ELK 与预览方案。
