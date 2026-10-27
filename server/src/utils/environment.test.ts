import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const runner = fileURLToPath(new URL('../../scripts/run-with-env.mjs', import.meta.url));
for (const mode of ['production', 'development', 'test']) {
  test(`explicit ${mode} selects the matching configuration and locks the mode`, () => {
    const dir = mkdtempSync(join(tmpdir(), 'qanda-env-test-'));
    try {
      for (const item of ['production', 'development', 'test']) {
        writeFileSync(join(dir, `.env.${item}`), `NODE_ENV=development\nDATABASE_URL=${item}-database\nADMIN_PASSWORD=${item}-password\n`);
      }
      writeFileSync(join(dir, '.env'), 'DATABASE_URL=fallback-production\n');
      const childEnv = { ...process.env };
      for (const key of ['NODE_ENV', 'DATABASE_URL', 'ADMIN_PASSWORD', 'TZ']) delete childEnv[key];
      const result = spawnSync(process.execPath, [runner, '--mode', mode, process.execPath, '-e',
        'process.stdout.write(JSON.stringify({mode:process.env.NODE_ENV,database:process.env.DATABASE_URL,password:process.env.ADMIN_PASSWORD,tz:process.env.TZ}))'],
      { cwd: dir, env: childEnv, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), { mode, database: `${mode}-database`, password: `${mode}-password`, tz: 'Asia/Shanghai' });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}

test('invalid mode is rejected before running the command', () => {
  const result = spawnSync(process.execPath, [runner, '--mode', 'prod', process.execPath, '-e', 'console.log("should not run")'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
});

test('external database settings cannot be replaced by a local env file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qanda-env-precedence-'));
  try {
    writeFileSync(join(dir, '.env.test'), 'DATABASE_URL=test-file\n');
    writeFileSync(join(dir, '.env.local'), 'DATABASE_URL=local-file\n');
    const result = spawnSync(process.execPath, [runner, '--mode', 'test', process.execPath, '-e',
      'process.stdout.write(process.env.DATABASE_URL)'], { cwd: dir, env: { ...process.env, DATABASE_URL: 'explicit-isolated-test' }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'explicit-isolated-test');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a development database command cannot silently pick up production .env', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qanda-env-guard-'));
  try {
    writeFileSync(join(dir, '.env'), 'DATABASE_URL=production-only\n');
    const childEnv = { ...process.env };
    delete childEnv.DATABASE_URL;
    const result = spawnSync(process.execPath, [runner, '--mode', 'development', 'prisma', 'migrate', 'deploy'], { cwd: dir, env: childEnv, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /已阻止数据库命令/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
