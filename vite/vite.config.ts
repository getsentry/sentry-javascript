import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __DEBUG_BUILD__: true,
  },
  test: {
    globals: true,
    coverage: {
      enabled: true,
      reportsDirectory: './coverage',
    },
    reporters: ['default', ...(process.env.CI ? [['junit', { classnameTemplate: '{filepath}' }]] : [])],
    outputFile: {
      junit: 'vitest.junit.xml',
    },
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
  },
});
