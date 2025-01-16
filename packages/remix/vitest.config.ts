import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    disableConsoleIntercept: true,
    silent: false,
    setupFiles: './test/integration/instrument.server.cjs',
    include: ['**/instrumentation/*.test.ts'],
  },
});
