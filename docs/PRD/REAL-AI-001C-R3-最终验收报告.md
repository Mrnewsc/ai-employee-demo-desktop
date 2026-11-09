# REAL-AI-001C-R3 最终验收报告

## 结论

**B：REAL-AI-001C-R3真实PDF端到端仍需一次受控复验，暂不冻结。**

Chunk执行层、有限重试、定向恢复、取消隔离、安全审计和精确错误分类已完成并通过本地验收。真实32页PDF的两轮已授权执行均因DeepSeek V4默认Thinking Mode耗尽输出预算而失败，未生成正式`ExtractedProduct[]`。Provider现已显式关闭Thinking Mode并通过本地测试，但为避免继续产生费用，本轮未进行第三次真实API调用。

## 修改范围

- Provider HTTP响应分类与脱敏诊断。
- Chunk受控并发、有限Provider Retry、Chunk Result Store与`retryFailedChunks()`。
- attemptId/runToken迟到回写保护。
- completed、partial-failed、failed、cancelled终态。
- 大文档安全Harness与R3自动测试。
- DeepSeek结构化提取默认使用非思考模式。

未修改ExtractedProduct V1字段语义、Evidence Resolver、OCR原值规则、Human Review、Semantic Guard、Merge判定、001E、002A、UI、企业产品库或报价。

## 自动测试

- 001A解析测试：7/7。
- Electron解析与真实链路回归：20/20。
- 001C测试：70/70，其中R3新增8项。
- 001D产品库测试：20/20。
- 001E匹配测试：17/17。
- `npm run check`：通过。
- `npm run build`：通过；仅保留既有Vite大Chunk提示。

## R3调度验收

1. 32 Chunk全部成功：通过Mock测试。
2. Chunk 17首次传输失败、第二次成功：通过；1至16和18至32均只调用一次。
3. Chunk 17永久失败：通过；Job为`partial-failed`，正式结果为null。
4. `retryFailedChunks()`恢复：通过；只重新请求失败Chunk。
5. 超时旧attempt迟到：通过；不能覆盖新attempt。
6. Cancel：通过；queued Chunk停止，迟到结果不能把cancelled改回completed。
7. 非JSON响应：通过；分类明确，可有限重试，不保存响应正文。
8. 峰值并发：Mock 32 Chunk实测为2。

## 真实PDF输入

- 安全文件名：`customer-product-list.pdf`。
- 页数：32。
- 文本块：1,020。
- 图片引用：190。
- 原始文字：约9,943字符。
- Extraction Chunk：32。
- 每Chunk Evidence Item：28至44，平均32。
- 每Chunk Evidence字符：228至354，平均279。
- 客户文件未复制进仓库，报告未保存客户原文。

## 真实执行一

- 输出预算：3,500 Token。
- 完成Chunk：0/32。
- 失败Chunk：32/32。
- Provider请求：32。
- 重试Chunk：0。
- 峰值并发：2。
- 唯一错误：`AI_OUTPUT_TRUNCATED`。
- 非JSON响应：0。
- 正式产品结果：未生成。

## 真实执行二

本次是在首轮零成功Chunk且查明统一截断后进行的恢复验证，不重复任何成功结果。

- 输出预算：6,000 Token。
- 完成Chunk：0/32。
- 失败Chunk：32/32。
- Provider请求：64；每个失败Chunk执行两次有限尝试。
- 重试Chunk：32。
- 峰值并发：2。
- HTTP状态：64次均为200。
- Content-Type：64次均为`application/json`。
- 非JSON响应：0。
- 错误：64次均为`AI_OUTPUT_TRUNCATED`，阶段均为Provider。
- 输入Token：99,904。
- 输出Token：383,909。
- 总Token：483,813。
- 总耗时：1,515,530ms。
- 首个失败Chunk：`chunk:1`。
- 正式产品结果：未生成。

## 根因

真实页面Evidence规模很小，排除Chunk输入过大。DeepSeek V4的Thinking Mode默认开启；原Provider未显式传递Thinking配置，结构化提取在生成正式JSON前持续消耗输出Token，并在3,500和6,000预算处统一截断。

已完成的修复是对结构化提取请求显式发送：

```json
{"thinking":{"type":"disabled"}}
```

该设置不改变提取字段、Evidence或业务安全语义，只关闭不适合确定性JSON提取的思考输出。

## 安全审计

Chunk审计仅保存状态、时间、耗时、Provider、模型、字符数、Token、请求次数、修复次数、HTTP状态、Content-Type、Body长度、响应类型、Provider Request ID、Schema状态、产品数和安全错误分类。

未保存API Key、Authorization、完整Prompt、完整messages、Provider响应正文或客户原文。

## 后续门槛

产品经理如授权下一次真实验收，应只执行一次非思考模式Harness，保持并发2。验收目标为32/32 Chunk完成；如出现局部可重试失败，使用同一Job的`retryFailedChunks()`，不得整份重跑。真实结果完成前，不恢复REAL-AI-002A，也不进入REAL-AI-002B。

## 非思考模式最终复验

产品经理授权后，先通过Mock Fetch静态截获最终请求选项，确认实际发送`thinking.type=disabled`、`response_format.type=json_object`和`stream=false`。静态检查未访问真实网络，也未输出完整请求体。

本轮仅执行一个新的完整PDF Job，没有整份重跑，也没有在`partial-failed`后调用额外恢复轮。

- Job状态：`partial-failed`。
- Thinking Mode：`disabled`。
- Chunk：32。
- 完成：27。
- 失败：5。
- Provider请求：37，其中32次初始请求、5次既有JSON Repair。
- Provider Retry Chunk：0。
- 峰值并发：2。
- 输入Token：59,554。
- 输出Token：96,745。
- 总Token：156,299。
- 平均每Chunk输出Token：3,023。
- 最大单Chunk输出Token：4,988。
- `AI_OUTPUT_TRUNCATED`：0次。
- Schema失败：5个Chunk。
- Provider错误：0次。
- 总耗时：207,368ms。
- 成功Chunk重复请求：0。
- 正式`ExtractedProduct[]`：未发布。

与Thinking开启时相比，统一输出截断已完全消失，总耗时和Token消耗明显下降，证明Thinking Mode是上一轮32/32截断的直接原因。但5个Chunk在一次既有JSON Repair后仍未通过Runtime Schema，因此尚未达到32/32成功门槛。

### 失败Chunk

| Chunk | Attempt | 错误码 | 审计阶段 | 耗时 | 输入Token | 输出Token | Content-Type | 截断 | Thinking |
|---|---:|---|---|---:|---:|---:|---|---|---|
| chunk:3 | 1 | AI_SCHEMA_INVALID | unknown | 20,797ms | 3,974 | 4,872 | application/json | 否 | disabled |
| chunk:7 | 1 | AI_SCHEMA_INVALID | unknown | 20,358ms | 3,880 | 4,724 | application/json | 否 | disabled |
| chunk:10 | 1 | AI_SCHEMA_INVALID | unknown | 18,212ms | 3,600 | 4,310 | application/json | 否 | disabled |
| chunk:26 | 1 | AI_SCHEMA_INVALID | unknown | 18,740ms | 3,634 | 4,332 | application/json | 否 | disabled |
| chunk:27 | 1 | AI_SCHEMA_INVALID | unknown | 22,349ms | 4,420 | 4,988 | application/json | 否 | disabled |

审计中的`requestAttempt=1`表示没有进行Provider Retry；每个失败Chunk内部各发生一次001C既有JSON Repair。`errorStage`当前安全审计值为`unknown`，错误码与请求记录明确表明实际失败发生在Runtime Schema阶段。由于禁止保存Provider正文，本轮无法离线重建具体的Zod字段错误。

### 最终判断

**B：REAL-AI-001C-R3仍有问题。**

未满足32/32 Chunk完成、正式`ExtractedProduct[]`生成以及最终Evidence/幻觉统计门槛。001C暂不重新冻结，REAL-AI-002A继续暂停。
