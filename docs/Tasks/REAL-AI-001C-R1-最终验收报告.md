# REAL-AI-001C-R1 最终验收报告

## 验收结论

**结论：B. REAL-AI-001C 有问题，需要修复后再验收。**

本轮完成了 OCR 重复输入修复、逐请求指标记录、完整 Smoke 结果序列化、字段级黄金答案、Evidence 校验、幻觉检测，以及低质量 OCR、缺字段、冲突字段和跨文件合并覆盖。

最终只执行了一次真实 DeepSeek Smoke Test。9 个脱敏样本均完成请求，Schema 100% 通过，Evidence 74/74 可追溯，幻觉计数为 0；但 3 项 P0 语义门槛仍未满足，因此不能建议 REAL-AI-001C 通过。

## 验收范围

- 模型：`deepseek-v4-flash`
- 执行时间：2026-08-09 12:51-12:54（Asia/Shanghai）
- 结果文件：`src/real-ai/extraction/tests/results/deepseek-smoke.json`
- 结果文件大小：155,223 bytes
- 样本：全部为本地脱敏 fixture
- 真实 API：本轮仅执行 1 次最终 Smoke 命令
- 未启动：REAL-AI-001E、REAL-AI-001F、TASK-006
- 敏感信息检查：结果文件未保存 API Key、Authorization、完整 Prompt、messages 或 request body

## 本轮完成项

1. OCR Chunk 去重：同一 OCR 内容同时存在于逐行 blocks 和整图 `ocrText` 时，仅发送逐行 Evidence，保留 bbox。
2. 逐请求记录：保存 requestId、sampleId、chunkId、耗时、字符数、Tokens、Schema、repair、产品数和错误码。
3. 完整产品结果：保存字段、置信度、Human Review、warnings、conflicts 和完整 Evidence。
4. 黄金答案：覆盖产品名称、型号、数量、规格、材质、工艺、应用、缺失字段、预期告警和预期人工复核。
5. 自动校验：覆盖 Evidence 定位、幻觉、冲突保留、跨文件合并、重复产品和 OCR 原值保真。
6. 安全回归：超时、取消、限流、错误、无效 JSON 和 Schema 修复测试继续通过。

## OCR Token 异常检查

### 本地诊断

| Fixture | rawText | blocks | image OCR | Chunk | Evidence 字符 | bbox Evidence | messages 字符 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `images/nameplate/input.jpg` | 110 | 105 | 110 | 1 | 105 | 6 | 1,514（无 Smoke 上下文） |
| `images/product-list/input.png` | 87 | 82 | 87 | 1 | 82 | 6 | 1,491（无 Smoke 上下文） |

结论：旧逻辑确实将逐行 OCR blocks 与整图 `ocrText` 分成两个高度重复 Chunk。修复后 `rawText` 不直接发送，整图重复文本不再进入第二个 Chunk，逐行 bbox 全部保留。

低质量 OCR fixture 的原始解析结果包含 `9P-3000`，不包含 `SP-3000`；送入模型和最终字段均保留 `9P-3000`，没有利用产品常识静默纠正。

### 同一铭牌修复前后

| 指标 | 修复前 | 修复后 | 变化 |
| --- | ---: | ---: | ---: |
| Chunk 数 | 2 | 1 | -50.0% |
| Evidence 输入字符 | 215 | 105 | -51.2% |
| 总 Tokens | 10,722 | 7,250 | -32.4% |
| 请求耗时 | 59,416 ms | 50,325 ms | -15.3% |

输入重复已经解决，但修复后该样本仍产生 6,408 completion tokens。剩余 Token 和耗时异常主要位于模型输出侧，不再是 OCR 正文重复输入导致。

## A. 基础调用

| 指标 | 结果 |
| --- | ---: |
| Smoke 样本数 | 9 |
| 真实请求数 | 13 |
| 请求成功样本 | 9 |
| 请求失败样本 | 0 |
| 最终产品总数 | 12 |
| Schema 一次通过 | 13/13（100%） |
| JSON 修复次数 | 0 |
| API 错误/超时 | 0 |
| 输入 Tokens | 10,739 |
| 输出 Tokens | 29,136 |
| 总 Tokens | 39,875 |

### 样本覆盖

| 样本 | 覆盖场景 | 最终产品 | Chunk | 耗时 | 总 Tokens | 结果 |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| `pdf-native` | 原生 PDF 单产品 | 1 | 1 | 18,581 ms | 2,837 | 通过 |
| `pdf-multi-product` | PDF 多产品 | 3 | 2 | 22,988 ms | 7,588 | 通过 |
| `excel-products` | Excel 产品清单 | 2 | 1 | 20,202 ms | 3,955 | 通过 |
| `docx-request` | DOCX 采购需求 | 2 | 2 | 36,744 ms | 7,959 | 字段语义 P0 |
| `ocr-low-confidence-model` | 低质量 OCR 型号 | 1 | 1 | 22,582 ms | 3,603 | Human Review P0 |
| `ocr-nameplate-regression` | OCR 去重性能对照 | 0 | 1 | 50,325 ms | 7,250 | Evidence 引用 P0 |
| `missing-fields` | 缺字段 Excel | 1 | 1 | 6,191 ms | 1,406 | 通过 |
| `conflicting-fields` | 跨文件型号/数量冲突 | 1 | 2 | 5,531 ms | 2,728 | 通过 |
| `cross-file-merge` | 跨文件同产品合并 | 1 | 2 | 4,600 ms | 2,549 | 通过 |

## B. 字段质量

| 字段 | 正确/总数 | 正确率 |
| --- | ---: | ---: |
| productName | 12/12 | 100% |
| model | 12/13 | 92.31% |
| quantity | 12/12 | 100% |
| specifications | 12/12 | 100% |
| material | 12/12 | 100% |
| process | 12/12 | 100% |
| application | 11/12 | 91.67% |
| 缺失字段正确保持空值 | 33/34 | 97.06% |
| hallucinatedFieldCount | 0 | 达标 |

字段问题：

- `docx-request` 将“需要接入现有生产线”从备注/要求归入 `application`，黄金答案期望 `application=null`。该值有真实 Evidence，因此不计为无来源幻觉，但属于字段语义误分类，也导致缺失字段空值门槛失败。
- `ocr-nameplate-regression` 的模型请求返回 1 个 Schema 合法产品，但引用了不存在的 Evidence ID。安全层拒绝所有字段并丢弃空产品，最终型号未保留，导致 model 指标失败。

## C. Evidence

| 指标 | 结果 |
| --- | ---: |
| Evidence 总数 | 74 |
| 有效 Evidence | 74 |
| 无效 Evidence | 0 |
| Evidence 正确率 | 100% |
| 无有效 Evidence 的最终关键字段 | 0 |

SourceLocation 分布：PDF 34、Excel/Sheet 23、DOCX 12、Image/OCR 5。PDF page/bbox、Excel sheet/cell/row/column、DOCX table/row/cell、OCR imageId/bbox 均保留并通过自动定位校验。

铭牌样本中的无效 Evidence ID 没有进入最终产品，系统生成了 `UNKNOWN_EVIDENCE_REFERENCE` 与 `MISSING_FIELD_EVIDENCE` 告警并执行 fail-closed。安全行为正确，但产品被完全丢弃，仍不满足真实提取验收。

## D. Human Review

| 指标 | 结果 |
| --- | ---: |
| 预期触发产品 | 3 |
| 实际触发产品 | 1 |
| 冲突字段触发 | 正确 |
| 低质量 OCR 触发 | 失败 |

实际触发原因为：

- `model` 存在多来源冲突：1
- `quantity` 存在多来源冲突：1

`ocr-low-confidence-model` 正确保留 `9P-3000`，但型号 Evidence 置信度为 0.89。当前规则只在 OCR 型号置信度低于 0.8 时触发 `OCR_MODEL_UNCERTAIN`，没有消费 001A 已生成的 `ocr_character_ambiguity` 文档告警，因此 `needsHumanReview=false`。

`ocr-nameplate-regression` 因产品被安全层丢弃，也没有形成产品级 Human Review。

## E. Merge

| 指标 | 结果 |
| --- | ---: |
| 正确跨来源合并 | 2 |
| 重复产品 | 0 |
| 冲突静默覆盖 | 0 |
| Harness 当前记录的 wrongMergeCount | 1 |

跨文件同产品合并成功：PDF 与 Excel 的 `SP-3000` 合并为 1 个产品，双方 Evidence 均保留。冲突样本也合并为 1 个产品，并保留 `SP-3000/SP-3200`、`10套/12套` 两组冲突 Evidence，未静默覆盖。

需要说明：当前 Harness 将“预期产品未找到”也累计为 `wrongMergeCount`。本轮这个 1 实际来自铭牌产品被安全层丢弃，不是两个不同产品被错误合并。后续应拆分为 `missingExpectedProductCount` 和真正的 `wrongMergeCount`。

## F. 性能

- 平均请求耗时：17,335 ms
- 最快请求：2,937 ms（`cross-file-merge` Excel Chunk）
- 最慢请求：50,325 ms（`ocr-nameplate-regression`）
- 最慢请求 Tokens：842 input + 6,408 output = 7,250 total
- Harness 因样本阈值未正式输出 P95；13 次请求的 nearest-rank 指示值为 50,325 ms，仅供本轮诊断。

### 每个 Chunk

| 样本 / Chunk | 耗时 | Input | Output | Total |
| --- | ---: | ---: | ---: | ---: |
| pdf-native / 1 | 18,579 ms | 710 | 2,127 | 2,837 |
| pdf-multi-product / 2 | 17,318 ms | 1,076 | 2,610 | 3,686 |
| pdf-multi-product / 1 | 22,986 ms | 697 | 3,205 | 3,902 |
| excel-products / 1 | 20,201 ms | 1,182 | 2,773 | 3,955 |
| docx-request / 2 | 13,449 ms | 1,068 | 2,188 | 3,256 |
| docx-request / 1 | 36,744 ms | 683 | 4,020 | 4,703 |
| ocr-low-confidence-model / 1 | 22,580 ms | 844 | 2,759 | 3,603 |
| ocr-nameplate-regression / 1 | 50,325 ms | 842 | 6,408 | 7,250 |
| missing-fields / 1 | 6,190 ms | 667 | 739 | 1,406 |
| conflicting-fields / B | 3,920 ms | 740 | 509 | 1,249 |
| conflicting-fields / A | 5,530 ms | 754 | 725 | 1,479 |
| cross-file-merge / Excel | 2,937 ms | 764 | 374 | 1,138 |
| cross-file-merge / PDF | 4,599 ms | 712 | 699 | 1,411 |

## P0 门槛

| 门槛 | 结果 |
| --- | --- |
| 全部请求成功或失败原因明确 | 通过 |
| Schema 100% 通过 | 通过 |
| 型号不被无证据篡改 | 低质量 OCR 通过；铭牌产品被丢弃，整体不通过 |
| 缺失字段不补造 | DOCX application 语义误分类，不通过 |
| hallucinatedFieldCount = 0 | 通过 |
| 最终关键非空字段有有效 Evidence | 通过 |
| Evidence 可追溯 | 通过 |
| 低质量 OCR 触发 Human Review | 不通过 |
| 冲突不静默覆盖 | 通过 |
| 跨文件合并不丢 Evidence | 通过 |
| 没有错误合并 | 实际无错误合并，但 Harness 指标需拆分；铭牌产品缺失仍为 P0 |
| OCR 重复输入已解决 | 通过 |
| 取消/超时/错误测试继续通过 | 通过 |
| `npm run check` | 通过 |
| `npm run build` | 通过 |
| 001C 自动测试 | 48/48 通过 |

## 问题分级

### P0

1. **OCR 歧义没有触发人工复核。** `9P-3000` 被正确保留，但 `ocr_character_ambiguity` 未传入 001C 决策，当前仅按 `<0.8` 置信度判断，导致 `needsHumanReview=false`。
2. **模型无效 Evidence ID 导致整个铭牌产品丢失。** Fail-closed 防止了无证据字段进入结果，但最终没有可用产品和型号。应设计仅在 quote 唯一精确匹配时的本地 Evidence ID 恢复，或对 Evidence 引用执行受控结构修复；不能模糊匹配或凭常识补证据。
3. **DOCX 字段语义误分类。** “需要接入现有生产线”被归入 application，而不是 notes/客户要求，导致应为空字段未保持 null。

### P1

1. `wrongMergeCount` 混合统计“错误合并”和“预期产品缺失”，需要拆分指标，避免误判 Merge 引擎。
2. 铭牌请求 completion tokens 达 6,408，输出侧成本和延迟仍异常。应收紧输出预算、减少重复字段结构，并为无效 Evidence 引用设置受控、有限的恢复策略。
3. Human Review 原因应同时吸收 ParsedDocument 的 OCR 歧义告警，而不只依赖单行数值置信度。

### P2

1. 小样本 P95 可输出为“指示值”并附样本量，而不是直接为 null。
2. Smoke 汇总可增加 `missingExpectedProductCount`、`invalidProviderEvidenceReferenceCount`，让产品丢失与错误合并分别可见。

## 最终建议

REAL-AI-001C-R1 的验收证据已经补全，OCR 重复输入和结果不可审计问题已经解决；基础安全层、Schema、Evidence、冲突与跨文件合并表现可靠。

但按照既定 P0 门槛，仍需先修复 OCR 歧义 Human Review、无效 Evidence ID 的确定性恢复/拒绝策略，以及 DOCX 字段语义边界，再使用小规模定向脱敏样本重新验收。当前不建议冻结 REAL-AI-001C，也不应开始 REAL-AI-001E 或 REAL-AI-001F。
