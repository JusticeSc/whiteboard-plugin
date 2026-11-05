# 发布说明：`@local/whiteboard` 3.0.0

> 历史适用范围（2026-11-05 补充）：本文保留当时计划和证据；“零写入”仅指所选大小/时间戳快照，不能证明全盘不变。旧安装/回滚探针曾操作真实 profile，现已改为临时合成 fixture；当前隔离方式和证据边界见 [测试说明](../test/e2e/README.md)。

> 状态：**已发布到 GitHub**（public repo + `v3.0.0` Release + MIT License）。
> **分发方式 = DSH bundle 安装；不发布 npm**（见 §4/§5）。
> 生成日期：2026-11-04（Asia/Shanghai）。

## 1. 发布物

| 项 | 值 |
|---|---|
| 包名 | `@local/whiteboard` |
| 版本 | `3.0.0`（首次公开发布，包含验收后修复） |
| 形态 | DSH Cordis bundle（`cordis.patch.yml` 插入 `whiteboard` 条目） |
| 入口 | `index.js`（Host）/ `client.js`（浏览器） |
| 兼容环境 | `@deepseek-ai/dsh` `0.2.1-rc.5`，Web profile |
| 当前 tag/commit | `v3.0.0`（已推送） |
| 远端仓库 | [github.com/JusticeSc/whiteboard-plugin](https://github.com/JusticeSc/whiteboard-plugin)（public，`main` + `v3.0.0` tag） |
| GitHub Release | [v3.0.0 — 画板插件首次发布](https://github.com/JusticeSc/whiteboard-plugin/releases/tag/v3.0.0) |
| 许可证 | MIT（见根目录 `LICENSE`） |

发布物是可直接安装的 DSH bundle 目录，`package.json` 的 `files` 覆盖运行所需文件：

```
index.js
client.js
host/
cordis.patch.yml
locale/en.json      # Plugin Manager 展示标题/描述
locale/zh.json
icon.svg            # bundle 图标
CHANGELOG.md
README.md
LICENSE
```

`docs/`、`scripts/`、`test/` 留在 GitHub 源码仓库，供开发/验证使用；本地目录安装时 DSH 会链接整个 checkout，
但它们不参与运行时加载，也不发布到任何 registry。

## 2. 自 v3 开发基线以来的内容

### 产品能力

- 右侧栏常驻画板 tab（keepMounted，切会话/切 tab 不丢）。
- 画笔/矩形/椭圆/箭头/文字/橡皮，选择/框选/拖动，5 色主题色板，缩放，撤销/重做。
- 多画板：新建/切换/重命名/删除、JSON 导入导出、PNG 导出。
- 选区 → 主输入框上方引用 chip → 原生引用 + 用户指令发送；聊天记录显示紧凑 chip。
- 模型工具：`whiteboard_read_selection` / `whiteboard_replace_selection`。
- `expectRev` 原子写、字段级冲突（人类优先）、单步撤销、可读错误。
- 按（画板 × 会话）AI 开关，客户端 + Host 双侧执行。
- 可选选区快照图片；原生停止生成；刷新/重启持久化。

### 验收后修复（本次 3.0.0 包含）

1. dock 引用 chip 与主输入框卡片左缘对齐（窄栏/宽栏/窄窗口三态 delta=0）。
2. 历史用户消息不再只剩引用 chip，用户指令文本保留。
3. 文字内容被模型改写后，选区/命中/框选按当前文字实时测量。
4. 「品牌色」从近黑 `--dsw-alias-brand-primary` 改为主题业务蓝
   `--dsw-alias-state-business-primary`（亮色 `#4176e6`），与墨色可区分。

## 3. 验证状态

| 检查 | 命令 | 结果 |
|---|---|---|
| Host 单测/冒烟 | `npm test` 的第一段 | **216 checks passed / SMOKE OK** |
| 客户端纯逻辑/注册面 | `npm test` 的第二段 | **105 checks passed / CLIENT SMOKE OK** |
| 隔离端到端 | `node test/e2e/v3.mjs` | **E2E V3 OK**（exit 0） |
| 真实 store 零写入 | e2e 前后快照 | `zeroWrite.ok = true` |
| 页面/控制台错误 | e2e 采集 | 0 pageerror / 0 console error |
| 实机验收 | 真实 3080 + ego-browser | 对齐/指令/文字选区/品牌色/停止/删除画板等，见 `evidence-v3/` |

最近一次 e2e 产物：`docs/evidence-v3/v3-result.json`（2026-11-04 11:57 复跑，含
`aiWrite`、`send`、`zeroWrite`、错误数组；`aiWrite.after = ["accent","accent"]`、
`zeroWrite.ok = true`、0 page/console error）。发布前建议再重跑一次并更新该文件。

## 4. 发布决策与当前状态（按推荐已执行）

| # | 决策 | 当前状态 | 下一步 |
|---|---|---|---|
| 1 | 发布形态 | **GitHub public 源码仓库 + DSH bundle 安装；不发 npm** | 使用者克隆仓库后用 `plugin_manager` / 插件页安装 bundle；后续更新走 `main`/PR |
| 2 | 包名 | 保留 `@local/whiteboard`（bundle 名称） | 不走 npm，因此无需改 scope |
| 3 | `private` | 保留 `true` | 不发布 npm；`private` 不阻止 DSH 从本地目录安装 |
| 4 | 许可证 | **MIT**（已添加 `LICENSE` + `package.json`） | 无 |
| 5 | 仓库 | **已发布** `main` + `v3.0.0` tag + GitHub Release | 后续新提交/新 tag；不改写已发布 tag |
| 6 | DSH 兼容声明 | 已加 `engines.dsh: >=0.2.1-rc.5 <0.3.0`（实测 `0.2.1-rc.5`） | DSH 升级后重新实测并放宽/收紧范围 |
| 7 | 分发内容 | 源码仓库含 docs/test/scripts；`files` 含 host/client/patch/locale/icon | 不发布 npm；打包检查只用于验证 bundle 文件完整 |
| 8 | 截图隐私 | 真实会话截图 `docs/evidence-v3/live-*.png` **已从 Git 排除**（`.gitignore`），仅本地保留；仓库内 e2e/spike 截图已裁掉左侧会话栏/头像 | 公开仓库如需实机截图，先脱敏 |

`v3.0.0` 是当前已发布基线；**npm 不是本项目的分发渠道**，DSH bundle 从 GitHub 源码安装即可。

## 5. 发布方式（DSH 规则）

DSH 的分发单位是 **bundle 包**，不是 npm 上的普通库：

- `package.json` 必须有 `dsh.bundle.patch`，指向 `cordis.patch.yml`；
- patch 里 `insert` 的每一行是插件条目（`id` + `name` + `config`）；Host/Client 入口由 `name` 对应的导出解析；
- 展示元数据来自 `locale/en.json` / `locale/zh.json` 的 `meta.title`、`meta.description`，图标来自 `./icon`；
- 兼容性由 `engines.dsh`（或 DSH peer 依赖范围）声明，不满足时 Plugin Manager 在安装前拒绝，启动时也会拒绝；
- 安装/升级用 DSH 的 Plugin Manager / `plugin_manager`（`install_bundle`），由 DSH 负责接入 profile；
- **npm publish 不是 DSH 插件发布的必要条件**；本项目保持 `private: true`，不走 npm。

### 方案 A：GitHub 源码 + DSH bundle 安装（本次采用）

1. `git clone https://github.com/JusticeSc/whiteboard-plugin.git`。
2. 在 DSH Web 的「插件」页或 agent 的 `plugin_manager` 里安装 bundle，目标填克隆目录的**绝对路径**。
3. 启用 `whiteboard` bundle；Host JavaScript 首次安装/替换按提示重启 `dsh web`，仅 client 刷新页面即可。
4. 用 `whiteboard_read_selection` / `whiteboard_replace_selection` 验证。

优点：不依赖 npm registry，版本/源码可审查；缺点是使用者需要先拿到源码目录。

### 方案 B：GitHub 仓库与 Release（已执行，作为源码来源）

已发布到 <https://github.com/JusticeSc/whiteboard-plugin>（public，`main` + `v3.0.0` tag），
并创建 [GitHub Release v3.0.0](https://github.com/JusticeSc/whiteboard-plugin/releases/tag/v3.0.0)。

本次执行过的步骤（可复现）：

```powershell
cd <path-to>\whiteboard-plugin
git init -b main
git add .
git commit -m "whiteboard v3.0.0"
git tag -a v3.0.0 -m "Whiteboard v3.0.0"
gh repo create whiteboard-plugin --public --source=. --remote=origin --push
git push origin --tags
gh release create v3.0.0 --repo JusticeSc/whiteboard-plugin --title "v3.0.0 — 画板插件首次发布" --notes-file <notes>
```

后续更新：在 `main` 上提交/PR，按需打新 tag 和 Release；不要改写已发布的 `v3.0.0` tag。
GitHub 仓库本身即可作为树内 bundle 源码；后续若需要单文件分发，可再附 Release 源码压缩包，
但仍不需要 npm。

### 方案 C：npm 包（**本项目不做**）

`private: true`、包名 `@local/whiteboard`、无 registry scope；用户已明确不走 npm。
如果未来改变决定，才需要改包名、移除 `private`、补 `license`/`repository`/`keywords` 并重新审查
`files`；那属于另一条发布路线，不影响当前 DSH bundle 安装。

## 6. 发布前检查清单

- [x] 发布方式按推荐采用：源码 Git 仓库 + MIT License
- [x] `LICENSE` 已添加（MIT，`package.json` 同步 `"license": "MIT"`）
- [x] `git init -b main` + 首次 commit + `v3.0.0` tag
- [x] `.gitignore` 排除临时产物（`.spike-e2e/`、`test/e2e/.artifacts/`、`node_modules/`）
- [x] `npm test` 216 + 105 全绿
- [x] `node test/e2e/v3.mjs` → E2E V3 OK，并更新 `v3-result.json`
- [x] DSH bundle 元数据：`dsh.bundle.patch`、`locale/en|zh.json`（title/description）、`icon.svg`、`exports`/`files`
- [x] DSH 兼容声明：`engines.dsh: >=0.2.1-rc.5 <0.3.0`（实测 `0.2.1-rc.5`）
- [x] `npm pack --dry-run` 内容符合预期（含 README/CHANGELOG/LICENSE/locale/icon；不发布 npm）
- [x] README/INDEX/PROJECT-CONTEXT/RELEASE/CHANGELOG 链接可点
- [x] 真实会话截图 `live-*.png` 已从公开 Git 排除（`docs/evidence-v3/README.md` 说明）
- [x] 推送远端仓库 + 建 Release（<https://github.com/JusticeSc/whiteboard-plugin/releases/tag/v3.0.0>）
- [x] 真实 store 旧测试残留已清理（2026-11-04 12:2x；备份见工作区 `_cleanup-backup/`）
- [x] 仓库名/源码目录统一为 `whiteboard-plugin`；v1 保留为 `whiteboard-plugin-v1`（历史文档保留）

## 7. 发布后验证

1. 新会话打开右侧栏 → 画板 tab 正常加载。
2. 画两个对象 → 选区 chip 出现且与输入框左缘对齐。
3. 插入引用、发送 → 消息显示 chip + 指令，模型能读。
4. 让模型改颜色 → toast + 撤销生效。
5. 关闭 AI → 模型调用被 `ai_disabled` 拒绝。
6. 刷新页面 → tab、画板内容、AI 开关、历史 chip 恢复。
7. 检查无 pageerror/console error。

## 8. 回滚

- 一步回滚：`powershell -ExecutionPolicy Bypass -File scripts\rollback-v1.ps1`
  → profile 指回 `..\whiteboard-plugin-v1`，重启 `dsh web`。
- 数据：canvas doc schema 未变，回滚 v1 不会破坏 v3 画板数据；但 v1 不读
  `session_pref.aiByCanvas`，行为回到旧版。
- 同目录代码回滚：`git checkout v3.0.0` 可回到本次发布基线；发布后的修改用
  `git revert`/回退提交，不要强推公共历史。

## 9. 已知限制

- 单用户、本机；无多人实时协作。
- 默认画板跨会话共享；600ms 轮询同步。
- 右侧栏约 575px；全屏为原生逃生口。
- 无连接线绑定、分组/帧/图层、图片对象、富文本。
- AI 为 selection-first：没有整板引用入口，不能凭空自动生成图表；
  下一阶段见 [`ROADMAP-v4.md`](ROADMAP-v4.md)。
- 快照开关不持久化；引用 chip 的 marker 是原生 `@`。
- 仅在 DSH `0.2.1-rc.5` 实测，其他版本未声明兼容。

## 10. 相关文档

- 项目上下文：[`PROJECT-CONTEXT.md`](PROJECT-CONTEXT.md)
- 文档索引：[`INDEX.md`](INDEX.md)
- 决策：[`DECISIONS.md`](DECISIONS.md)（含 §6 发布/下一阶段）
- 验收：[`ACCEPTANCE-v3.md`](ACCEPTANCE-v3.md)
- 架构：[`adr/0002-canvas-authority.md`](adr/0002-canvas-authority.md) /
  [`adr/0003-canvas-agent-bridge.md`](adr/0003-canvas-agent-bridge.md)
- 证据：[`evidence-v3/SPIKE-RESULT.md`](evidence-v3/SPIKE-RESULT.md)
