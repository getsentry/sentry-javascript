import { makeBaseNPMConfig, makeNPMConfigVariants } from '../../rollup/index';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    hasBundles: true,
    packageSpecificConfig: {
      output: {
        // set exports to 'named' or 'auto' so that rollup doesn't warn
        exports: 'named',
        // set preserveModules to false because for Replay we actually want
        // to bundle everything into one file.
        preserveModules: false,
      },
    },
  }),
);
