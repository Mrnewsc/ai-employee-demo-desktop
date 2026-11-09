# REAL-AI-001C-R3.2-R1-CANARY Chunk 3单Chunk真实复验

## 验收结论

**PASS**

Chunk 3在一次真实DeepSeek主请求后首次通过Runtime Schema，未进入Safe Canonicalization，未执行AI Repair。正式001C后续链路已运行，并写入了可重新加载的completed Checkpoint。

本轮未运行Chunk 7、27、10、26或任何其他Chunk，未运行完整32页DeepSeek Job，未恢复REAL-AI-002A、REAL-AI-002B或TASK-006。

## 1. 执行前检查

| 检查项 | 结果 |
|---|---|
| `DEEPSEEK_API_KEY` | 存在，未读取或输出内容 |
| `DEEPSEEK_MODEL` | `deepseek-v4-flash` |
| 历史R3.2 Chunk 3 Checkpoint | `failed / AI_SCHEMA_INVALID`，不是completed |
| 历史R3.2 ambiguous attempt | 0 |
| R1独立Ledger执行前请求数 | 0 |
| R1独立Ledger预算 | 2 |
| R1 ambiguous attempt | 0 |
| R1 compatible completed Checkpoint | 无 |
| sourceFingerprint | `2cbff87bdb373a6fcce83e3bb9912605f97f40735ee96ef0c62d985fc17d4822` |
| chunkFingerprint | `d6fb484aae65ea513928ca6a37d8e7435ac3ea65907a87090217c686fc75f1ba` |
| 确定性Chunk总数 | 32 |
| 执行Chunk | 仅3 |
| schemaVersion | `1.0` |
| provider / model | `deepseek / deepseek-v4-flash` |
| thinkingMode | `disabled` |
| extractionConfigFingerprint | `527bc7dff30f044e2bf789f6850df8d7124063a3cc22865903fdbd4360e6c037` |
| R1 promptConfigFingerprint | `8674ce8bfdd795e7fbba872b96c6dcffe3a943af86515979ab0ca28a8c52eb92` |

R1使用独立的2次预算Ledger和Checkpoint目录，没有覆盖历史R3.2失败证据。

## 2. Provider配置

最终请求路径确认使用：

- `thinking.type = disabled`
- `response_format.type = json_object`
- `stream = false`
- `concurrency = 1`
- 主请求最多1次
- Repair最多1次
- 进程硬上限和Persistent Attempt Ledger均为2次

未修改正式默认并发配置。

## 3. Chunk 3真实执行路径

本轮实际走的是授权中的**情况A**：

```text
Provider Request
→ 合法JSON
→ Runtime Schema首次通过
→ Evidence Resolver
→ Materializer
→ Semantic Guard
→ 正式Chunk 3结果
→ completed Checkpoint
```

| 指标 | 结果 |
|---|---:|
| finalStatus | `completed` |
| schemaValidFirstPass | true |
| schemaIssueCountFirstPass | 0 |
| canonicalizationApplied | false |
| canonicalizationAppliedCount | 0 |
| canonicalizationRejectedCount | 0 |
| repairExecuted | false |
| repairRequestCount | 0 |
| semanticDriftDetected | false |
| Provider Error | 0 |
| `AI_OUTPUT_TRUNCATED` | 0 |

Prompt增强后，模型首次就输出了契约要求的quantity对象，因此`QUANTITY_NULL_TO_EMPTY_OBJECT`本轮不需要执行。这是允许且更优的成功路径。

## 4. 请求预算与Token

| 指标 | 结果 |
|---|---:|
| MAX_REAL_PROVIDER_REQUESTS | 2 |
| 实际Provider主请求 | 1 |
| 实际Repair请求 | 0 |
| Ledger已用 | 1 |
| Ledger剩余 | 1 |
| `realProviderRequestCount` | 1 |
| Input Tokens | 1,579 |
| Output Tokens | 2,415 |
| Total Tokens | 3,994 |
| Request durationMs | 9,963 |
| Ledger durationMs | 9,955 |

两个耗时统计相差8ms，来自Provider请求记录和外围Ledger记录的计时边界不同。

## 5. Quantity结构验证

对completed Checkpoint做纯结构审计：

| 指标 | 结果 |
|---|---:|
| Validated Wire DTO products | 9 |
| quantity为object | 9 |
| quantity容器为null | 0 |
| quantity具备`value/unit/raw` | 9 |
| 正式Materialized products | 9 |

Runtime Schema和Wire DTO未放宽。

## 6. Evidence与幻觉防线

本地通过冻结001B重新确定性生成Chunk 3，对正式结果的Evidence做离线回指验证：

| 指标 | 结果 |
|---|---:|
| Chunk 3输入Evidence items | 30 |
| 最终Evidence引用 | 33 |
| Evidence有效 | 33 |
| Evidence无效 | 0 |
| 最终非空关键字段 | 18 |
| 无有效Evidence的最终关键字段 | 0 |
| hallucinated final field count | 0 |
| needsHumanReview | 8 |

Materializer产生14条安全告警：

- `EVIDENCE_TEXT_MISMATCH`: 9
- `MISSING_CRITICAL_FIELD`: 5

这些告警表示Provider的部分候选字段与引用原文不一致，系统已将它们置空并触发人工复核；它们没有被当作最终事实放行。Evidence Resolver、Materializer和Semantic Guard均未被跳过。

## 7. Canonicalization与事实一致性

本轮Runtime Schema首次已通过，因此Safe Canonicalization不需要改写任何字段：

- `canonicalizationRuleIds = []`
- `canonicalizationFieldPaths = []`
- `QUANTITY_NULL_TO_EMPTY_OBJECT` 执行次数 = 0

因没有执行Canonicalization，“转换前后的product count / Evidence refs / 其他事实字段Diff”在本次真实路径中为**不适用**。R3.2-R1离线测试仍保留了9次转换的事实不变验证。

## 8. Repair

Repair未执行：

- `repairRequestCount = 0`
- `repairExecuted = false`
- RepairDiff = 不适用
- `REPAIR_SEMANTIC_DRIFT = 0`

本轮没有为了通过Canary而放宽Schema或重写产品事实。

## 9. Checkpoint

Chunk 3成功后已立即在仓库外写入completed Checkpoint，并在写入后重新加载验证。

Checkpoint包含：

- Validated Wire DTO
- Evidence refs
- 正式Materialized Chunk结果
- resultHash
- sourceFingerprint
- chunkFingerprint
- schemaVersion
- provider / model / thinkingMode
- promptConfigFingerprint
- extractionConfigFingerprint

| 检查项 | 结果 |
|---|---|
| checkpointWritten | true |
| checkpointReloaded | true |
| status | `completed` |
| resultHash | `8a551e0f388897838501645893c76993d91a1f1a1e4ef85e21a52996c9a5de40` |
| Validated Wire DTO products | 9 |
| Materialized products | 9 |
| Evidence refs | 33 |

## 10. 重启/复用验证

在新进程中启用真实Provider硬阻断，重新解析同一PDF并校验全部兼容键，结果直接命中completed Checkpoint：

- `status = checkpoint-hit`
- `resumeProviderRequestCount = 0`
- Ledger attempt仍为1
- 无重复Provider请求
- `successfulChunkDuplicateRequestCount = 0`

## 11. Ledger最终状态

| 指标 | 结果 |
|---|---:|
| maxRealRequests | 2 |
| attempts | 1 |
| completed attempts | 1 |
| ambiguous attempts | 0 |
| remaining budget | 1 |
| 第3次请求 | 未发生 |

Ledger的completed表示真实Provider Attempt已闭合；Chunk自身也已有独立的completed Checkpoint。

## 12. 回归验证

- `npm run test:real-ai-extraction`: 131/131通过，0失败。
- `npm run check`: 通过。
- `npm run build`: 通过。
- Build仅保留原有Vite chunk大于500 kB的提示。

回归包含Evidence、Materializer、Semantic Guard、Repair、Checkpoint、Ledger、Request Budget、Cancel和迟到回写隔离。

## 13. 安全与隐私

真实Canary报告、Ledger和对外统计未保存或输出：

- API Key
- Authorization
- 完整Prompt / messages
- Provider原始JSON
- 客户原文
- 输入文件的完整本地路径

completed Checkpoint含有必要的本地敏感结构化结果和Evidence，仅保存于仓库外，不进入Git。

## 14. 剩余风险

- Chunk 3的Schema Failure已收口，但本轮不能代表Chunk 7/27/10/26已通过。
- 8/9产品需人工复核，主要因为候选字段与Evidence原文不一致或产品名称缺失；安全策略已正确置空未验证字段。
- 未获产品经理新授权前，不应执行任何其他真实Chunk。

## 最终判定

**REAL-AI-001C-R3.2-R1-CANARY通过。**

**Chunk 3单Chunk真实复验成功，首次Runtime Schema直接通过，Repair请求为0。**

**后续Chunk必须等待产品经理单独授权。**
