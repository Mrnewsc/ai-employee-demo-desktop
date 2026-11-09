# REAL-AI-001E 真实产品匹配引擎 V1 验收报告

## 1. 最终结论

**A：REAL-AI-001E建议通过并冻结**

REAL-AI-001E 已将冻结的 `ExtractedProductV1` 与 `ProductRepository` 通过独立 MatchEngine 正式连接。34 个脱敏黄金案例全部通过，六项 P0 安全指标均为 0；001A、001B、001C、001D 回归、TypeScript 检查和生产构建全部通过。本轮未修改正式页面，未启动 REAL-AI-001F 或 TASK-006。

## 2. 修改文件

匹配引擎：

- `src/real-ai/matching/contracts.ts`
- `src/real-ai/matching/schemas.ts`
- `src/real-ai/matching/config.ts`
- `src/real-ai/matching/normalizer.ts`
- `src/real-ai/matching/candidate-retriever.ts`
- `src/real-ai/matching/model-matcher.ts`
- `src/real-ai/matching/name-matcher.ts`
- `src/real-ai/matching/spec-matcher.ts`
- `src/real-ai/matching/application-matcher.ts`
- `src/real-ai/matching/input-quality.ts`
- `src/real-ai/matching/conflict-detector.ts`
- `src/real-ai/matching/scorer.ts`
- `src/real-ai/matching/semantic-provider.ts`
- `src/real-ai/matching/match-engine.ts`
- `src/real-ai/matching/validation.ts`
- `src/real-ai/matching/index.ts`

Fixtures、测试与验证：

- `src/real-ai/matching/fixtures/golden-cases.ts`
- `src/real-ai/matching/tests/test-repository.ts`
- `src/real-ai/matching/tests/normalizer.test.ts`
- `src/real-ai/matching/tests/candidate-retriever.test.ts`
- `src/real-ai/matching/tests/spec-matcher.test.ts`
- `src/real-ai/matching/tests/conflict-scorer-review.test.ts`
- `src/real-ai/matching/tests/match-engine.test.ts`
- `src/real-ai/matching/tests/results/matching-validation.json`
- `scripts/real-ai/run-matching-validation.ts`

未修改 `AIReception.tsx`、`ModulePages.tsx`、首页、客户线索、报价管理、跟进中心、企业配置、数据库、Electron 配置或打包配置。

## 3. MatchEngine 架构

正式链路为：

`ExtractedProductV1 + ExtractionWarnings` → `InputQuality` → `CandidateRetriever` → `Model/Name/Spec/Application Matcher` → `ConflictDetector` → `Scorer` → 可选 `SemanticMatchProvider` → `ProductMatchResult[]`

决策优先级固定为：

`硬冲突 > 型号精确 > 确定性规则 > AI语义补充`

MatchEngine 不读取 JSON/Excel 文件，只依赖 `ProductRepository`。产品库仍由 001D 负责导入、规范化、版本化和持久化，001E 是只读消费者。

## 4. ProductMatchResult V1

正式结果包含：

- `schemaVersion`、`matchId`、`createdAt`
- `extractedProductId` 与客户产品快照
- `candidateProductId` 与产品库候选快照
- `candidateRank`
- `status`：`matched / candidate / unresolved / none`
- `level`：`exact / high / medium / low / none`
- `score`
- 结构化 `matchedRules`、`conflictingRules`
- 客户侧、产品库侧和规则侧 `evidence`
- `needsHumanReview`、`reviewStatus`、`reviewReasons`
- `catalogVersion`

Runtime Schema 验证已覆盖。`score` 仅用于候选排序，不表示技术可行性、成交概率、产品质量或报价可信度。

## 5. CandidateRetriever

候选召回顺序：

1. `ProductRepository.findByNormalizedModel()`；
2. 标准名称；
3. 企业同义词；
4. 关键词；
5. 分类；
6. 应用场景；
7. 可比较规格字段。

默认 Top-K 为 5，语义复核 Top-K 为 3，均集中配置。召回只保留 `active` 且通过 001D `ProductRecordSchema` 的记录；停用产品和损坏记录会被跳过并返回明确 issue。重复标准化型号不会静默选择第一条，而是保留候选并触发人工确认。

当前 24 条产品规模由 Repository 的标准化查询和内存候选搜索满足。未来 1,000–10,000 条产品时可以在 Repository 内升级倒排索引，不需要改 MatchEngine，也不需要本轮提前引入向量数据库。

## 6. 型号匹配

型号标准化完全复用 001D 的 `normalizeModel()`：

- `SP3000`、`SP-3000`、`SP 3000`、全角 `ＳＰ－３０００` 可归一为同一型号；
- `9P-3000` 与 `SP-3000` 明确不相等；
- 不使用编辑距离、OCR 字符猜测或产品常识修正型号。

型号精确是 exact 的必要条件，但不是充分条件：仍需通过输入质量和硬规格冲突检查。

## 7. 名称与同义词匹配

确定性优先级为：标准名称完全一致、企业同义词一致、分类一致、关键词一致、保守的字符片段重合。名称维度可召回高质量候选，但没有可靠型号时不会产生 exact。

黄金案例已覆盖“自动喷涂机”“自动喷粉设备”“自动产线”“输送机”“家具喷漆线”“往复式喷涂机”“涂装前处理线”“喷粉生产线”等企业别名和关键词。

## 8. 规格匹配

规格状态明确区分：

- `matched`
- `missing`
- `conflicting`
- `not-comparable`

支持字符串相等、数值比较、基础单位换算、单值与范围判断、候选最小能力和候选最大能力判断。产品库缺字段不会被当作匹配，也不会被当作确定冲突，而是进入缺失关键规格与人工确认。

## 9. 单位标准化复用

001E 调用 001D 的 `normalizeSpecificationName()` 和 `parseSpecification()`，直接复用：

- mm / cm / m
- g / kg
- W / kW

产品库优先使用 001D 已保存的 `specificationDetails.baseValue/baseUnit`；客户侧规格使用同一解析器生成可比基准。额外的范围解析只负责组合比较，不重新建立另一套基础单位表。

黄金测试验证了 `1.2m = 1200mm`、`120cm = 1200mm`、`15000W = 15kW` 和 `10–20kW` 包含 `15kW`。

## 10. 硬规格与软规格规则

`MatchPolicy` 集中配置每个规格的：

- `importance`：hard / soft / informational
- `comparison`：equal / candidate-minimum / candidate-maximum
- `toleranceRatio`
- `requiredForReview`

V1 默认硬规格包括工作宽度、最大工作宽度、尺寸、电压、功率、最大负载、产能和接口规格；材质、外观为软规格，可选附件为信息规格。这是工程起点，不是所有行业的正式标准，后续应由企业产品配置覆盖。

## 11. Application 匹配

`ExtractedProduct.application` 与产品库 `applications`、`keywords` 比较，只作为 10% 加分项。仅有应用场景时最高降为 low；它不能覆盖型号不一致或硬规格冲突。

## 12. Scoring

默认权重集中在 `MatchPolicy`：

- 型号 45%
- 名称/同义词 25%
- 规格 20%
- 应用场景 10%

只对实际可用维度归一评分。阈值为 high `>=0.82`、medium `>=0.60`、low `>=0.35`，近似候选差值阈值为 `0.05`。这些阈值只代表 V1 工程基线，不是行业标准。

等级安全约束：

- exact：型号精确、无硬冲突、无缺失硬规格、无 OCR 歧义、无输入冲突、Evidence 完整；
- hard conflict：最高降为 medium；
- 明确型号不一致：最高降为 low；
- OCR 歧义且候选型号不同：不得 exact，进入人工确认；
- 低于最低阈值：返回 none，不强行匹配。

## 13. ConflictDetector

ConflictDetector 独立识别：

- 型号不一致；
- 硬规格冲突；
- 产品库缺少关键规格；
- ExtractedProduct 上游多来源冲突。

冲突写入结构化 `conflictingRules`，包含客户值、产品库值、规格重要性和文字说明。高相似度和 AI 语义建议都不能清除这些规则。

## 14. Human Review 规则

以下情况触发人工确认：

- OCR 型号歧义；
- 型号不一致或重复型号；
- 硬规格冲突；
- 缺少关键规格；
- 上游 ExtractedProduct 已要求人工确认；
- 上游字段冲突；
- 多个候选分数接近；
- AI 语义建议与规则冲突；
- high、medium、low 或 none 结果。

只有满足 exact 且没有任何质量阻断项的候选可以 `needsHumanReview=false`；正式业务仍需销售确认后使用。

## 15. OCR 9P-3000 案例

客户原始 OCR 型号保持为 `9P-3000`，结果快照没有改写。企业产品库中的 `SP-3000` 可通过名称、规格和应用场景成为候选，但最终：

- `candidateProductId = JG-SP-3000`
- `level = low`
- `needsHumanReview = true`
- review reason 同时保留客户原值 `9P-3000` 与候选值 `SP-3000`
- `ocrAmbiguousPromotedToExact = 0`

## 16. Evidence 设计

结果 Evidence 明确区分：

- `customer`：001C 客户文件中的名称、型号、规格、应用及 SourceLocation；
- `catalog`：产品 ID、产品库字段、来源文件和 catalogVersion；
- `rule`：型号归一、名称同义词、规格比较、冲突或语义复核规则。

MatchEngine 不改写 001C Evidence。跨文件合并产品的客户 Evidence 保持原来源，产品库依据绑定候选 `productId` 和版本。

## 17. Catalog 版本与只读边界

每条结果保存实际 `catalogVersion`。请求若指定旧版本且与当前版本不一致，会返回 `CATALOG_VERSION_MISMATCH` 并触发人工确认。

Repository 集成测试在匹配前后比较版本、checksum 和全部产品记录，确认 MatchEngine 不修改产品库。AI 建议不会自动写入同义词、关键词或产品记录。

## 18. Semantic Provider

已建立供应商无关的 `SemanticMatchProvider` 和 `MockSemanticMatchProvider`。语义层只接收确定性规则召回的 Top-K 候选，可返回有限调整和解释。

安全约束：

- 调整幅度由 `maxSemanticAdjustment=0.05` 限制；
- 不能创建产品库不存在的产品；
- 不能改客户或候选型号；
- 不能覆盖硬规格冲突；
- 不能把 none 强行变成 high；
- 与规则冲突时以规则为准并触发人工确认。

本轮没有实现或调用真实 DeepSeek Semantic Provider，没有产生新的 API 费用。真实语义 Smoke 留待单独评审，不影响 V1 确定性引擎验收。

## 19. 黄金测试集

使用 001D 的 24 条脱敏企业产品库，建立 34 个匹配案例，覆盖：

- 型号精确、无连字符、空格和全角格式差异；
- 型号缺失、同义词、关键词、中英文/格式化名称基础；
- 同系列不同型号、同名不同型号；
- 单位换算、范围、硬规格冲突、软规格冲突、缺关键规格；
- 应用一致、应用单独不足；
- OCR `9P-3000` 与 `SP-3000`；
- 多候选接近、完全无关、未知型号、停用产品；
- 上游冲突、跨文件合并、重复型号、损坏产品记录；
- 规则与 Mock AI 语义冲突。

结果：34/34 通过。等级分布为 exact 11、high 15、medium 3、low 2、none 3。

## 20. Top-1 Accuracy

当前脱敏黄金集合中，有预期产品的 31 个案例 Top-1 全部命中：**100%**。

该指标只说明 V1 在当前 24 条产品库和 34 个受控案例上的表现，不代表任意行业或真实客户资料的泛化准确率。

## 21. Top-3 Recall

有预期产品的 31 个案例均在 Top-3 中召回：**100%**。

## 22. Exact Precision

引擎输出 exact 的 11 个案例均为正确产品且满足 exact 安全条件：**100%**。`wrongExactMatchCount=0`。

## 23. Wrong Match 与 Human Review 统计

- `wrongMatchCount = 0`
- `humanReviewRecall = 100%`（当前 23 个预期复核案例全部触发）
- `hardConflictBlockedCount = 2`
- `duplicateProductCount` 不适用于匹配结果；重复型号以 Repository issue 和人工确认处理
- 上游冲突静默覆盖：0

## 24. None 案例

三个 none 案例全部正确：

1. 未知型号 `XYZ-9999` 且没有名称；
2. 完全无关的激光切割机需求；
3. 已停用产品 `MIX-200`。

三者均 `candidateProductId=null`，没有为了界面展示强行返回相似产品。

## 25. 性能

本地 24 条产品库、34 个案例验证结果：

- 平均总耗时：13.03 ms/产品
- P95：19 ms/产品
- 平均候选召回：8.26 ms
- 平均确定性规则匹配：0.12 ms
- 语义调用：0 次

性能数据来自当前开发机和脱敏 Fixture，只用于工程回归，不作为生产 SLA。未来产品量提升时，优先在 Repository 层增加标准化索引和倒排索引。

## 26. 测试与构建结果

| 验证项 | 结果 |
| --- | --- |
| 001E 模块测试 | 17/17 通过 |
| 001E 黄金案例 | 34/34 通过 |
| 001A Parser 回归 | 7/7 通过 |
| 001B Electron service 回归 | 8/8 通过 |
| 001D Catalog 回归 | 20/20 通过 |
| 001C Extraction 回归 | 62/62 通过 |
| `npm run check` | 通过 |
| `npm run build` | 通过 |

## 27. 已发现问题与边界

### P1

1. 默认硬/软规格和阈值是制造业演示库的工程起点，正式接入企业产品库前需要行业化 MatchPolicy 配置与人工评审。
2. `件/天` 等业务复合单位当前支持相同单位的数值比较，但尚未实现 `件/分钟 ↔ 件/天` 的时间维度安全换算；单位不同会保守返回不可比较。
3. 当前 Repository 候选搜索适合 24 条及中小规模目录；达到 1,000–10,000 条时应在 001D Repository 内增加索引并重新做性能基准。

### P2

1. Semantic Provider 当前只有接口与 Mock，尚未通过真实 DeepSeek 边界 Smoke；确定性规则不依赖该能力。
2. 100% 指标仅限当前脱敏黄金集合，需要随着真实行业样本增加持续扩充反例，尤其是同义词冲突、型号复用和复合规格。

以上问题不破坏 V1 的 P0 安全门槛，也不要求在本轮修改冻结模块。

## 28. P0 验收表

| P0 项 | 结果 |
| --- | --- |
| ExtractedProduct 通过真实 ProductRepository 查询 | 通过 |
| exact 型号正常命中 | 通过 |
| 型号格式差异正常归一 | 通过 |
| 硬规格冲突不能 exact | 通过，`hardConflictPromotedToExact=0` |
| OCR 歧义不能 exact | 通过，`ocrAmbiguousPromotedToExact=0` |
| 缺型号可由名称/规格形成候选 | 通过 |
| 无合理候选可返回 none | 通过，3/3 |
| 不制造产品库外产品 | 通过，`unknownProductFabricated=0` |
| 匹配依据可解释 | 通过，结构化 matched/conflicting rules |
| 客户与产品库 Evidence 可追溯 | 通过 |
| catalogVersion 保存 | 通过 |
| `wrongExactMatchCount=0` | 通过 |
| `noneForcedToCandidate=0` | 通过 |
| `silentConflictOverwrite=0` | 通过 |
| 关键边界正确触发 Human Review | 通过，Recall 100% |
| 自动测试全部通过 | 通过 |
| `npm run check` | 通过 |
| `npm run build` | 通过 |
| 冻结页面未修改 | 通过 |

**A：REAL-AI-001E建议通过并冻结**

满足进入 REAL-AI-001F 的技术前置条件，但本轮到此停止，等待产品经理验收，不自动开始 UI 接入。
