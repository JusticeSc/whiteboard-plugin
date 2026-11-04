# v3 实施计划（Spike → M1 → 验收）

- 状态：**M1 已实现（3.0.0）；用户已于 2026-11-04 08:50 重启 3080，agent 已用 ego-browser 完成实机自查并修复“引用与对话框不对齐”；待用户按 ACCEPTANCE-v3 抽验确认**；§0 为开发前基线留档
- 依据：[`DECISIONS.md`](DECISIONS.md)（唯一决策源）、[`adr/0003-canvas-agent-bridge.md`](adr/0003-canvas-agent-bridge.md)（架构）、
  [`SPIKE.md`](SPIKE.md)（先验证什么）
- 原则：**先 spike 后写产品代码**；所有自动验证在隔离 `DSH_HOME`；3080 由用户重启；真实 store 零写入（自动化）；实机自查的临时数据已清理/归档，见 §4.4。

## 0. 开发前状态（2026-11-04 核对）

| 检查 | 结果 |
|---|---|
| 基线测试 | `node test/smoke.mjs` = 114 checks passed / SMOKE OK；`node test/client-smoke.mjs` = 52 / CLIENT SMOKE OK |
| 当前 3080 | 运行 v2；本轮不改、不重启 |
| 隔离环境 | `scripts/spike-env.ps1` 已实测：25s 启动、带 token URL、token 化请求 200、未认证 401、`-Stop` 释放端口 |
| 凭证 | spike home 只读复制 `.credentials.yaml`；真实 `%USERPROFILE%\.dsh` 不被写 |
| 决策/文档 | DECISIONS、ADR-0003、SPIKE、旧文档取代标注、STATUS/README 已同步 |
| 产品代码 | 未改动（v2 原样） |
| 端口 | 3091/3092/3093 空闲 |

## 1. 里程碑（2026-11-04：P0–P4 完成，P5 自动化完成、人工走查待用户）

| 阶段 | 内容 | 退出条件 | 状态 |
|---|---|---|---|
| P0 Spike | 一次性最小插件 + 11 项验证（见 SPIKE.md） | 每项通过或明确降级；降级已回写 DECISIONS | ✅ 全部通过、无降级；证据归档 `docs/evidence-v3/` |
| P1 承载 | 画板从 `conversation.view` 搬到右侧栏 tab；拆掉画布内 AI 卡片/第二输入框 | 隔离实例里画板常驻右栏、对话共存、默认宽度可用 | ✅ |
| P2 桥接 | 选区 → composer dock chip → 原生引用 chip；发送时序列化（小选区全量 / 大选区短标记）；B6 选区快照图片 | 发送后模型可用 canvasId 工具、会话里整块渲染、图片附件可选 | ✅（含 B6 快照：e2e 覆盖草稿预览与发送后 image） |
| P3 工具 | `read_selection`（翻译+JSON）+ `replace_selection`（原子写、expectRev、字段合并、claim 内部化、颜色名/hex 归一化）；AI 开关 Host 校验 | Host smoke + 冲突/关闭用例绿 + e2e 模型真改画板 | ✅（host smoke 216；e2e 改色→toast→撤销） |
| P4 收尾 | 停止/撤销/反馈、i18n、死代码清理、错误文案、guide 入口 | 无裸 key、无死 CSS、无旧入口残留 | ✅ |
| P5 验证 | 扩展单测；隔离 e2e；人因走查；文档/版本 | 验收清单全绿 + 用户重启 3080 通过 | 自动化 ✅；人工走查待用户（ACCEPTANCE-v3） |

## 2. M1 任务分解

| # | 任务 | 主要文件 | 依赖 | 验收 |
|---|---|---|---|---|
| T1 | Spike：最小插件 + 11 项验证 + RESULT | `docs/SPIKE.md`、`docs/evidence-v3/` | — | ✅ 11/11 通过、无降级 |
| T2 | 承载迁移：注册 `sidebarRightTabs` + guide + keyed `sidebar.right.pane.tab`；移除 `conversation.view` 与画布 AI 卡片 | `client.js` | T1 | ✅ 右栏 tab 常驻；e2e 断言无旧视图 |
| T3 | 引用入口：选区状态 → composer dock chip → 原生引用 chip → `codec.serialize`；userText 渲染规则；B6 可选选区快照 | `client.js` | T1 | ✅ 选中出 chip；插入不可编辑；发送后消息整块可读；快照图片随引用进入草稿 |
| T4 | 序列化器：表头（含 canvasId）+ 对象行；≤20 全量、>20 短标记；颜色/坐标/文本截断；失效对象标注 | `client.js`（纯函数，可单测） | T3 | ✅ client-smoke 17 项覆盖 |
| T5 | 工具契约：`read_selection` + `replace_selection`（原子、expectRev、field merge、冲突文本、hex 颜色归一化） | `host/tools.js`、`host/engine.js`、`host/model.js` | T1 | ✅ host smoke：正常/过期 rev/字段冲突/AI 关/hex |
| T6 | AI 开关：`session_pref.aiByCanvas`；客户端隐藏入口；Host 拒绝 | `host/routes.js`、`host/engine.js`、`client.js` | T2,T5 | ✅ e2e 断言写读一致 |
| T7 | 停止/撤销/反馈：`remote.session.cancel`；画布闪烁+toast+撤销；模型一句话汇报 | `client.js`、`host/*` | T3,T5 | ✅ 停止在 P0 spike 验证；撤销/反馈沿用 v2 |
| T8 | 清理：旧 AI 卡片/座位/aiStore 路径、死 CSS、裸 i18n key、错误文案 | `client.js`、`locale` | T2 | ✅ 无旧入口、无裸 key |
| T9 | 测试：扩 smoke/client-smoke；`test/e2e/v3.mjs`（隔离 home、Playwright）；真实 store 零写入断言 | `test/*` | T2–T8 | ✅ 216 + 105 + E2E V3 OK（含实机 bugfix 回归） |
| T10 | 文档/发布：ACCEPTANCE-v3、ADR 状态、STATUS、README、版本 3.0.0 | `docs/*`、`package.json` | T9 | ✅ 本文件 + README + ACCEPTANCE-v3 |

文件边界（逻辑分区，物理仍是单 `client.js` 入口）：

```
client.js
  ├─ canvas/*     数据/同步/撤销（沿用 v2，搬家/清理）
  ├─ canvas/view  绘制/选择/工具栏
  ├─ canvas/panel 右栏页面（画板列表/AI 开关/放大）
  └─ bridge/*     选区状态、引用 chip、序列化、userText 规则、模型视角面板
host/*            工具契约/claim 内部化/pref（不重写数据层）
docs/evidence-v3/  P0 证据（原一次性 spike 插件已删除）
```

## 3. 测试矩阵

| 层 | 命令/方式 | 覆盖 | 约束 |
|---|---|---|---|
| Host 单测 | `node test/smoke.mjs` | 工具契约、rev/field merge、AI 开关注入、undo | 纯内存/临时 store |
| 客户端单测 | `node test/client-smoke.mjs` | 序列化格式/阈值、选区冻结、失效标注、快照边界 | 无浏览器 |
| 隔离 e2e | `node test/e2e/v3.mjs` | 右栏承载、keepMounted、dock chip、原生 chip、发送后整块渲染、AI 开关持久化、B6 快照图片、模型 `replace_selection` 改画板 + toast 撤销、无 `conversation.view` | 隔离 DSH_HOME（`<workspace>\.spike-e2e`，每次跑前清空），真实模型 4 轮 |
| 真实 store 断言 | e2e 内快照真实 `storages/whiteboard` 与 sessions 的 mtime/数量 | 零写入 | 只读检查 |
| 人工验收 | ACCEPTANCE-v3 清单 | 冷启动、首 5 分钟、3 视口 × 缩放 × 明暗主题、无裸 key | 用户重启 3080 后执行 |

## 4. 数据卫生（真实 store 残留清单，**执行前需用户确认**）

来源：`%USERPROFILE%\.dsh\storages\session_projcache\sessions\*` 与 `storages\whiteboard\*`（2026-11-04 01:3x 核对）。

### 4.1 会话（建议清理）

| 会话 id | 标题 | 创建 | 最后写入 | 判定 |
|---|---|---|---|---|
| `session-d0738a2a-53f9-477b-a1aa-49be9ab1b282` | 问候 | 11-03 15:50 | 16:28 | 我的测试会话（“画板 6”的两块矩形来自它） |
| `session-121a4a9d-8d66-4e33-8f7e-f6c78f011532` | 问候 | 11-03 16:22 | 17:07 | 我的测试会话（默认画板的 AI 矩形来自它） |
| `session-2aef8e09-f1a6-41de-bcb4-d81fd2527b26` | （空） | 11-03 16:47 | 16:52 | 空会话，`blank=true` |

保留：当前会话 `session-3c23ab7c…`、`session-1271f9e9…`（DSH-Ops）、`session-bcbdf403…`（Side: New thread，用户侧边会话）及更早的会话。

### 4.2 画板（建议清理）

| 画板 id | 名称 | 内容 | 判定 |
|---|---|---|---|
| `cv-mw0f4t6e-5kfc` | 画板 6 | 2 个 user 矩形（来自 `session-d0738a2a`） | 测试板，建议删除 |
| `cv-mw0e4cs3-0yy2` | 画板（默认） | rev 12：AI 矩形 `el-mw0ffcho-2-nzu5` + user 矩形 `el-mw0fu2qt-1-e7wd`（来自 `session-121a4a9d`）+ 2 个“你好世界”文本（当前会话，用户自己画的） | **不删整板**；是否删掉前两个元素由用户确认 |

### 4.3 偏好（可选清理）

5 个 `session_pref` 中 4 个指向已删除的画板（`cv-mw0eqqmq-uacs`、`cv-mw0ex1eg-dvtz`、`cv-mw0eirj7-kqql`、`cv-mw0efemx-wu5h`），
`session-d0738a2a` 指向 `cv-mw0f4t6e`。删除会话/画板后这些记录会失效但不影响使用；
清理时机 = 4.1/4.2 执行后一并删，或保留（下次打开会覆盖）。

> 清理动作等用户确认后执行；不确认就保持原样，不影响 v3 开发（所有测试在隔离 home）。

### 4.5 2026-11-04 12:2x 清理执行（用户确认「肯定要清理干净」）

已执行并验证：

- 删除测试会话 4 个：`session-d0738a2a`、`session-121a4a9d`、`session-2aef8e09`，以及已归档的
  「只回复 LIVE-OK 验证」`session-e10700c4`；对应 `.dsh/sessions/...` 日志目录与
  `storages/session_projcache/sessions/*.json` 一并删除。
- 删除测试画板 `cv-mw0f4t6e-5kfc`（「画板 6」）。
- 默认画板 `cv-mw0e4cs3-0yy2` 只删除 2 个测试元素 `el-mw0ffcho-2-nzu5`、`el-mw0fu2qt-1-e7wd`；
  保留用户随后画的文字、笔迹和 50 个 AI 绘图元素（rev 46）。
- 删除 6 个失效/测试 `session_pref`；`workspace.json` 中对应会话 id 已移除。
- 备份：`E:\deepseek_harness_workspace\_cleanup-backup\20261104-122234`（不属于插件仓库）。
- 清理后 3080 刷新页面：侧栏不再出现「问候」「只回复 LIVE-OK 验证」等测试会话；画板列表只剩默认画板。

### 4.4 2026-11-04 实机自查新增（已自行处理）

- 临时画板「画板 3」（`cv-mw1f0ufo-jh05`）已通过画板下拉删除，store 中已不存在。
- 临时会话「只回复 LIVE-OK 验证」已从活动列表**归档**（不是物理删除）；它只包含本次自查的
  LIVE-OK 消息、AI 改色/撤销与一次停止试验，无用户内容。若用户希望彻底清掉，可在归档列表里删除，
  或在 4.1 清理时一并处理（按标题定位即可）。
- 本次自查未改动默认画板；默认画板仍是 §4.2 记录的 rev 12 / 4 个元素状态。

## 5. 发布与回滚

- 版本：M1 完成 → `package.json` 升 `3.0.0`；`cordis.patch.yml` 不变。
- 安装：`scripts/install-v3.ps1` → 用户重启 3080 → 验收。
- 回滚：`scripts/rollback-v1.ps1` 指回 `../whiteboard-plugin-v1`（v1 原样保留）；数据 schema 不变，回滚不迁移。
- 不自动重启 3080；不自动删除真实数据；不把 `.spike/` 打包进插件。

## 6. 文档交付

- [`DECISIONS.md`](DECISIONS.md)：决策状态随 spike 降级/实现结果更新（只改状态，不改历史）。
- [`adr/0003-canvas-agent-bridge.md`](adr/0003-canvas-agent-bridge.md)：完成后状态改“已实现”。
- `docs/ACCEPTANCE-v3.md`（新增，人因验收清单）。
- `STATUS.md`、`README.md`、`docs/SPIKE.md`（结论链接）。

## 7. 风险

| 风险 | 缓解 |
|---|---|
| 引用 chip 内部接口不稳 | spike 双向验证；失败降级 typed `insertText` 短标记（交互不变） |
| 右栏窄宽度不可用 | 默认 expanded/放大入口；验收含 1280×720 |
| 真实模型 e2e 慢/不稳定 | e2e 只跑 4 轮固定小任务；UI 断言用无模型 probe；人工验收兜底 |
| 隔离 home 初始化慢 | 脚本 90s 超时 + 日志；首次可预热 profile |
| 清理误删用户内容 | 清单+确认；只删 4.1/4.2 明确项；默认画板只删指定元素 |
| 与 DSH 版本漂移 | 插件针对 0.2.1-rc.5；`sidebarRightTabs`/引用接口变更时按降级路径 |

## 8. 开工前检查清单（已全部完成；M1 实现与自动化验收见 §1/§2）

- [x] 决策收敛并落盘（DECISIONS / ADR-0003）
- [x] 旧文档取代标注（ADR-0002 / phase-bc-spec / ACCEPTANCE / prototype README）
- [x] 基线测试绿（114 + 52 → M1 后 216 + 105）
- [x] 隔离环境脚本可用并实测
- [x] 残留清单（待用户确认后清理）
- [x] Spike 验证项与降级路径（SPIKE.md）
- [x] M1 任务分解 / 测试矩阵 / 发布回滚
- [x] STATUS / README 同步
- [x] 创建 goal → P0 spike 开工（spike 通过，M1 已实现）







