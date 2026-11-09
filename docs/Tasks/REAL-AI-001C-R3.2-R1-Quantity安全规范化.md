# REAL-AI-001C-R3.2-R1 Quantity安全规范化

## 验收结论

R3.2-R1离线最小修复通过。`quantity:null`现在可以在不新增任何业务事实的前提下，规范化为Wire DTO要求的标准空数量对象。

本轮未调用真实DeepSeek，未运行任何真实Canary、Chunk 3/7/27/10/26或32页PDF Job，也未恢复REAL-AI-002A。

## 1. 真实Failure根因

R3.2真实Chunk 3的Provider JSON中，9个产品均输出：

```json
{"quantity": null}
```

Wire DTO要求`quantity`始终是对象：

```json
{
  "quantity": {
    "value": null,
    "unit": null,
    "raw": null
  }
}
```

因此首次Runtime Schema产生9项`INVALID_QUANTITY`：`expectedType=object`、`receivedType=null`。旧Safe Canonicalization不处理容器级`null`，且该Issue被保守标记为`repairable=false`，故未进入AI Repair。

## 2. 修改范围

本轮只修改：

- `src/real-ai/extraction/prompt.ts`
- `src/real-ai/extraction/safe-canonicalization.ts`
- `src/real-ai/extraction/tests/r3-2-r1-quantity-canonicalization.test.ts`
- 本报告

未修改Runtime Schema、Wire DTO、ExtractedProduct V1、Evidence规则、Evidence Resolver、Materializer、Semantic Guard、Merge、Repair整体策略、001E、002A或UI。

## 3. Prompt修改

正式Extraction Prompt现在明确要求：

- `quantity`始终必须是`{value, unit, raw}`对象。
- 数量缺失或无法确认时，三个子字段全部为`null`。
- 禁止输出`"quantity":null`。
- 禁止省略`quantity`。
- 禁止猜测`1`、`MOQ`、`minimum order`、`piece`或`pcs`。
- 只有“最小订单量”而没有具体数值时，不得解释为quantity value。
- 通用的`null / [] / {}`缺失值规则必须服从quantity专项契约。

## 4. Canonicalization规则

新增唯一规则：

`QUANTITY_NULL_TO_EMPTY_OBJECT`

它仅在下列严格条件下命中：

```text
quantity === null
```

转换结果：

```json
{
  "value": null,
  "unit": null,
  "raw": null
}
```

审计字段：

- `ruleId = QUANTITY_NULL_TO_EMPTY_OBJECT`
- `targetField = products[n].quantity`
- `beforeShape = null`
- `afterShape = object(keys=[value,unit,raw])`
- `semanticSafe = true`

## 5. 安全边界

新规则不处理：

- `quantity:""`
- `quantity:"3"`
- `quantity:"MOQ"`
- `quantity:[]`
- `quantity:{value:"3"}`
- `quantity:{unit:"pcs"}`
- 其他非法结构

字符串不会转成number或quantity object，array不会转成object，系统不会判断单位或解释MOQ。

空对象`quantity:{}`继续使用R3.1既有的子字段结构默认白名单，但不命中R1新规则。非空且子字段不完整的quantity对象不再自动补齐，保留给Runtime Schema诊断。

## 6. 为什么没有业务语义变化

`null`和`{value:null, unit:null, raw:null}`在此契约中都表示“数量未知”。转换只恢复Wire DTO所要求的容器结构，不会新增：

- 数量数值
- 数量单位
- 数量原始文本
- 产品、型号、材质、规格或应用事实
- Evidence或Evidence语义

事实一致性Diff证明：除`quantity`的容器形状外，`productName`、`model`、`material`、`application`、`specifications`、`notes`和`evidenceRefs`均完全不变。

## 7. 真实Issue离线重放

使用不含客户文本的安全Mock结构，构造9个product，每个product的`quantity`都为`null`，重放Chunk 3已确认的Schema形态。

| 阶段 | 结果 |
|---|---:|
| Before `INVALID_QUANTITY` | 9 |
| `QUANTITY_NULL_TO_EMPTY_OBJECT` | 9 |
| After `INVALID_QUANTITY` | 0 |
| Schema Valid | true |
| Product count before | 9 |
| Product count after | 9 |
| Repair executed | false |

## 8. Canonicalization审计

9个规则记录的fieldPath分别为：

```text
products[0].quantity
products[1].quantity
products[2].quantity
products[3].quantity
products[4].quantity
products[5].quantity
products[6].quantity
products[7].quantity
products[8].quantity
```

离线重放统计：

- `canonicalizationApplied = true`
- `canonicalizationAppliedCount = 9`
- `canonicalizationRejectedCount = 0`
- 每项`semanticSafe = true`
- 每项`beforeShape = null`
- 每项`afterShape = object(keys=[value,unit,raw])`

## 9. Repair是否被避免

是。

本地Provider流程测试中，首次Mock Provider返回`quantity:null`，Runtime Schema首次失败后进入Safe Canonicalization；规范化后Schema直接通过，不再进入AI Repair。

- Provider主请求：1次本地Mock
- AI Repair请求：0
- `repairAttempts = 0`
- `repair-started`审计事件：无

## 10. 测试结果

新增R3.2-R1定向测试：14/14通过。覆盖：

- Prompt quantity对象契约和MOQ禁止猜测
- 单个`quantity:null`规范化
- 9项历史Issue形态离线重放
- 合法quantity不变
- 字符串、空字符串、MOQ、array禁止转换
- 空对象沿用原白名单，部分非法对象不得扩大补齐
- Canonicalization后不调用Repair
- Product count、Evidence refs与其他产品字段不变
- rule audit路径、形状与`semanticSafe`
- 不产生数量、单位或原文事实

完整001C回归：

- 总测试：131
- 通过：131
- 失败：0
- 原基线：117/117继续通过
- 新增：14/14通过

Evidence、Materializer、Semantic Guard、Repair、Checkpoint、Ledger、Request Budget与取消/迟到回写测试全部通过。

## 11. check/build

- `npm run check`：通过。
- `npm run build`：通过。
- 仅有原有Vite大于500 kB的chunk提示，与本轮修复无关。

## 12. realProviderRequestCount

- `REAL_DEEPSEEK_REQUEST_COUNT = 0`
- 真实Provider请求：0
- 真实Repair请求：0

全部Provider流程测试使用本地Mock Response，测试进程显式启用`REAL_AI_BLOCK_REAL_DEEPSEEK=1`。

## 13. 下一步最小真实复验建议

在产品经理另行授权后，只重新执行Chunk 3真实Canary，验证：

1. Prompt增强后Provider是否直接输出合法quantity对象。
2. 若仍输出`quantity:null`，是否应用9次`QUANTITY_NULL_TO_EMPTY_OBJECT`后Schema通过。
3. `repairRequestCount` 是否为0。
4. Product count、Evidence refs与产品事实是否保持不变。

不应自动运行Chunk 7/27、Chunk 10/26或完整32页PDF，也不应恢复REAL-AI-002A。
