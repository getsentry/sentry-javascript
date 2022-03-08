const path = require('path');
const process = require('process');

const useBuild = process.env['SENTRY_NODE_BUILD'];
const useESM = useBuild === 'esm';

const sentryNodePath = path.join(path.dirname(__dirname), 'node', useESM ? 'esm' : 'dist');
const sentryTracingPath = path.join(path.dirname(__dirname), 'tracing', useESM ? 'esm' : 'dist');

const config = {
  transform: {
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.js$': 'babel-jest',
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
