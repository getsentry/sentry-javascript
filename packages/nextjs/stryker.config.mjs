import baseConfig from '@sentry-internal/stryker-config/config';

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
const config = {
  ...baseConfig,
  dashboard: {
    ...baseConfig.dashboard,
    module: '@sentry/nextjs',
  },
  mutate: ['src/**/*.ts', '!src/config/templates/*.ts', 'src/**/*.tsx'],
  testRunner: 'jest',
  disableTypeChecks: true,
};

export default config;
