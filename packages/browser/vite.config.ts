import { defineConfig } from 'vitest/config';
import baseConfig from '../../vite/vite.config';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    // Vitest 3 mocks all timers which broke some tests
    fakeTimers: {
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'Date'],
    },
  },
});
