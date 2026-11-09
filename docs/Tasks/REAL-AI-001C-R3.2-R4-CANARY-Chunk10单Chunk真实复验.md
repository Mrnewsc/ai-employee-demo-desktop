# REAL-AI-001C-R3.2-R4-CANARY Chunk 10 单Chunk真实复验

## 1. 验收结论

**PASS。** Chunk 10 使用一次真实 DeepSeek 主请求完成，Runtime Schema 首次通过；未执行 Safe Canonicalization 或 Repair。正式 Evidence Resolver、Materializer、Semantic Guard 与其他 001C 安全处理均已执行，Persistent Completed Checkpoint 已写入并通过零 Provider 请求 Resume 验证。

本轮未执行 Chunk 3、Chunk 7、Chunk 27、Chunk 26、其他 Chunk或完整 32 页 PDF Job，也未恢复 REAL-AI-002A。

## 2. Chunk 10 执行前安全状态

| 检查项 | 结果 |
|---|---|
| 输入安全文件名 | `customer-product-list.pdf` |
| Source Fingerprint | `2cbff87bdb373a6fcce83e3bb9912605f97f40735ee96ef0c62d985fc17d4822`，匹配 |
| 确定性 Chunk 总数 | 32 |
| 本轮唯一 Chunk | 10 |
| Chunk ID | `2cbff87bdb373a6f:chunk:10` |
| Chunk Fingerprint | `70a09fb88b52ed8f15e9b644c7299003e58ac95a3fed10ecbdfee8e17bc31a45`，匹配 |
| Evidence Item 数 | 28 |
| Chunk 10 Completed Checkpoint | 不存在 |
| Chunk 10 Failed Checkpoint | 不存在 |
| `AMBIGUOUS_ATTEMPT` | 不存在 |
| Schema Version | `1.0`，匹配 |
| Provider | `deepseek`，匹配 |
| Model | `deepseek-v4-flash`，匹配 |
| Thinking Mode | `disabled`，匹配 |
| Prompt Config Fingerprint | 匹配 |
| Extraction Config Fingerprint | 匹配 |
| 执行前账本 | 0 / 2 |
| 执行前剩余预算 | 2 |

真实调用前已完成离线 Dry Run，`REAL_DEEPSEEK_REQUEST_COUNT = 0`。

## 3. Request Budget

| 指标 | 结果 |
|---|---:|
| `MAX_REAL_PROVIDER_REQUESTS` | 2 |
| 主 Extraction 请求 | 1 |
| Repair 请求 | 0 |
| 实际 Provider 请求总数 | 1 |
| 剩余预算 | 1 |
| Concurrency | 1 |

独立 R4 Attempt Ledger 只有一条 `chunkIndex = 10`、`repairAttempt = 0`、状态为 `completed` 的记录。没有第 2 次或第 3 次调用，也没有 Transport Retry。

## 4. Provider 结果

| 配置或结果 | 值 |
|---|---|
| `thinking.type` | `disabled` |
| `response_format.type` | `json_object` |
| `stream` | `false` |
| HTTP / Transport / Provider Error | 0 |
| `AI_OUTPUT_TRUNCATED` | 0 |
| Response Content Type | `application/json` |
| 最终状态 | `completed` |

审计不包含 API Key、Authorization、完整 Prompt、messages、Provider 原始响应、客户原文或完整本地路径。

## 5. Runtime Schema

| 指标 | 结果 |
|---|---:|
| `schemaValidFirstPass` | `true` |
| Canonicalization 前 Schema Issue | 0 |
| Canonicalization 后 Schema Issue | 0 |
| Repair 后 Schema Issue | 不适用 |
| Runtime Schema 是否放宽 | 否 |
| Wire DTO 是否修改 | 否 |

Canary 前后对 Runtime Schema、Wire DTO、Canonicalization 与正式 DeepSeek Provider 源文件做 SHA-256 对照，全部保持不变。

## 6. SchemaIssue

首次 Provider 返回直接通过 Runtime Schema，本轮没有产生真实 `SchemaIssue[]`。

## 7. Canonicalization

| 指标 | 结果 |
|---|---:|
| `canonicalizationApplied` | `false` |
| Applied Count | 0 |
| Rule IDs | 空 |
| Rejected Count | 0 |
| `QUANTITY_NULL_TO_EMPTY_OBJECT` | 未触发 |

模型首次输出已经满足 quantity 对象契约，因此无需 Canonicalization。

## 8. Repair 与 Semantic Drift

| 指标 | 结果 |
|---|---:|
| `repairExecuted` | `false` |
| Repair Request Count | 0 |
| Repair 最终状态 | `NOT_EXECUTED` |
| `semanticDriftDetected` | `false` |
| `REPAIR_SEMANTIC_DRIFT` | 0 |

## 9. 正式提取与 Evidence

Runtime Schema 通过后继续执行了现有正式 Evidence Resolver、Materializer、Semantic Guard 和保守字段发布逻辑。

| 指标 | 结果 |
|---|---:|
| `productCount` | 9 |
| `evidenceTotal` | 26 |
| `evidenceValid` | 26 |
| `evidenceInvalid` | 0 |
| `productsWithoutEvidence` | 0 |
| `hallucinatedFieldCount` | 0 |
| `needsHumanReviewCount` | 3 |

Evidence 按 `evidenceId + 原文精确包含 + SourceLocation + sourceFile` 联合验证。3 个产品因正式链路发现字段与来源原文不一致或关键名称缺失而进入人工复核；未将无依据字段发布为确定事实，因此不构成本轮 Schema 或 Evidence 验收失败。

## 10. Token 与耗时

| 指标 | 结果 |
|---|---:|
| Input Tokens | 1,486 |
| Output Tokens | 1,836 |
| Total Tokens | 3,322 |
| Provider Request Duration | 8,374 ms |

## 11. Checkpoint

| 检查项 | 结果 |
|---|---|
| Persistent Completed Checkpoint | 写入成功 |
| 写后 Runtime Schema 读取 | 成功 |
| Checkpoint 状态 | `completed` |
| Checkpoint Result Hash | `95e0f389fd3686bc485010624f2ce0f39e23d8f5689c00f9fd577f62a906ec84` |
| Checkpoint 文件 SHA-256 | `b1def35db98e50c8c334b1d7665680cbf938a839c9528591c54a673eb15cf8d9` |

Checkpoint 包含 validated Wire DTO、Evidence refs、source/chunk fingerprint、Schema Version、Provider、Model、Thinking Mode、配置指纹和 Result Hash。文件保存在仓库外本地敏感结果目录。

## 12. Resume 验证

使用新进程并强制阻断真实 Provider 后再次运行专用 Harness：

| 指标 | 结果 |
|---|---:|
| `checkpointHit` | `true` |
| Resume Provider Request Count | 0 |
| Resume 后 Ledger Attempt Count | 1 |
| Chunk 10 重复主请求 | 0 |

Resume 直接复用 Completed Checkpoint，没有访问 DeepSeek。

## 13. Chunk 3 / 7 / 27 防重复验证

| 既有结果 | Checkpoint | 本轮验证请求 | R4 账本 Attempt | 文件保护 |
|---|---|---:|---:|---|
| Chunk 3 | `completed`，Result Hash 可验证 | 0 | 0 | Checkpoint 与账本 SHA-256 前后相同 |
| Chunk 7 | `completed`，Result Hash 可验证 | 0 | 0 | Checkpoint 与账本 SHA-256 前后相同 |
| Chunk 27 | `completed`，Result Hash 可验证 | 0 | 0 | Checkpoint 与账本 SHA-256 前后相同 |

`successfulChunkDuplicateRequestCount = 0`。Chunk 26 未产生 Checkpoint，R4 账本中也没有 Chunk 26 记录。

## 14. 自动测试

001C 当前全部自动测试结果：**131 / 131 通过**。测试期间设置了真实 Provider 阻断与零请求上限。

## 15. check / build

| 验证 | 结果 |
|---|---|
| `npm run check` | 通过 |
| `npm run build` | 通过 |
| check/build 期间真实 Provider 请求 | 0 |

构建只有既有 Vite 大 Chunk 提示，不影响本次验收。

## 16. 修改与边界

本轮只新增 Chunk 10 专用 Canary Harness 和本报告，没有修改 Provider、Prompt、Runtime Schema、Wire DTO、Canonicalization、Repair、Evidence Resolver、Materializer、Semantic Guard 或任何冻结业务模块。

真实 Canary 执行期间没有边测边改代码。客户 PDF 未复制进仓库，外部 Checkpoint、Ledger 与脱敏审计未加入 Git。

## 17. 下一步建议

REAL-AI-001C 继续保持 Controlled Unfreeze。建议下一步仅在产品经理单独授权后执行 **Chunk 26 单 Chunk 真实 Canary**。

在此之前继续禁止执行 Chunk 26、其他 Chunk、完整 32 页 PDF Job，禁止恢复 REAL-AI-002A、启动 REAL-AI-002B 或 TASK-006。
