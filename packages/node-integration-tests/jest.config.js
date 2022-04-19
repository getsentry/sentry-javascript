const baseConfig = require('../../jest.config.js');

module.exports = {
  globalSetup: '<rootDir>/setup-tests.ts',
  ...baseConfig,
  testMatch: ['**/test.ts'],
};
