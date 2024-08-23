import baseConfig from '@sentry-internal/stryker-config/config';

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  ...baseConfig,
  testRunner: 'jest',
  dashboard: {
    ...baseConfig.dashboard,
    module: '@sentry/aws-serverless',
  },
};

export default config;
