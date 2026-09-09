import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig({
  root: __dirname,
  base: '/vue/',
  plugins: [vue()],
  build: {
    outDir: path.resolve(__dirname, '..', 'public', 'vue'),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/login': 'http://localhost:8000',
      '/styles.css': 'http://localhost:8000',
      '/modern.css': 'http://localhost:8000',
      '/tailwind.css': 'http://localhost:8000',
    },
  },
});
