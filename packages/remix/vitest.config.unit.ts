import { defineConfig } from 'vitest/config';

import baseConfig from '../../vite/vite.config';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    // disableConsoleIntercept: true,
    // silent: false,
    include: ['test/**/*.test.ts'],
    exclude: ['**/integration/**/*.test.ts'],
  },
});
