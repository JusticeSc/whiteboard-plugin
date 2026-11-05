# 项目上下文（画板 v3 / `@local/whiteboard` 3.0.0）

> 面向接手者/发布审阅者。目标：不依赖会话历史，读完这份 + 链接文档即可知道
> 当前产品是什么、代码怎么组织、哪些承诺不能破、如何验证、还差什么才能发布。
> 原始记录：2026-11-04（Asia/Shanghai）；当前环境与验证结果须另行核实。

## 1. 一句话

一个常驻 DSH Web 右侧栏的手绘画板：选中对象后通过**主输入框的原生引用 chip**把
选区交给同一个对话里的模型；模型通过 Host 工具读画板并逐次原子写入，支持撤销、停止、
按（画板 × 会话）AI 开关。它不创建会话、不自定义消息节点、不做第二输入框。

## 2. 当前状态

| 项 | 值 |
|---|---|
| 包名 / 版本 | `@local/whiteboard` / `3.0.0` |
| 历史验证环境 | DSH Web `@deepseek-ai/dsh` `0.2.1-rc.5`；2026-11-04 的实机审查使用端口 3080，不代表当前实例状态 |
| 历史安装方式 | profile 的 `node_modules\@local\whiteboard` junction 指向源码目录；使用前须核对当前 profile 和链接目标 |
| 历史自动化结果 | Host 216 checks / 客户端 105 checks / 隔离 e2e **E2E V3 OK**，不代表当前运行结果 |
| 历史实机审查 | 对齐、历史消息、文字选区、品牌色，见 `evidence-v3/` |
| 发布记录 | 2026-11-04 的 GitHub、MIT 与 `v3.0.0` tag / Release 记录见 `RELEASE-v3.0.0.md`；当前远端状态未由本文核验 |

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
  `expectRev` 逐调用原子写、字段级人类优先、可读冲突；每个有效变更可分别撤销。
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
6. **写入原子且可撤销**：每次有效工具调用产生一个变更和一个修订，可按该次变更撤销；没有有效修改时不产生变更。冲突字段可跳过而非冲突字段仍可提交；撤销也会跳过之后被更改的字段或对象。同一轮的多次调用不合并为一个撤销步骤。
7. **AI 不能删除用户对象**：工具没有删除操作；删除由用户执行。
8. **测试隔离**：e2e 应使用隔离 `DSH_HOME`。脚本仅比较真实 store 的部分目录条目与 `workspace.json` 的大小和时间戳；该检查不能证明所有文件均无写入。

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
| `host/claims.js` | 公共 claim 表及暂存逻辑；v3 原子写复用暂存方法但不注册公开 claim |
| `host/store.js` | storage hub：canvas / session_pref / global |
| `host/engine.js` | 单写入者：默认画板、幂等 op、模型读/写、session_pref 合并 |
| `host/routes.js` | HTTP：画板 CRUD、sync、import/export、health、session-pref |
| `host/tools.js` | 两个模型工具的 schema/execute/render |
| `client.js` | 浏览器端：Canvas 纯函数 + 画板 UI + 右侧栏 tab + dock/chip 桥接 |
| `cordis.patch.yml` | 作为 DSH bundle 安装时插入 `whiteboard` 条目 |
| `scripts/install-v3.ps1` | 修改指定用户 profile 的链接与已有匹配 `link:` 依赖 |
| `scripts/rollback-v1.ps1` | 将指定用户 profile 的链接与已有匹配 `link:` 依赖指回 v1 |
| `scripts/spike-env.ps1` | 旧手工复现脚本；使用前须核对 home、端口和进程，见下文 |

## 8. 验证方式

```powershell
cd <path-to>\whiteboard-plugin
npm test                 # Host + client smoke
npm run test:e2e         # 可选：真实 Chrome/模型；先检查下方隔离及凭据注意事项
node --check index.js    # 入口改动时的定向语法检查
```

运行 e2e 前，先确认 `../.spike-e2e/dsh-home` 的删除/保留策略、权限、凭据复制、父目录的忽略规则和事后清理；该目录不是本仓库 `.gitignore` 覆盖范围。详见 [e2e 说明](../test/e2e/README.md)。

旧的 `scripts/spike-env.ps1` 不是安全替代：它可覆盖 `DshHome`，会强制停止 PID 文件所指进程及所选端口的监听进程，并把凭据复制到仓库父目录。使用前须核对路径、端口、PID、敏感输出与清理计划。

- 单测覆盖：Host 模型/CRUD/工具/claim/冲突/撤销；客户端纯函数、注册面、
  引用规则、文本测量、色板。
- e2e 覆盖：右栏 tab、keepMounted、画图、dock 对齐（默认/宽栏/窄窗）、
  原生 chip、发送渲染 + 指令保留、AI 开关持久化、快照、模型改画板 + 撤销、
  AI 关拒绝、删除 chip 后重插、刷新恢复；脚本还断言页面与控制台错误为空，并比较真实 store 的所选元数据。
- 实机证据：`docs/evidence-v3/`（`SPIKE-RESULT.md`、`v3-result.json`、隔离 e2e
  截图 `v3-*.png`；真实会话截图 `live-*.png` 因含
  真实对话上下文，应只在本机保留，见 `docs/evidence-v3/README.md`；这些是历史证据，不代表本次已验证）。

## 9. 安装 / 回滚

以下脚本直接使用 `$env:USERPROFILE\.dsh\profiles\web`，不以 `DSH_HOME` 选目标。仅在用户明确授权后运行：先确认 profile 和链接目标、待替换路径确实是 junction，并备份 profile 的链接信息和 `package.json`。回滚还须确认兄弟目录 `whiteboard-plugin-v1` 存在且兼容。

- 安装/切换：`powershell -ExecutionPolicy Bypass -File scripts\install-v3.ps1`
  指向本源码目录。
- 回滚：`powershell -ExecutionPolicy Bypass -File scripts\rollback-v1.ps1`
  指向 `..\whiteboard-plugin-v1`。
- 两个脚本替换 junction，并在 profile `package.json` 中更新已有的匹配 `@local/whiteboard` `link:` 依赖；不会凭空新增缺失的依赖。脚本不自行重启 DSH；若后续步骤失败，可能已留下部分切换。
- 刷新或重启需求取决于 DSH 的实际构建与加载方式，不应假定刷新一定足够；重启会结束当前会话，须事先取得用户授权。

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

## 12. 发布与分发（历史记录见 RELEASE）

- 计划分发形态：GitHub 源码仓库 + DSH bundle 安装：<https://github.com/JusticeSc/whiteboard-plugin>。远端可见性与发布状态须另行核实。
- 包名：保留 `@local/whiteboard`、`"private": true`；**不发布 npm**（DSH 从源码目录安装 bundle）。
- 许可证：**MIT**（`LICENSE` + `package.json` 已同步）。
- 历史记录称 `main` 与 `v3.0.0` tag 已推送并创建 [Release v3.0.0](https://github.com/JusticeSc/whiteboard-plugin/releases/tag/v3.0.0)；本文不代表当前远端状态已验证。
- 兼容性：声明的 `engines.dsh` 为 `>=0.2.1-rc.5 <0.3.0`；DSH `0.2.1-rc.5` 的实测是历史记录。
- 安装元数据：`dsh.bundle.patch` + `locale/en|zh.json`（title/description）+ `icon.svg`；Plugin Manager 的可用性须在目标实例确认。
- 历史记录称真实 store 的旧测试残留已于 2026-11-04 清理，并曾写入 `_cleanup-backup/`；备份的当前状态未经核验，若仍存在须按敏感数据处理。
