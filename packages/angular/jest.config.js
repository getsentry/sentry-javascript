const baseConfig = require('../../jest/jest.config.js');

module.exports = {
  ...baseConfig,
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/setup-jest.ts'],
};
