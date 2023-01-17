import replace from '@rollup/plugin-replace';

import { makeBaseNPMConfig, makeNPMConfigVariants } from '../../rollup/index';

import pkg from './package.json';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    hasBundles: true,
    packageSpecificConfig: {
      plugins: [
        // TODO: Remove this - replay version will be in sync w/ SDK version
        replace({
          preventAssignment: true,
          values: {
            __SENTRY_REPLAY_VERSION__: JSON.stringify(pkg.version),
          },
        }),
      ],
      output: {
        // set exports to 'named' or 'auto' so that rollup doesn't warn about
        // the default export in `worker/worker.js`
        exports: 'named',
        preserveModules: false,
      },
    },
  }),
);
