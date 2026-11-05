# 防御性模式

[English](general.md) | 中文

来之不易的缺陷类别规则：以下每个模式都是来源项目中实际发布过或险些发布的缺陷类别，按防止其复发的规则陈述。在修改生成、抓取、缓存、输出写入、错误处理或 teardown 之前阅读本页。测试层面的对应规则（真实入口路径、验证世界、资源归属）见[测试策略](../testing.zh.md)。

## 独立报告正交结果

一个结果可以同时是几件事——进程可能超时，又因为捕获信号而以 0 退出。把每个独立事实（`timedOut`、`signal`、`exitCode`）单独暴露；绝不要把某个标志的报告嵌进另一个标志的分支，否则调用方会把被截短的运行读成干净成功。

判断条件是每个事实能否独立为真，并且不进入另一个条件的分支就能读取。边界是报告本身；进程如何被发信号或获得多长时间是另一个决定。

## 时序不承载正确性

正确性来自显式调用点与显式状态，绝不来自回调落在事件循环的哪个位置。一个决定工作是否正确的 `microtask`、`setTimeout` 或 `queueMicrotask` 会与程序其余部分竞争：轻负载下成立，繁忙或批处理变化时静默失败。

判断条件是正确性是否依赖“那个回调已经运行过”，而不是命名调用点或状态机。测试的超时预算是在等待失败，不是依赖时序的正确性；只为调节输出节奏的刻意延迟不属于本规则。

```ts
// The order is written into the code: close the old store, then build its successor.
declare let store: { close(): void }
declare function createStore(scopeKey: string): { close(): void }
declare const scopeKey: string

store.close()
store = createStore(scopeKey)
```

```ts ignore-check
queueMicrotask(() => { if (!ready) refresh() })   // assumes the microtask runs before the next frame
setTimeout(() => setReady(true), 0)                // waits for a render that was never sequenced
```

## 可选输入说明两种行为

可选参数说明被调用方在参数存在与缺失时分别做什么，这样调用方从合同读取两种行为，而不是从防御性运算符推断其中一种。不断累积的 `?.` 就是信号：每个都在替代一个关于字段是否应存在的决定。

判断条件是 `?.` 是否替代了“字段是否存在”的判定，而不是处理已知值上真正可选的一跳。合同说明两个分支及其副作用；无法说明两种行为的调用点是审查阻断项，不是风格偏好。

```ts
interface ResolveInput { options?: readonly string[] }
type Resolution = { kind: 'unknown' } | { kind: 'value'; value: string }

// Both behaviors are in the contract: no options means "unknown", not "skip".
function resolve(input: ResolveInput): Resolution {
  if (input.options === undefined) return { kind: 'unknown' }
  return { kind: 'value', value: input.options.join(',') }
}
```

```ts ignore-check
const value = a?.b?.c?.d ?? fallback   // four layers of fallback hide whether d should exist
```

## 一个值说明一个事实

未知值、空集合或空字符串，以及真正缺失的字段是三个不同事实，使用三种表示。一个 `undefined` 或 `null` 绝不代表其中多个；必须对不同情况采取不同行为的消费方要在边界显式区分，而不是把它们合并。

判断条件是单个“无值”是否承载多种语义：尚未查询、已查询但为空、无法确定。可辨识联合或显式枚举值通常是实现方式。

```ts
type ValueState<T> = { kind: 'unknown' } | { kind: 'empty' } | { kind: 'value'; value: T }
```

```ts ignore-check
return null   // means "not queried", "queried, nothing there", and "cannot tell", all at once
```

## 共享状态有唯一 owner

共享状态挂在有生命周期的对象上，因此其 owner 可命名。模块级缓存、单例、`globalThis` 字段或 `Symbol.for` 键隐藏了 owner，并在每次 teardown 之后继续存在。

判断条件：为该值命名 owner；若无法命名，先决定 owner 再实现。实例字段可以被任意数量消费方读取；跨领域传递该值要经过现有接口，而不是全局命名空间。确实需要全局查找键时，交给领域 owner 并同时给出回收策略。

```ts
// The cache hangs on the generator run; consumers receive it explicitly.
interface RunCache { get(key: string): string | undefined }
declare const cache: RunCache

const cached = cache.get('registry:@scope/example')
```

```ts ignore-check
globalThis.__cache = new Map()   // shared across runs, reclaimed never
```

## 迁移保持行为

迁移或包拆分保持可观察行为相等：错误码、诊断、数据流顺序与输出字节逐项比较。优先搬动代码，而不是删除后重写；重写适用于语义本来就在变化的代码，并且变更要列出差异。包或导出路径变化是载体变化，不是行为变化；行为变化是独立变更。

判断条件是变更前后可观察行为的逐项比较。无法完全相等时，变更说明不同项及各自的验证方式。迁移中发现的缺陷作为独立变更修复，不折入搬动。

```sh
# The move keeps paths and exit codes; the reference updates are the whole diff.
git mv apps/old/src/fetch.ts apps/new/src/fetch.ts
```

```ts ignore-check
// The migration silently upgrades the error handling it was only supposed to move.
throw new Error('not found')   // was: return { ok: false, code: 'not_found' }
```

## Dispose 必须达到静止，而不只是请求

杀死或中止后要等待子进程退出。可选通知可以提前停止；完成或最终持久化所需的资源与监听器必须存活到消费方安定为止。

判断条件是 teardown 等待真实静止，还是只发出请求。边界是没有 owner 可等待的工作——分离且未被观察的任务——teardown 无需追踪；组件启动且仍能观察到的任何工作，都必须在报告完成前等待。

## 在分发器中包含回调异常

捕获并报告每个监听器的异常，不让分发 promise 拒绝，也不让后续监听器挨饿。监听器的 owner 必须按错误处理规则处理它修改的状态；仅捕获并不能恢复状态。

判断条件是抛出的监听器能否拒绝分发 promise 或阻止后续监听器运行。边界是调用方自己的 await：分发器刻意传播给发起操作的错误不是包含失败。

```ts
async function dispatch(listeners: ((event: string) => Promise<void>)[], event: string): Promise<void> {
  for (const listener of listeners) {
    try { await listener(event) } catch (error) { console.warn('listener failed', error) }
  }
}
```

## 绝不把环境或可预测路径交给不可信输出

启动的命令获得清理过的环境（丢弃 `*KEY*`/`*SECRET*`/`*TOKEN*`/`*PASSWORD*`），使凭据不会泄漏到输出、`env` 或 spill 文件。临时与缓存文件使用私有目录、随机名称与独占的仅 owner 打开（`'wx'`、`0o600`）；可预测的全局可读路径会招致符号链接竞争与泄露。

判断条件是启动的进程是否继承环境，或写入其他进程可以预测并替换的位置。边界是不含外部输入的受信任进程内代码，本规则不管辖。

## 解除链接形态的路径

可能是符号链接或 Windows junction 的路径，用 `lstatSync().isSymbolicLink()` 判断后 `unlinkSync` 删除：unlink 只删除链接，并拒绝真实目录，因此绝不会跟随链接进入目标。Windows 上 `rmSync(link)` 对 junction 抛出 `ERR_FS_EISDIR`；递归删除可能穿过它进入目标。递归 `rmSync` 只用于已知真实目录。

判断条件是删除原语能否跟随链接进入目标。边界是代码在自有目录中自己创建的路径，此处普通递归删除已知安全。

## 为完整结果设限

在完整的输出或保留值（包括包装与元数据）已知处应用字节、数量与时间上限。测试极小上限、精确上限、单个超大项与多字节字节数。只限制内部载荷而忽略其信封，会让总量超过声明的上限。

判断条件是调用方能否在不触发上限的情况下构造超过文档最大值的结果。边界是组件既不输出也不保留的值，不受它自己的上限管辖。
