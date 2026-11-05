# 条件性领域规则

[English](conditional-domains.md) | 中文

本页评审规则在具名对象实际存在时适用，保留归属与证据责任，但不要求引入浏览器、远程协议、插件宿主、模型运行时或 Session 存储。[通用规则](general.zh.md)仍适用；[测试](../testing.zh.md)说明当前有效的证据边界。[项目上下文](../PROJECT-CONTEXT.md)拥有具体产品合同。

## UI 身份与状态

持有草稿、焦点、selection 或内部实例的控件，其组件类型身份保持稳定。无关更新不能替换其 DOM 节点或重新挂载组件。在首个流程同时准备数据与初值，不靠后续 effect 补齐。列表 key 唯一标识实体或实例；可变列表的 index 不是身份，冲突须修复 ID 来源。确实需要重新挂载时，须由负责该实例生命周期的 reviewer 接受理由与状态迁移计划，并测试预期迁移。

业务数据、共享交互状态与设置各有自己的 owner。传入所需数据、selector 和 action，而非整个 service 或 store。多实例上下文从当前 scope 派生，不新增全局 `current`、`active` 或 `selection`。局部展开、hover 和草稿状态保持局部；真正的全局单例显式注入。复用已有资源 fetch/cache/invalidation owner，不增加 feature 局部的竞争订阅或缓存。新订阅 hook 须在评审说明订阅影响；协议 hook 归协议 owner，值 wrapper 可以重塑值，但不能隐藏归属。

不能用 effect 经由 props 收到的 setter 向上发送 render 可推导的数据，包括在 cleanup 中清空。先在数据 owner 渲染；必要时在 render 期间交付；真正共享的数据须有声明的共享 owner。真实外部订阅、事件回调与用户 gesture 不属于该模式。其他例外须由 owning domain expert 确认；把 `useEffect` 换成 `useLayoutEffect` 不算修复。

feature 首先自行吸收需求。新控件先保持 feature 私有，第二个真实消费者出现后才有提升共享的依据；owner 提升作为独立变更评审。通过 feature wrapper、style 或 layer 适配共享布局，不让共享层学习单一 feature 的排序或语义。真正通用的共享变更可行，但须 domain expert 确认，并回归每个消费者。共享 grouping、list、rendering 和 Markdown pipeline 通过显式语义数据或注册 renderer 扩展，不添加单一业务字段或遍历分支；共享排序、虚拟化、可访问性、通用 Markdown 与附件是合法共享职责。

框架专属限制仅在采用对应宿主时触发。Slot 宿主通过声明注入与 child slot 扩展，不跨 feature 边界传递宿主 context、直接 observable 或 markup-valued props；被触碰的旧 markup-valued 字段在同变更转换，除非 domain expert 接受延期。动态 feature 不 runtime-import 或 re-export 其他 feature 的实现。使用官方扩展入口，保留其 fallback 与完整 labels 合同。这不禁止普通 React Context 或 `useSyncExternalStore`，也不要求采用 Slot 或 Cordis。

## 客户端样式与资源

客户端构建变更扩展已有共享构建 owner，不另建包级独立构建分支。使用 CSS Modules 与 `clsx`，不新加组件库或 Tailwind。复用已有控件。feature 样式使用语义 theme token，不复制 palette 值、写 literal color、另立全局 theme 或局部 light/dark selector。全局 sheet、theme、motion 与 elevation 各有唯一 owner；具体 token 名与视觉值归该 owner 实际协议。

静态值和 variant 放 CSS class；inline style 只承接运行时测量或组件局部 custom property，例如测量得到的 gutter 或进度。图片、GIF 与 SVG 放 CSS 资源而非 JSX；TSX 不内嵌 base64 或大段文本。新 build branch 或 inline 形式落地前按 owning package 规则在评审说明。font 与 line-height 配对；保持合同要求的列宽、滚动、可见 focus 与 reduced-motion 行为。来源专属控件、平台视觉 backing 与 theme 值只在实际采用该控件/theme 协议时适用。

浏览器请求与资源 URL 相对当前文档解析，并能在反向代理子路径下工作。内部绝对 route key 不授权发出根绝对请求 URL。transport、代理、证书与超时策略有唯一 owner；独立 transport 须说明理由并保留代理感知。

## 远程合同与恢复

远程业务能力拥有独立而内聚的 service 或 object；单一调用方不是合并无关能力的理由。身份与资源授权在真正执行的操作内落实，包括替代入口与直接调用。已有生成客户端协议时，在具体操作标记暴露，客户端类型与其定义同源，保留唯一 wire codec 与输出验证路径。不手抄客户端合同，不另加输出 decoder。已有暴露名称保持含义；新语义使用新入口。rename 或新 decode 路径须陈述收益与调用方影响并获 domain owner 确认，作者不得自批。普通 in-process 方法不受这些暴露规则约束；真正单业务 service 无需拆分。stream、pagination 与 projection 保持各自协议，不因共享 carrier 就塞进普通 RPC descriptor。不要求特定 decorator、Peer 或 gateway 框架。

Host 拥有权威业务状态；Client mirror 声明稳定 identity，以及延迟响应如何合并或让位于新 baseline。物理重连不等于逻辑恢复。按数据语义选择 baseline、cursor 或 query 恢复；普通通知不是可回放历史。business/protocol error 与 carrier failure 分开处理，不用通用重试抹平。无 stream 就不必凭空增加 resynchronization，不同领域也不必共用通用恢复 runtime。

## 派生状态、持久化与资源

权威操作 commit 后才发布通知、派生状态与外部可见结果；失败时 log、view 与 feed 保持一致。一个异步操作使用一个生命周期 controller 或 transaction，除非另一个 readiness、reservation 或 settlement point 确有独立 owner。遵循[项目持久化与兼容性合同](../PROJECT-CONTEXT.md)；不能为了通过迁移而改写已发布输入或用户数据。

权威 log 派生 projection 或等价 cache 使用唯一公开读取/计算路径，默认完整计算；缩窄计算须 owning domain expert 确认。部分 projection 只服务 UI 可用性，不能决定外部结果。其 Client 边界显式返回 miss/stale，不静默冷读整个 log，小历史也无例外。Host 必要冷读，以及无 projection 时独立命名的 cold-read 操作仍合法。这不禁止普通任意缓存重新计算。

引用计数共享资源显式 acquire/use/release；idle 回收要求零引用且无 inflight work，不枚举业务状态。release 触发可以人工评审。高频 stream 增量计算、合批发布并说明复杂度，不逐 chunk 重算全部历史且立即发布。结构或 terminal 变化可以立即发布；不能只凭 cadence 名称判缺陷。不存在此类共享资源时，不强制普通 CRUD 实现引用计数。

<a id="display-metadata-without-activation"></a>
## 显示元数据不触发激活

读取包显示元数据时不激活或执行包，包括 disabled 或不可信插件。标题与描述独立 fallback。字段缺失可 fallback；malformed JSON 或非法字段须给逐包 diagnostic。图片包含在发布 `files`，真实解析留在包边界内，拒绝绝对路径、URL、逃逸路径或 symlink。图片及其依赖必须自包含；SVG 作为 image 渲染而非 inline HTML。显式非法 icon 保留有效 text 并诊断，不再尝试竞争 icon export；缺失或不可解码图片可用默认图。

包根与插件 subpath 地址遵循实际协议：subpath 不是包，不能读取虚构的嵌套 `package.json`。允许格式、最大字节数与 locale chain 是显式 metadata 合同参数，不是普遍上传限制。生成的输出资源本身不代表已建立安装包的 metadata 协议。
