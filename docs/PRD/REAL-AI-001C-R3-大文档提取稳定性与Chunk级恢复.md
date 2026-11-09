# REAL-AI-001C-R3 大文档提取稳定性与Chunk级恢复

## 范围

本轮仅受控解冻001C的Provider可靠性、Chunk调度、Chunk级错误处理、Retry/Resume、安全审计与大文档Harness。未修改ExtractedProduct V1字段语义、Evidence Resolver、OCR原值保持、Human Review、Semantic Guard、Merge判定、001E、002A、UI、产品库或报价。

## 实现结果

- 使用受控Worker Pool执行Chunk，默认峰值并发为2。
- 每个Chunk独立保存queued、running、retrying、completed、failed或cancelled状态。
- Provider临时错误按集中配置有限重试，Provider Retry与JSON Repair分别计数。
- 已成功Chunk保留于当前Job，`retryFailedChunks()`只请求失败Chunk。
- `partial-failed`不发布正式`ExtractedProduct[]`；全部Chunk恢复后才进入原有Merge与Runtime Schema。
- attemptId与runToken阻止超时旧请求、取消后的迟到结果回写。
- 非JSON HTTP响应只记录状态码、Content-Type、长度、响应类型与Provider Request ID，不记录响应正文。
- 大文档Harness输出脱敏Chunk审计，不保存Prompt、messages、Provider响应或客户原文。

## 错误分类

- `AI_HTTP_ERROR`：HTTP非成功状态。
- `AI_INVALID_CONTENT_TYPE`：成功响应的Content-Type不是JSON。
- `AI_EMPTY_HTTP_RESPONSE`：HTTP响应体为空。
- `AI_INVALID_HTTP_RESPONSE`：HTTP响应体无法解析为JSON。
- `AI_PROVIDER_ERROR`：Provider返回业务错误对象。
- 原有`AI_TIMEOUT`、`AI_RATE_LIMITED`、`AI_EMPTY_RESPONSE`、`AI_INVALID_JSON`、`AI_SCHEMA_INVALID`、`AI_OUTPUT_TRUNCATED`和`AI_EXTRACTION_CANCELLED`继续保留各自语义。

## 自动验收

- 32 Chunk全部成功。
- Chunk 17首次失败、第二次成功，其他Chunk只调用一次。
- Chunk 17永久失败时Job为`partial-failed`且不发布正式结果。
- 定向恢复只调用失败Chunk，成功后统一进入原有Merge。
- 旧attempt迟到结果不能覆盖新attempt。
- Cancel后queued Chunk不再启动，迟到结果不能恢复为completed。
- 非JSON响应安全分类且审计不包含响应正文。

## 真实PDF验收

第一轮真实执行使用001C默认3500输出Token，32个Chunk均收到`AI_OUTPUT_TRUNCATED`，未产生成功Chunk。脱敏审计确认峰值并发为2，错误属于统一输出预算不足，不是HTTP传输或Public Search故障。大文档Harness随后与已验证正式Pipeline对齐，使用不低于6000的输出Token预算；不改变正式字段、Evidence或Merge语义。

第二轮恢复执行共64次Provider请求，32个Chunk各执行两次，仍全部在6000输出Token处截断。全部响应均为HTTP 200、`application/json`，没有发生非JSON响应。总输入Token为99,904，总输出Token为383,909，总Token为483,813，峰值并发为2，总耗时1,515,530ms。

本地检查显示每个Chunk仅包含28至44个Evidence Item、228至354个Evidence字符，排除输入页面过密。DeepSeek V4的Thinking Mode默认开启，而原Provider没有显式设置该参数，导致结构化提取请求消耗大量思考Token并触发统一截断。Provider现已对结构化提取默认发送`thinking: { type: 'disabled' }`；该修复已通过Mock和回归测试，但本轮遵循费用控制要求，不进行第三次真实API调用。

## 当前结论

R3执行层、Chunk恢复和安全审计通过本地技术验收；真实PDF端到端仍未产出`ExtractedProduct[]`，因此REAL-AI-001C-R3暂不建议冻结。下一次真实验收只需在产品经理明确授权后，以非思考模式执行一次，不应重复本轮Thinking Mode请求。
