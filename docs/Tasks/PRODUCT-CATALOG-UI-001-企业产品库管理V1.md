# PRODUCT-CATALOG-UI-001 企业产品库管理 V1

## 1. 最终结论

**A：PRODUCT-CATALOG-UI-001 建议通过并冻结。**

企业产品库已作为正式配置模块接入“企业配置”，完成真实 XLS/XLSX 导入、预览校验、错误行展示、原子提交、产品查询、只读详情、版本历史、正式回滚、模板保存及 Windows 打包版点击验收。

本任务没有修改 REAL-AI-001A～001F 的冻结核心业务逻辑，没有启动 REAL-AI-002、TASK-006 或 PRODUCT-CATALOG-UI-002。

## 2. 修改文件

### 新增

- `src/catalog-management/CatalogManagementPanel.tsx`
- `src/catalog-management/catalog-management-client.ts`
- `src/catalog-management/contracts.ts`
- `src/catalog-management/catalog-management-client.test.ts`
- `electron/catalog-management/channels.cjs`
- `electron/catalog-management/catalog-management-service.cjs`
- `electron/catalog-management/register-catalog-management-ipc.cjs`
- `electron/catalog-management/index.cjs`
- `electron/catalog-management/tests/catalog-management-integration.test.cjs`
- `electron/catalog-management/tests/catalog-management-ipc.test.cjs`
- `scripts/catalog-management/run-packaged-ui-smoke.mjs`
- `docs/Tasks/PRODUCT-CATALOG-UI-001-企业产品库管理V1.md`

### 修改

- `src/pages/CompanyConfig.tsx`
- `src/App.tsx`
- `src/index.css`
- `electron/preload.cjs`
- `electron/main.cjs`
- `package.json`

未修改 `src/real-ai/catalog`、`src/real-ai/matching`、`src/real-ai/extraction`、`src/real-ai/pipeline` 及其 Electron 冻结实现。

## 3. 页面信息架构

产品库位于：

`企业配置 → 企业产品库`

没有新增左侧主导航，也没有重做企业基础信息页面。

页面层级：

1. 产品总数、启用数、停用数、当前版本。
2. 当前配置状态、更新时间、最近导入状态、匹配引擎版本。
3. 搜索、状态筛选、动态分类筛选、排序和分页。
4. 产品列表。
5. 导入流程、产品详情、版本历史 Drawer。

空库保持真实空态，不自动装入 24 条测试产品。

## 4. CatalogClient 架构

Renderer 只依赖 `CatalogManagementClient`，不感知 IPC 通道、文件路径、`userData` 或 JSON 文件。

调用链：

`React UI → CatalogManagementClient → preload受控桥接 → Catalog IPC Adapter → CatalogManagementService → 001D公共接口`

`CatalogManagementService` 负责应用层查询、分页、状态摘要、写操作串行保护和友好错误映射。正式导入、原子提交、Repository 版本化和回滚仍由 001D 负责。

## 5. Electron IPC 边界

暴露最小能力：

- 选择导入文件
- Summary
- 产品列表
- 产品详情
- Import Preview
- Import Commit
- 丢弃 Preview
- 版本记录
- Rollback
- 保存模板

安全措施：

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- IPC 发送方 ID 与来源页面校验
- Zod 严格校验 Renderer payload
- Renderer 只接收安全文件名，不接收绝对路径
- Windows 路径从错误消息中脱敏
- API 不暴露 `fs`、`path`、`userData` 或 JSON 文件操作
- 导入和回滚使用应用层互斥写保护

## 6. 产品库 Summary

全部来自真实 Repository：

- 是否已配置
- 产品总数
- 启用产品
- 停用产品
- 当前版本
- 最近更新时间
- 最近导入或回滚状态
- 001E 当前读取版本

回滚重启后会根据 Snapshot 来源显示“回滚成功”，不会回落成“无记录”。

## 7. 产品列表

列表展示：

- 产品名称
- 型号
- 分类
- 最多两项核心规格
- 关键词与应用场景摘要
- 启用/停用状态
- 更新时间

分页支持每页 20、50、100 条，不一次渲染全部产品。停用状态只展示，不提供绕过版本系统的单条修改。

## 8. 搜索与筛选

确定性本地搜索覆盖：

- 产品名称
- 型号
- 关键词
- 同义词

筛选支持全部、启用、停用以及由真实产品数据生成的分类。排序支持最近更新、产品名称和型号。

## 9. 产品详情

右侧 Drawer 读取真实 `ProductRecord`，展示：

- 产品名称、型号、分类、状态
- 产品库版本、来源 Sheet、来源行
- 规格、应用场景、关键词、同义词
- 产品说明/备注
- productId、标准化型号
- 单位规范化结果及 baseValue/baseUnit
- 来源文件、记录版本、创建和更新时间

详情只读。单条编辑和状态调整仍通过正式 Excel 重新导入完成。

## 10. 模板下载

模板来源：`assets/templates/企业产品库标准导入模板.xlsx`

打包时作为 `extraResources/real-ai/templates` 资源进入应用。用户通过 Main Process Save Dialog 保存，Renderer 不参与路径处理或文件复制。

Windows 打包 Smoke 已保存并重新读取模板，文件大小 10,273 bytes，工作簿结构有效。

## 11. Import Preview

导入流程：

`选择文件 → 001D真实读取 → 字段识别 → 行校验与规范化 → Preview → 人工确认 → 原子提交 → 新版本`

支持 `.xlsx` 与 `.xls`。界面不使用固定计时器或假百分比，不在 Renderer 主线程解析 Excel。

## 12. Import Validation

预览显示：

- 数据行数
- 可导入数
- 警告数
- 错误数
- 字段映射及匹配方式
- 产品样例

只要 001D 报告含错误或失败行，提交按钮即锁定。UI 不自行改变 001D 的整批提交策略。

## 13. Error Rows

错误区展示：

- Sheet 与 Excel 行号
- 字段
- 真实问题说明
- 建议处理方式

Windows 1366×768 宽版 Drawer 可完整看到四列。故意导入 `invalid-products.xlsx` 时显示 4 个错误并禁止进入提交确认。

## 14. Atomic Commit

自动化验证：

- V1 导入成功后产品数为 24。
- 无效导入时 `currentVersion` 仍为 V1。
- 无效导入前后 checksum 相同。
- 无效导入前后产品列表深度一致。
- V2 成功导入生成正式 V2，V1 继续存在。

Commit 失败时 UI 明确提示当前产品库未修改。

## 15. Version History

版本记录来自 Repository，不维护第二套版本号。显示当前版本、上一版本、操作类型、来源文件、创建时间和产品数量。

001D 当前公共接口只允许完整读取 current/previous Snapshot；更早版本可显示真实版本号，但完整摘要标记为“历史详情未开放”。若后续要求任意历史版本完整元数据，需要产品经理批准 Controlled Unfreeze，为 001D 增加只读 Snapshot 元数据接口。

## 16. Rollback

V1 严格复用 001D 的 `rollbackPrevious()`：

- V2 回滚至 V1 内容时创建新的 V3 审计版本。
- 不切换旧指针，不删除 V1/V2。
- UI 二次确认。
- 成功后无需重启，Summary、列表和版本历史立即刷新。
- 确认文案明确：未来匹配使用新版本，历史匹配结果的 `catalogVersion` 不变。

## 17. CatalogVersion 与 001E 联动

自动化结果：

- V1 时新匹配结果记录 `catalogVersion = 1`。
- 导入 V2 后新匹配结果记录 `catalogVersion = 2`。
- 旧 V1 结果仍保持 `catalogVersion = 1`。
- 回滚创建 V3 后新匹配结果记录 `catalogVersion = 3`。
- Windows 打包版确定性匹配 `SP-3000`，结果读取 V3，候选为 `JG-SP-3000`。

停用产品继续由 001E 正式规则排除，回归测试通过。

## 18. 空库状态

首次安装显示：

- 尚未配置企业产品库
- AI 产品匹配用途说明
- 下载模板
- 导入产品库

没有 Demo 产品、没有自动初始化 fixture。空库时 001F 继续明确阻止匹配，冻结回归通过。

## 19. Demo / Real 边界

正式页面不读取 `demoData`，不提供“一键加载测试库”，不把 24 条 fixture 当成企业真实产品。24 条及大批量产品只由自动化验收通过显式文件导入到隔离 `userData`。

## 20. 数据安全

- 产品库仅落在本机 001D Repository。
- 产品库不发送 DeepSeek，不新增云同步。
- 导入绝对路径只在 Main Process 内存在。
- Renderer 只显示 basename。
- 验收日志只记录版本、数量、状态和耗时，不记录完整产品表。
- Preview 取消后清理待提交记录。

## 21. 1366×768 结果

通过。验证状态：

1. 空产品库
2. 导入预览
3. 导入成功
4. 产品列表
5. SP-3000 产品详情
6. 错误行
7. 版本历史
8. Rollback 确认

页面无横向滚动；顶部导入、模板与版本入口可见；详情和导入 Drawer 独立滚动；错误表四列可读；操作不被遮挡。

## 22. 1440×900 结果

通过。验证回滚完成与应用重启后的正常产品列表，信息密度稳定，没有被过度拉散。

## 23. 500 条列表 Smoke

使用 1,000 条脱敏生成数据覆盖超过 500 条的场景：

- 列表总数：1,000
- 单页渲染数据：100
- 后台列表读取：约 50ms
- `PX-0500` 搜索结果正确
- 分页与详情读取正常

## 24. 1000 条导入 Smoke

最近一次结果：

- 真实 XLSX 行数：1,000
- Preview：约 188ms
- Commit：约 151ms
- 状态：ready
- 最终产品数：1,000

耗时为当前开发机观察值，不作为正式 SLA。

## 25. Windows 打包 Smoke

通过。

- 可执行文件：`release/win-unpacked/数员科技 AI数字员工.exe`
- 安装包：`release/数员科技 AI数字员工 Setup 0.1.0.exe`
- 模板资源存在并可保存
- XLSX 可预览和提交
- 错误导入不覆盖 V1
- V2 导入、V1 回滚、V3 创建成功
- 关闭重开后 V3 和 24 条产品仍存在
- Renderer 控制台错误：0

机器证据：`electron/catalog-management/tests/results/windows-packaged-ui-smoke.json`

## 26. Windows 点击级验收

自动化通过 Electron 打包版 BrowserWindow 和 Chromium DevTools Protocol 执行真实点击，没有绕过 Renderer。

截图目录：`preview/product-catalog-ui/`

- `01-empty-1366x768.png`
- `02-import-preview-1366x768.png`
- `03-import-success-1366x768.png`
- `04-product-list-1366x768.png`
- `05-product-detail-1366x768.png`
- `06-error-rows-1366x768.png`
- `07-version-history-1366x768.png`
- `08-rollback-confirm-1366x768.png`
- `09-rollback-complete-1440x900.png`
- `10-restart-persistence-1440x900.png`

## 27. 底层回归

未调用真实 DeepSeek，没有产生新的 API 费用。

- 001A Parser：7/7 通过
- Electron 文件与任务服务：20/20 通过
- 001C Extraction 本地/Mock：62/62 通过
- 001D Catalog：20/20 通过
- 001E Matching：17/17 通过
- 001F Quote Gate/Client：4/4 通过
- PRODUCT-CATALOG-UI-001 专项：5/5 通过
- `npm run check`：通过
- `npm run build`：通过

首次运行 Electron 服务完整套件时，`job-manager.test.cjs` 在已完成一个用例后出现一次 Node/V8 退出期原生内存计数崩溃。未修改冻结代码；该文件单独复跑 3/3 通过，完整服务套件再次复跑 20/20 通过。列为运行时偶发观察项。

## 28. 已发现问题

### P1

1. 001D 未提供单产品状态版本化更新接口，因此 V1 只展示启用/停用。状态变更需重新导入，不绕过版本系统。
2. 001D 未提供任意历史 Snapshot 的只读元数据接口。V1 对 current/previous 展示完整信息，更早版本只展示真实版本号。
3. 当前 `dist:win` 脚本只构建 Real-AI runtime，不主动执行 Vite build。本次最终包已先执行 `npm run build` 再打包；后续发布流程应继续保持该顺序，是否修改既有 Windows 打包脚本需单独批准。
4. Node/V8 在首次全套 Electron 服务测试退出时发生过一次偶发原生崩溃，复跑未复现。

### P2

1. 未来可评估单产品版本化编辑、批量启停、产品图片、价格、当前库导出；均不属于 V1。
2. 大规模产品正式 SLA、更多行业表头映射仍需后续真实客户样本验证。

无 P0 遗留。

## 29. P0 验收表

| # | 门槛 | 结果 |
|---|---|---|
| 1 | 企业配置中可进入企业产品库 | 通过 |
| 2 | 空库不显示 Demo 产品 | 通过 |
| 3 | 可真实下载标准 XLSX 模板 | 通过 |
| 4 | 可真实导入 XLS/XLSX | 通过 |
| 5 | Preview 来自 001D 真实 Importer | 通过 |
| 6 | 错误行明确可见 | 通过 |
| 7 | Invalid Import 不覆盖 current | 通过 |
| 8 | 成功 Import 生成正式版本 | 通过 |
| 9 | 产品列表来自真实 Repository | 通过 |
| 10 | 搜索真实可用 | 通过 |
| 11 | 产品详情来自真实 ProductRecord | 通过 |
| 12 | 当前版本真实展示 | 通过 |
| 13 | 匹配引擎版本与当前 Catalog 一致 | 通过 |
| 14 | 版本历史真实可查看 | 通过 |
| 15 | Rollback 使用 001D 正式能力 | 通过 |
| 16 | Rollback 后产品列表同步 | 通过 |
| 17 | 历史匹配 catalogVersion 不被修改 | 通过 |
| 18 | Renderer 不直接访问 fs | 通过 |
| 19 | Renderer 不直接访问 userData JSON | 通过 |
| 20 | 不泄露本地绝对路径 | 通过 |
| 21 | 无产品库时 001F 明确阻止匹配 | 通过 |
| 22 | 更新产品库后 001F/001E 读取新版本 | 通过 |
| 23 | 1366×768 关键操作无阻挡 | 通过 |
| 24 | Windows 打包版模板下载成功 | 通过 |
| 25 | Windows 打包版导入成功 | 通过 |
| 26 | Windows 打包版重启后持久存在 | 通过 |
| 27 | Windows 打包版 Rollback 成功 | 通过 |
| 28 | 001A～001F 底层回归通过 | 通过 |
| 29 | npm run check 通过 | 通过 |
| 30 | npm run build 通过 | 通过 |
| 31 | 未修改冻结模块核心逻辑 | 通过 |
| 32 | 未启动 REAL-AI-002 或 TASK-006 | 通过 |

## 30. 是否建议冻结

**建议冻结 PRODUCT-CATALOG-UI-001。**

后续如需任意历史版本完整元数据、单产品版本化编辑或状态切换，应单独立项并评估是否对 001D 进行 Controlled Unfreeze。
