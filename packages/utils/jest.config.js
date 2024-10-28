const baseConfig = require('../../jest/jest.config.js');

module.exports = {
  ...baseConfig,
  transform: {
    '^.+\\.js$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.test.json',
      },
    ],
    ...baseConfig.transform,
  },
};
