# 异构既有项目采用治理模板：方案与实践研究

> 性质：参考研究，不是本仓库当前规范，也不表示其中的工具或门禁已启用。对象是“把一套工程治理约定引入已经存在、技术栈可能不同的项目”。

## 结论摘要

这类工作常被含混地称为“安装模板”，但至少包含四种不同任务：**生成**一个新项目、**迁移/采用**一套约定到既有项目、**从模板持续同步**更新、以及**在组织层强制**执行不变量。它们的状态和风险不同；一个为新项目复制文件的生成器，不能因为可以写入现有目录就被当成迁移器；复制 CI 文件，也不等于中心治理已强制执行。

适用性最高的做法不是“把完整模板覆盖过去”，而是先识别目标项目能力和约束，再生成可审阅的变更提案；将每项变更归入保留、创建、语义转换、跳过或待决策，明确区分通用不变量与可选工具，最后在隔离分支上应用并按项目已有命令验证。希望未来跟随模板的项目，才值得额外建立模板来源、版本和更新元数据。

## 代表性方案

| 范例 | 解决的问题 / 设计模式 | 适合 | 不能据此假设 |
|---|---|---|---|
| GitHub Template Repository | 从模板仓库创建具有相同目录、分支和文件的新仓库；生成的新仓库从单个提交开始，与模板分支历史无关。 | 新项目启动、复制一致的初始骨架。 | 它本身不提供生成后与模板持续同步的更新通道；模板仓库不等于迁移工具。[GitHub 文档](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template) |
| Cookiecutter | 以问题答案渲染项目，并在生成的特定阶段执行 pre/post hooks；hooks 可验证输入、预处理和执行生成后设置。 | 新项目初始化、按答案选择文件/选项、需要受控生成钩子的模板。 | hooks 是生成阶段的扩展点，不应误当作既有仓库的差异合并或升级历史；hook 也意味着模板可执行代码，需审查信任边界。[Cookiecutter hooks](https://cookiecutter.readthedocs.io/en/stable/advanced/hooks.html) |
| Backstage Software Templates | 用结构化参数表单描述项目选项，再按步骤执行模板获取、文件生成和外部动作；支持 dry-run 的 action 可以模拟副作用并单独测试。 | 组织内部平台化的服务创建、自助流程、需要可追踪的输入和自动化动作。 | 平台化生成器并不会自动解决任意既有项目的文件所有权、覆盖或语义迁移；副作用安全取决于 action 是否实现 dry-run。[模板定义](https://backstage.io/docs/features/software-templates/writing-templates/)；[dry-run 测试](https://backstage.io/docs/features/software-templates/dry-run-testing/) |
| Yeoman | 对目标目录中已存在文件的写入进入冲突处理；先写入内存文件系统，在运行结束的冲突阶段后再落盘。 | 交互式生成器、组合多个 generator、需要在覆盖用户文件前询问。 | 逐文件询问可防止意外覆盖，但不是跨文件语义迁移算法；机器化大批量更新仍需检测、结构化编辑和自动化测试。[Yeoman 文件系统](https://yeoman.io/authoring/file-system) |
| Copier | 显式保存模板答案/来源，可对有版本标签的模板运行 update；文档建议目标仓库有有效 `.copier-answers.yml`、模板与目标均受 Git 版本控制且工作树干净。无法自动解决的冲突保留为冲突标记或 `.rej` 文件，要求人工检查；模板还能按答案生成条件文件并定义迁移。 | 已经由 Copier 管理、希望逐版吸收模板演进的项目；需要可复用、可审查的模板更新。 | “有工具”不代表历史基线自动正确。对从未由该模板管理的仓库，必须先确定可信的基线和每个文件的归属；更新冲突仍需人处理，不能盲目提交。[Copier 更新](https://copier.readthedocs.io/en/stable/updating/)；[配置、条件文件和迁移入口](https://copier.readthedocs.io/en/stable/configuring/) |
| OpenRewrite | 把可重复的代码/配置改变表达成可测试的 recipe；dry-run 输出 patch，而不改动源文件。recipe 测试不仅验证预期改变，也验证不应发生的改变没有发生；官方也提供 JavaScript/TypeScript recipe 开发资料。 | 已知、重复、可描述为语法或配置转换的代码迁移；需要跨许多仓库一致升级。 | 不是整套仓库模板复制器；只在 recipe 覆盖的语法、格式和目标条件内可靠。粗糙文本替换不能替代语法理解。[dry-run](https://docs.openrewrite.org/reference/rewrite-maven-plugin)；[recipe 测试](https://docs.openrewrite.org/authoring-recipes/recipe-testing)；[JS/TS 开发环境](https://docs.openrewrite.org/authoring-recipes/javascript-recipe-development-environment) |
| GitHub Reusable Workflows + Rulesets | reusable workflow 集中实现 CI 逻辑，调用方通过 workflow 文件引用；组织/企业 ruleset 可要求指定 workflow 通过后才允许合并。 | 多仓库共享 CI 行为；对必须遵循的合并条件做中心化执行。 | 仅复制一个 workflow 文件或仅调用 reusable workflow 不是强制策略。强制能力受 GitHub 产品层级、仓库可见性和组织配置影响；跨仓库引用应考虑固定到 SHA。[Reusable workflows](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows)；[Ruleset 工作流规则](https://docs.github.com/en/enterprise-cloud@latest/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-workflows-to-pass-before-merging) |
| Renovate Shareable Presets | 仓库通过 `extends` 继承托管在共享仓库的依赖更新策略；preset 可嵌套，并可用 Git tag 固定版本。 | 集中管理依赖自动更新规则、减少复制粘贴漂移。 | 这是 Renovate 配置复用，不是通用项目配置同步或迁移机制；调用方仍需 opt in，并管理 preset 版本。[Renovate presets](https://docs.renovatebot.com/config-presets/) |

## 方案边界与选型

| 目标 | 优先考虑 | 判断条件 |
|---|---|---|
| 快速创建同类新项目 | GitHub Template、Cookiecutter；组织平台化时用 Backstage | 目标是新仓库，允许形成一个初始骨架，而不是把已存在项目伪装成模板派生物。 |
| 交互式写入少量已有文件 | Yeoman 式冲突处理或小型显式迁移工具 | 需要逐项审阅覆盖；变更可切分，工具能准确识别已有文件。 |
| 让已生成项目长期跟随模板 | Copier 一类具备来源、版本、答案和更新机制的工具 | 已建立可信模板基线；团队愿意维护版本、迁移脚本、冲突处理和更新测试。 |
| 对许多项目做重复代码升级 | OpenRewrite 等 recipe/AST 迁移工具 | 变更是可精确定义的转换；有代表性输入、期望输出和负例测试。 |
| 让 CI / 依赖策略不随仓库漂移 | Reusable workflows、Rulesets、Renovate presets 等中心机制 | 该约束确实必须强制；平台具备能力，授权、版本固定和绕过策略清楚。 |
| 单次把规范带入一个异构旧仓库 | 先做能力盘点，再输出最小迁移 PR | 项目技术栈、脚本和已有策略是事实来源；不要求建立长期模板血缘。 |

这些机制可以组合，但应按责任拆分。例如：生成器提供默认文件，reusable workflow 复用 CI 实现，ruleset 强制关键检查，Renovate preset 共享依赖策略，recipe 负责一次性代码转换。不要用每个仓库都复制一份大型模板来承担所有责任。

## 可复用的安全迁移流程

1. **先定任务类型和验收目标。** 明确这次是新建、采纳、同步还是强制执行；列出预期交付物、不能改变的合同、允许的例外，以及此次不做什么。缺少这一层时，“安装成功”往往只表示文件写过了。
2. **读取项目事实，而不是根据模板推断。** 盘点 manifest、包管理器锁文件、模块格式、CI、已有测试命令、导出/发布形态、目录结构和运行时约束。能力分型应基于可验证信号，允许 `unknown/manual review`，而非把所有 Node 项目等同于 TypeScript + pnpm workspace。
3. **做逐文件变更分类。** 对每个候选文件或规则标注 `keep`、`create`、`transform`、`skip`、`needs decision`；把覆盖和删除单独列出并默认禁止自动执行。对 manifest/CI 这类控制文件优先做字段级、语义级修改，不要无条件整文件替换。
4. **先输出计划和差异，再写入。** 给出候选文件、操作类型、变更理由、对应目标能力和验证方法。支持 dry-run 时先 dry-run；否则生成临时 patch 或工作树。差异应可人工审阅、可撤销，且写入落在隔离分支/工作树中。
5. **小批次应用并保留人工决策。** 先处理身份与工具链，再处理测试/CI，最后处理文档和可选增强。遇到不兼容、不确定或已有用户实现时暂停并报告，不能把“覆盖确认”当作语义判断。
6. **只运行现有项目实际声明的验证。** 基线测试和迁移后测试使用 manifest/CI/项目文档中真实存在的命令；新模板带来的类型检查、文档预算或 monorepo 聚合门禁，只有在目标项目真正配置、安装并验证后才能称为已启用。
7. **把迁移本身也当产品测试。** 至少准备代表性 fixture：目标技术栈已匹配、部分能力缺失、同类能力以不同方式实现、关键文件已有自定义、第二次重复运行。检查正确项目被修改、无关项目不变、重复运行无额外差异、错误输入在写入前失败。
8. **决定是否需要长期同步。** 若只需一次采纳，就保留普通 Git 历史和明确 PR，不要为了工具强行建立 template parent 关系。若确实要持续同步，先记录模板 ID/版本/答案，给升级脚本定版本，并在每个模板版本变更时维护冲突和迁移测试。
9. **将“必须遵守”放到真正能强制的层。** 文件模板适合提供默认值；中心 workflow / preset 适合共享实现；组织规则适合强制合并条件。说明平台适用范围、版本固定、秘密/权限和 bypass，并把可选增强与强制不变量分开。

## 质量标准

一个成熟的采纳/迁移机制至少应满足以下条件：

- **能力适配：** 根据项目实际声明选取配置，不根据目录名或技术栈刻板印象猜测。
- **最小差异：** 每个新增文件、依赖、命令和规则都有明确用途；跳过的模板功能也可解释。
- **非破坏默认值：** 不覆盖用户文件、不删除原有内容、不改包身份/发布/运行时合同；有风险的操作要求明确审阅。
- **可预览与可撤销：** 先呈现 diff，写入可限制在分支/临时工作树，失败能恢复而不影响用户现有工作。
- **幂等：** 相同版本重复运行不持续新增、重写或改变内容。
- **有边界的自动化：** 结构化配置用解析器或语义变更；复杂源码用 AST/recipe；无法可靠解释的冲突留给人。
- **覆盖负例：** 测试既证明预期内容出现，也证明不存在的能力没有被强行引入、用户自定义没有被损坏。
- **声明与执行一致：** 文档只宣称 manifest/CI 中实际运行的检查；采用模板不自动等于模板内所有门禁都生效。
- **供应链审查：** 生成器 hook、任务脚本和外部 workflow 都可能执行代码或访问权限；固定可信来源与版本，最小化 secrets/permissions。

## 对本次案例的结论

本仓库是根目录 JavaScript/ESM 的 DSH 插件：`package.json` 声明 `type: module`、包身份 `@local/whiteboard`、DSH engine 范围，并只有 `npm test` 和可选的 `npm run test:e2e`；其 DSH bundle、导出、Host 状态和持久化契约不能由通用模板替代。[本仓库 package.json](../../package.json) 与项目说明明确了这些边界。[项目 AGENTS.md](../../AGENTS.md)

因此，把固定 TypeScript + pnpm workspace 模板直接应用到这里，是任务分类和能力检测错误，不是模板文件“复制得不够聪明”。历史记录显示，先写入约 295 个模板文件、再做语义核对，造成了大量回头确认；后续移除不适用的 workspace 假设并保护插件特有契约，才是成本真正集中的部分。文件数量不是质量指标：应当在首次写入前判断每个文件是否适用。

更合理的复盘结论是：将第一阶段改成只读项目盘点与变更计划，按插件/独立 Node 包/workspace 等能力切分模板配置；对这类既有插件走一次性、最小化迁移 PR，保留现有 `npm` 流程和项目合同，只添加已确认适用的治理改动；保留每项跳过/人工决策及其理由。如果以后要对大量 DSH 插件反复实施相同升级，再把高频、稳定、可测试的文件变化提炼为版本化 migration，并为不同插件 profile 建测试夹具。中心化可强制的 CI 规则，则优先使用平台支持的共享 workflow / ruleset，而不是向每个仓库复制越来越多的门禁文件。

本案例历史上下文还记录过 `npm test` 的 321 项检查通过；这不是本次重新运行的结果，也不应被理解为模板带来的额外检查已启用。任何变更仍应以当前 manifest 与 CI 为准。

## 主要一手来源

- GitHub：从模板创建新仓库及其历史关系：https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template
- Cookiecutter：生成钩子及其执行阶段：https://cookiecutter.readthedocs.io/en/stable/advanced/hooks.html
- Copier：项目更新条件、冲突处理：https://copier.readthedocs.io/en/stable/updating/
- Copier：答案、条件文件和迁移配置：https://copier.readthedocs.io/en/stable/configuring/
- Yeoman：内存文件系统与冲突阶段：https://yeoman.io/authoring/file-system
- Backstage：Software Template 的参数和步骤：https://backstage.io/docs/features/software-templates/writing-templates/
- Backstage：Scaffolder action dry-run 实现与测试：https://backstage.io/docs/features/software-templates/dry-run-testing/
- OpenRewrite：JS/TS recipe 开发环境：https://docs.openrewrite.org/authoring-recipes/javascript-recipe-development-environment
- OpenRewrite：recipe 的预期/非预期变化测试：https://docs.openrewrite.org/authoring-recipes/recipe-testing
- OpenRewrite：dry-run patch 与 CI 检查：https://docs.openrewrite.org/reference/rewrite-maven-plugin
- GitHub：Reusable Workflows：https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows
- GitHub Enterprise Cloud：Ruleset 要求 workflow 通过：https://docs.github.com/en/enterprise-cloud@latest/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-workflows-to-pass-before-merging
- Renovate：Shareable Config Presets：https://docs.renovatebot.com/config-presets/
