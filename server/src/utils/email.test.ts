import assert from 'node:assert/strict';
import test from 'node:test';
import { isQqEmail, normalizeEmail } from './email.js';

test('QQ email validation accepts numeric and custom aliases', () => {
  assert.equal(isQqEmail('123456@qq.com'), true);
  assert.equal(isQqEmail('abc123@qq.com'), true);
  assert.equal(isQqEmail('Abc.123@QQ.com'), true);
});

test('QQ email validation rejects non-QQ or invalid addresses', () => {
  assert.equal(isQqEmail('abc123@163.com'), false);
  assert.equal(isQqEmail('abc123'), false);
  assert.equal(isQqEmail('abc123@qq.com.cn'), false);
});

test('email normalization trims and lowercases', () => {
  assert.equal(normalizeEmail('  Abc123@QQ.COM  '), 'abc123@qq.com');
});
