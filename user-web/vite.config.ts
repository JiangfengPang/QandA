import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const appVersion = process.env.npm_package_version || '2.0.0';
const buildId = process.env.QANDA_BUILD_ID || `${appVersion}-${new Date().toISOString()}`;

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
