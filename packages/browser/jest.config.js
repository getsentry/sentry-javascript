const baseConfig = require('../../jest/jest.config.js');

module.exports = {
  ...baseConfig,
  testEnvironment: './jest.env.js',
  testMatch: ['<rootDir>/test/unit/**/*.test.ts'],
};
