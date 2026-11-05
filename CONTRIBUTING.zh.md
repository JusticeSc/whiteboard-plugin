# 贡献

[English](CONTRIBUTING.md) | 中文

本仓库包含根目录 JavaScript/ESM 包 `@local/whiteboard`，它是 DeepSeek Harness（DSH）插件。`index.js` 与 `host/` 中的 Host 代码拥有持久化画板状态和工具；`client.js` 负责右侧栏渲染，并把选区引用桥接到原生输入框。

## 修改代码之前

先阅读根 [AGENTS.md](AGENTS.md)、[项目上下文](docs/PROJECT-CONTEXT.md) 以及所属产品或 ADR 文档。[架构](docs/architecture.zh.md)说明边界，[开发指南](docs/development.zh.md)说明日常流程，[测试策略](docs/testing.zh.md)说明证据，[文档标准](docs/AGENTS.md)说明贡献者文字要求。

## 工作流

- 一项变更聚焦一个可观察行为；行为变化时同步更新测试和所属文档。
- 保持 Host 权威、持久化文档形状、修订检查、字段级人类优先冲突、AI 开关执行、撤销行为和原生 DSH 输入框集成。
- 在边界验证不可信 JSON、HTTP 输入、导入的画板文档和工具参数；保持现有错误码与失败原因。
- 同一变更同时更新双语文档配对，保持内容等价；本包没有启用翻译记录命令。
- 不要提交凭据、`.spike-e2e/`、浏览器产物、缓存或生成输出；遵守插件专用的 `.gitignore` 排除项。
- 没有活跃的插件消费方需要时，不要新增依赖或配置。

## 验证

在仓库根目录运行覆盖变更的检查：

```sh
npm test
node --check index.js
npm run test:e2e
```

`npm test` 运行 Host 与客户端冒烟套件，是通常必需的检查。修改 JavaScript 入口时运行语法检查。只有在具备 DSH、Chrome、凭据和隔离 `DSH_HOME` 时才运行 `npm run test:e2e`；它是可选检查，绝不能使用真实 DSH store。报告实际运行的命令，并区分前置条件不可用与检查失败。

治理模板中的 TypeScript、Vitest、pnpm、覆盖率、workspace 与聚合门禁工具未接入为本插件的有效检查。manifest 和当前 CI 均未定义或调用这些门禁；请以以上命令和根目录指令为准。

## 审查与发布

依据项目上下文、ADR、[防御性指导](.agents/skills/)和实际测试审查变更。本地审查策略文件不能证明远端分支保护或 GitHub 工作流成功运行。包保持私有，通过 GitHub 源码分发并作为 DSH bundle 安装；不得发布到 npm。

## 许可证与溯源

插件贡献按仓库的 MIT [许可证](LICENSE)接受。不要复制许可证不兼容的代码、资产或文档。导入材料变化时，在 [SOURCE-LICENSE.txt](SOURCE-LICENSE.txt) 中记录来源。
