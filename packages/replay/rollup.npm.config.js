import { makeBaseNPMConfig, makeNPMConfigVariants } from '../../rollup/index';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    hasBundles: true,
    packageSpecificConfig: {
      output: {
        // set exports to 'named' or 'auto' so that rollup doesn't warn about
        // the default export in `worker/worker.js`
        exports: 'named',
        preserveModules: false,
      },
    },
  }),
);
