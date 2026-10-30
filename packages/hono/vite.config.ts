import { defineConfig } from 'vitest/config';
import baseConfig from '../../vite/vite.config';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.test.json',
      ignoreSourceErrors: true,
    },
  },
});
