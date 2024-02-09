import { makeBaseBundleConfig, makeBundleConfigVariants } from '@sentry-internal/rollup-utils';
import alias from '@rollup/plugin-alias';

const baseBundleConfig = makeBaseBundleConfig({
  bundleType: 'addon',
  entrypoints: ['src/index.ts'],
  jsVersion: 'es6',
  licenseTitle: '@sentry-internal/feedback-screenshot',
  outputFileBase: () => 'bundles/feedback-screenshot',
  plugins: [
    alias({
      entries: [
        { find: 'react', replacement: 'preact/compat' },
        { find: 'react-dom/test-utils', replacement: 'preact/test-utils' },
        { find: 'react-dom', replacement: 'preact/compat' },
        { find: 'react/jsx-runtime', replacement: 'preact/jsx-runtime' }
      ]
    })
  ],

});

const builds = makeBundleConfigVariants(baseBundleConfig);

export default builds;
