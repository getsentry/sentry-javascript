import { svelte } from '@sveltejs/vite-plugin-svelte';
import baseConfig from '../../vite/vite.config';

export default {
  ...baseConfig,
  plugins: [svelte({ hot: !process.env.VITEST })],
  test: {
    ...baseConfig.test,
    alias: [{ find: /^svelte$/, replacement: 'svelte/internal' }],
  },
};
