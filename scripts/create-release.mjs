import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const releaseRoot = path.join(root, 'release');
const bundleRoot = path.join(releaseRoot, 'qanda');
const archivePath = path.join(releaseRoot, 'qanda-production.tar.gz');

const files = [
  '.gitignore',
  '.env.production.example',
  'package.json',
  'package-lock.json',
  'docker-compose.prod.yml',
  'LOCAL_AND_PROD_USAGE.md'
];

const directories = [
  'admin-web/dist',
  'deploy',
  'question-banks',
  'server/dist',
  'server/prisma',
  'user-web/dist'
];

await rm(releaseRoot, { recursive: true, force: true });
await mkdir(bundleRoot, { recursive: true });

for (const file of files) {
  const destination = path.join(bundleRoot, file);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(root, file), destination);
}

for (const directory of directories) {
  const destination = path.join(bundleRoot, directory);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(root, directory), destination, { recursive: true });
}

for (const workspace of ['server', 'user-web', 'admin-web']) {
  const source = path.join(root, workspace, 'package.json');
  const destination = path.join(bundleRoot, workspace, 'package.json');
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination);
}

await cp(
  path.join(root, 'server', '.env.production.example'),
  path.join(bundleRoot, 'server', '.env.production.example')
);

const serverPackageJsonPath = path.join(bundleRoot, 'server', 'package.json');
const serverPackageJson = JSON.parse(await readFile(serverPackageJsonPath, 'utf8'));
serverPackageJson.scripts = {
  start: 'node dist/server.js',
  'prisma:generate': 'prisma generate',
  'prisma:migrate:deploy': 'prisma migrate deploy',
  seed: 'node dist/scripts/seedAdmin.js',
  'import:legacy': 'node dist/scripts/importLegacyBanks.js'
};
await writeFile(serverPackageJsonPath, `${JSON.stringify(serverPackageJson, null, 2)}\n`);

const packageJsonPath = path.join(bundleRoot, 'package.json');
const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
packageJson.scripts = {
  start: 'npm run start --workspace server',
  'db:generate': 'npm run prisma:generate --workspace server',
  'db:migrate': 'npm run prisma:migrate:deploy --workspace server',
  'admin:sync': 'npm run seed --workspace server',
  'db:import': 'npm run import:legacy --workspace server',
  'prod:prune': 'npm prune --omit=dev --workspaces --include-workspace-root'
};
await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

const tar = spawnSync('tar', [
  '-czf',
  archivePath,
  '-C',
  releaseRoot,
  'qanda'
], { stdio: 'inherit' });

if (tar.status !== 0) {
  throw new Error('Failed to create production archive');
}

console.log(`Production bundle created: ${archivePath}`);
