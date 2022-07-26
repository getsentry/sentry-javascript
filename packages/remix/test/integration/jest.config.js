const baseConfig = require('../../jest.config.js');

module.exports = {
  ...baseConfig,
  globalSetup: `${__dirname}/test/server/utils/test-setup.ts`,
  globalTeardown: `${__dirname}/test/server/utils/test-teardown.ts`,
  testMatch: [`${__dirname}/test/server/**/*.test.ts`],
  testPathIgnorePatterns: [`${__dirname}/test/client`],
};
