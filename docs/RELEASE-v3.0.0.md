# 发布说明：`@local/whiteboard` 3.0.0

> 状态：**源码发布基线已建立**（git 仓库 + `v3.0.0` tag + MIT License）。
> 代码/测试/实机验收已就绪；远端仓库地址与 npm 发行方式待定，见 §4。
> 生成日期：2026-11-04（Asia/Shanghai）。

## 1. 发布物

| 项 | 值 |
|---|---|
| 包名 | `@local/whiteboard` |
| 版本 | `3.0.0`（首次公开发布，包含验收后修复） |
| 形态 | DSH Cordis bundle（`cordis.patch.yml` 插入 `whiteboard` 条目） |
| 入口 | `index.js`（Host）/ `client.js`（浏览器） |
| 兼容环境 | `@deepseek-ai/dsh` `0.2.1-rc.5`，Web profile |
| 当前 tag/commit | `v3.0.0`（本地 git tag；远端待推送） |
| 许可证 | MIT（见根目录 `LICENSE`） |

发布物按 `package.json` 的 `files` 字段打包：

```
index.js
client.js
host/
cordis.patch.yml
CHANGELOG.md        # 由 files 显式包含
README.md           # npm 自动包含
LICENSE             # npm 自动包含
```

`docs/`、`scripts/`、`test/` 默认**不进 npm 包**；如果要随包分发安装脚本/文档，
需要调整 `files` 或改为源码仓库分发。

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
| 1 | 发布形态 | **源码 Git 仓库（本地基线已建立）** | 提供远端地址后 `git push`；内部 bundle 可作为附带分发 |
| 2 | 包名 | 保留 `@local/whiteboard`（源码/bundle 名称） | 只有走 npm 时才需要换 scope，并同步 `cordis.patch.yml`、安装脚本、profile manifest |
| 3 | `private` | 保留 `true` | 内部 bundle 可保留；npm 发布前移除 |
| 4 | 许可证 | **MIT**（已添加 `LICENSE` + `package.json`） | 无 |
| 5 | 仓库 | **已 `git init` + 首次 commit + `v3.0.0` tag** | 添加远端并推送 |
| 6 | DSH 兼容声明 | 仅实测 `0.2.1-rc.5` | 公开/正式发布前决定是否加 `peerDependencies`/最低版本说明 |
| 7 | npm 包内容 | 本次不走 npm；源码仓库含 docs/test/scripts | 若后续发 npm：用 `files` 精简（当前 14 文件 / 65.5 kB，含 README/CHANGELOG/LICENSE） |
| 8 | 截图隐私 | 真实会话截图 `docs/evidence-v3/live-*.png` **已从 Git 排除**（`.gitignore`），仅本地保留；仓库内 e2e/spike 截图已裁掉左侧会话栏/头像 | 公开仓库如需实机截图，先脱敏 |

本地 `v3.0.0` 是当前发布基线；在推送远端前不要执行 `npm publish`。

## 5. 发布方式

### 方案 A：内部 bundle 分发（最贴近当前使用方式）

1. 确认 profile 链接指向本目录：`scripts\install-v3.ps1`。
2. 把本目录整体打包/共享给使用者。
3. 使用者将 `@local/whiteboard` 放到其 profile 的 `node_modules` 下（或 junction）。
4. 重启 `dsh web`，刷新页面验证。

优点：无需改包名/许可证；缺点：不是标准生态分发。

### 方案 B：Git 源码仓库（本次采用）

本地已经执行：

```powershell
cd <path-to>\whiteboard-plugin-v2
git init -b main
git add .
git commit -m "whiteboard v3.0.0"
git tag v3.0.0
```

剩余：把本地仓库推到远端。

```powershell
git remote add origin <your-repo-url>
git push -u origin main --tags
```

`LICENSE`、`CHANGELOG.md` 已提供；`.gitignore` 已排除
`.spike-e2e/`、`test/e2e/.artifacts/` 等临时产物。

### 方案 C：npm 包

1. 改包名（如 `@your-scope/dsh-whiteboard`），移除 `"private": true`。
2. 补 `license`、`repository`、`homepage`、`keywords`、`engines`/`peerDependencies`。
3. 检查 `cordis.patch.yml` 与安装脚本中的包名一致。
4. `npm pack --dry-run` 检查内容；`npm publish --access public`（或私有 registry）。
5. 用干净 profile 安装并重启验证。

## 6. 发布前检查清单

- [x] 发布方式按推荐采用：源码 Git 仓库 + MIT License
- [x] `LICENSE` 已添加（MIT，`package.json` 同步 `"license": "MIT"`）
- [x] `git init -b main` + 首次 commit + `v3.0.0` tag
- [x] `.gitignore` 排除临时产物（`.spike-e2e/`、`test/e2e/.artifacts/`、`node_modules/`）
- [x] `npm test` 216 + 105 全绿
- [x] `node test/e2e/v3.mjs` → E2E V3 OK，并更新 `v3-result.json`
- [x] `npm pack --dry-run` 内容符合预期（14 文件 / 65.5 kB，含 README/CHANGELOG/LICENSE）
- [x] README/INDEX/PROJECT-CONTEXT/RELEASE/CHANGELOG 链接可点
- [x] 真实会话截图 `live-*.png` 已从公开 Git 排除（`docs/evidence-v3/README.md` 说明）
- [ ] 推送远端仓库 + 建 Release（需要你提供仓库地址）
- [ ] 公开/正式发布前决定 DSH 兼容声明（`peerDependencies`/最低版本）
- [ ] 真实 store 旧测试残留清理（可选，需用户确认；见 `PLAN-v3.md` §4）
- [ ] 决定是否把 `whiteboard-plugin-v2` 改名为 `whiteboard-plugin`（历史文档去留）

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
  → profile 指回 `..\whiteboard-plugin`，重启 `dsh web`。
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
