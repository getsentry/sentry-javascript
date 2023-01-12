import path from 'path';

import replace from '@rollup/plugin-replace';
import renameNodeModules from 'rollup-plugin-rename-node-modules';

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
        // this renames the path under which rrweb is pulled into the build output directory
        // from `node_modules/rrweb/...` to `ext/rrweb/...`
        // see https://github.com/getsentry/sentry-javascript/issues/6690
        renameNodeModules('ext'),
      ],
      output: {
        // set exports to 'named' or 'auto' so that rollup doesn't warn about
        // the default export in `worker/worker.js`
        exports: 'named',

        // As we are inlining the rrweb dependency here, we need to ensure the nested folders are correct
        // Without this config, you get:
        // * build/npm/esm/node_modules/rrweb/...
        // * build/npm/esm/packages/replay/...
        preserveModulesRoot: path.join(process.cwd(), 'src'),
      },
    },
  }),
);
