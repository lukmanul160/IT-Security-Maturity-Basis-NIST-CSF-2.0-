import { defineConfig, transformWithEsbuild } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig({
  root: __dirname,
  base: '/vue/',
  // Legacy runtime mutates these static trees; retain explicit DOM creation.
  plugins: [vue({ template: { compilerOptions: { hoistStatic: false } } }), {
    name: 'compact-classic-workspace',
    apply: 'build',
    enforce: 'post',
    async transform(code, id) {
      if (!id.includes('/workspace/') || !id.endsWith('.js?raw')) return;
      const match = code.match(/^export default\s+([\s\S]*?);?\s*$/);
      if (!match) return;
      const source = JSON.parse(match[1].replace(/;$/, ''));
      // Classic scripts share global names across features: preserve identifiers.
      const result = await transformWithEsbuild(source, id.split('?')[0], {
        minifyWhitespace: true, minifySyntax: true, minifyIdentifiers: false,
        target: 'es2020',
      });
      return { code: `export default ${JSON.stringify(result.code)};`, map: null };
    },
  }],
  build: {
    outDir: path.resolve(__dirname, '..', 'public', 'vue'),
    emptyOutDir: true,
    sourcemap: false,
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
