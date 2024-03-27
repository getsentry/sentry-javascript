const baseConfig = require('../../jest/jest.config.js');

module.exports = {
  ...baseConfig,
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.js$': 'ts-jest',
    ...baseConfig.transform,
  },
};
