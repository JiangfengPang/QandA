import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const packageJsonPath = path.join(root, 'package.json');
const expectedPackageName = 'qanda-fullstack';
const skippedDirectories = new Set(['.git', '.idea', '.vscode', 'dist']);

async function assertProjectRoot() {
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
  if (packageJson.name !== expectedPackageName) {
    throw new Error(`Refusing to clean dependencies outside ${expectedPackageName}. Current package: ${packageJson.name || 'unknown'}`);
  }
}

async function findNodeModules(directory, results = []) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (skippedDirectories.has(entry.name)) continue;

    const fullPath = path.join(directory, entry.name);
    if (entry.name === 'node_modules') {
      results.push(fullPath);
      continue;
    }

    await findNodeModules(fullPath, results);
  }

  return results;
}

await assertProjectRoot();

const targets = await findNodeModules(root);
if (!targets.length) {
  console.log('No node_modules directories found.');
  process.exit(0);
}

for (const target of targets) {
  console.log(`Removing ${path.relative(root, target) || target}`);
  await rm(target, { recursive: true, force: true });
}

console.log(`Removed ${targets.length} node_modules director${targets.length === 1 ? 'y' : 'ies'}.`);
