#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

const args = process.argv.slice(2);

if (!args.length) {
  console.error('Usage: node scripts/run-with-env.mjs <command> [...args]');
  process.exit(1);
}

const envMode = process.env.NODE_ENV || 'development';
const envFiles = envMode === 'production'
  ? [['.env.production', false], ['.env', false]]
  : envMode === 'test'
    ? [['.env.test', false], ['.env.local', true]]
    : [['.env.development', false], ['.env.local', true]];

for (const [fileName, override] of envFiles) {
  const filePath = path.resolve(process.cwd(), fileName);
  if (fs.existsSync(filePath)) {
    dotenv.config({ path: filePath, override });
  }
}

const [command, ...commandArgs] = args;

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
