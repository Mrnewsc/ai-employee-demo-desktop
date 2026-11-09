# REAL-AI-001C-R3.2-R2-CANARY Chunk 7 单Chunk真实复验

## 1. 验收结论

**PASS。** Chunk 7 在一次真实 DeepSeek 主请求后完成，Runtime Schema 首次通过；未执行 Safe Canonicalization，未执行 Repair。正式 Evidence Resolver、Materializer 与 Semantic Guard 链路已执行，Persistent Checkpoint 已写入并完成零 Provider 请求 Resume 验证。

本轮没有运行 Chunk 3、Chunk 10、Chunk 26、Chunk 27、其他 Chunk 或完整 32 页 PDF Job，也没有恢复 REAL-AI-002A。

## 2. Chunk 7 执行前状态

| 检查项 | 结果 |
|---|---|
| 输入文件 | `customer-product-list.pdf` |
| Source Fingerprint | `2cbff87bdb373a6fcce83e3bb9912605f97f40735ee96ef0c62d985fc17d4822`，匹配 |
| 确定性 Chunk 总数 | 32 |
| 本轮 Chunk | 7 |
| Chunk ID | `2cbff87bdb373a6f:chunk:7` |
| Chunk Fingerprint | `e3e9905edab585f28cdde8eb40a27f76013cae33f720aafe1bae99ab4abdaf72`，匹配 |
| Evidence Item 数 | 30 |
| 兼容 Completed Checkpoint | 不存在 |
| 兼容 Failed Checkpoint | 不存在 |
| `AMBIGUOUS_ATTEMPT` | 不存在 |
| Schema Version | `1.0`，匹配 |
| Model | `deepseek-v4-flash`，匹配 |
| Thinking Mode | `disabled`，匹配 |
| Prompt Config Fingerprint | 匹配 |
| Extraction Config Fingerprint | 匹配 |
| 执行前账本 | 0 / 2 |
| 执行前剩余预算 | 2 |

离线 Dry Run 在真实调用前完成，`REAL_DEEPSEEK_REQUEST_COUNT = 0`。

## 3. Request Budget

| 指标 | 结果 |
|---|---:|
| `MAX_REAL_PROVIDER_REQUESTS` | 2 |
| 主 Extraction 请求 | 1 |
| Repair 请求 | 0 |
| 实际 Provider 请求总数 | 1 |
| 剩余预算 | 1 |
| 第 3 次请求阻断要求 | 未触发，且预算闸门有效 |
| Concurrency | 1 |

Attempt Ledger 仅有一条 Chunk 7、`repairAttempt = 0`、状态为 `completed` 的记录。不存在模糊 Attempt。

## 4. Provider 结果

| 配置或结果 | 值 |
|---|---|
| `thinking.type` | `disabled` |
| `response_format.type` | `json_object` |
| `stream` | `false` |
| HTTP/Transport/Provider Error | 0 |
| `AI_OUTPUT_TRUNCATED` | 0 |
| Response Content Type | `application/json` |
| 最终状态 | `completed` |

审计未保存 API Key、Authorization、完整 Prompt、messages、Provider 原始响应、客户原文或完整本地路径。

## 5. Runtime Schema

| 指标 | 结果 |
|---|---:|
| `schemaValidFirstPass` | `true` |
| Canonicalization 前 Schema Issue | 0 |
| Canonicalization 后 Schema Issue | 0 |
| Repair 后 Schema Issue | 不适用 |
| Runtime Schema 是否放宽 | 否 |
| Wire DTO 是否修改 | 否 |

## 6. SchemaIssue

首次 Provider 返回即通过 Runtime Schema，本轮没有产生真实 `SchemaIssue[]`。

## 7. Canonicalization

| 指标 | 结果 |
|---|---:|
| `canonicalizationApplied` | `false` |
| Applied Count | 0 |
| Rejected Count | 0 |
| `QUANTITY_NULL_TO_EMPTY_OBJECT` | 未触发 |

由于模型首次输出已满足 quantity 对象契约，本轮不需要 Canonicalization。这是允许且更优的成功路径。

## 8. Repair

| 指标 | 结果 |
|---|---:|
| `repairExecuted` | `false` |
| Repair Request Count | 0 |
| Repair 最终状态 | `NOT_EXECUTED` |
| `semanticDriftDetected` | `false` |
| `REPAIR_SEMANTIC_DRIFT` | 0 |

## 9. 正式提取与 Evidence

Runtime Schema 通过后继续执行了现有正式 Evidence Resolver、Materializer 与 Semantic Guard，没有绕过安全步骤。

| 指标 | 结果 |
|---|---:|
| `productCount` | 9 |
| `evidenceTotal` | 35 |
| `evidenceValid` | 35 |
| `evidenceInvalid` | 0 |
| `productsWithoutEvidence` | 0 |
| `hallucinatedFieldCount` | 0 |
| `needsHumanReviewCount` | 5 |

Evidence 通过 `evidenceId + 原文精确包含 + SourceLocation + sourceFile` 联合校验。5 个产品进入人工复核，是因为正式链路对字段与来源原文不一致或产品名称缺失进行了保守处理；未将未证实字段发布为确定事实，因此不构成本轮 Schema 或 Evidence 验收失败。

## 10. Token 与耗时

| 指标 | 结果 |
|---|---:|
| Input Tokens | 1,559 |
| Output Tokens | 2,495 |
| Total Tokens | 4,054 |
| Provider Request Duration | 10,745 ms |

## 11. Checkpoint

| 检查项 | 结果 |
|---|---|
| Completed Checkpoint 写入 | 成功 |
| 写后 Runtime Schema 读取 | 成功 |
| Checkpoint Chunk | 7 |
| Checkpoint 状态 | `completed` |
| Checkpoint Result Hash | `6169d1c1b421ea34cce8668055638b93bb042759270c08f1f755f71a0ccfd72c` |

Checkpoint 保留完整 validated Wire DTO 和 Evidence refs，存放在仓库外本地敏感结果目录，未加入 Git。

## 12. Resume

使用新进程、真实 Provider 强制阻断模式重新运行 Chunk 7 Harness：

| 指标 | 结果 |
|---|---:|
| `checkpointHit` | `true` |
| Resume Provider Request Count | 0 |
| Resume 后 Ledger Attempt Count | 1 |
| 重复主请求 | 0 |

Resume 直接复用 Completed Checkpoint，没有调用 DeepSeek，也没有新增 Repair。

## 13. Chunk 3 防重复验证

| 检查项 | 执行前 | 执行后 |
|---|---|---|
| Chunk 3 Checkpoint SHA-256 | `2231b7c280b92047b175736c1cb14d5a4019661f8a8bb2f81580566ecad88e0d` | 相同 |
| Chunk 3 Ledger SHA-256 | `ed7ab59130cea5d67f8e7900e8d66e9639c5347c532fa9aff6added127f6768f` | 相同 |
| R2 账本中的 Chunk 3 Attempt | 0 | 0 |

`successfulChunkDuplicateRequestCount = 0`。Chunk 3 的 Completed Checkpoint 与原账本未被修改或重复调用。

## 14. 回归测试

| 验证 | 结果 |
|---|---|
| 001C 全部自动测试 | 131 / 131 通过 |
| `npm run check` | 通过 |
| `npm run build` | 通过 |
| 回归期间真实 Provider 请求 | 0（显式阻断） |

构建仅保留现有 Vite 大 Chunk 提示，不影响本次验收结果。

## 15. 修改与边界

本轮新增 Chunk 7 专用 Canary Harness 与本报告。未修改 Provider、Runtime Schema、Wire DTO、Prompt、Canonicalization、Repair、Evidence、Materializer、Semantic Guard 或冻结业务页面。

真实 Canary 期间没有边测边改代码。外部 Checkpoint、Ledger 和脱敏审计结果均留在仓库外，客户 PDF 未复制进仓库。

## 16. 下一步建议

REAL-AI-001C 继续保持 Controlled Unfreeze。建议下一步仅在产品经理单独授权后执行 **Chunk 27 单 Chunk 真实 Canary**。

在此之前继续禁止运行 Chunk 10、Chunk 26、其他 Chunk、完整 32 页 PDF Job，禁止恢复 REAL-AI-002A、启动 REAL-AI-002B 或 TASK-006。
