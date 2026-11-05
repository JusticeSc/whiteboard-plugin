# DSH 画板（`@local/whiteboard`）

## 概览

在 DeepSeek Harness（DSH）的原生右侧栏绘图，再把选区作为原生引用 chip 放入主输入框，让同一会话里的模型读取或修改画板。画板数据由 Host 持久化，模型修改支持版本检查、字段级人类优先和撤销。会话继续使用正常的文字与图片消息，不创建第二输入框、临时会话、自定义会话卡片或 `conversation.view`。

| 项目 | 说明 |
|---|---|
| 当前版本 | `3.0.0` |
| DSH 兼容范围 | `>=0.2.1-rc.5 <0.3.0`；已有实测记录针对 `0.2.1-rc.5` |
| 分发方式 | [GitHub 源码](https://github.com/JusticeSc/whiteboard-plugin) + DSH bundle；保持 `private: true`，不发布 npm |
| 版本记录 | [Release v3.0.0](https://github.com/JusticeSc/whiteboard-plugin/releases/tag/v3.0.0) · [CHANGELOG](<CHANGELOG.md>) |

## 导航

- [功能与用法](#功能与用法)
- [安装与回滚](#安装与回滚)
- [数据与 AI 安全](#数据与-ai-安全)
- [开发与验证](#开发与验证)
- [架构与目录](#架构与目录)
- [文档与后续方向](#文档与后续方向)
- [限制与已知问题](#限制与已知问题)
- [许可证](#许可证)

## 功能与用法

安装并启用 bundle 后，画板与当前会话的主输入框配合使用，不需要另开 AI 对话。

| 能力 | 用法 |
|---|---|
| 手绘与编辑 | 选择、抓手、画笔、矩形、椭圆、箭头、文字和橡皮；支持框选、拖动、撤销、重做、清空、缩放与适配 |
| 多画板 | 新建、切换、重命名、删除；每个会话记住最后打开的画板 |
| 导入与导出 | JSON 导入 / 导出、PNG 导出 |
| AI 协作 | 插入选区引用，可选附带选区 PNG；模型通过 Host 工具读写，修改可撤销 |

### 在 GUI 里使用（v3）

1. 打开或新建会话，展开右侧栏；在空侧栏引导页点击「画板」。画板 tab 常驻，切换会话或 tab 不会因为卸载而丢掉画布。
2. 使用工具栏绘图，或从左上画板下拉菜单管理画板。
3. 用「选择」选中非笔迹对象，点击主输入框上方的「◈ 画板选区 · N 个对象」，把选区插入为原生引用。
4. 在正常输入框补充指令后发送，例如“把选中的两个矩形改成蓝色”。聊天记录显示紧凑引用 chip 与用户指令，模型可按指令读取或修改画板。
5. 需要图像上下文时，开启画板头栏的「附带选区快照」，再插入引用；选区 PNG 会作为原生图片附件加入同一草稿。该选项默认关闭。

不希望当前会话的模型接触某张画板时，关闭画板头栏的「AI」开关。它按“画板 × 会话”生效，具体规则见[数据与 AI 安全](#数据与-ai-安全)。

<a id="安装dsh-bundle无需-npm"></a>

## 安装与回滚

这是 DSH bundle，不是独立网页或普通 npm 库。安装前确认 DSH 版本符合上表范围；bundle 补丁、导出和兼容声明分别由 [Cordis 补丁](<cordis.patch.yml>)与[包清单](<package.json>)定义，Plugin Manager 的展示信息来自 [locale](<locale/>) 与[图标](<icon.svg>)。

### 从 GitHub 源码安装

```powershell
git clone https://github.com/JusticeSc/whiteboard-plugin.git
```

1. 在 DSH Web 的「插件」页或 agent 的 `plugin_manager` 中安装 bundle，目标使用克隆目录的绝对路径。
2. 启用 whiteboard bundle，并按 DSH 提示重启 `dsh web`。
3. 重新打开会话右侧栏，确认出现「画板」入口。

Plugin Manager 会把源码目录接入当前 profile；本项目无需执行 `npm publish`。首次安装或替换 Host JavaScript 后需要重启，不能仅靠刷新页面生效；客户端更新则以宿主的加载与刷新提示为准，不假定自动构建或热更新已运行。

### 本地开发目录直连（Windows）

[安装脚本](<scripts/install-v3.ps1>)是当前工作区的开发捷径，固定操作 `%USERPROFILE%\.dsh\profiles\web`。执行前确认该 profile 是目标环境，并备份其配置与当前插件链接。

```powershell
cd <path-to>\whiteboard-plugin
powershell -ExecutionPolicy Bypass -File scripts\install-v3.ps1
```

脚本会替换 profile 的 `node_modules/@local/whiteboard` junction；若 profile 清单里已有匹配的 `@local/whiteboard: link:...` 依赖，还会同步修改该依赖路径。它不删除旧源码目录，也不停止或重启运行中的 DSH。看到 `installed @local/whiteboard -> ...` 后，由用户安排重启；停止当前 `dsh web` 会结束当前会话。

### 回滚到 v1

[回滚脚本](<scripts/rollback-v1.ps1>)依赖同级 `../whiteboard-plugin-v1` 目录及其中的包清单已存在。它把 junction 和匹配的 `link:` 依赖路径指回 v1，重启后生效。

```powershell
powershell -ExecutionPolicy Bypass -File scripts\rollback-v1.ps1
```

这里的回滚是切换插件源码，不是数据迁移或备份恢复。公开安装使用前述 bundle 流程，不要把本地目录直连脚本当成通用安装器。

## 数据与 AI 安全

画板的持久化与写入判定都在 Host；客户端负责交互和选区引用，不依赖 `localStorage` 保存当前画板。

- **数据与撤销**：沿用 v2 的画板文档，保留操作历史；人类按操作撤销，AI 修改按工具调用单步撤销。刷新或重开浏览器后，Host 中的画板与会话偏好仍在。
- **画板与会话**：会话通过 `lastCanvasId` 记住最后打开的画板；新会话未切换或新建画板时使用 Host 默认画板，因此默认画板跨会话共享，并非每会话独占。
- **AI 开关**：默认开启，状态存入 Host 的 `session_pref.aiByCanvas`。关闭后客户端收起引用入口，Host 对两个模型工具均返回 `ai_disabled`，即不读也不改；刷新后仍保持该设置。
- **快照与隐私**：开启快照后，选区图片会随正常消息提供给模型；关闭后不再附图。快照开关只保留在当前页面挂载态，不持久化。笔迹不进入选区引用或快照。

### 模型如何读写画板

选区引用发送时会转换为模型可读文本，表头形如 `【画板选区引用】<画板名> · N 个对象 · rev R · canvasId <id>`。不超过 20 个对象时带逐对象字段；超过 20 个时仅带摘要，并提示模型先读取。聊天记录把引用块渲染为紧凑 chip，用户指令仍作为正常文字保留；原生引用插入失败时会降级为 typed 短标记。

| 工具 | 行为与边界 |
|---|---|
| `whiteboard_read_selection` | 返回中文翻译与无损 JSON；可按 ID 读取选区，省略 ID 时读取整板非笔迹对象，受规模上限约束 |
| `whiteboard_replace_selection` | 使用刚读取的 `expectRev` 原子应用字段修改或插入；有效修改一次提交，增加一个画板版本，并可单步撤销 |

版本过期会返回 `stale_revision`，需要重新读取；字段级冲突保留人类的最新编辑，并报告 `conflicts`。模型不能改变对象 ID / 类型或删除用户对象，也不能写入笔迹。其他失败包括 `canvas_not_found`、`invalid_proposal`、`too_large` 和 `ai_disabled`；参数与返回值以[工具定义](<host/tools.js>)为准。

## 开发与验证

本仓库是根目录 JavaScript/ESM 插件，没有 TypeScript workspace 或独立构建步骤。先运行不依赖浏览器的检查，再按环境条件选择端到端验证。

### 测试

```powershell
cd <path-to>\whiteboard-plugin
npm test
node --check index.js
```

`npm test` 运行 Host 与客户端冒烟套件，目前分别为 216 和 105 项；通过时输出 `SMOKE OK` 与 `CLIENT SMOKE OK`。覆盖模型、持久化、冲突、撤销、HTTP、客户端桥接和注册逻辑，但不能替代真实 UI / 模型验证。

### 可选端到端验证

需要本地 DSH、Chrome、可用模型凭据及隔离环境。**执行前先检查测试目录的权限、现有内容、忽略规则和清理方式**：[v3 测试脚本](<test/e2e/v3.mjs>)使用仓库父目录的 `../.spike-e2e/dsh-home`，默认在启动时清空并重建该 home；`WB_E2E_KEEP_HOME=1` 可跳过重置。它会复制凭据，运行后保留该 home，本仓库的忽略规则不覆盖父目录。

```powershell
npm run test:e2e
```

脚本默认使用独立端口 3092，覆盖真实侧栏、引用、快照、模型修改与撤销、AI 关闭拒绝、刷新和窄窗，并比较真实 store 的所选大小/时间戳元数据（非全盘字节证明）；成功标记为 `E2E V3 OK`。前置条件缺失或未执行不等于通过。[合成安装 / 回滚检查](<test/e2e/install-rollback.mjs>)在临时 fixture 中验证脚本切换，不证明历史 v1 的运行兼容性。详细要求见[测试策略](<docs/testing.zh.md>)。

### 治理与贡献

提交前阅读[贡献指南](<CONTRIBUTING.zh.md>)与 [Agent 指令](<AGENTS.md>)；工作流程见[开发指南](<docs/development.zh.md>)。实际命令由[包清单](<package.json>)和 [CI 工作流](<.github/workflows/ci.yml>)定义。保留的治理技能和审阅材料仅作参考，不表示已启用 TypeScript、Vitest、翻译校验、加权审批或远端分支保护。

<a id="目录"></a>

## 架构与目录

Host 保存画板文档并统一提交写入；客户端按会话隔离选区桥接，再通过 DSH 原生输入框与消息渲染承载引用。理解数据流、不变量与完整文件职责，见[项目上下文](<docs/PROJECT-CONTEXT.md>)和[架构概览](<docs/architecture.zh.md>)。

<a id="两块--一个薄承载"></a>

<details>
<summary>展开代码地图与桥接流程</summary>

```text
index.js          Host 入口、storage/tools 注入、HTTP 路由与模型工具注册
host/             画板模型、版本与合并、持久化、引擎、路由和工具
client.js         画布 UI、右侧栏 tab、会话级选区桥接与引用 chip
cordis.patch.yml  DSH bundle 安装补丁
locale/           Plugin Manager 的本地化标题与描述
icon.svg          插件图标
test/             Host / 客户端冒烟及可选端到端检查
scripts/          本地安装、回滚与隔离排查脚本
docs/             产品上下文、决策、验收、发布、路线和治理文档
.agents/          治理参考技能与 Agent Notes
.github/          CI、贡献与审阅材料
```

桥接流程：选中非笔迹对象 → 发布会话级选区 → 点击输入框上方的引用入口 → 通过 `captureInsertion()` / `insertReference()` 插入原生引用 → 发送时由 `inputTriggers` 序列化 → 正常消息显示引用 chip、指令和可选图片 → 模型调用 Host 工具。可选快照通过原生草稿附件加入，不创建第二会话面。

设计决策见 [ADR-0003](<docs/adr/0003-canvas-agent-bridge.md>)；画板文档、字段级合并和撤销见 [ADR-0002](<docs/adr/0002-canvas-authority.md>)。精确实现以 [Host 入口](<index.js>)、[引擎](<host/engine.js>)和[客户端](<client.js>)为准。

</details>

## 文档与后续方向

首页保留使用和维护入口；发布细节、修复经过与验收截图由各自文档承载。

| 需要了解 | 入口 |
|---|---|
| 接手项目与不可破坏的约定 | [项目上下文](<docs/PROJECT-CONTEXT.md>) · [决策总表](<docs/DECISIONS.md>) |
| 人工验收 | [v3 验收清单](<docs/ACCEPTANCE-v3.md>) |
| 发布和版本变更 | [v3.0.0 发布说明](<docs/RELEASE-v3.0.0.md>) · [CHANGELOG](<CHANGELOG.md>) |
| 历史验证与修复证据 | [证据说明](<docs/evidence-v3/README.md>) · [spike 结论](<docs/evidence-v3/SPIKE-RESULT.md>) |
| 下一阶段 | [canvas-first / 自动画图路线](<docs/ROADMAP-v4.md>)，属于计划而非当前能力 |
| 全部文档 | [文档索引](<docs/INDEX.md>) |

历史记录不代表当前 checkout、远端 CI 或在线 DSH 已重新验证。公开证据与本地真实会话截图的范围不同：`live-*.png` 不进入公开 Git，引用它们的链接仅在保留对应文件的本机工作区有效。

## 限制与已知问题

以下是当前版本的使用边界；后续方向以路线文档为准，不作已实现能力承诺。

- **单用户、本机使用**：没有账号、跨设备同步或多人实时协作；默认画板跨会话共享。
- **侧栏与同步**：右侧栏默认宽度约 575px，以窄栏为先；极窄窗口 DSH 会收起侧栏，可使用宿主的原生全屏。画板采用 600ms 轮询同步，不是流式更新。
- **引用外观**：原生引用 marker 为 `@`，显示画板选区 label。
- **画布表达力**：没有连接线绑定、分组、帧、图层、图片对象或富文本；规模上限由 [LIMITS](<host/constants.js>)定义，超限会被拒绝并提示。
- **AI 入口**：当前是 selection-first，没有整板引用或从零自动排版生成图的入口；模型工具支持插入对象，不等于已经提供自动布局能力。
- **旧数据兼容**：保留但不再读取 v1 的 `localStorage` key，不迁移其数据；v3 数据层沿用 v2 画板文档。

<a id="license"></a>

## 许可证

插件使用 [MIT](<LICENSE>) 许可证。导入治理参考材料的来源与核验边界见[来源说明](<SOURCE-LICENSE.txt>)。
