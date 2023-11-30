const baseConfig = require('../../jest/jest.config.js');

module.exports = {
  ...baseConfig,
  preset: 'ts-jest/presets/js-with-ts',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.test.json',
      },
    ],
    '^.+\\.js$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.test.json',
      },
    ],
  },
};
