const baseConfig = require('@sentry-internal/jest-config');

module.exports = {
  ...baseConfig,
  transform: {
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.js$': 'ts-jest',
  },
};
