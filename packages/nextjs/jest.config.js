const baseConfig = require('../../jest/jest.config.js');

module.exports = {
  ...baseConfig,
  testPathIgnorePatterns: ['<rootDir>/test/integration/'],
};
