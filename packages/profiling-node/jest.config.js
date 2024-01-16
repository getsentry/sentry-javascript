const baseConfig = require('../../jest/jest.config.js');

console.log('baseConfig', baseConfig);
module.exports = {
  ...baseConfig,
  testEnvironment: 'node',
};
