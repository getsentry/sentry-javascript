import commonjs from '@rollup/plugin-commonjs';

import { makeBaseBundleConfig, makeBundleConfigVariants } from '../../rollup/index.js';

import pkg from './package.json';

const builds = [];

// TODO: Do we even need es5 bundles?
[/* 'es5', */ 'es6'].forEach(jsVersion => {
  const baseBundleConfig = makeBaseBundleConfig({
    bundleType: 'addon',
    entrypoints: ['src/index.ts'],
    jsVersion,
    licenseTitle: '@sentry/replay',
    outputFileBase: () => `bundles/replay${jsVersion === 'es5' ? '.es5' : ''}`, // TODO: simplify if no es5 bundles
    packageSpecificConfig: {
      external: [...Object.keys(pkg.peerDependencies || {})],
      plugins: [
        // lodash.debouce is commonJs and hence we have to first convert it to es6
        commonjs(),
      ],
      output: {
        // set exports to 'named' or 'auto' so that rollup doesn't warn about
        // the default export in `worker/worker.js`
        exports: 'auto',
        // format: 'esm',
      },
    },
  });

  builds.push(...makeBundleConfigVariants(baseBundleConfig));
});

export default builds;
