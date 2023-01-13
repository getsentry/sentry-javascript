const baseConfig = require('../../jest/jest.config.js');

module.exports = {
  ...baseConfig,
  // This prevents the build tests from running when unit tests run. (If they do, they fail, because the build being
  // tested hasn't necessarily run yet.)
  testPathIgnorePatterns: ['<rootDir>/test/buildProcess/'],
  setupFiles: ['<rootDir>/test/setupUnitTests.ts'],
};
