#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const inheritedEnvKeys = new Set(Object.keys(process.env));
const args = process.argv.slice(2);
let envMode = process.env.NODE_ENV || 'development';
if (args[0] === '--mode') {
  envMode = args[1];
  args.splice(0, 2);
}
if (!['development', 'test', 'production'].includes(envMode)) {
  console.error('环境模式必须为 development、test 或 production');
  process.exit(1);
}
process.env.NODE_ENV = envMode;

if (!args.length) {
  console.error('Usage: node scripts/run-with-env.mjs [--mode production|development|test] <command> [...args]');
  process.exit(1);
}

const envFiles = envMode === 'production'
  ? [['.env.production', false], ['.env', false]]
  : envMode === 'test'
    ? [['.env.test', false], ['.env.local', true]]
    : [['.env.development', false], ['.env.local', true]];

for (const [fileName, override] of envFiles) {
  const filePath = path.resolve(process.cwd(), fileName);
  if (fs.existsSync(filePath)) {
    const values = dotenv.parse(fs.readFileSync(filePath));
    for (const [key, value] of Object.entries(values)) {
      if (!inheritedEnvKeys.has(key) && (override || process.env[key] === undefined)) process.env[key] = value;
    }
  }
}

// The selected mode is authoritative even when an env file contains NODE_ENV.
process.env.NODE_ENV = envMode;
process.env.TZ ||= 'Asia/Shanghai';

const [command, ...commandArgs] = args;
if (/^prisma(?:\.cmd)?$/i.test(path.basename(command)) && commandArgs[0] !== 'generate') {
  const databaseUrl = process.env.DATABASE_URL || '';
  if (!databaseUrl || /请填写|你的|your_|change[_-]?me/i.test(databaseUrl)) {
    console.error(`缺少 ${envMode} 环境的有效 DATABASE_URL，已阻止数据库命令`);
    process.exit(1);
  }
}

function resolveCommand(commandName) {
  if (/[\\/]/.test(commandName)) return commandName;

  const pathDirs = String(process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean);
  const extensions = process.platform === 'win32'
    ? String(process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD')
      .split(';')
      .filter(Boolean)
    : [''];

  for (const dir of pathDirs) {
    for (const ext of extensions) {
      const candidate = path.join(dir, process.platform === 'win32' ? `${commandName}${ext.toLowerCase()}` : commandName);
      if (fs.existsSync(candidate)) return candidate;
    }
    for (const ext of extensions) {
      const candidate = path.join(dir, process.platform === 'win32' ? `${commandName}${ext.toUpperCase()}` : commandName);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return commandName;
}

const resolvedCommand = resolveCommand(command);
const isWindowsShellScript = process.platform === 'win32' && /\.(cmd|bat)$/i.test(resolvedCommand);
const child = isWindowsShellScript
  ? spawn(process.env.ComSpec || 'cmd.exe', [
    '/d',
    '/s',
    '/c',
    resolvedCommand,
    ...commandArgs
  ], {
    env: process.env,
    stdio: 'inherit'
  })
  : spawn(resolvedCommand, commandArgs, {
    env: process.env,
    stdio: 'inherit'
  });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
