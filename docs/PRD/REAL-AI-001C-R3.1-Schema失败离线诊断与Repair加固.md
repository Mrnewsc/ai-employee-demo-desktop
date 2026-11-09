# REAL-AI-001C-R3.1 Schema失败离线诊断与Repair加固

## 验收结论

R3.1离线技术任务通过。`REAL_DEEPSEEK_REQUEST_COUNT = 0`，`realProviderRequestCount = 0`。

本轮没有执行真实PDF提取、DeepSeek Smoke、`retryFailedChunks()`、Strict Schema真实请求或Repair真实请求。全部Provider测试使用Mock Fetch，并在回归命令中设置`REAL_AI_BLOCK_REAL_DEEPSEEK=1`。真实Provider保护测试确认阻断后计数保持0。

R3仍处于Controlled Unfreeze，不能据此重新冻结001C；REAL-AI-002A继续暂停，002B和TASK-006不启动。

## 历史失败边界

历史失败Chunk为3、7、10、26、27，已知错误均为`AI_SCHEMA_INVALID`。

**历史5个Chunk的精确Schema Issue不可离线恢复。**

上一轮没有持久化安全Schema Issue，现有审计只包含错误码、Token、耗时和响应元信息。因此不得推断任何历史Chunk具体是quantity、evidenceRefs、specifications或其他字段错误。R3.1解决的是下一次Schema Invalid的可诊断性，不是离线修复历史5个Chunk。

## Schema Issue

标准结构包含：

- `fieldPath`
- `issueCode`
- `expectedType`
- `receivedType`
- `expectedConstraint`
- `receivedShape`
- `message`
- `repairable`
- `repairReason`

支持分类：`MISSING_REQUIRED`、`INVALID_TYPE`、`INVALID_ENUM`、`UNKNOWN_FIELD`、`INVALID_ARRAY`、`INVALID_OBJECT`、`INVALID_UNION`、`INVALID_EVIDENCE_REF`、`INVALID_QUANTITY`、`INVALID_SPECIFICATION`、`ROOT_SHAPE_INVALID`、`OTHER_SCHEMA_ERROR`。

字段路径保留数组索引和嵌套层级，例如`products[2].evidenceRefs.model[1].evidenceId`。`specifications`和`evidenceRefs`中的未知动态键统一显示为`<dynamic-key>`，未知额外字段显示为`<unknown-field-N>`。

`receivedShape`只输出类型和结构，例如`string(length=12)`、`array(length=3)`、`object(keys=2;known=[unit,value])`。动态键只记录数量，不记录键名或字段值。

## Repair加固

Schema Repair只接收：

- 语法合法的Provider JSON
- 脱敏Schema Issues
- Wire Schema精简说明

不重新输入客户Chunk或Extraction Prompt。Repair指令明确禁止新增/删除产品、修改文本事实、推测缺失值、重新解释客户需求、改变Evidence引用语义，以及修改产品名称和型号。

Repair前后检查：

- 产品数量
- Evidence引用集合
- 已有非空事实集合

任一集合发生变化即标记`REPAIR_SEMANTIC_DRIFT`，拒绝进入Materializer。审计仅保存前后数量、Issue数量和漂移布尔值，不保存Repair前后JSON。

## Canonicalization边界

白名单仅包含：

- 已知string字段去除首尾空白
- 明确nullable字段的`undefined -> null`
- `notes`缺省为`[]`
- `specifications`和`evidenceRefs`缺省为`{}`
- 已存在quantity对象中的缺省子字段补`null`

每次执行记录`ruleId`、`targetField`、`beforeShape`、`afterShape`和`semanticSafe=true`。

明确拒绝：string到number、object到array、array到string、enum猜测、生成业务字段、补造Evidence、修改产品名称/型号、推测数量/单位/材质/规格。该模块未自动接入正式提取路径，避免改变冻结Schema的既有接受边界。

## Repairability

可修复范围仅限确定性的结构缺省或额外结构字段。Evidence不存在、数量/规格类型错误、业务事实缺失、enum无法判断、union分支不明、根产品边界错误均默认`repairable=false`。

Schema错误不会再被无条件视为适合模型Repair；即使执行Repair，也必须通过Repair Diff。

## Schema Complexity Report

### 指标

| 指标 | 数量/结论 | 风险 |
|---|---:|---|
| required字段声明 | 16 | MEDIUM |
| optional字段 | 0 | LOW |
| nullable字段 | 8 | MEDIUM |
| nullable/union表达 | 8 | MEDIUM |
| union最大嵌套深度 | 1 | LOW |
| 动态key结构 | 2 | HIGH |
| array结构 | 3 | MEDIUM |
| 最大array嵌套 | 2层 | MEDIUM |
| record结构 | 2 | HIGH |
| 根节点 | 固定object | LOW |

required统计包括根节点2项、产品对象9项、quantity 3项、Evidence引用对象2项。

### 字段风险

| 字段 | 结构 | 风险 | 说明 |
|---|---|---|---|
| products[] | object array，最多100项 | MEDIUM | 产品边界错误会影响整个Chunk |
| productName/model | string或null | LOW | 禁止数组、对象及自动改写 |
| quantity | 固定三字段object，各字段nullable | HIGH | 模型容易输出string、缺字段或非标准对象 |
| material/application | string或null | LOW | 主要风险为类型错误，不允许语义补全 |
| specifications | `Record<string,string>` | HIGH | 自由动态key，模型容易输出array或嵌套object |
| notes | string array | MEDIUM | 模型可能输出单string或object |
| evidenceRefs | `Record<field, EvidenceRef[]>` | HIGH | 动态key、嵌套array、严格引用对象三者叠加 |

整体复杂度：**HIGH**。主要原因不是字段数量，而是`specifications`与`evidenceRefs`的动态Record以及Evidence嵌套数组。

## Strict Schema兼容性

`STRICT_SCHEMA_COMPATIBLE = PARTIAL`

可直接表达：根object、products array、固定required字段、nullable标量、quantity固定object、notes array、Evidence引用对象。

需要Schema改写：

- `specifications: Record<string,string>`依赖`additionalProperties`。
- `evidenceRefs`同时依赖动态键、键名正则与动态值数组。

许多Strict Tool/Function Schema子集要求`additionalProperties=false`，且不支持`patternProperties`。完全兼容通常需要将规格改为`[{name,value}]`，将Evidence改为`[{field,refs}]`。

这会改变当前Provider Wire DTO和Prompt/Materializer适配关系，属于架构变更。它不一定要求修改ExtractedProductV1领域对象，但会破坏当前001C Wire契约，禁止在R3.1实施。建议后续单独进行Strict Wire DTO V2 Spike，不切换Provider或真实Endpoint。

## 离线测试

- 原001C测试：70项继续通过。
- R3.1新增离线测试：24项通过。
- 001C合计：94/94。
- 001A：7/7。
- Electron/001B链路：20/20。
- 001D：20/20。
- 001E：17/17。
- `npm run check`：通过。
- `npm run build`：通过，仅存在既有Vite大Chunk提示。

新增测试覆盖A至V全部要求，包括12类Schema异常、嵌套路径、自由文本防泄漏、Repair Prompt、Repair Diff、Canonicalization白名单、Repairability和真实Provider阻断。

## 下一次最小真实复验方案

本方案仅设计，不执行：

1. 第一阶段只运行3个Chunk：1个历史成功控制Chunk，加历史失败Chunk 3和27。
2. 固定non-thinking、JSON模式、并发1、相同Wire Schema和Evidence规则。
3. 最多3次初始请求；只有Schema失败时允许现有单次Repair。
4. 持久化本轮新增的脱敏Schema Issues与Repair Diff，不保存Provider JSON。
5. 三个Chunk全部通过后，再单独验证历史失败Chunk 7、10、26。
6. 历史5个失败Chunk全部通过后，才申请完整32页复验。
7. 任一Chunk失败立即停止该阶段，不扩大样本，不整份重跑。

最小复验不得恢复002A搜索；只有001C重新冻结后才能恢复002A。
