/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeModel, textSimilarity } from '../normalizer';

test('型号标准化复用001D规则且不做OCR字符猜测', () => {
  assert.equal(normalizeModel('ＳＰ－３０００'), 'SP3000');
  assert.equal(normalizeModel('SP 3000'), 'SP3000');
  assert.notEqual(normalizeModel('9P-3000'), normalizeModel('SP-3000'));
});

test('名称相似度对完全一致、包含和无关文本保持单调', () => {
  assert.equal(textSimilarity('自动喷涂设备', '自动喷涂设备'), 1);
  assert.ok(textSimilarity('自动喷涂设备', '自动喷涂设备标准方案') > 0.5);
  assert.ok(textSimilarity('自动喷涂设备', '激光切割机') < 0.2);
});
