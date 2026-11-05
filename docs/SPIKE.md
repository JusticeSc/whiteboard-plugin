# Spike 计划（v3 承载 + 桥接，先于 M1）

> 历史适用范围（2026-11-05 补充）：本文保留当时计划和证据；“零写入”仅指所选大小/时间戳快照，不能证明全盘不变。旧安装/回滚探针曾操作真实 profile，现已改为临时合成 fixture；当前隔离方式和证据边界见 [测试说明](../test/e2e/README.md)。

> **状态（2026-11-04）：已完成，11/11 通过、无降级。** 一次性 spike 插件与 probe 脚本已删除；
> 结论、截图与结构化结果归档在 [vidence-v3/SPIKE-RESULT.md](evidence-v3/SPIKE-RESULT.md)。
> 本文件仅作为当时的计划与降级路径留档；§2/§3 里的 spike/ 目录已不存在。

- 目的：在**隔离环境**里验证 v3 依赖的 DSH 原生表面确实可用，把“能不能做”与“怎么做”定下来；
  不通过不开工正式代码。约 1 天，产物是一份结论 + 截图，不是产品代码。
- 铁律：不碰 3080、不碰真实 `DSH_HOME`、不往真实 store 写任何会话/画板/偏好。

## 1. 环境（已备好脚本）

```powershell
cd <path-to>\whiteboard-plugin
pwsh scripts/spike-env.ps1                    # 启动隔离 GUI（3091，输出带 token 的 URL）
pwsh scripts/spike-env.ps1 -PluginPath spike  # 先安装 spike 插件再启动
pwsh scripts/spike-env.ps1 -Stop              # 停止并释放端口
```

- `DSH_HOME` = `<workspace>\.spike\dsh-home`（可整个删除）；
- 从真实 DSH_HOME **只读复制** `.credentials.yaml`，模型可用；会话/画板/偏好完全隔离；
- 日志：`.spike\web.out.log` / `.spike\web.err.log`；pid：`.spike\web.pid`；
- 首次启动自动创建 `profiles/web`；安装插件后会二次启动（脚本已处理）。

已做过的环境验证（2026-11-04）：隔离实例 25s 内启动、打印带 token 的 URL、token 化请求 200、
未认证根路径 401、`-Stop` 后端口释放。

## 2. Spike 插件（goal 第一步创建）

目录 `spike/`（最小包，不进入产品构建）：

```
spike/package.json      name=@local/wb-spike, dsh.client={platform:'web', inject:[...]}
spike/index.js          Host：注册一个无副作用测试工具 + debug 端点
spike/client.js         验证项 1–8 的最小 UI（右侧栏 tab + composer chip + 模型视角抽屉）
```

## 3. 待验证项与判定

| # | 验证什么 | 怎么验 | 通过标准 | 失败降级 |
|---|---|---|---|---|
| 1 | 右栏 tab 注册/打开/keepMounted | `ctx.sidebarRightTabs.register` + `sidebar.right.pane.tab` 页面；切 tab 再切回 | tab 出现、标题正确、切走再回内容不丢 | 改用 `conversation.view`（回 v2 承载，暂停 M1 决策） |
| 2 | 默认右栏宽度可用 | 1280×720 与 1280×780；画布最小交互（选择/拖动） | 工具栏不被裁、可完成一次框选 | 默认 expanded；头栏提供“放大/全屏” |
| 3 | composer dock 能拿到 `inputActions` | `conversation.input.dock` 组件渲染 chip；调用 `insertText/submit` | chip 渲染、能拿到 actions、`submit` 生效 | 改注册 `conversation.composer.dock` |
| 4 | 引用 chip 插入 + 序列化 | 两种路径：`conversation.input.shell(id).insertFileReferences/insertReference`；`slash/input-insert-reference` 事件 | chip 是原子节点、不可编辑、可删除；发送后消息里出现序列化文本 | 降级为 `insertText` 一行短标记（DECISIONS B11） |
| 5 | 已发送消息渲染 | `uiConversation.userText.register(rule)` 渲染紧凑标签 | 标签替代原始块，回退可读 | 保留短标记文本（B12） |
| 6 | 图片附件 | `conversation.createDrafts(sessionId, files)` + `addAttachments` 或 composer dock 注入 | 会话/模型侧收到原生 image part | 已验证；B6 已在 M1 实现（默认关） |
| 7 | 原子写 + 冲突 + AI 开关 | `replace_selection(canvasId, expectRev, patches)`；人类并发改字段；关开关再调 | stale 返回可读冲突；人类字段保留；关闭后拒绝 | 保留显式 claimId 流程（B7 回退） |
| 8 | 真停止 | `remote.session.cancel({sessionId})`，观察 turn 结束 | 当前 turn 停止、无残留执行 | 用 `/claim/abort` + 提示 |
| 9 | 模型视角面板 | debug 抽屉显示序列化文本/工具入参/出参 | 人工可读、与真实 prompt 一致 | 仅保留日志 |

## 4. 证据与结论

- 截图放 `.spike/shots/`；结论写 `spike/RESULT.md`（每项：通过/降级 + 证据 + 备注）。
- 结论直接决定 `docs/DECISIONS.md` 的 B11/B12/B7 是否按“降级”列更新；若触发降级，先在文档里改状态，
  再进 M1。
- Spike 完成后，`.spike/` 可整体删除（结论已落盘到 `docs/`）。

## 5. 注意

- 首次启动若卡在 profile 初始化，等 90s 并看 `.spike/web.err.log`；不要连真实 3080。
- 插件装进隔离 profile 后需重启隔离实例（脚本自动做）；不要用 `pnpm install` 直接改真实 profile。
- 任何验证都不写真实 `%USERPROFILE%\.dsh`（凭证只读复制；spike 自己的 home 随便写）。


