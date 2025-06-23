import { defineConfig } from 'vitest/config';
import baseConfig from '../../vite/vite.config';

export default defineConfig({
  ...baseConfig,
  test: {
    globals: true,
    ...baseConfig.test,
  },
});
