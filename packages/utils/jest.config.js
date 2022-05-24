const baseConfig = require('../../jest/jest.config.js');

module.exports = {
  ...baseConfig,
  transform: {
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.js$': 'ts-jest',
  },
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.test.json',
    },
    __DEBUG_BUILD__: true,
  },
};
