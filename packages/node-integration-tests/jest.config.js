const path = require('path');

const sentryNodePath = path.join(path.dirname(__dirname), 'node');
const sentryTracingPath = path.join(path.dirname(__dirname), 'tracing');

const config = {
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testEnvironment: 'node',
  testMatch: ['**/test.ts'],
  moduleNameMapper: {
    '@sentry/node': sentryNodePath,
    '@sentry/tracing': sentryTracingPath,
  },
  moduleFileExtensions: ['js', 'ts'],
};

module.exports = config;
