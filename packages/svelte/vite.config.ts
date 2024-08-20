import baseConfig from '@sentry-internal/vitest-config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  ...baseConfig,
  plugins: [svelte({ hot: !process.env.VITEST })],
  test: {
    ...baseConfig.test,
    alias: [{ find: /^svelte$/, replacement: 'svelte/internal' }],
    coverage: {
      ...baseConfig.test!.coverage,
      exclude: ['build', '.eslintrc.js', 'vite.config.ts', 'rollup.*'],
    },
  },
});
