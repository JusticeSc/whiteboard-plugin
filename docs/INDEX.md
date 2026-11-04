# 文档索引（发布版）

> 先读 [`PROJECT-CONTEXT.md`](PROJECT-CONTEXT.md)；要安装/发布读
> [`RELEASE-v3.0.0.md`](RELEASE-v3.0.0.md)；要了解下一步读
> [`ROADMAP-v4.md`](ROADMAP-v4.md)。

| 文档 | 作用 | 状态 |
|---|---|---|
| [`../CHANGELOG.md`](../CHANGELOG.md) | 版本变更记录（3.0.0 起） | 权威 |
| [`../README.md`](../README.md) | 项目入口：能力、目录、测试、安装/回滚、限制 | 权威 |
| [`PROJECT-CONTEXT.md`](PROJECT-CONTEXT.md) | 一页式项目上下文：定位、架构、数据流、不变量、文件地图、测试、限制、发布状态 | 权威（本文件） |
| [`ACCEPTANCE-v3.md`](ACCEPTANCE-v3.md) | v3 人工验收清单 | 权威 |
| [`DECISIONS.md`](DECISIONS.md) | 决策总表（S/B/C 编号 + 发布/下一阶段 R 编号） | 权威（决策唯一来源） |
| [`PLAN-v3.md`](PLAN-v3.md) | v3 M1 执行计划与 T2–T10 任务记录 | 已完成（历史计划） |
| [`adr/0002-canvas-authority.md`](adr/0002-canvas-authority.md) | CanvasDoc 权威、字段级合并、撤销 | 权威（架构） |
| [`adr/0003-canvas-agent-bridge.md`](adr/0003-canvas-agent-bridge.md) | 右侧栏承载 + 选区引用桥接 | 权威（架构） |
| [`evidence-v3/SPIKE-RESULT.md`](evidence-v3/SPIKE-RESULT.md) | P0 spike + 真实 3080 实机审查结论与截图 | 证据 |
| [`evidence-v3/v3-result.json`](evidence-v3/v3-result.json) | 隔离 e2e 机器结果 | 证据 |
| [`RELEASE-v3.0.0.md`](RELEASE-v3.0.0.md) | 发布说明、发布前检查、安装/验证/回滚 | 发布 |
| [`ROADMAP-v4.md`](ROADMAP-v4.md) | 下一阶段：canvas-first / 自动画图路线 | 计划（未实施） |
| [`ACCEPTANCE.md`](ACCEPTANCE.md) | v2 历史验收 | 历史（已被 ADR-0003 取代） |
| [`phase-bc-spec.md`](phase-bc-spec.md) | v2 阶段规格 | 历史 |
| [`prototype/`](prototype/) | v3 之前的原型与截图 | 历史资料 |

## 发布相关

- 版本号：`3.0.0`（首次公开发布，包含 QA 期修复）
- 兼容目标：`@deepseek-ai/dsh` `0.2.1-rc.5`（2026-11-04 实测环境）
- 包形态：DSH Cordis bundle（`cordis.patch.yml` 插入 `@local/whiteboard`）
- 发布形态：**已发布到 GitHub** <https://github.com/JusticeSc/whiteboard-plugin>（public，`v3.0.0` tag + Release + MIT）；
  npm 待定，见 [`RELEASE-v3.0.0.md`](RELEASE-v3.0.0.md) §4。
