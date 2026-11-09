# REAL-AI-002A 真实公开来源产品候选检索技术验证

## 1. 验证结论

当前结论：**B：REAL-AI-002A 仍有问题，不建议进入 REAL-AI-002B。**

- 独立 `public-search` 模块已经建立，未修改 REAL-AI-001A～001F、产品库管理及现有 UI。
- 公开索引候选检索已真实跑通：7 条原始索引结果，经证据校验、相关性阈值、去重与 Top-K 后保留 5 条。
- 5 条候选均包含真实目标 URL、公开索引证据 URL、标题来源、检索时间，并统一设置 `needsHumanReview = true`。
- 真实客户 PDF 已按仓库外路径执行验收，文档仅记录安全文件名 `customer-product-list.pdf`，不记录完整本地路径。
- 001B 真实解析通过；001C 在并发 Chunk 请求中收到非合法 HTTP JSON 响应，冻结服务按设计取消其余请求并拒绝返回部分结果。
- 因 001C 未形成有效 `ExtractedProduct[]`，不能选择 8 个真实产品，也不能合法执行对应公开候选检索。
- 未使用 fixture 或人工编造产品替代真实 PDF。

## 2. 模块边界

新增模块：`src/real-ai/public-search/`

```text
PublicProductSearchRequest
  -> QueryBuilder
  -> CandidateSearchProvider
  -> CandidateNormalizer
  -> EvidenceValidator
  -> CandidateRanker
  -> CandidateDeduplicator
  -> Top 5
  -> PublicProductSearchResult
```

正式生产触发条件仍应为：

```text
001E MatchEngine
  -> none / unresolved
  -> REAL-AI-002 PublicSearchService
```

002A Harness 允许以 `searchReason = test-harness` 构造 unmatched 输入，但没有接入正式生产流程或 UI。

## 3. 数据契约

### PublicProductSearchRequest

保留以下真实输入字段：

- `extractedProductId`
- `productName`
- `model`
- `specifications`
- `material`
- `application`
- `category`
- `keywords`
- `customerEvidence`
- `imageReferences`
- `searchReason`

产品名称与型号不能同时为空。QueryBuilder 只使用输入中已有字段，不创造型号、不补造缺失规格。

### PublicProductCandidate

候选包含任务要求的标题、来源、真实 URL、域名、图片、价格文本、MOQ、供应商、地区、规格、材料、描述、查询、匹配信号、冲突信号、分数、检索时间、人工确认状态和 `sourceEvidence`。

任何非空候选字段必须有公开证据支持。无证据候选直接拒绝，不进入 Top-K。

## 4. Provider 验证

### 360 搜索公开索引

状态：**可作为 002A 第一阶段 Provider。**

- 仅访问公开搜索结果页，不使用账号、Cookie、验证码绕过或反爬绕过。
- 使用公开索引中的 `data-mdurl` 保存真实目标 URL。
- `sourceEvidence.sourceUrl` 保存实际索引结果页，不把未访问的商品详情页伪装成证据页。
- 可保留索引页公开展示的标题、摘要、图片和价格文本。
- 真实 Smoke：原始结果 7 条，正式候选 5 条，全部需要人工核验。

证据文件：`src/real-ai/public-search/tests/results/provider-smoke.json`

### Made-in-China 公开搜索页

状态：**Provider 已实现，但当前网络环境表现不稳定。**

- 初始验证曾成功返回公开商品标题、图片和真实商品 URL。
- 连续请求后出现公开页限制访问，Provider 正确返回 `SOURCE_BLOCKED`。
- 不做自动绕过，不作为本轮唯一稳定来源。

### 1688

状态：**受限 Source。**

- 直接搜索页面返回登录/验证相关内容，当前不做直接抓取。
- 允许保存公开搜索引擎已索引的 1688 目标 URL、标题和摘要。
- 不访问受限详情、不保存 Cookie、不绕过登录或验证码。
- 索引内容可能过期，必须人工打开并核验。

### Alibaba 及其他平台

当前未作为正式 Provider。需要登录、频控或页面不稳定时统一返回受限或不可用状态，不进行降级 Demo。

## 5. 查询与排序

QueryBuilder 最多生成 5 个查询，优先顺序：

1. 产品名称 + 型号
2. 产品名称 + 材料
3. 类别 + 产品名称
4. 产品名称 + 规格
5. 产品名称 + 应用或输入关键词

排序权重遵循：

- 型号精确命中权重最高。
- 名称、类别、材料、规格和用途分别形成可读匹配信号。
- 材料或规格明确冲突会降权并记录 `conflictingSignals`。
- 低于相关性阈值的结果不进入正式候选。
- 相同 URL 去重，只保留更高分候选并合并证据。
- 最终最多保留 5 条，全部需要人工确认。

## 6. 图片证据评估

本次真实 PDF 的 001B 结果：

- 文件名：`customer-product-list.pdf`
- 文件大小：2,556,542 bytes
- 页数：32
- 文本块：1,020
- 表格：0
- 图片引用：190
- 带 `bbox` 的图片引用：0
- Parser Warning：0
- 原始文本字符数：9,943

现有 001B PDF 解析结果能够保留：

- `imageId`
- PDF `page`
- 可选 `bbox`
- 可选 `sha256`

当前限制：

- 普通 PDF 内嵌图片通常只有 `imageId + page`，`bbox` 可能为空。
- 001C 的结构化提取输入目前不包含图片对象，只包含文字、表格与 OCR Evidence。
- 002A 不修改冻结模块，而是在独立请求中预留 `imageReferences[]`。
- 只有图片具备可定位引用和哈希时才标记 `availableForVisualSearch = true`；否则明确为不可用于图片搜索。
- 本轮未实现图片向量检索或搜同款。

## 7. 安全与失败边界

- 仅允许 HTTP/HTTPS 公开 URL。
- 登录、验证码、403、429 分别映射为受限或阻塞状态。
- Provider 抛错记录为 `SOURCE_UNAVAILABLE`，不生成 Demo 候选。
- 无真实 URL、无标题证据或字段无来源支持的候选直接拒绝。
- 不保存登录 Cookie，不使用个人账号，不绕过反爬。
- 不自动把候选加入企业产品库。
- 不把索引价格、MOQ、库存或规格视为正式承诺。
- 客户 PDF 与完整提取结果只能写入仓库外路径。

## 8. 测试结果

本地测试：14 项全部通过。

覆盖：

- QueryBuilder 不补造型号
- Runtime Schema
- 图片引用缺失状态
- 真实 URL 与索引证据 URL 分离
- 无证据候选拒绝
- 无证据价格拒绝
- Provider 受限状态
- Provider 抛错不降级 Demo
- 材料冲突降权
- 相同 URL 去重
- Top 5
- `needsHumanReview = true`

公开来源 Smoke：通过，不调用 DeepSeek，不使用客户文件。

## 9. 真实 PDF Harness

独立入口：

```powershell
npx tsx scripts/real-ai/run-real-ai-002a-smoke.ts `
  --pdf=C:\外部目录\customer-product-list.pdf `
  --confirm-ai-cost=true
```

约束：

- PDF 必须使用外部绝对路径。
- 结果默认写入系统临时目录。
- 如果输出路径位于 Git 仓库内，Harness 会直接拒绝。
- Harness 复用现有 001B、001C，不修改其代码。
- 真实 DeepSeek 调用必须显式确认费用后执行。
- 自动从真实提取结果选择 8 个代表产品，不重写产品字段。

## 10. 真实 PDF 端到端验收结果

### 执行过程

1. 预检确认 `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL` 存在，未输出或记录 API Key。
2. 001B 成功解析 32 页真实 PDF。
3. 初次 Harness 预检在调用模型前被冻结配置的 30 Chunk 安全上限拦截；仅在 002A Harness 中将本次上限调整为 40，未修改 001C 默认配置，也未产生该次 API 费用。
4. 随后执行一次真实 001C 提取。并发请求中出现“DeepSeek 响应不是合法 HTTP JSON”，冻结服务取消剩余请求并拒绝部分结果。
5. 未进行第二次真实 DeepSeek 调用。
6. 因没有合法 `ExtractedProduct[]`，公开 Provider 未针对客户产品执行，避免用人工字段或 Demo 数据替代。

### 验收数据

| 项目 | 实际结果 |
|---|---|
| 实际提取产品数量 | 未产出（001C 整体失败，不能记为 0） |
| 选择的 8 个测试产品 | N/A |
| 每个真实 Search Query | N/A |
| 每个产品 Top-5 | N/A |
| 候选真实 URL | N/A |
| Source | 计划使用 `360搜索公开索引`，本次未进入 Provider 阶段 |
| Candidate 数量 | N/A |
| matchedSignals | N/A |
| conflictingSignals | N/A |
| no-result | N/A；这是上游失败，不得误报为公开搜索无结果 |
| CandidateHitRate | N/A |
| Top1RelevantRate | N/A |
| Top3RelevantRate | N/A |
| WrongCandidateRate | N/A |
| 搜索耗时 | 0 ms（未进入公开搜索阶段） |
| 是否使用缓存 | 否 |

### Provider 限制

- 360 搜索公开索引已经通过独立真实 Smoke，但本次不能用通用 Smoke 候选冒充客户产品验收。
- 1688 仍属于受限 Source；不登录、不访问验证码后的内容、不绕过反爬。
- Made-in-China 当前环境存在间歇性访问限制，不作为本次兜底。
- Provider 不允许在 001C 失败时自动降级为 Demo 输入。

## 11. P0 问题

### P0-1：32 Chunk 真实提取缺少可恢复审计结果

- 任一并发请求失败后，服务按冻结逻辑取消其余请求。
- 当前 Harness 没有在失败时保存不含客户正文的逐请求审计记录，因此无法确认具体失败 Chunk、HTTP 响应类型和已完成请求数量。
- 不能使用部分结果继续候选检索。

### P0-2：真实 8 产品验收未完成

- 浴室用品、车载手机支架、便携启动电源、圣诞装饰品、家居收纳、旋转电动清洁刷、折叠晾衣架、折叠餐桌/家具均未形成可验证的 001C 产品对象。
- Search Query、Top-5、候选 URL 和相关性指标无法计算。

在以上 P0 修复并重新获得产品经理对真实 API 调用的明确授权前，不再次调用 DeepSeek，不冻结 REAL-AI-002A，不开始 REAL-AI-002B。
