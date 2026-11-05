# 架构

[English](architecture.md) | 中文

本包是根目录 JavaScript/ESM 的 DeepSeek Harness（DSH）插件，不是 TypeScript workspace。详细合同见[项目上下文](PROJECT-CONTEXT.md)与产品 ADR；本页说明运行时归属和数据流。

## 运行时边界

- `index.js` 是 Host 入口，注册存储、路由以及 `whiteboard_read_selection` 和 `whiteboard_replace_selection` 工具。
- `host/` 拥有画板模型、验证、持久化 store、单写入者引擎、HTTP 路由和工具合同。
- `client.js` 拥有浏览器渲染、原生右侧栏 tab 和按会话隔离的选区引用桥接，不拥有持久化状态。
- `test/` 包含 Host 与客户端逻辑的 Node 冒烟套件，以及可选的隔离浏览器/模型端到端检查。

Host 是持久化画板和会话偏好状态的唯一 owner。客户端选区数据只是按会话隔离的桥接引用；正常 DSH 输入框仍是唯一会话输入面。Host 写入使用修订检查、字段级人类优先合并、稳定错误码，并且每次操作只有一个撤销步骤。

## Bundle 边界

`package.json` 声明私有包、ESM 导出、DSH engine 范围、客户端注入项和 `cordis.patch.yml` bundle patch。该 patch 把插件插入 DSH bundle，而不是创建第二个应用 workspace。locale 元数据和 `icon.svg` 是包资源。

## 扩展点

画板 HTTP 操作位于 `/api/whiteboard/v2`。模型侧变化属于 Host 工具 schema 和引擎合同；右侧栏与输入框变化属于 `client.js`。修改持久化文档、工具错误或 DSH 注册时，必须同步所属项目上下文、ADR、测试和发布证据。

本插件没有 `apps/` 或业务 `packages/` 成员。模板提供的 TypeScript、Vitest 与 pnpm workspace 门禁并未启用；可运行检查以 package manifest 和 CI 为准。
