import { rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const targets = [
  'server/dist',
  'user-web/dist',
  'admin-web/dist',
  'user-web/tsconfig.tsbuildinfo',
  'admin-web/tsconfig.tsbuildinfo',
  'release'
];

await Promise.all(targets.map((target) => rm(path.join(root, target), {
  recursive: true,
  force: true
})));

console.log('Build caches and release output removed.');
