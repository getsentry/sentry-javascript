const baseConfig = require('@sentry-internal/jest-config');

module.exports = {
  ...baseConfig,
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.js$': 'ts-jest',
    ...baseConfig.transform,
  },
};
