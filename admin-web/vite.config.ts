import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

function vendorChunk(id: string) {
  if (!id.includes('/node_modules/')) return undefined;

  if (id.includes('/node_modules/zrender/')) return 'zrender';
  if (id.includes('/node_modules/echarts/')) return 'echarts';
  if (/(markdown-it|highlight\.js|katex|dompurify)/.test(id)) return 'markdown';

  return undefined;
}

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/uploads': 'http://127.0.0.1:3000'
    }
  },
  preview: {
    host: '127.0.0.1',
    port: 5174,
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
