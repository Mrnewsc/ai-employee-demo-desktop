# REAL-AI-001F-R1 Windows真实链路收口

## 1. 最终结论

**A：REAL-AI-001F 建议通过并冻结。**

Windows 解包版已经完成真实 PDF、XLSX、多产品、低质量 OCR、空产品库、无 API Key、两阶段取消、跨文件合并的 A～H 验收。自动 Pipeline 证据与打包 UI 点击证据均为通过，最终结果文件中 `passed=true`、`pendingEvidence=[]`。

- 打包程序：`release/win-unpacked/数员科技 AI数字员工.exe`
- 程序大小：225,486,336 bytes
- 自动验收结果：`src/real-ai/pipeline/tests/results/windows-packaged-e2e-r1.json`
- UI 截图目录：`src/real-ai/pipeline/tests/results/windows-ui-click-r1/`
- 分辨率截图：`.tmp/packaged-capture-r1/`

## 2. 修改文件

本轮只修改 001F 编排、客户端状态、UI 胶水、验收夹具与测试；未修改冻结的 001A～001E 核心算法。

- `electron/real-ai/pipeline/full-analysis-job-manager.cjs`
- `src/real-ai/pipeline/contracts.ts`
- `src/real-ai/clients/real-file-analysis-client.ts`
- `src/real-ai/ui/RealAnalysisWorkspace.tsx`
- `electron/real-ai/tests/full-analysis-job-manager.test.cjs`
- `src/real-ai/pipeline/tests/real-file-analysis-client.test.ts`
- `electron/real-ai/pipeline/smoke/run-full-pipeline-smoke.cjs`
- `electron/main.cjs`
- `scripts/real-ai/generate-pipeline-r1-fixtures.mjs`
- `scripts/real-ai/run-pipeline-r1-packaged-smoke.mjs`
- `scripts/real-ai/run-packaged-ui-click-smoke.mjs`
- `src/real-ai/pipeline/fixtures/case-c-exact.xlsx`
- `src/real-ai/pipeline/fixtures/case-c-conflict.xlsx`
- `src/real-ai/pipeline/fixtures/case-c-none.xlsx`
- `src/real-ai/pipeline/fixtures/case-h-same-product.xlsx`
- `docs/Tasks/REAL-AI-001F-R1-Windows手工验收清单.md`
- 本报告、结果 JSON 与验收截图

## 3. 根因最终确认

1. Provider 失败原先被并发 Chunk 的后续内部 Abort 覆盖，最终容易被误记为用户取消或宽泛的 Extraction failed。
2. 001F 缺少完整 attempt、文件、提取、匹配和安全失败诊断，无法定位 HTTP、截断、Schema、超时等阶段。
3. 跨文件产品虽能合并，但 001F/UI 的 Evidence 标识与展示链没有明确保证“同文字、不同文件来源”同时保留。
4. 报价交接缺少完整审计字段，人工更换候选后需要同时保留原 OCR 型号、原始匹配与人工决策。
5. `deepseek-v4-flash` 在低质量 OCR 样本上使用 3500 输出 Token 曾发生截断。冻结 001C 未修改；001F 在用户未显式配置时采用 6000，显式环境变量仍优先。
6. 原验收只有 CLI/单测，没有 Windows 打包 BrowserWindow 的操作级证据。

## 4. Provider 失败诊断与错误分类

每个 attempt 现在记录：Job/客户/状态/阶段/开始与完成时间、文件安全名称与类型、解析耗时、OCR 使用与 Warning、Provider/模型、提取耗时、请求/修复次数、HTTP 状态（安全可得时）、超时、截断、Schema、Catalog 版本、产品和匹配数量、匹配耗时、失败阶段与安全错误信息。

错误分类：

| 场景 | 标准错误码 |
|---|---|
| 未配置 Key/模型 | `AI_NOT_CONFIGURED` |
| 401/402/5xx 或普通请求失败 | `AI_REQUEST_FAILED` |
| 429 | `AI_RATE_LIMITED` |
| 超时 | `AI_TIMEOUT` |
| 空响应 | `AI_EMPTY_RESPONSE` |
| 非法 JSON | `AI_INVALID_JSON` |
| Runtime Schema 失败 | `AI_SCHEMA_INVALID` |
| 输出长度截断 | `AI_OUTPUT_TRUNCATED` |
| 其他提取失败 | `AI_EXTRACTION_FAILED` |

诊断不会保存 API Key、Authorization、完整 Prompt/messages、客户原文或本地绝对路径。001F 不额外增加 Provider Retry，修复尝试只来自冻结 001C 的受控策略。

## 5. Evidence 合并修复

- 001F 将全部 `ParsedDocument[]` 一次性交给冻结 001C 正式 `ProductExtractionService`。
- 跨文件合并继续由 001C 的 `ExtractionMergeService` 完成，001F 没有复制合并算法。
- 001F、Analysis Client、UI State 全量透传 `ExtractedProduct.evidence`。
- UI Evidence Key 使用 `evidenceId + sourceFile + SourceLocation`，不会仅按字段或文本去重。
- 技术详情保留 `sourceFile` 与完整 `SourceLocation`。
- Case H 最终只有 1 个 SP-3000 产品，同时保留 PDF 与 XLSX 两个独立来源。

## 6. Case B 安全证明

真实 OCR 输出保持：`9P-3000`。

企业候选为：`SP-3000`，级别 `low`，`needsHumanReview=true`。合法召回依据仅为：

- 名称与产品分类“自动喷涂设备”一致；
- 产能匹配：客户约 3000 件/天，产品库 3000 件/天。

冲突明确包含客户型号 `9P-3000` 与候选型号 `SP-3000` 不一致。报告中 `illegalModelGuess=false`。没有编辑距离、OCR 字符常识修正或 9/S 猜测；若不存在名称、规格、应用等可靠信息，测试仍要求 `none + needsHumanReview=true`。

人工确认后报价草案使用企业产品库 SP-3000；审计仍保留原始 `9P-3000`、原匹配结果与人工决策，未覆盖 `ExtractedProduct.model`。

## 7. Case A～H 结果

| Case | Windows Pipeline | Windows UI 点击 | 结果摘要 |
|---|---|---|---|
| A | 通过 | 通过 | PDF → SP-3000 exact → Evidence → 人工确认 → 报价；金额为 0/待填写 |
| B | 通过 | 通过 | OCR 9P-3000 原值 → SP-3000 low 候选 → Human Review → 报价审计保留原值 |
| C | 通过 | 通过 | SP-3000 exact、AL-2600 冲突、ZX-9999 none；决策前报价禁用，none 未进报价 |
| D | 通过 | 通过 | AL-2600 工作宽度 2000mm/1200mm 硬冲突可见，非 exact，人工确认后继续 |
| E | 通过 | 通过 | 空 Catalog 已识别 1 项，进入 `catalog-required`，无 Demo 候选、报价禁用 |
| F | 通过 | 通过 | 无 Key 显示 `AI_NOT_CONFIGURED`，请求数 0，无 Mock/Demo 回退 |
| G | 通过 | 通过 | OCR/parsing 与 extracting 两阶段取消，延迟观察后仍为 cancelled |
| H | 通过 | 通过 | PDF + XLSX 合并为 1 个产品，Evidence 同时包含两个文件来源 |

Case C 与 D 使用同一次多产品 Windows UI 会话，避免重复 Provider 费用；D 的硬冲突展开和人工确认截图映射到 Case C 证据。

## 8. Windows 打包版与点击级证据

验收直接启动 `release/win-unpacked/数员科技 AI数字员工.exe`，使用 Electron BrowserWindow 的 Chromium DevTools Protocol 执行真实 DOM 点击、等待实际 IPC 状态、展开 Evidence、执行人工决策、检查按钮门禁并跳转报价管理；不是用单元测试或 CLI 冒充 UI。

为消除无人值守环境中 Windows 原生文件对话框的焦点不确定性，验收启动参数 `--real-ai-ui-smoke-fixture` 仅在显式指定时提供固定脱敏文件；“拖入客户资料”仍由打包 UI 实际点击，之后完整经过 preload IPC、文件暂存、解析、DeepSeek、产品库、匹配、人工确认和报价交接。普通启动不传该参数，仍使用原生文件选择框。

本轮点击证据均为自动化点击级证据，没有把未执行步骤标记为真人点击。真人复核清单保留在 `docs/Tasks/REAL-AI-001F-R1-Windows手工验收清单.md`，用于发布前可选复验，不是本次 P0 的缺口。

关键截图包括每个 Case 的 ready/result/evidence/decision/quote 或 terminal 状态。Renderer 错误监听结果为 0；首页和资料分析页无白屏、无 `ERR_FILE_NOT_FOUND`。

## 9. Cancel、Retry 与状态完整性

- 状态覆盖：queued → staging → parsing/ocr → extracting → matching → completed/catalog-required/failed/cancelled。
- 外部取消才映射 `JOB_CANCELLED`；001C 内部 Abort 不再误报为用户取消。
- `runToken` 防止 Worker、Provider、Matching 迟到结果写回 cancelled。
- OCR/parsing 与 extracting 两种 UI 取消后延迟 2 秒，状态仍稳定为 cancelled。
- Retry 增加 `attemptNumber` 并保留安全的 previousAttempts；旧 products、matches、extraction 与确认结果会清除。
- 旧 attempt 不能覆盖新 attempt，001F 没有额外 Provider 重试。

## 10. 报价交接与客户上下文

- 报价输入只来自 `ConfirmedMatchResult[]`。
- `pending` 与未处理 `none` 均锁定报价按钮。
- `not-found` 产品不会进入报价。
- 人工更换/确认后使用企业产品库 `productId`、名称和型号。
- `unitPrice` 不由 AI 决定；报价页保持 `0/待销售填写`。
- 每个报价项保留 `originalModel`、`originalMatchResult` 和 `humanDecision` 审计。
- Pipeline、恢复、进度监听和跳转均校验 `customerId=customer-jinhua-001`，跨客户恢复测试通过。

## 11. 分辨率结果

- `1366×768`：顶部模式切换、文件区、结果区和底部操作均可访问；底部截图确认操作栏不覆盖最后内容。
- `1440×900`：三栏完整，Evidence 与结果区域可读。
- 页面没有页面级横向滚动，未发现文字截断导致核心决策不可读。
- 证据：`.tmp/packaged-capture-r1/real-analysis-1366x768.png`、`real-analysis-1366x768-bottom.png`、`real-analysis-1440x900.png`。

## 12. 底层回归

| 模块 | 结果 |
|---|---:|
| 001A 文件解析 | 7/7 |
| 001B + 001F Electron 服务 | 20/20 |
| 001C 结构化提取 | 62/62 |
| 001D 产品库 | 20/20 |
| 001E 匹配引擎 | 17/17 |
| 001F 报价门禁客户端 | 4/4 |
| `npm run check` | 通过 |
| `npm run build` | 通过 |

构建仅保留既有 Vite chunk 大于 500 kB 的非阻断警告。

## 13. DeepSeek 调用与费用说明

- 001F 编排层没有自动重试；`requestCount`/`repairCount` 来自 001C Provider 日志。
- 最终 Pipeline 报告可直接审计的请求为 12 次：A 1、C/D 同任务 3、H 2、E 1、B 当前及历史合计 5；F/G 为 0 或取消。
- Windows UI 点击会话的基础 Chunk 请求为 A 1、B 1、C/D 同任务 3、H 2、E 1，共 8 个基础请求；F 为 0，G-extracting 在发起阶段立即取消，未保存可计费的完成记录。
- R1 最终证据可明确归属的基础/诊断请求合计为 20；早期中断调试中未落入最终 attempt history 的请求无法从安全报告精确复原，因此不虚构“项目生命周期精确账单”。
- 默认 6000 Token 修复后，未设置 `DEEPSEEK_MAX_OUTPUT_TOKENS` 的最新打包 CLI 和 UI Case B 各真实执行一次并通过；之后未再调用 DeepSeek。

## 14. 剩余 P1 / P2

### P1

- Provider 未返回 request ID 时诊断中的 `providerRequestId` 为 null；错误码、阶段、HTTP 状态和请求计数仍可用。
- 早期旧版诊断未保存全部历史请求，因此无法补造精确的历史费用总账；新 attempt 已具备逐请求计数。

### P2

- Windows 原生文件对话框的 OS 焦点操作未纳入无人值守 CDP 自动化，使用显式测试夹具替代；普通应用原生选择流程和 IPC 服务保持不变，可按手工清单复核。
- Vite 主 JS chunk 约 1.2 MB，属于性能优化项，不影响本轮正确性。
- 当前解包版未签名，符合内部测试阶段预期。

## 15. 26 项 P0 验收表

| # | 门槛 | 结果 | 证据摘要 |
|---:|---|---|---|
| 1 | PDF 打包端到端 | 通过 | Case A UI + Pipeline |
| 2 | XLSX/多产品可展示 | 通过 | Case C 三产品 |
| 3 | OCR 低质量真实链 | 通过 | Case B 最新 CLI + UI |
| 4 | 9P-3000 保持原值 | 通过 | UI、Evidence、Audit |
| 5 | OCR ambiguity 触发 Review | 通过 | Warning + low + Review |
| 6 | SP 候选来自合法依据 | 通过 | 名称与产能 |
| 7 | 无合法依据允许 none | 通过 | 单测锁定 |
| 8 | 人工选择后可报价 | 通过 | Case B 报价页 |
| 9 | 原始 9P 保留 | 通过 | Evidence/Audit |
| 10 | 跨文件 Evidence 完整 | 通过 | Case H |
| 11 | OCR Evidence 不丢失 | 通过 | Case B/H 测试 |
| 12 | Provider 标准错误码/阶段 | 通过 | 诊断 JSON |
| 13 | Cancel 无迟到回写 | 通过 | Case G 两阶段 |
| 14 | Retry 无旧 attempt 污染 | 通过 | 服务与客户端测试 |
| 15 | 空 Catalog 不注入 Demo | 通过 | Case E |
| 16 | 缺 Key 不注入 Demo | 通过 | Case F |
| 17 | none 不直接报价 | 通过 | Case C |
| 18 | pending 不直接报价 | 通过 | Case C 初始门禁 |
| 19 | Quote 只收 Confirmed | 通过 | 客户端测试 + UI |
| 20 | unitPrice 为空/人工填写 | 通过 | 报价页 ¥0 与提示 |
| 21 | 客户上下文不串线 | 通过 | 恢复测试 + UI customerId |
| 22 | 1366×768 可访问 | 通过 | 三张分辨率截图 |
| 23 | Windows 打包无白屏 | 通过 | A～H BrowserWindow |
| 24 | 001A～001E 回归通过 | 通过 | 7/20/62/20/17 |
| 25 | `npm run check` | 通过 | TypeScript 无错误 |
| 26 | `npm run build` | 通过 | Vite 生产构建成功 |

## 16. 冻结建议

REAL-AI-001F-R1 的 P0 已全部闭环，可以冻结 REAL-AI-001F。后续不得在本任务中继续 TASK-006、REAL-AI-002、公开平台搜索或产品库管理 UI；新增范围应单独立项评审。
