const baseConfig = require('../../jest/jest.config.js');

module.exports = {
  ...baseConfig,
  testEnvironment: 'jsdom',
  testMatch: ['<rootDir>/test/unit/**/*.test.ts'],
};
