import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __DEBUG_BUILD__: true,
  },
  test: {
    coverage: {
      enabled: true,
      reportsDirectory: './coverage',
      exclude: [
        '**/node_modules/**',
        '**/test/**',
        '**/tests/**',
        '**/__tests__/**',
        '**/rollup*.config.*',
        '**/build/**',
        '.eslint*',
        'vite.config.*',
      ],
    },
    reporters: process.env.CI ? ['default', ['junit', { classnameTemplate: '{filepath}' }]] : ['default'],
    outputFile: {
      junit: 'vitest.junit.xml',
    },
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },
  },
});
