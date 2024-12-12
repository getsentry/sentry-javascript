import { defineConfig } from 'vitest/config';

const useOtel = process.env.USE_OTEL === '1';

export default defineConfig({
  test: {
    globals: true,
    disableConsoleIntercept: true,
    silent: false,
    setupFiles: useOtel ? './test/integration/instrument.server.cjs' : undefined,
    include: useOtel ? ['**/instrumentation-otel/*.test.ts'] : ['**/instrumentation-legacy/*.test.ts'],
  },
});
