# 条件性测试证据

[English](testing-conditional.md) | 中文

本参考仅在相应对象实际存在时说明 harness、UI、迁移、平台与性能证据，不代表已安装测试基础设施或已有通过结果。[测试策略](testing.zh.md)拥有可用检查与执行规则；[条件性领域规则](defensive-patterns/conditional-domains.zh.md)拥有适用的实现约定。

<a id="conditional-evidence"></a>
## 条件性证据

按测试主体和必须保持真实的下游实现选择 harness，声明替换边界与限制。完整客户端 fixture 可组合明确的 double，不存在通用的 double 数量上限。durability、恢复、通知与 claim-policy 测试使用生产对象；仅当被省略行为不是测试主体时，才适合使用进程内 structural stub。不应调用的依赖用 fail-fast stub。缺 service、未 stub 的 endpoint 或脚本耗尽必须响亮失败；即使产品捕获 mock 错误，未匹配调用仍在 teardown 再次令测试失败。有状态 handler、queue 与 promise 每测试局部持有。生成合同暂时解析成 `any` 不是严格类型证据；交付前须生成并检查真实声明。

说明每种 harness 无法提供的证据。allow-all UI fixture 不证明拒绝授权；in-process proxy 或按引用 mock 不证明 JSON 编码、生成 codec、wire name、scoped identity 或 gateway 生命周期。覆盖宽松 hook 或使用真实授权测试拒绝。stream drained 只证明拉取，不证明处理，除非处理发生在该 read loop 内。按首次调用顺序绑定的 replay 不证明并发 sibling 确定性。共享 arrival-order fault cursor 不会为每个并发 session 分配固定 fault；必要时隔离实例。记录压力测试 seed；合成权重不是生产事故频率。终止直接子进程不证明整个进程树已清理。

UI 变更测试真实浏览器用户路径，而不只测 render helper：按适用对象验证首帧值、稳定节点/focus/selection/草稿、列表插删身份、两个并存 scope、键盘访问、reduced motion、route 子路径与真实清理。真实运行时注册测试 dispose owner 并观察移除；手工 injection 不证明交付的 loader/组合。在相应平台测试真实平台边界，明确报告 skip 与缺少能力。运行零测试或扫描零个必需源码对象的绿色不是验收。

历史输入、迁移结果 oracle 与当前 native-writer oracle 是独立工件。格式归一化前比较迁移和 native target 输出；只掩码声明的 volatile 字段，不通过转回旧格式或删除字段来掩盖结构差异。用户 corpus 保持只读，使用前派生 sanitized fixture。拒绝授权测试的 cwd 必须实际处于 ambient 自动授权之外；harness 已授权的临时目录不能证明拒绝。包含合法显式授权正例。

资源测试使用私有独占路径、动态分配端口与调用方拥有的清理。保留调用方传入的工作目录，不当成 harness-owned 删除。等待可观察工作与子进程退出，失败后仍恢复环境，并区分进程树限制。预期拒绝检查文档化退出状态，而非任意失败。性能声称使用真实用户路径，准备与测量分开，标识机器/平台，保留原始样本与明确预算，并用代表性负载验证规模变化；合成输出或单次计时不能建立普遍速度或内存结论。真实 API 凭据、录制、远端变更与宿主修改各自需要授权；权限缺失是须报告的证据边界，不是假 fallback。
