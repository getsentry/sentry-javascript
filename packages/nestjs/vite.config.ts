import { defineConfig } from 'vitest/config';
import baseConfig from '../../vite/vite.config';
import type { UserConfig } from 'vitest';

export default defineConfig({
  ...baseConfig,
  test: {
    // test exists, no idea why TS doesn't recognize it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(baseConfig as UserConfig & { test: any }).test,
    environment: 'node',
  },
});
