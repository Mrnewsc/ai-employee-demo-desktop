# REAL-AI-001C-R3.2-PREFLIGHT 真实Canary执行前收口

## 验收结论

R3.2-PREFLIGHT离线收口通过，已具备在产品经理单独授权后安全执行Chunk 3、7、27真实Canary的条件。

- `REAL_DEEPSEEK_REQUEST_COUNT = 0`
- `realProviderRequestCount = 0`
- 未执行真实Canary
- 未运行完整32页DeepSeek Job
- 未运行Chunk 10或26
- REAL-AI-002A继续暂停
- REAL-AI-002B与TASK-006未启动

## 1. 昨日四文件修改验证

昨日断线前修改的文件为：

- `src/real-ai/extraction/contracts.ts`
- `src/real-ai/extraction/real-provider-guard.ts`
- `src/real-ai/extraction/providers/deepseek-product-extraction-provider.ts`
- `src/real-ai/extraction/tests/r3-1-schema-diagnostics.test.ts`

验证结果：

- Schema Invalid先进入Safe Canonicalization，再次Runtime Schema验证。
- 只有剩余Schema Issue全部`repairable=true`才允许一次Schema Repair。
- Repair后继续执行RepairDiff；语义变化返回`REPAIR_SEMANTIC_DRIFT`。
- 真实请求进程级硬上限在Fetch之前生效。
- 取消请求的原时序已回归，未留下活动句柄。
- 原R3.1结束时的94项测试全部继续通过。

## 2. Canary Harness

独立Harness：`scripts/real-ai/run-r3-2-schema-canary.ts`。

支持：

- `--chunks=3,7,27`
- `--max-real-requests=6`
- `--concurrency=1`
- `--dry-run=true`
- `--resume=true`

默认行为永远是Dry Run。真实调用必须同时显式提供：

- `--execute-real=true`
- `--confirm-ai-cost=true`

Harness硬限制只允许Chunk 3、7、27；Chunk 10、26及其他Chunk在Provider调用前被拒绝。Concurrency只能为1，预算只能为6。Harness不启用Job层Transport Retry；每个Chunk只有1次主请求，Runtime Schema失败且全部Issue可安全Repair时最多增加1次Repair。

## 3. 真实PDF Dry Run

输入文件仅记录安全文件名：`customer-product-list.pdf`。

Dry Run结果：

| 指标 | 结果 |
|---|---:|
| sourceFingerprint | `2cbff87bdb373a6fcce83e3bb9912605f97f40735ee96ef0c62d985fc17d4822` |
| totalChunks | 32 |
| selectedChunks | 3、7、27 |
| selected inputChars | 902 |
| estimatedRequestCount | 6（最坏情况） |
| maxRealRequests | 6 |
| thinkingMode | disabled |
| concurrency | 1 |
| providerRequestCount | 0 |
| realProviderRequestCount | 0 |

仓库外脱敏结果文件：

`C:\Users\HGX\Documents\sy\real-ai-pilot-output\r3-2-canary\2cbff87bdb373a6f\preflight-dry-run.json`

结果未保存客户正文、Prompt、messages、API Key、Authorization、Provider响应或完整本地输入路径。

## 4. Persistent Chunk Checkpoint

新增`PersistentChunkCheckpointStore`，仅服务于真实提取Job恢复。成功Checkpoint保存：

- jobId
- sourceFingerprint
- chunkId / chunkIndex / chunkFingerprint
- schemaVersion
- provider / model / thinkingMode
- promptConfigFingerprint
- extractionConfigFingerprint
- completedAt
- Validated Wire DTO（包含Evidence refs）
- 正式Materialized Chunk Result
- resultHash
- `sensitivity = sensitive/local-only`

Checkpoint不保存API Key、Authorization、完整Prompt、messages、Provider原始响应或客户完整PDF文本。真实Checkpoint只能位于仓库外pilot output目录，不进入Git。

## 5. Checkpoint兼容性

读取和覆盖失败Checkpoint前均验证：

- jobId
- sourceFingerprint
- chunkId / chunkIndex / chunkFingerprint
- schemaVersion
- provider / model / thinkingMode
- promptConfigFingerprint
- extractionConfigFingerprint

任一不一致返回`CHECKPOINT_INCOMPATIBLE`，禁止自动调用Provider。损坏JSON、Runtime Schema失败或resultHash不一致返回`CHECKPOINT_CORRUPT`并Fail Closed。成功Checkpoint不可覆盖或降级为失败状态。

## 6. Chunk Fingerprint

Chunk Fingerprint采用SHA-256，确定性输入包括：

- sourceFingerprint
- chunkIndex
- canonical Chunk结构
- Evidence ID、文本、SourceLocation、confidence、kind和warning code

Checkpoint只保存Hash，不额外保存Chunk客户正文。Validated Wire DTO本身属于客户派生业务数据，因此仅保存在本地仓库外目录。

## 7. Attempt Ledger

新增`RealProviderAttemptLedger`。每次真实Fetch之前先原子写入：

- attemptId
- jobId
- chunkIndex
- requestAttempt / repairAttempt
- provider / model
- `status = started`
- startedAt

完成或失败后只更新安全元数据：status、completedAt、durationMs、providerRequestId与errorCode。账本不保存Prompt、messages或响应正文。

## 8. Ambiguous Attempt保护

进程重启后，账本中遗留的`started`自动转为`AMBIGUOUS_ATTEMPT`。对应Chunk禁止自动重试，必须人工确认。

如果账本已有任何已消费请求，但对应Chunk没有成功或失败Checkpoint，Harness同样Fail Closed为模糊状态，不会推测请求是否完成，也不会自动再次付费调用。

## 9. Request Budget持久化

Job级预算为6，以`attempt started`计数，而不是以响应完成计数。Ledger原子写入成功即消耗一次预算，断网、进程崩溃或响应丢失不会返还。

Harness重启后从账本恢复已用预算。例如已started 4次，则remaining为2；第7次会在HTTP Fetch前阻断。进程级`REAL_AI_MAX_DEEPSEEK_REQUESTS`硬上限继续作为第二道保护。

## 10. Crash / Restart恢复

安全状态：

- `not-started`：无Checkpoint、无账本调用，可执行。
- `request-started`：当前进程已经记账。
- `completed`：读取成功Checkpoint，`checkpointHit=true`，Provider调用0次。
- `failed`：只有显式`--resume=true`才允许重试。
- `ambiguous`：禁止自动重试。

成功Chunk重启后不会重新调用。失败Chunk仅在显式resume时执行。Checkpoint损坏、兼容键变化或孤立Ledger记录均Fail Closed。

## 11. Mock Canary

离线Mock确认：

- 3/7/27首次全部Schema Valid：3个请求。
- 3/7/27全部需要Repair：严格6个请求。
- Repair改变产品事实：触发`REPAIR_SEMANTIC_DRIFT`并保存失败状态。
- 失败Checkpoint未显式resume：Provider调用0次。
- 成功Checkpoint重启resume：Provider调用0次。
- Chunk 10、26及任何非白名单Chunk：Provider调用0次并拒绝。
- Dry Run：Provider调用0次。

## 12. Schema诊断链

Mock已覆盖完整链：

`Schema Invalid → SchemaIssue → Safe Canonicalization → Runtime Schema → Repairability → 一次Repair → RepairDiff → Runtime Schema`

未放宽Runtime Schema，未修改ExtractedProductV1领域契约。Schema Issue仍只保存结构、类型、约束与安全Shape；Repair诊断只保存计数与漂移结论。

## 13. 测试

- R3.2-PREFLIGHT新增离线测试：20/20通过。
- 001C完整测试：117/117通过。
- 原94项001C基线：94/94继续通过。
- R3 Scheduler恢复、重试、Cancel和迟到回写测试继续通过。
- 测试全程设置`REAL_AI_BLOCK_REAL_DEEPSEEK=1`和`REAL_AI_MAX_DEEPSEEK_REQUESTS=0`。

## 14. Check / Build

- `npm run check`：通过。
- `npm run build`：通过。
- 仅存在既有Vite大Chunk提示，不影响本次PREFLIGHT。

## 15. 真实请求计数

- `REAL_DEEPSEEK_REQUEST_COUNT = 0`
- `realProviderRequestCount = 0`
- Dry Run Ledger attempts：0

## 16. 真实Canary预估最大调用次数

- 3个Chunk各1次主请求：3次。
- 每个Chunk只有Schema失败且Issue全部可安全Repair时才允许1次Repair：最多3次。
- 总上限：6次。
- Transport Retry：Harness不启用。
- 第7次：Ledger与进程级守卫均会在HTTP请求前阻断。

## 17. 执行条件与历史边界

`SUCCESSFUL_CHUNK_CHECKPOINT_AVAILABLE = false`

历史R3的27个成功Chunk只有脱敏审计，没有Validated Wire DTO和Evidence refs：

- 可安全恢复成功Chunk：0
- `historicalCheckpointRecoverable = false`
- 不伪造、不重建、不从审计推断
- 本次3个Canary成功也不能直接恢复原32/32最终Merge

新的Persistent Checkpoint会从下一次真实调用开始保存成功结果，避免今后再次发生成功Chunk随进程结束丢失。

综合结论：R3.2-PREFLIGHT具备执行Chunk 3、7、27真实Canary的安全条件，但本轮没有执行。必须等待产品经理单独授权。
