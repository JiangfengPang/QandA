import assert from 'node:assert/strict';
import test from 'node:test';
import { api } from '../src/api/request';

test('admin activity request forwards its cancellation signal and credentials', async (t) => {
  const controller = new AbortController();
  let options: RequestInit | undefined;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    options = init;
    return new Response(JSON.stringify({ code: 0, data: { days: 30 } }));
  });
  assert.deepEqual(await api.get('/admin/activity/detail?days=30', { signal: controller.signal }), { days: 30 });
  assert.equal(options?.signal, controller.signal);
  assert.equal(options?.credentials, 'include');
  assert.equal(new Headers(options?.headers).get('X-Qanda-Client'), 'admin');
});

test('abort errors remain identifiable by the activity view', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new DOMException('Aborted', 'AbortError'); });
  await assert.rejects(api.get('/admin/activity/detail'), { name: 'AbortError' });
});

test('server errors cannot be mistaken for successful empty activity data', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ code: 500, message: '统计暂不可用' }), { status: 500 }));
  await assert.rejects(api.get('/admin/activity/detail'), /统计暂不可用/);
});
