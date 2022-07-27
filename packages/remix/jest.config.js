const baseConfig = require('../../jest/jest.config.js');

module.exports = {
  ...baseConfig,
  testPathIgnorePatterns: ['<rootDir>/build/', '<rootDir>/node_modules/', '<rootDir>/test/integration/'],
};
