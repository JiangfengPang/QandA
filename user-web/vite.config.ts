import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appVersion = process.env.npm_package_version || '2.0.0';
const userWebDir = fileURLToPath(new URL('.', import.meta.url));
const rootDir = path.resolve(userWebDir, '..');

function appendPathHash(hash: ReturnType<typeof createHash>, targetPath: string) {
  if (!existsSync(targetPath)) return;

  const stats = statSync(targetPath);
  const relativePath = path.relative(userWebDir, targetPath).split(path.sep).join('/');

  if (stats.isDirectory()) {
    for (const entry of readdirSync(targetPath).sort()) {
      if (entry === '.DS_Store') continue;
      appendPathHash(hash, path.join(targetPath, entry));
    }
    return;
  }

  if (!stats.isFile()) return;

  hash.update(`file:${relativePath}\0`);
  hash.update(readFileSync(targetPath));
  hash.update('\0');
}

function appendRelevantLockHash(hash: ReturnType<typeof createHash>) {
  const lockPath = path.join(rootDir, 'package-lock.json');
  if (!existsSync(lockPath)) return;

  try {
    const userPackage = JSON.parse(readFileSync(path.join(userWebDir, 'package.json'), 'utf8'));
    const packageLock = JSON.parse(readFileSync(lockPath, 'utf8'));
    const packageEntries = packageLock.packages || {};
    const directDependencies = Object.keys({
      ...(userPackage.dependencies || {}),
      ...(userPackage.devDependencies || {})
    }).sort();
    const seen = new Set<string>();

    function findPackageKey(packageName: string, parentKey = '') {
      const nestedKey = parentKey ? `${parentKey}/node_modules/${packageName}` : '';
      if (nestedKey && packageEntries[nestedKey]) return nestedKey;

      const rootKey = `node_modules/${packageName}`;
      return packageEntries[rootKey] ? rootKey : '';
    }

    function appendPackage(packageKey: string) {
      if (!packageKey || seen.has(packageKey)) return;
      const entry = packageEntries[packageKey];
      if (!entry) return;

      seen.add(packageKey);
      hash.update(`lock:${packageKey}:${entry.version || ''}:${entry.resolved || ''}:${entry.integrity || ''}\0`);

      const dependencies = Object.keys({
        ...(entry.dependencies || {}),
        ...(entry.optionalDependencies || {})
      }).sort();
      for (const dependency of dependencies) {
        appendPackage(findPackageKey(dependency, packageKey));
      }
    }

    for (const dependency of directDependencies) {
      appendPackage(findPackageKey(dependency));
    }
  } catch {
    appendPathHash(hash, lockPath);
  }
}

function createDefaultBuildId() {
  const hash = createHash('sha256');
  for (const target of ['index.html', 'package.json', 'vite.config.ts', 'public', 'src']) {
    appendPathHash(hash, path.join(userWebDir, target));
  }
  appendRelevantLockHash(hash);
  return `${appVersion}-${hash.digest('hex').slice(0, 12)}`;
}

const buildId = process.env.QANDA_BUILD_ID?.trim() || createDefaultBuildId();

function versionManifestPlugin() {
  return {
    name: 'qanda-version-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({
          app: 'qanda-user-web',
          version: appVersion,
          buildId,
          builtAt: new Date().toISOString()
        }, null, 2)}\n`
      });
    }
  };
}

function vendorChunk(id: string) {
  if (!id.includes('/node_modules/')) return undefined;

  if (id.includes('/node_modules/zrender/')) return 'zrender';
  if (id.includes('/node_modules/echarts/')) return 'echarts';
  if (/(markdown-it|highlight\.js|katex|dompurify)/.test(id)) return 'markdown';
  if (id.includes('/node_modules/vant/')) return 'vant';

  return undefined;
}

export default defineConfig({
  define: {
    __QANDA_APP_VERSION__: JSON.stringify(appVersion),
    __QANDA_BUILD_ID__: JSON.stringify(buildId)
  },
  plugins: [vue(), versionManifestPlugin()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/uploads': 'http://127.0.0.1:3000'
    }
  },
  preview: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: vendorChunk
      }
    }
  }
});
