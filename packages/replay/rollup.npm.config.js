import replace from '@rollup/plugin-replace';

import { makeBaseNPMConfig, makeNPMConfigVariants } from '../../rollup/index';

import pkg from './package.json';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    hasBundles: true,
    packageSpecificConfig: {
      external: [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.peerDependencies || {})],
      plugins: [
        replace({
          // __SENTRY_DEBUG__ should be save to replace in any case, so no checks for assignments necessary
          preventAssignment: false,
          values: {
            __SENTRY_REPLAY_VERSION__: JSON.stringify(pkg.version),
            // @ts-ignore not gonna deal with types here
            __SENTRY_DEBUG__: true,
            // @ts-ignore not gonna deal with types here
            __DEBUG_BUILD__: true,
          },
        }),
      ],
      output: {
        // set exports to 'named' or 'auto' so that rollup doesn't warn about
        // the default export in `worker/worker.js`
        exports: 'named',
      },
    },
  }),
);
