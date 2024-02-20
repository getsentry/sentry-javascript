import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { UserConfig } from 'vitest';
import baseConfig from '../../vite/vite.config';

export default {
  ...baseConfig,
  plugins: [svelte({ hot: !process.env.VITEST })],
  test: {
    // test exists, no idea why TS doesn't recognize it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(baseConfig as UserConfig & { test: any }).test,
    environment: 'jsdom',
    alias: [{ find: /^svelte$/, replacement: 'svelte/internal' }],
  },
};
