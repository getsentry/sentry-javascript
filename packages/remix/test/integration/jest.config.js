const baseConfig = require('../../jest.config.js');

module.exports = {
  globalSetup: '<rootDir>/test/server/utils/test-setup.ts',
  globalTeardown: '<rootDir>/test/server/utils/test-teardown.ts',
  ...baseConfig,
  testMatch: ['**/*.test.ts'],
};
