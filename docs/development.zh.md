# 开发指南

[English](development.md) | 中文

本指南说明根目录 JavaScript/ESM DSH 插件的日常开发。[架构](architecture.zh.md)拥有运行时边界，[测试策略](testing.zh.md)拥有测试证据，[项目上下文](PROJECT-CONTEXT.md)拥有产品合同。

<a id="setup-tutorial"></a>
## 环境准备教程

### 前置条件

- 使用支持包 ESM 语法和 npm 的 Node.js 版本。本包没有声明 Node 版本范围；DSH 安装提供自身的兼容性要求。
- 冒烟检查只需要 Node.js 和仓库文件，不需要 DSH 服务、浏览器或 workspace 包安装。
- 可选端到端检查还需要 DSH 安装、Chrome、凭据以及测试所需的隔离 store 前置条件。

### 日常工作流

1. 修改行为前阅读根 [AGENTS.md](../AGENTS.md)、[项目上下文](PROJECT-CONTEXT.md)和所属 ADR。
2. Host 修改放在 `index.js` 或 `host/`，客户端修改放在 `client.js`；保持持久化文档形状、工具错误合同、原生输入框集成和按会话隔离的选区桥接。
3. 可观察行为变化时同步更新测试和所属文档。
4. 运行适用的最小检查，然后报告命令及结果。

<a id="verify-a-change"></a>
## 验证变更

根据需要在仓库根目录运行：

```sh
npm test
node --check index.js
npm run test:e2e
```

`npm test` 是当前启用的必需冒烟检查，目前运行 216 项 Host 检查和 105 项客户端检查。修改 Host 入口时运行 `node --check index.js` 做针对性语法检查。只有具备 DSH、Chrome、凭据和隔离 `DSH_HOME` 前置条件时才运行 `npm run test:e2e`；它是可选检查，绝不能使用真实 DSH store。执行前阅读[测试证据规则](testing.zh.md#证据规则)，核对父目录中的凭据副本、排除与清理方式。

## 运行时与发布流程

仅客户端修改在刷新 DSH 页面后生效。Host 或 bundle 修改需要重启 DSH web 进程。修改 `package.json` 或 `cordis.patch.yml` 时检查包导出、locale 元数据、图标、bundle 插入项和回滚文档；本包保持私有，不发布到 npm。

## 仅作参考的治理资产

模板中的 TypeScript、Vitest、pnpm workspace、翻译配对与聚合门禁工具并未作为本项目的有效工具接入。manifest 声明 `npm test` 和可选的 `npm run test:e2e`；根指令记录了 `node --check index.js`，CI 也会运行该语法检查。本项目没有启用 typecheck、build、Vitest、workspace 或覆盖率门禁。保留的技能与治理说明仅作参考。
