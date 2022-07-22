const baseConfig = require('../../jest.config.js');

module.exports = {
  globalSetup: '<rootDir>/test/server/utils/run-server.ts',
  ...baseConfig,
  testMatch: ['**/*.test.ts'],
};
