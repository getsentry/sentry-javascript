const baseConfig = require('../../jest/jest.config.js');

module.exports = {
  ...baseConfig,
  transform: {
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.js$': 'ts-jest',
  },
};
