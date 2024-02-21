const baseConfig = require('../../jest/jest.config.js');

module.exports = {
  ...baseConfig,
  // TODO: Fix tests to work with the Edge environment
  // testEnvironment: '@edge-runtime/jest-environment',
};
