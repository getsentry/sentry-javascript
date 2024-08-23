import baseConfig from '@sentry-internal/stryker-config/config';

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  ...baseConfig,
  dashboard: {
    ...baseConfig.dashboard,
    module: '@sentry/astro',
  },
};

export default config;
