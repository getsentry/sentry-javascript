import baseConfig from '@sentry-internal/stryker-config';

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  ...baseConfig,
  dashboard: {
    ...baseConfig.dashboard,
    module: '@sentry/svelte',
  },
};

export default config;
