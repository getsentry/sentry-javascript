const baseConfig = require('../../jest.config.js');

module.exports = {
  ...baseConfig,
  testEnvironment: 'jsdom',
};
