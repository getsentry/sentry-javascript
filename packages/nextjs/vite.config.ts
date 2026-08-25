import { defineConfig } from 'vitest/config';
import baseConfig from '../../vite/vite.config';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    environment: 'node',
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.test-d.json',
    },
  },
});
