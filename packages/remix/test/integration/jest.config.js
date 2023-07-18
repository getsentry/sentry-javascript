const baseConfig = require('../../jest.config.js');

module.exports = {
  ...baseConfig,
  testMatch: [`${__dirname}/test/server/**/*.test.ts`],
  testPathIgnorePatterns: [`${__dirname}/test/client`],
  detectOpenHandles: true,
  forceExit: true,
  testTimeout: 10000,
};
