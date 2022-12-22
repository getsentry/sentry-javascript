import replace from '@rollup/plugin-replace';

import { makeBaseBundleConfig, makeBundleConfigVariants } from '../../rollup/index.js';

import pkg from './package.json';

const baseBundleConfig = makeBaseBundleConfig({
  bundleType: 'addon',
  entrypoints: ['src/index.ts'],
  jsVersion: 'es6',
  licenseTitle: '@sentry/replay',
  outputFileBase: () => 'bundles/replay',
  packageSpecificConfig: {
    plugins: [
      replace({
        preventAssignment: true,
        values: {
          __SENTRY_REPLAY_VERSION__: JSON.stringify(pkg.version),
        },
      }),
    ],
  },
});

const builds = makeBundleConfigVariants(baseBundleConfig);

export default builds;
