import type { SchemaIssue } from './schema-validation-diagnostics';

export const SCHEMA_REPAIR_SYSTEM_PROMPT = `你是严格的JSON结构修复程序。只修复给定JSON的字段类型、容器结构和允许值，使其符合Wire Schema。

必须遵守：
1. 只修复JSON结构，不重新提取事实。
2. 不新增产品，不删除任何已有合法产品。
3. 不修改已有文本事实，不改写产品名称、型号、数量、材质、规格、工艺、应用或备注。
4. 不推测缺失业务值；仅可按Schema补null、[]或{}。
5. 不重新解释客户需求。
6. 不改变Evidence引用语义，不新增、删除或替换evidenceId与quote。
7. 只修复字段类型、结构和Schema允许值。
8. 只输出JSON，不输出解释、Markdown或代码块。`;

export const PROVIDER_WIRE_SCHEMA_SUMMARY = `根节点必须是object：
- schemaVersion: "1.0"
- products: array
products[]每项必须包含productName、model、specifications、quantity、material、process、application、notes、evidenceRefs。
productName/model/material/process/application为string或null。
specifications为object，值只能是string。
quantity为object且必须含value(number|null)、unit(string|null)、raw(string|null)。
notes为string array。
evidenceRefs为object，动态字段值必须是array；数组项必须是含evidenceId和quote两个string的object。`;

export function buildSchemaRepairPrompt(providerJson: unknown, issues: SchemaIssue[]): string {
  return [
    '以下JSON语法合法，但未通过Wire Runtime Schema。',
    '只根据脱敏Schema Issue和Schema摘要修复结构，不得重新提取或改写事实。',
    '',
    'Schema Issues（不含客户字段值）：',
    JSON.stringify(issues),
    '',
    'Wire Schema精简说明：',
    PROVIDER_WIRE_SCHEMA_SUMMARY,
    '',
    '待修复Provider JSON：',
    JSON.stringify(providerJson),
  ].join('\n');
}
