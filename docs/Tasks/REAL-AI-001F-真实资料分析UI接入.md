# REAL-AI-001F 真实资料分析与产品匹配 UI 接入

## 1. 修改文件

- `electron/main.cjs`
- `electron/preload.cjs`
- `electron/real-ai/index.cjs`
- `electron/real-ai/ipc/channels.cjs`
- `electron/real-ai/ipc/register.cjs`
- `electron/real-ai/pipeline/full-analysis-job-manager.cjs`
- `electron/real-ai/pipeline/smoke/run-full-pipeline-smoke.cjs`
- `electron/real-ai/tests/full-analysis-job-manager.test.cjs`
- `scripts/real-ai/build-matching.mjs`
- `src/App.tsx`
- `src/index.css`
- `src/pages/AIReception.tsx`
- `src/pages/ModulePages.tsx`（仅报价草案数据接收）
- `src/stores/AppStore.tsx`（仅新增真实报价交接对象）
- `src/real-ai/clients/real-file-analysis-client.ts`
- `src/real-ai/pipeline/contracts.ts`
- `src/real-ai/pipeline/index.ts`
- `src/real-ai/pipeline/tests/real-file-analysis-client.test.ts`
- `src/real-ai/ui/RealAnalysisWorkspace.tsx`

未重做 TASK-001 至 TASK-005 的页面设计，未修改数据库、真实发送接口或公开平台搜索。

## 2. UI 接入架构

Renderer 只调用 `RealFileAnalysisClient`。文件暂存、Parser、DeepSeek、ProductRepository 和 MatchEngine 全部在 Electron 主进程编排，Renderer 不接触 `fs`、本地路径、API Key 或产品库 JSON。

真实链路为：文件选择/拖放 → 安全暂存 Token → Pipeline Job → 001B Parser → 001C Extraction → Catalog readiness → 001E MatchEngine → Renderer 人工确认 → 报价草案交接。

## 3. RealFileAnalysisClient

提供 `selectFiles`、`stageFiles`、`startAnalysis`、`getStatus`、`cancel`、`retry`、`resume`、`catalogStatus`、`onProgress`、`confirmMatch` 和 `createQuoteDraft`。人工确认保存在当前应用会话的 `sessionStorage`，不写数据库。

## 4. Job 状态映射

正式状态覆盖 `queued`、`staging`、`parsing`、`ocr`、`extracting`、`matching`、`catalog-required`、`completed`、`failed`、`cancelled`。六步 UI 完全由真实快照推进，不再使用固定 5 至 8 秒定时器。

## 5. 真实文件上传

支持 PDF、DOCX、XLS、XLSX、JPG、JPEG、PNG，多文件上限沿用 001B 安全配置。界面仅显示文件名、类型、大小和状态，不显示真实本地路径。

## 6. 真实解析

复用 001B Worker 与 Job Manager。文件状态随 `reading`、`ocr`、`parsed`、`failed` 更新。打包版既有 Smoke 已覆盖 PDF、DOCX、XLSX、OCR、取消和损坏文件恢复。

## 7. 真实 AI 提取

主进程使用环境变量创建正式 DeepSeek Provider；生产路径没有 Mock fallback。UI展示 001C 的产品名称、型号、规格、数量、材质、工艺、应用、人工复核状态和告警。

## 8. 产品库前置检查

提取后调用 `getVersionInfo`。产品库为空时终态为 `catalog-required`，保留已提取产品并明确显示“产品匹配等待企业产品库”，不切换 Demo 数据。

## 9. 真实 Match 结果

每个 ExtractedProduct 调用 001E MatchEngine，返回 Top-K `ProductMatchResult[]`。UI按 `exact/high/medium/low/none` 映射为精确匹配、高匹配、部分匹配、低匹配、未找到，并将“有候选”与“已人工确认”分开表达。

001F 新增一项受限召回保护：当 OCR 只保留错误型号且产品名称为空/为泛化标题时，只从同一产品的可追溯 Evidence 中确定性提取“产品名称”提示供候选召回。原始型号和 001C 字段不被改写，结果强制 Human Review。001C、001D、001E 未修改。

## 10. Evidence UI

抽屉展示来源文件、PDF页码、Word段落/表格位置、Excel Sheet/Cell、图片来源和原始文字。bbox、置信度等信息放在低权重技术详情中。

## 11. Human Review UI

每个产品支持“确认匹配、选择其他候选、标记未找到、暂不确认”。OCR歧义、冲突、medium、low 和 none 均保持待人工处理，不自动成为正式结果。

## 12. 更换候选

展开 Top-K 候选后可人工选择其他产品。记录 `decision=changed`、产品 ID、确认时间和备注，不写回企业产品库，也不宣称 AI 自动学习。

## 13. None 处理

`none` 明确显示“企业产品库未找到对应产品”，只能标记未找到或暂不确认。本轮没有 1688、Alibaba、Google 或图片搜同款入口。

## 14. ConfirmedMatchResult

契约包含 `extractedProductId`、`selectedProductId|null`、`originalMatchResult`、`decision`、`confirmedBy=local-user`、`confirmedAt` 和 `note`。未确认状态不会被静默覆盖。

## 15. 报价草案交接

只有 `accepted/changed` 的企业产品进入 `RealQuoteDraftHandoff`；`pending` 会锁定按钮，`not-found` 被排除。报价页只接收产品、型号、数量和配置描述，单价固定为 `null` 交接并在页面中保持人工填写，不生成价格、折扣、交期或技术承诺。

## 16. Demo / Real 边界

“智能接待”原演示能力保持不变。“资料分析与产品匹配”默认走真实 Pipeline。失败、缺 Key、产品库为空均不会自动切换演示结果。预览查询参数仅用于 Electron 截图验收，不参与正常业务运行。

## 17. 无 API Key 场景

本地管线测试确认返回 `AI_NOT_CONFIGURED`，保留解析边界，不创建 Mock 结果。UI映射为“AI分析服务尚未配置，请联系系统管理员”。

## 18. 无产品库场景

本地管线测试确认状态为 `catalog-required`，ExtractedProduct 保留、MatchGroup 为空。UI显示已识别数量和产品库待配置提示。

## 19. Cancel / Retry

取消会增加 `runToken` 并触发 AbortController 与 Parser cancel；迟到结果无法覆盖 cancelled。AI失败后可以复用已解析文档重试；解析阶段失败需要重新上传。7项 001F Electron 编排测试全部通过。

## 20. 多文件

一次任务支持多个 fileId，001C继续负责跨 Chunk/跨文件合并。全量回归已覆盖跨文件同产品合并、冲突保留和 Evidence 合并。真实打包批量 Smoke 同时处理了 PDF、XLSX 和 OCR 图片。

## 21. 客户上下文

Job 必须绑定 `customerId`。`resume(customerId)` 只恢复同一客户最近任务；UI收到其他客户快照时直接忽略。客户切换后清空当前显示并按新客户恢复，不会把金华结果挂到义乌客户。

## 22. 1366×768

生成并人工检查：

- `preview/real-analysis-1366x768.png`
- `preview/real-analysis-1366x768-bottom.png`
- `preview/real-analysis-1440x900.png`

三栏完整、无页面级横向滚动、中文字段无单字强拆。底部滚动截图确认操作栏属于页面结构且不遮挡中间建议或右侧结果区。

## 23. Windows 打包 Smoke

打包目录：`release/win-unpacked/数员科技 AI数字员工.exe`。

最终生产包使用 `--capture-previews` 原生渲染截图，退出码为 0，1366×768、底部滚动状态和 1440×900 均非白屏、无 `ERR_FILE_NOT_FOUND`。截图保存在 `.tmp/packaged-capture/`。

已通过部分：

- Windows packaged=true
- 产品库导入 24 条、版本 1
- PDF 解析、Evidence、真实 DeepSeek 提取
- XLSX 解析、Evidence、真实 DeepSeek 提取
- MatchEngine 生成真实 MatchGroup
- OCR Worker 运行并进入真实 AI 阶段
- OCR 原值 `9P-3000` 保持
- OCR Human Review 触发
- OCR Evidence 可追溯
- Renderer 快照不含路径和 API Key

未通过：第一次批量 Smoke 中重复 OCR 信息未进入合并结果；OCR 单文件复验成功提取 `9P-3000`，但首次未召回 SP-3000。增加 Evidence 名称提示后，最终 Provider 复验在提取阶段失败，未形成新的 MatchResult。因此“打包版 OCR → SP-3000 候选 → 人工选择 → 报价”没有取得最终通过证据。

报告：`src/real-ai/pipeline/tests/results/windows-packaged-smoke.json`，当前 `passed=false`。

既有 001B packaged Smoke 仍为 `passed=true`，覆盖取消、损坏文件、OCR、路径泄漏和渲染心跳。

## 24. 底层回归

- 001A Parser：7/7 通过
- 001B Electron service：14/14 通过
- 001C Extraction：62/62 通过
- 001D Catalog：20/20 通过
- 001E Matching：17/17 通过
- 001F Pipeline Client：3/3 通过
- 001F Electron Pipeline：7/7 通过
- `npm run check`：通过
- `npm run build`：通过

## 25. 已发现问题

### P0

1. Windows 打包版 OCR 单文件在最终复验时 Provider 失败，且 Smoke 报告尚未取得“9P-3000 → SP-3000候选”的通过证据。
2. 因上述问题，无法证明打包版从 OCR 到人工确认再到报价草案的完整 Case B。

### P1

1. Pipeline Job 只在同一次应用运行期间保留，应用重启后不能恢复。
2. 最终 Smoke 失败报告应保留更完整的 Provider 错误码、耗时和 request metrics；当前专项报告只保存终态。
3. UI 的真实结果交互已由契约和单元测试覆盖，但未取得 Windows 打包版逐按钮自动化录像/截图证据。

### P2

1. Renderer 主包包含 XLSX 导出代码，Vite 提示主 chunk 超过 500 kB；不影响功能，但后续可做按需加载。
2. 当前无正式产品库管理 UI，产品库为空时只能引导至企业配置并说明待配置。

## 26. P0 验收表

| 编号 | 验收项 | 结论 |
|---|---|---|
| 1 | 真实 PDF 从 UI/管线端到端 | 管线通过，UI真实点击证据不足 |
| 2 | 真实 XLSX 从 UI/管线端到端 | 管线通过，UI真实点击证据不足 |
| 3 | OCR 图片端到端 | 未通过，候选链路缺最终证据 |
| 4 | 不使用固定 timer | 通过 |
| 5 | 不使用固定 Demo Match | 通过 |
| 6 | ExtractedProduct 来自 001C | 通过 |
| 7 | MatchResult 来自 001E | 通过 |
| 8 | 空产品库不伪造 | 通过 |
| 9 | 缺 Key 不切 Demo | 通过 |
| 10 | `9P-3000` 原值保持 | 通过 |
| 11 | OCR Human Review | 通过 |
| 12 | 硬冲突不能 exact | 通过（001E回归） |
| 13 | none 不显示已找到 | 通过 |
| 14 | 未确认不能进报价 | 通过 |
| 15 | 报价只接收人工确认产品 | 通过 |
| 16 | Evidence UI 可追溯 | 实现并通过契约测试，打包逐按钮证据不足 |
| 17 | 多文件合并不重复 | 底层回归通过；真实批量 OCR Evidence 合并存在边界 |
| 18 | Cancel 有效 | 通过 |
| 19 | Retry 有效 | 通过 |
| 20 | 页面切换不串客户 | 通过 |
| 21 | 1366×768无遮挡 | 通过 |
| 22 | Windows 打包版真实链路 | 未通过 |
| 23 | 底层回归 | 通过 |
| 24 | `npm run check` | 通过 |
| 25 | `npm run build` | 通过 |
| 26 | 未改冻结模块业务设计 | 通过 |

## 27. 是否建议冻结 REAL-AI-001F

**B：REAL-AI-001F仍需修复。**

建议仅处理 P0：在不重复无意义调用的前提下，先补齐 Provider 失败的持久化诊断证据，然后用 OCR 单文件完成一次可复现的 Windows 打包版 `9P-3000 → SP-3000候选 → 人工确认 → 报价草案` 验收。TASK-006、REAL-AI-002 和产品库正式管理 UI 继续暂停。
