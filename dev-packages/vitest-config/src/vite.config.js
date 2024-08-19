const { defineConfig } = require('vitest/config');
const path = require('path');

/**
 * @type {import('vitest').VitestConfig}
 */
module.exports = defineConfig({
  define: {
    __DEBUG_BUILD__: true,
  },
  test: {
    globals: true,
    coverage: {
      enabled: true,
      reportsDirectory: './coverage',
    },
    typecheck: {
      tsconfig: path.join(process.cwd(), 'tsconfig.test.json'),
    },
  },
});
