const baseConfig = require('../../jest/jest.config.js');

module.exports = {
  ...baseConfig,
  testPathIgnorePatterns: ['<rootDir>/build/', '<rootDir>/node_modules/', '<rootDir>/test/integration/'],
  // Some tests take longer to finish, as flushing spans with OpenTelemetry takes some more time
  testTimeout: 15000,
};
