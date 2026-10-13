import { defineConfig } from 'vitest/config';

import baseConfig from '../../vite/vite.config';

export default defineConfig({
  ...baseConfig,
  resolve: {
    ...baseConfig.resolve,
    // `remix` is an optional peer and not installed here. The SDK imports the matcher through it so an
    // app gets the copy its router uses; tests get it from the package that provides it.
    alias: { ...baseConfig.resolve?.alias, 'remix/route-pattern/match': '@remix-run/route-pattern/match' },
  },
  test: {
    ...baseConfig.test,
    include: ['test/**/*.test.ts'],
  },
});
