const baseConfig = require('../../jest.config.js');

module.exports = {
  ...baseConfig,
  testMatch: [`${__dirname}/test/server/**/*.test.ts`],
  testPathIgnorePatterns: [`${__dirname}/test/client`],
  forceExit: true,
  testTimeout: 30000,
  setupFilesAfterEnv: [`${__dirname}/jest.setup.js`],
  collectCoverage: false,
};
