const baseConfig = require('../../jest/jest.config.js');

module.exports = {
  ...baseConfig,
  testEnvironment: 'jsdom',
  passWithNoTests: true, // TODO remove once we have something to test and tests
};
