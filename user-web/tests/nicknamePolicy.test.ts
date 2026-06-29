import assert from 'node:assert/strict';
import test from 'node:test';
import { createRandomNickname, nicknamePolicyMessage, normalizeNickname } from '../src/utils/nicknamePolicy';

test('nickname policy accepts meaningful nicknames', () => {
  assert.equal(normalizeNickname('  Ａ 同学  '), 'A 同学');
  assert.equal(nicknamePolicyMessage('学习者4821'), '');
  assert.equal(nicknamePolicyMessage('阅读理解演示'), '');
});

test('nickname policy rejects low quality nicknames', () => {
  assert.equal(nicknamePolicyMessage('。'), '昵称不能只包含标点、空格或表情');
  assert.equal(nicknamePolicyMessage('A'), '昵称至少需要 2 个有效字符');
  assert.equal(nicknamePolicyMessage('111111'), '昵称不能使用连续重复字符');
  assert.equal(nicknamePolicyMessage('管理员'), '昵称包含保留词，请换一个昵称');
  assert.equal(nicknamePolicyMessage('傻逼'), '昵称包含不文明用语，请换一个昵称');
});

test('random nickname generator produces valid nicknames', () => {
  for (let index = 0; index < 30; index += 1) {
    assert.equal(nicknamePolicyMessage(createRandomNickname()), '');
  }
});
