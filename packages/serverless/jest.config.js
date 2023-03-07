const baseConfig = require('../../jest/jest.config.js');

module.exports = {
  ...baseConfig,
  moduleNameMapper: {
    uuid: require.resolve('uuid'),
  },
};
