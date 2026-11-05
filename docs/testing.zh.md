# 测试策略

[English](testing.md) | 中文

本页记录根目录 JavaScript/ESM 插件当前启用的检查。命令以 [AGENTS.md](../AGENTS.md) 和 [package.json](../package.json) 为准；[开发指南](development.zh.md)拥有流程选择。

## 当前检查

- **Host 冒烟套件**（`node test/smoke.mjs`）：覆盖纯画板模型、claims、持久化 store 与引擎、v3 模型工具、AI 开关、撤销和 HTTP 路由。不需要浏览器或运行中的 DSH 实例。
- **客户端冒烟套件**（`node test/client-smoke.mjs`）：通过 stub 的 module loader 和 React 面加载 `client.js`，覆盖客户端映射、操作 diff、变更应用、桥接翻译、注册面和文字边界。不需要浏览器。
- **合并冒烟检查**（`npm test`）：运行两个套件，目前报告 216 项 Host 检查和 105 项客户端检查。
- **可选隔离端到端检查**（`npm run test:e2e`）：启动 throwaway DSH web 进程，使用 Chrome 和隔离的 `DSH_HOME`，检查真实右侧栏、输入框引用、AI 开关、持久化行为以及真实 store 保护。需要本地 DSH、Chrome、凭据和测试前置条件。
- **针对性语法检查**（`node --check index.js`）：不启动 DSH，检查 Host 入口。
- **Windows 脚本隔离回归**（`node test/install-rollback-isolation.mjs`）：验证合成 junction/manifest 切换、观察器失败后的清理和并发独立进程。CI 在 Windows 运行；它不启动 DSH，也不能替代浏览器/模型检查。

## 证据规则

行为变化后运行 `npm test`。只有前置条件可用时才运行 v3 端到端检查。其隔离 home 位于相对本仓库的 `../.spike-e2e/dsh-home`。脚本默认在启动时清空并重建该 home；`WB_E2E_KEEP_HOME=1` 会跳过重置。脚本会复制凭据且运行后保留该 home；执行前确认权限、独立忽略规则与清理方式。本仓库的 `.gitignore` 不覆盖父目录。浏览器产物不得提交。直接执行 scripts/install-v3.ps1 或 scripts/rollback-v1.ps1 会操作调用用户的 profile，不能替代隔离测试。[测试说明](../test/e2e/README.md)中的临时 fixture 验证合成链接切换，不证明历史 v1 运行兼容性。可选前置条件缺失不等于通过，应与测试失败分开报告。除非实际执行过，不要声称远端 CI、GitHub 分支保护或在线 DSH 会话已验证。

通过 Host 入口测试 Host 持久化和工具合同。通过现有桥接和原生输入框集成测试客户端选区状态；不要为了让测试通过而引入第二 store 或第二会话输入面。

## 仅作参考的检查

治理模板中的 TypeScript、Vitest、覆盖率、pnpm workspace、翻译配对、包导出与聚合门禁工具并未接入为本插件的有效检查。manifest 和 CI 均未定义或调用 `typecheck`、`build`、`check:all`、`check:ci` 或覆盖率阈值。这些内容仅作模板参考。
