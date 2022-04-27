import { makeBaseNPMConfig, makeNPMConfigVariants } from '../../rollup/index.js';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    // packages with bundles have a different build directory structure
    hasBundles: true,
    watchPackages: ['core'],
  }),
);
