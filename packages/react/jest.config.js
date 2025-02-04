const baseConfig = require('../../jest/jest.config.js');

module.exports = {
  ...baseConfig,
  testEnvironment: 'jsdom',
  setupFiles: ['whatwg-fetch'],
  // We have some tests that trigger warnings, which mess up the test logs
  silent: true,
};
