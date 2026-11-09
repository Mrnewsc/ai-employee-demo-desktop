# REAL-AI-001C-R3.2 Schema真实Canary

## 验收结论

**CANARY = FAIL**

Chunk 3在一次真实Provider主请求后返回合法JSON，但未通过Runtime Schema。Safe Canonicalization拒绝对9个`quantity: null`做业务对象强转，因全部Issue均为`repairable=false`，未调用Schema Repair。按“首个Chunk最终失败即可停止”的费用边界，Chunk 7和27未执行。

本轮共发起1次真实DeepSeek请求，未执行第2次请求，未运行Chunk 10/26、完整32页Job、REAL-AI-002A、REAL-AI-002B或TASK-006。

## 1. Canary输入

| 项目 | 结果 |
|---|---|
| 安全文件名 | `customer-product-list.pdf` |
| sourceFingerprint | `2cbff87bdb373a6fcce83e3bb9912605f97f40735ee96ef0c62d985fc17d4822` |
| PDF是否在仓库外 | 是 |
| 冻结001B确定性Chunk总数 | 32 |
| 授权Chunk | 3、7、27 |
| 实际进入Provider的Chunk | 3 |
| Chunk 3输入字符数 | 296 |
| sourceFingerprint是否与Preflight一致 | 是 |
| Chunk 3 fingerprint | `d6fb484aae65ea513928ca6a37d8e7435ac3ea65907a87090217c686fc75f1ba` |

未在本报告中保存客户原文、完整Prompt、messages、Provider原始JSON、API Key、Authorization或输入文件的完整本地路径。

## 2. Request Budget

| 指标 | 结果 |
|---|---:|
| MAX_REAL_PROVIDER_REQUESTS | 6 |
| usedBudgetBefore | 0 |
| request-started | 1 |
| usedBudgetAfter | 1 |
| remainingBudget | 5 |
| realProviderRequestCount | 1 |
| REAL_DEEPSEEK_REQUEST_COUNT | 1 |
| 第7次请求 | 未发生 |

计数以Attempt Ledger的`request-started`为准，不以HTTP返回成功为准。

## 3. Attempt Ledger

执行前Ledger为空，Chunk 3/7/27无R3.2 completed checkpoint，也无`AMBIGUOUS_ATTEMPT`。

| 字段 | 结果 |
|---|---|
| attemptId | `ds_mspvt4qy_1` |
| chunkIndex | 3 |
| requestAttempt | 1 |
| repairAttempt | 0 |
| provider / model | `deepseek` / `deepseek-v4-flash` |
| Attempt状态 | `completed`（表示HTTP Provider Attempt已完成，不表示Chunk Schema通过） |
| 耗时 | 10,179 ms（Ledger） |
| Provider Request ID | 未返回 |

无started但未completed/failed的账本项，因此本次无模糊请求状态。

## 4. Chunk 3详细结果

| 指标 | 结果 |
|---|---|
| finalStatus | `failed` |
| finalErrorCode | `AI_SCHEMA_INVALID` |
| providerRequestCount | 1 |
| repairRequestCount | 0 |
| durationMs | 10,189 |
| inputTokens | 1,441 |
| outputTokens | 2,394 |
| totalTokens | 3,835 |
| schemaValidFirstPass | false |
| schemaIssuesBeforeCanonicalization | 9 |
| canonicalizationApplied | false |
| canonicalizationRuleIds | `[]` |
| canonicalizationRejected | 9 |
| schemaIssuesAfterCanonicalization | 9（未应用转换，最终仍为同类9项Issue） |
| repairExecuted | false |
| schemaIssuesAfterRepair | 不适用 |
| semanticDriftDetected | false（未进入Repair） |
| checkpointWritten | true（failed checkpoint） |
| 正式productCount | 不可用：Wire DTO无效，未发布产品结果 |
| outputTruncated | false |
| Provider Error | 0 |

Schema Issue路径显示Provider JSON中有`products[0]`至`products[8]`共9个结构项，但这不等于9个已验收产品；Runtime Schema未通过时，正式`productCount`不得记为9。

## 5. Chunk 7详细结果

| 指标 | 结果 |
|---|---|
| finalStatus | `not-started` |
| providerRequestCount | 0 |
| repairRequestCount | 0 |
| checkpointWritten | false |
| 原因 | Chunk 3最终失败后按授权的“失败即停”边界停止 |

## 6. Chunk 27详细结果

| 指标 | 结果 |
|---|---|
| finalStatus | `not-started` |
| providerRequestCount | 0 |
| repairRequestCount | 0 |
| checkpointWritten | false |
| 原因 | Chunk 3最终失败后按授权的“失败即停”边界停止 |

## 7. SchemaIssue

Chunk 3的9项Issue只有数组索引不同，安全诊断如下：

| fieldPath | issueCode | expectedType | receivedType | expectedConstraint | receivedShape | repairable |
|---|---|---|---|---|---|---|
| `products[0].quantity` | `INVALID_QUANTITY` | `object` | `null` | `null` | `null` | false |
| `products[1].quantity` | `INVALID_QUANTITY` | `object` | `null` | `null` | `null` | false |
| `products[2].quantity` | `INVALID_QUANTITY` | `object` | `null` | `null` | `null` | false |
| `products[3].quantity` | `INVALID_QUANTITY` | `object` | `null` | `null` | `null` | false |
| `products[4].quantity` | `INVALID_QUANTITY` | `object` | `null` | `null` | `null` | false |
| `products[5].quantity` | `INVALID_QUANTITY` | `object` | `null` | `null` | `null` | false |
| `products[6].quantity` | `INVALID_QUANTITY` | `object` | `null` | `null` | `null` | false |
| `products[7].quantity` | `INVALID_QUANTITY` | `object` | `null` | `null` | `null` | false |
| `products[8].quantity` | `INVALID_QUANTITY` | `object` | `null` | `null` | `null` | false |

统一Repair分类原因：数量或规格涉及业务事实与类型语义，禁止自动强转。诊断仅保存路径、类型与结构，未保存客户字段值。

## 8. Canonicalization

Safe Canonicalization未应用任何白名单规则，`canonicalizationRuleIds=[]`。

9个`quantity: null`均被拒绝，因为当前安全边界不允许把数量的`null`容器自动生成或转换为业务对象。未修改原值，未猜测数量。

## 9. Repair

`repairExecuted=false`，Repair请求数为0。

原因是9项Schema Issue全部为`repairable=false`。系统按fail-closed规则停止，没有为了通过Schema而调用模型重写产品事实。

## 10. Semantic Drift

未进入Repair，因此没有RepairDiff，`REPAIR_SEMANTIC_DRIFT=0`。这不表示Repair成功，而是Repair根本未执行。

## 11. Checkpoint

Chunk 3失败后已立即在仓库外写入failed checkpoint，包含：

- jobId
- sourceFingerprint
- chunkId / chunkIndex / chunkFingerprint
- schemaVersion
- provider / model / thinkingMode
- promptConfigFingerprint
- extractionConfigFingerprint
- final error code

因Chunk 3未通过Schema，不存在可作为正式结果的Validated Wire DTO或Evidence refs。Chunk 7/27未执行，没有对应Checkpoint。

## 12. Token

| 类型 | Token |
|---|---:|
| Input | 1,441 |
| Output | 2,394 |
| Total | 3,835 |

无输出截断，无Repair Token。

## 13. Provider请求总数

- 主请求：1
- Repair请求：0
- Provider请求总数：1
- Transport Retry：0
- Provider Error：0
- `AI_OUTPUT_TRUNCATED`：0

## 14. Repair请求总数

0。

## 15. successfulChunkDuplicateRequestCount

0。本轮没有成功Chunk，也没有对任何Chunk重复请求。

## 16. Resume验证

未执行真实Resume，也未再调用Provider。原因：Chunk 3是failed checkpoint，而非completed checkpoint；授权中要求的“重启后命中Checkpoint且Provider为0”验证只在3个Chunk全部成功时执行。

本地回归已验证：失败Checkpoint未显式`resume`时会阻断Provider；completed checkpoint的resume会使Provider请求为0。

## 17. 测试

`npm run test:real-ai-extraction`：117/117通过，0失败。

覆盖包括：

- Runtime Schema与SchemaIssue映射
- Safe Canonicalization白名单边界
- RepairDiff和Semantic Drift阻断
- Evidence Resolver / Materializer / Semantic Guard
- Persistent Checkpoint
- Attempt Ledger / Ambiguous Attempt / 第7次请求前阻断
- Chunk 3/7/27范围限制
- 失败Checkpoint的显式Resume规则

## 18. check/build

- `npm run check`：通过。
- `npm run build`：通过。
- 构建仅有现存Vite chunk大于500 kB的提示，与本次Schema Canary失败无关。

## 19. 当前剩余风险与最小修复建议

### 已确认根因

Provider在数量未知时对每个产品输出了`quantity: null`，但Wire DTO要求`quantity`容器始终是对象，未知值应为`{value:null, unit:null, raw:null}`。

当前Prompt虽然给出了正确JSON示例，但“无法判断必须使用null、[]或{}”这条总规则可能被模型应用到`quantity`容器本身，从而与Wire DTO容器约束冲突。这是本次已通过真实SchemaIssue证据定位的失败点，不是Provider网络、JSON Parse、Thinking Mode、输出截断或Evidence阶段失败。

### 最小修复顺序

1. 不放宽Runtime Schema，只增强Prompt的容器约束：`quantity`必须始终输出对象，未知数量必须输出三个`null`子字段，禁止把`quantity`本身输出为`null`。
2. 增加针对“多产品且数量全未知”的离线Mock契约用例，确认Prompt和Wire DTO表述一致。
3. 由产品与安全评审决定，是否允许将`quantity: null`离线规范化为全空数量对象。该转换不应在本轮未授权情况下直接改动。
4. 修复通过本地回归后，另行授权针对Chunk 3的最小真实复验；需同时处理Prompt fingerprint变更与旧failed checkpoint的兼容性，不得盲目重试。

## 20. 是否建议继续Chunk 10/26

**不建议。**

Chunk 3已提供可复现、可定位的真实Schema Failure证据。应先针对`quantity`容器结构做最小修复和本地验证，再由产品经理单独授权后续Canary。当前不得运行Chunk 10/26，也不得恢复REAL-AI-002A。

## 最终判定

**B：REAL-AI-001C-R3.2真实Canary失败。**

**已获得真实SchemaFailure证据。**

**需要先针对失败字段进行最小修复。**
