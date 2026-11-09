# REAL-AI-001C-R2 最终验收报告

## 1. 验收结论

**A：REAL-AI-001C建议通过并冻结**

本轮三个 P0 已完成收口：OCR 字符歧义能够传播并触发人工确认；Provider Wire DTO、Evidence Catalog 与 Evidence Resolver 已将证据位置控制权收回本地；DOCX `application` 字段语义边界已通过 Prompt 和本地 Semantic Guard 双重约束。全部本地测试、TypeScript 检查、生产构建及唯一一次真实 DeepSeek Smoke 均通过。

本轮没有启动 REAL-AI-001E、REAL-AI-001F、TASK-006，也没有接入产品匹配、ProductRepository、公开平台或新数据库。

## 2. 修改文件

核心实现：

- `src/real-ai/extraction/contracts.ts`
- `src/real-ai/extraction/schemas.ts`
- `src/real-ai/extraction/chunker.ts`
- `src/real-ai/extraction/evidence-resolver.ts`
- `src/real-ai/extraction/semantic-guard.ts`
- `src/real-ai/extraction/materializer.ts`
- `src/real-ai/extraction/prompt.ts`
- `src/real-ai/extraction/config.ts`
- `src/real-ai/extraction/index.ts`

测试与验收：

- `src/real-ai/extraction/fixtures/golden-cases.ts`
- `src/real-ai/extraction/tests/materializer.test.ts`
- `src/real-ai/extraction/tests/parser-integration.test.ts`
- `src/real-ai/extraction/tests/r2-p0.test.ts`
- `src/real-ai/extraction/smoke/validation.ts`
- `scripts/real-ai/run-deepseek-extraction-smoke.ts`
- `src/real-ai/extraction/tests/results/deepseek-smoke-r1.json`
- `src/real-ai/extraction/tests/results/deepseek-smoke.json`

未修改正式业务页面、Electron 页面流程、数据库或产品匹配模块。

## 3. Warning 传播机制

传播链现为：

`ParsedDocument.warnings` → `ExtractionInput.parserWarnings` → Chunk Evidence 的 `warningCodes` → `ExtractedProduct.warnings` → `needsHumanReview`

字段影响规则：

| Parser Warning | 影响范围 | 最终行为 |
| --- | --- | --- |
| `ocr_character_ambiguity` | 与 Warning 来源位置重叠的 OCR Evidence；当前重点消费型号字段 | 保留 OCR 原始值，映射为 `OCR_MODEL_UNCERTAIN`，触发人工确认 |
| 普通 OCR 低置信度 | 仅对应低置信度字段 | 按字段触发人工确认，不扩散到全部 OCR 产品 |
| 非型号、无歧义且置信度正常 | 对应字段 | 不误触发整条产品人工确认 |

Warning 不再在 001B 到 001C 的边界丢失，也没有把所有 OCR 结果一律标为人工确认。

## 4. OCR Human Review 规则

型号字段满足任一条件时触发人工确认：

1. Evidence 带有 `ocr_character_ambiguity`；
2. 已存在 `OCR_MODEL_UNCERTAIN`；
3. 型号 OCR Evidence 明确包含字符候选不确定性；
4. 型号 OCR 置信度低于配置阈值。

`ocr-low-confidence-model` 的原始型号 `9P-3000` 在最终结果中保持不变，未被产品常识或产品库修正为 `SP-3000`；同时 `needsHumanReview=true`，并包含 `OCR_MODEL_UNCERTAIN`。

## 5. Provider Wire DTO

模型输出已与正式领域对象分离。Provider 只返回紧凑字段值、简洁备注和 `evidenceRefs`，不再返回完整 Evidence、文件路径、页码、Sheet、单元格、bbox 或 SourceLocation。

Wire DTO 的核心形态为：

```json
{
  "products": [
    {
      "productName": "...",
      "model": "...",
      "evidenceRefs": {
        "productName": [{"evidenceId": "ev_xxx", "quote": "..."}]
      }
    }
  ]
}
```

正式 `ExtractedProduct` 仍由本地 Materializer 生成，未破坏领域对象 V1。

## 6. Evidence Catalog

每个 Chunk 向 Provider 提供只读紧凑目录：`evidenceId`、`text`、`type`。完整 Canonical Evidence 仅保存在本地，包含文件、SourceLocation、confidence、originKind 等可信信息。

因此，最终 SourceLocation 始终由本地 Catalog 恢复，模型无法自行构造页码、单元格或图片坐标。

## 7. Evidence Resolver 与无效 ID 恢复规则

Resolver 严格按以下顺序处理：

1. Evidence ID 有效且 quote 被本地原文包含：使用本地 Canonical Evidence；
2. ID 无效，但 quote 与当前 Chunk 中唯一一条 Evidence 全文规范化后完全一致：确定性恢复，并增加 `EVIDENCE_REFERENCE_REPAIRED`；
3. quote 对应多条相同 Evidence，或没有精确匹配：拒绝猜测，增加 `UNKNOWN_EVIDENCE_REFERENCE`；
4. 单字段证据失败时，仅将该字段置空，保留其他有有效证据的字段；
5. 整个候选均无可验证关键字段时，记录 `UNRESOLVED_PRODUCT_CANDIDATE`，不静默消失。

禁止使用模糊匹配、编辑距离、语义猜测或产品常识补证据。唯一恢复路径已有本地自动测试覆盖；本次真实 Smoke 中 Provider 没有产生无效引用，因此 `invalidProviderEvidenceReferenceCount=0`。

## 8. DOCX 字段语义修复

Prompt 已明确：

- `application`：产品实际用于什么工件、业务场景、行业或用途；
- 非 `application`：接入、安装、兼容、接口、交付、现场改造等实施要求。

真实 Smoke 中，“需要接入现有生产线”进入 `notes`，`application=null`；未被翻译或推断为 production line application。

## 9. Semantic Guard

本地 Guard 对模型输出进行保守复核：当 application Evidence 只包含接入、安装、兼容、接口、交付、现场改造、PLC、预留等实施要求，且没有“用于某工件/场景”等真实应用证据时：

- `application` 置为 `null`；
- 原内容移入 `notes`；
- 原 Evidence 改挂到 notes；
- 增加 `APPLICATION_RECLASSIFIED`。

真实应用句“用于金属零件喷涂”在独立测试中保持为 application，不会被误删。

## 10. Merge 指标修复

指标已拆分：

- `wrongMergeCount`：仅统计两个本不应合并的产品被错误合并；
- `missingExpectedProductCount`：统计黄金样本预期产品缺失；
- `invalidProviderEvidenceReferenceCount`：统计无效或经过恢复的 Provider Evidence 引用；
- `duplicateProductCount`：统计重复产品；
- `silentlyOverwrittenConflictCount`：统计冲突是否被静默覆盖。

最终结果：错误合并 0、预期产品缺失 0、重复产品 0、冲突静默覆盖 0、无效 Provider 引用 0。

## 11. 自动测试与构建结果

| 验证项 | 结果 |
| --- | --- |
| 001C 原有自动测试 | 48/48 通过 |
| R2 新增 P0 测试 | 14/14 通过 |
| 001C 合计 | 62/62 通过 |
| Parser 测试 | 7/7 通过 |
| Electron real-ai service 测试 | 8/8 通过 |
| Catalog 测试 | 20/20 通过 |
| `npm run check` | 通过 |
| `npm run build` | 通过 |
| Smoke 脚本静态编译 | 通过 |

R2 新增测试覆盖 OCR Warning 传播、0.89 歧义置信度、正常 OCR 不误报、`9P-3000` 原值保持、合法 ID、唯一 quote 修复、歧义 quote 拒绝、无匹配拒绝、字段级 fail-closed、DOCX 语义、真实 application 保留、Merge 指标拆分、Wire DTO 无 SourceLocation、输出截断错误。

## 12. 最终 9 样本真实 Smoke

在全部本地验证通过后，仅执行一次真实 DeepSeek Smoke；未重复调用 API。

| 样本 | 产品数 | Chunk/请求数 | 耗时 | Token |
| --- | ---: | ---: | ---: | ---: |
| `pdf-native` | 1 | 1 | 9,619 ms | 2,153 |
| `pdf-multi-product` | 3 | 2 | 22,384 ms | 7,861 |
| `excel-products` | 2 | 1 | 14,798 ms | 3,372 |
| `docx-request` | 2 | 2 | 15,722 ms | 5,932 |
| `ocr-low-confidence-model` | 1 | 1 | 20,957 ms | 3,282 |
| `ocr-nameplate-regression` | 1 | 1 | 16,094 ms | 2,838 |
| `missing-fields` | 1 | 1 | 2,822 ms | 1,068 |
| `conflicting-fields` | 1 | 2 | 5,962 ms | 2,731 |
| `cross-file-merge` | 1 | 2 | 16,507 ms | 4,775 |

统计：9 个样本、13 次请求、9 成功、0 失败、共 13 个产品；Schema 13/13 首次通过，JSON 修复 0 次，API 错误/超时 0 次。

## 13. 字段质量

| 字段 | 正确/可评估 | 正确率 |
| --- | ---: | ---: |
| 产品名称 | 11/12 | 91.67% |
| 型号 | 13/13 | 100% |
| 数量 | 12/12 | 100% |
| 规格 | 10/12 | 83.33% |
| 材质 | 11/12 | 91.67% |
| 工艺 | 12/12 | 100% |
| 应用场景 | 12/12 | 100% |
| 应为空字段 | 34/34 | 100% |

幻觉/补造字段数量为 0。缺失字段全部保持 `null`、空对象或空集合，没有用常识补齐。

## 14. Evidence 质量

- Evidence 总数：80
- 有效：80
- 无效：0
- 最终有效率：100%
- 关键字段无 Evidence：0
- Provider 无效引用：0
- SourceLocation：全部由本地 Canonical Evidence 恢复

字段被 fail-closed 置空时，原 Evidence 仍可用于人工复核，但不会把不满足值-原文校验的字段当作已确认事实。

## 15. Human Review

- 黄金样本预期触发产品：3
- 实际触发产品：3
- OCR 歧义触发：通过
- 冲突触发：通过

`ocr-low-confidence-model` 保留 `9P-3000`，并触发 `OCR_MODEL_UNCERTAIN`；`ocr-nameplate-regression` 产品未丢失，型号 `SP-3000` 有本地 Canonical Evidence，仍因 OCR 歧义提示人工复核；冲突样本保留多来源冲突，没有静默选值。

## 16. Merge 结果

| 指标 | 结果 |
| --- | ---: |
| 正确跨 Chunk/跨文件合并 | 2 |
| 错误合并 | 0 |
| 预期产品缺失 | 0 |
| 重复产品 | 0 |
| 冲突静默覆盖 | 0 |

跨文件合并保留了各来源 Evidence，未把产品缺失误算为错误合并。

## 17. R1/R2 性能对比

可比样本：`ocr-nameplate-regression`，Chunk 均为 1，输入字符均为 105。

| 指标 | R1 | R2 | 变化 |
| --- | ---: | ---: | ---: |
| Input Token | 842 | 789 | -6.29% |
| Output Token | 6,408 | 2,049 | -68.02% |
| Total Token | 7,250 | 2,838 | -60.86% |
| 耗时 | 50,325 ms | 16,094 ms | -68.02% |

全部 R2 请求平均耗时 12,933 ms，P95 为 22,378 ms。最慢请求为 `pdf-multi-product` 的第二个 Chunk，22,378 ms；该请求同时返回 3 个产品、输出 3,045 Token，是内容量最大的单次响应。

## 18. 输出 Token 与截断保护

集中配置 `maxOutputTokens=3500`，Provider 调用不再散落 magic number。单次响应因上限或 finish reason 被截断时，统一返回 `AI_OUTPUT_TRUNCATED`，不会尝试消费半截 JSON。

铭牌单产品输出 Token 从 6,408 降至 2,049，说明 Wire DTO 已显著减少重复 Evidence、SourceLocation、bbox 与元数据输出。多 Chunk 样本的表中 Token 是多个请求合计，因此可能超过单次 3,500 上限。

## 19. 已发现的剩余问题

### P1

1. `ocr-low-confidence-model` 中，模型给出的规范化中文值与带空格 OCR 原文不能通过严格包含校验，产品名称、材质和产能规格被 fail-closed 置空。该行为安全且无幻觉，但降低字段召回率；后续可增加“仅删除 OCR 字符间空格”的保守、可证明等价规范化，仍需保留原始 Evidence。
2. `docx-request` 的“日产约3000件”进入 notes，未进入规格字段，造成规格统计的一次缺失。V1 没有 requirements 字段，当前语义安全；后续可在不扩大 application 的前提下完善需求/产能结构化规则。

### P2

1. Token 优化在铭牌单产品上效果明显，但并非每个多产品、多 Chunk 样本都同比下降；后续可按产品数和 Evidence 数建立 Token 预算基线。
2. 真实 Smoke 没有自然触发无效 Evidence ID；确定性恢复与拒绝分支目前由本地测试证明，可在未来无额外付费的录制 Provider fixture 中持续回归。

以上问题均未破坏 P0 的 fail-closed、原值保持、Evidence 可追溯、无幻觉、无缺失产品和无错误合并要求。

## 20. P0 验收表

| P0 门槛 | 结果 |
| --- | --- |
| 9 个 Smoke 全部完成 | 通过，9/9 |
| Schema 100% | 通过，13/13 首次通过 |
| `hallucinatedFieldCount=0` | 通过 |
| Evidence 最终有效率 100% | 通过，80/80 |
| 无 Evidence 关键字段为 0 | 通过 |
| `9P-3000` 不被更改 | 通过 |
| OCR ambiguity 触发 Human Review | 通过 |
| 铭牌产品不因 Evidence 引用问题丢失 | 通过 |
| 无法确定 Evidence 时严格 fail-closed | 通过，本地测试覆盖 |
| DOCX application 语义正确 | 通过 |
| 缺失字段保持空值 | 通过，34/34 |
| 冲突不静默覆盖 | 通过，0 次静默覆盖 |
| 跨文件合并不丢 Evidence | 通过 |
| `wrongMergeCount=0` | 通过 |
| `missingExpectedProductCount=0` | 通过 |
| `duplicateProductCount=0` | 通过 |
| 原 48 项测试继续通过 | 通过，48/48 |
| R2 新增测试通过 | 通过，14/14 |
| `npm run check` | 通过 |
| `npm run build` | 通过 |

## 21. 最终结论

**A：REAL-AI-001C建议通过并冻结**

R2 已关闭 R1 的三个 P0。当前实现具备明确的 Warning 传播、保守的 OCR 人工确认、受本地证据控制的 Provider 边界、严格 Evidence 恢复规则、DOCX 字段语义保护和可区分的 Merge 验收指标。剩余问题属于召回率与成本优化，不影响本阶段的安全性和可验收性。
