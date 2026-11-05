# 隔离浏览器验证与合成安装/回滚检查

两项检查验证不同边界。V3 检查启动独立 DSH 并使用真实 Chrome 和模型；安装/回滚检查仅在临时合成目录中运行 PowerShell 脚本，不启动 DSH 或浏览器，也不证明历史 v1 的运行兼容性。

## V3 浏览器与模型

在仓库根目录运行：

```powershell
npm run test:e2e
```

需要本机 DSH、Chrome、可用模型凭据，以及 Node 可解析的 `playwright-core`。该依赖未写入包清单，须由测试环境单独提供；不要假定存在另一 checkout 或 junction，也不要把测试依赖安装成产品依赖。

- home 固定为仓库父目录的 `../.spike-e2e/dsh-home`；默认启动时清空重建，`WB_E2E_KEEP_HOME=1` 跳过重置。仓库的忽略规则不覆盖父目录。
- 执行前检查父目录内容、权限和敏感数据清理计划。脚本复制模型凭据并保留 home；Windows 下目录 mode 不能代替私有 ACL。测试后先确认子进程已退出，再清理凭据和临时环境。
- 默认端口为 3092；`WB_E2E_PORT=0` 由系统分配端口，其他值须避免占用。`WB_E2E_TIMEOUT` 设置模型轮次超时（毫秒）。测试不连接现有 3080 实例。
- `.v3.lock` 在重置前独占固定目录；遇到锁应检查持有进程，不能直接删除后并行运行。启动失败也会清理已拥有的 Host，健康检查和退出等待有超时。
- 覆盖侧栏和 keepMounted、选区、dock 与原生 chip、发送后指令保留、AI 开关持久化、可选快照、模型改画板与撤销、AI 关闭拒绝、重新插入 chip、刷新及窄窗，并检查页面和控制台错误。
- 真实 store 观察仅比较所选 sessions、whiteboard 和 workspace.json 的大小及时间戳，不递归覆盖所有数据，也不能把并发真实会话的变化归因给本测试。`zeroWrite.ok` 不是全盘字节不变的证明。
- 截图与 `v3-result.json` 写入本目录的 `.artifacts/`，失败时可能包含诊断截图和日志；保持忽略，检查敏感信息后再分享。成功标记为 `E2E V3 OK`，清理失败不能算通过。

## 合成安装/回滚

仅在 Windows 运行：

```powershell
node test/e2e/install-rollback.mjs
node test/install-rollback-isolation.mjs
```

检查创建唯一临时根目录，复制当前安装/回滚脚本，准备相互独立的合成 current/v1 源码目录、profile、junction 和无关配置。子 PowerShell 使用独立 USERPROFILE/HOME/AppData/TEMP，只验证链接切换、已有匹配 link: 依赖更新及无关数据保持；完成或失败后移除自有 fixture，不遍历 junction 目标。成功标记为 `SYNTHETIC INSTALL/ROLLBACK OK`。

此 fixture 不使用真实 profile、凭据、历史 v1 代码或模型；不能替代实际版本兼容、数据迁移或在线安装验收。直接执行仓库 `scripts/install-v3.ps1` / `scripts/rollback-v1.ps1` 仍会操作调用用户的真实 profile，必须另行核对和授权。

## 手工排查

`scripts/spike-env.ps1` 是历史手工工具，可覆盖 home 并强制停止 PID/端口上的进程，不是以上隔离检查的替代。使用前检查脚本、路径、端口、PID、凭据复制与清理要求。历史截图和旧结论见[证据说明](../../docs/evidence-v3/README.md)，不代表当前检查已经运行。
