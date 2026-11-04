# 项目上下文（画板 v3 / `@local/whiteboard` 3.0.0）

> 面向接手者/发布审阅者。目标：不依赖会话历史，读完这份 + 链接文档即可知道
> 当前产品是什么、代码怎么组织、哪些承诺不能破、如何验证、还差什么才能发布。
> 更新时间：2026-11-04（Asia/Shanghai）。

## 1. 一句话

一个常驻 DSH Web 右侧栏的手绘画板：选中对象后通过**主输入框的原生引用 chip**把
选区交给同一个对话里的模型；模型通过 Host 工具**原子读写**画板，支持撤销、停止、
按（画板 × 会话）AI 开关。它不创建会话、不自定义消息节点、不做第二输入框。

## 2. 当前状态

| 项 | 值 |
|---|---|
| 包名 / 版本 | `@local/whiteboard` / `3.0.0` |
| 运行环境 | DSH Web `@deepseek-ai/dsh` `0.2.1-rc.5`，真实 3080 |
| profile 链接 | `%USERPROFILE%\.dsh\profiles\web\node_modules\@local\whiteboard` → 本目录（Junction） |
| 自动化 | Host 216 checks / 客户端 105 checks / 隔离 e2e **E2E V3 OK** |
| 实机审查 | 已完成多轮（对齐、历史消息、文字选区、品牌色），见 `evidence-v3/` |
| 发布状态 | **已发布到 GitHub（public，MIT，`v3.0.0` tag + Release）** |

版本策略：首次发布保持 `3.0.0`，包含验收后修复；发布后的 bugfix 升 `3.0.x`，
功能升级升 `3.x`/`4.0`（见 `DECISIONS.md` R3）。

## 3. 用户可见能力

- **画布**：选择/抓手/画笔/矩形/椭圆/箭头/文字/橡皮；框选、多选、拖动；
  墨色/品牌蓝/红/绿/琥珀；缩放/重置视图；撤销/重做/清空。
- **画板**：默认画板 + 新建/切换/重命名/删除；JSON 导入/导出、PNG 导出。
- **引用**：选中对象 → 输入框上方 dock chip `◈ 画板选区 · N 个对象` → 点击插入
  原生引用 chip → 补指令发送；聊天记录显示 chip + 指令，不泄漏序列化原文。
- **模型读取**：≤20 对象带完整字段；>20 只带摘要并提示先读；可附选区快照图片。
- **模型写入**：`whiteboard_read_selection` / `whiteboard_replace_selection`，
  `expectRev` 原子写、字段级人类优先、可读冲突、单步撤销。
- **AI 开关**：按“画板 × 会话”，客户端收起入口 + Host 拒绝（`ai_disabled`）。
- **原生集成**：右侧栏 tab（keepMounted）、主输入框 dock、引用 chip、
  发送消息渲染、停止生成、主题 token、刷新/重启持久化。

## 4. 架构与数据流

```
┌──────────────────────────── DSH Web 客户端 ────────────────────────────┐
│ 右侧栏 tab: WhiteboardPage (client.js)                                 │
│   画布渲染/工具/画板下拉/AI 开关/快照                                  │
│        │ 发布 {canvasId, rev, ids, objects, ready, aiEnabled}          │
│        ▼                                                                │
│ 会话级 bridge store (client.js)                                        │
│        │ dock chip（仅在选区非空且 AI 开启时显示）                      │
│        ▼                                                                │
│ 主输入框 shell（sessions.scope → conversation.input.for）              │
│   captureInsertion() + insertReference() → 原生 chip                  │
│        │ 发送时 inputTriggers codec.serialize() → 翻译文本              │
│        ▼                                                                │
│ 正常会话：引用 chip（userText 规则渲染）+ 用户指令 + 可选快照图片       │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ 模型工具调用
┌───────────────────────────────▼─────────────────────────────────────────┐
│ DSH Host: index.js → host/engine.js（单写入者）                         │
│   whiteboard_read_selection   → 读整板/选区 + 字段 basis               │
│   whiteboard_replace_selection→ expectRev 原子写 + 字段级 merge        │
│   /api/whiteboard/v2/*        → 画板 CRUD / sync / import / export     │
│        │                                                                 │
│        ▼                                                                 │
│ storage hub: canvas 文档、session_pref（lastCanvasId / aiByCanvas）、   │
│              global（默认画板）                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                │ 600ms /sync 轮询
                                ▼
                        客户端重新渲染画布
```

## 5. 不能破的不变量

1. **Host 权威**：画板状态只在 Host；客户端不直接决定持久化结果。
2. **元素/字段级版本**：`element.rev` + `fieldRevs`；合并时字段级比较，
   人类编辑优先，冲突可读。
3. **AI 开关双侧执行**：客户端隐藏入口不能替代 Host 拒绝；两个工具都过
   `assertAiEnabled`。
4. **会话只保留文字/图片**：没有自定义 conversation view、AI 卡片、临时会话、
   系统消息注入。
5. **引用不可编辑**：引用是原生 chip；用户指令才可编辑。
6. **写入原子且可撤销**：一次工具调用 = 一个 rev + 一个撤销步骤。
7. **AI 不能删除用户对象**：工具没有删除操作；删除由用户执行。
8. **真实 store 零写入（自动化验收）**：e2e 使用隔离 `DSH_HOME`，前后快照比对。

## 6. 工具契约

### `whiteboard_read_selection`
- 必需：`canvasId`；可选：`ids`（缺省 = 整板非笔迹对象）、`expectRev`。
- 返回：翻译文本 + lossless JSON + `canvasId/canvasName/rev/objects/invalid`。
- 读时记录字段 basis，用于后续字段级冲突报告。

### `whiteboard_replace_selection`
- 必需：`canvasId`、`expectRev`；`patches` 和/或 `inserts`。
- `patches: [{ id, set: {x,y,w,h,color,text} }]`；`inserts: [{type,x,y,w,h,text,color}]`。
- 仅允许 rect/ellipse/arrow/text 插入；笔迹只读；类型不能改。
- 失败码：`canvas_not_found`、`stale_revision`、`invalid_proposal`、
  `too_large`、`ai_disabled`。
- 返回：`rev`、`applied`、`inserted`、`ignored`、`conflicts`、`notes`。

## 7. 代码地图

| 路径 | 职责 |
|---|---|
| `index.js` | Host 入口：注入 storage/tools，挂 `/api/whiteboard/v2`，注册两个工具 |
| `host/constants.js` | LIMITS、可编辑字段、调色板、存储单元描述符 |
| `host/model.js` | CanvasDoc 纯模型、sanitize/normalize、hex→调色板、快照序列化 |
| `host/claims.js` | 内存 claim 表（兼容保留；v3 原子写内部使用） |
| `host/store.js` | storage hub：canvas / session_pref / global |
| `host/engine.js` | 单写入者：默认画板、幂等 op、模型读/写、session_pref 合并 |
| `host/routes.js` | HTTP：画板 CRUD、sync、import/export、health、session-pref |
| `host/tools.js` | 两个模型工具的 schema/execute/render |
| `client.js` | 浏览器端：Canvas 纯函数 + 画板 UI + 右侧栏 tab + dock/chip 桥接 |
| `cordis.patch.yml` | 作为 DSH bundle 安装时插入 `whiteboard` 条目 |
| `scripts/install-v3.ps1` | 把 profile 链接指向本目录（重启生效） |
| `scripts/rollback-v1.ps1` | 把 profile 链接指回 v1 |
| `scripts/spike-env.ps1` | 隔离 DSH_HOME + 独立端口手工复现环境 |

## 8. 验证方式

```powershell
cd <path-to>\whiteboard-plugin-v2
npm test                 # 216 + 105 checks
node test/e2e/v3.mjs     # 隔离 DSH_HOME + 端口 3092，真实 Chrome/模型，约 3–5 分钟
```

- 单测覆盖：Host 模型/CRUD/工具/claim/冲突/撤销；客户端纯函数、注册面、
  引用规则、文本测量、色板。
- e2e 覆盖：右栏 tab、keepMounted、画图、dock 对齐（默认/宽栏/窄窗）、
  原生 chip、发送渲染 + 指令保留、AI 开关持久化、快照、模型改画板 + 撤销、
  AI 关拒绝、删除 chip 后重插、刷新恢复、零真实 store 写入、0 page/console error。
- 实机证据：`docs/evidence-v3/`（`SPIKE-RESULT.md`、`v3-result.json`、隔离 e2e
  截图 `v3-*.png` 进入仓库且已裁掉左侧会话栏/头像；真实会话截图 `live-*.png` 因含
  真实对话上下文，已由 `.gitignore` 排除、只在本机保留，见 `docs/evidence-v3/README.md`）。

## 9. 安装 / 回滚

- 安装/切换：`powershell -ExecutionPolicy Bypass -File scripts\install-v3.ps1`
  然后重启 3080（会结束当前会话）。
- 回滚：`powershell -ExecutionPolicy Bypass -File scripts\rollback-v1.ps1`
  把链接指回 `..\whiteboard-plugin`，重启生效。
- 两个脚本只改 profile 的 junction，不删旧目录、不动运行中的 3080。
- client 改动刷新页面即生效；Host 改动需要重启 `dsh web`。

## 10. 已知限制（不是缺陷）

- 单用户、本机；无多人同步。
- 默认画板跨会话共享；会话只记住自己的 `lastCanvasId`。
- 600ms 轮询同步，不是流式。
- 右侧栏默认约 575px；全屏是原生逃生口。
- 引用 chip 的 marker 是原生 `@`（扩展来源默认外观），label 正确。
- 快照开关不持久化；关闭后只插 chip。
- 画布表达力：无连接线绑定、无分组/帧/图层、无图片对象/富文本。
- AI 目前 selection-first：没有“整板引用”入口，也不能从零自动排版生成图。

## 11. 下一阶段方向（已记录，未实施）

用户已确认方向：从 selection-first 扩展到 **canvas-first**。

- **v3.1 最小闭环**：整板引用 chip + 画板“让 AI 画”入口 + insert-only 用法。
- **v4**：`whiteboard_create_diagram`（语义 nodes/edges + 自动布局）+ 生成预览/接受拒绝。
- 之后：连接线绑定/帧、画板记忆检索、实时协作、互操作/导出扩展。

详见 [`ROADMAP-v4.md`](ROADMAP-v4.md)，决策见 [`DECISIONS.md`](DECISIONS.md) §6。

## 12. 发布状态（详见 RELEASE）

- 发布形态：**已发布到 GitHub public 源码仓库**：<https://github.com/JusticeSc/whiteboard-plugin>。
- 包名：保留 `@local/whiteboard`、`"private": true`；本次不走 npm，未来发 npm 再改 scope/移除 private。
- 许可证：**MIT**（`LICENSE` + `package.json` 已同步）。
- 仓库：`main` + `v3.0.0` tag 已推送；[Release v3.0.0](https://github.com/JusticeSc/whiteboard-plugin/releases/tag/v3.0.0) 已建。
- 兼容性：仅在 DSH `0.2.1-rc.5` 实测；公开/正式发布前决定是否声明 peer/engines。
- 真实 store 旧测试残留清理仍需用户确认（与发布物无关，但会影响演示环境干净度）。
