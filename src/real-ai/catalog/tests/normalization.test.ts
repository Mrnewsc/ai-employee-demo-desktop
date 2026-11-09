/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeModel,
  normalizeProductName,
  parseSpecification,
  splitList,
  stableProductId,
} from '../normalization';

test('型号标准化统一空格、连字符和全角字符', () => {
  assert.equal(normalizeModel('ＳＰ－３０００'), 'SP3000');
  assert.equal(normalizeModel('SP 3000'), 'SP3000');
  assert.equal(normalizeModel('sp-3000'), 'SP3000');
});

test('产品ID在相同命名空间与型号下稳定生成', () => {
  const first = stableProductId('浙江某智能装备有限公司', '自动喷涂设备', 'SP-3000');
  const second = stableProductId('浙江某智能装备有限公司', '名称调整不影响有型号产品', 'SP 3000');
  assert.equal(first, second);
});

test('列表字段支持中英文标点并去重', () => {
  assert.deepEqual(splitList('喷涂；自动化、喷涂|五金'), ['喷涂', '自动化', '五金']);
});

test('基础单位保留原值并生成可比较基准值', () => {
  const width = parseSpecification('工作宽度', '1.2m');
  const power = parseSpecification('功率', '15kW');
  assert.equal(width.rawValue, '1.2m');
  assert.equal(width.normalizedValue, '1200mm');
  assert.equal(width.baseValue, 1200);
  assert.equal(power.normalizedValue, '15000W');
  assert.equal(normalizeProductName(' 自动喷涂设备 '), '自动喷涂设备');
});
