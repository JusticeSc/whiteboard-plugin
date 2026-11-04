# e2e（真实浏览器 + 真实模型）

两个脚本，都**不会**碰正在运行的 3080，也不写真实 `DSH_HOME`：

```powershell
cd <path-to>\whiteboard-plugin-v2

node test/e2e/v3.mjs                # v3 全流程；自起隔离 DSH_HOME（<workspace>\.spike-e2e）+ 端口 3092
node test/e2e/install-rollback.mjs  # profile 链接 v1↔v2 反转，各起 throwaway host 验证安装/回滚
```

- `v3.mjs`：每次跑前清空隔离 home（`WB_E2E_KEEP_HOME=1` 保留以便排查）；`WB_E2E_PORT` 换端口，
  `WB_E2E_TIMEOUT` 换模型轮次超时（ms）。它用真实 Chrome（`--channel=chrome`，headless），
  通过右栏引导页打开画板，覆盖 dock chip → 原生 chip → 发送 → 整块渲染 → AI 开关持久化 → B6 快照图片 → 模型 replace_selection 改画板 → toast 撤销 → AI 关时写入被拒 → 删 chip 后 dock 重插 → 刷新持久化，
  最后对比真实 `DSH_HOME` 的 sessions / whiteboard / workspace.json 快照（size+mtime）确认零写入。
  截图与结果写 `.artifacts/`（失败时也会写 `v3-99-failure.png` 和 `v3-result.json`）。
- `install-rollback.mjs`：会临时改真实 profile 的 `@local/whiteboard` junction，结束后恢复原状；
  只应在确实要验证安装/回滚时手动运行，不要在 3080 正在使用的会话里跑。
- 依赖 `playwright-core`：本目录的 `node_modules` 是指向
  `..\..\..\whiteboard-plugin\test\e2e\node_modules` 的 junction（v1 目录里已有）。
  若该目录不存在，在 `whiteboard-plugin-v2\test\e2e` 下执行 `npm i playwright-core`，
  并用本机 Chrome（`--channel=chrome`）。
- 隔离环境手工复现：`pwsh scripts\spike-env.ps1 -Port 3091 -PluginPath .`（脚本仍保留；
  `.spike\dsh-home` 与 e2e 的 `.spike-e2e` 互不影响）。





