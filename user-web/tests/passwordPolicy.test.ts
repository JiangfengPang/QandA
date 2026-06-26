import assert from 'node:assert/strict';
import test from 'node:test';
import { passwordPolicyMessage } from '../src/utils/passwordPolicy';

test('password policy accepts eight-character complex passwords', () => {
  assert.equal(passwordPolicyMessage('Aa123456'), '');
});

test('password policy rejects passwords shorter than eight characters', () => {
  assert.equal(passwordPolicyMessage('Aa12345'), '密码至少 8 位');
});

test('password policy supports custom labels', () => {
  assert.equal(passwordPolicyMessage('Aa12345', '新密码'), '新密码至少 8 位');
});

test('password policy keeps the character category requirement', () => {
  assert.equal(
    passwordPolicyMessage('aaaaaaaa'),
    '密码需包含大写字母、小写字母、数字、特殊字符中的至少三类'
  );
});
