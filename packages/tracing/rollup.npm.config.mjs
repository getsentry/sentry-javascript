import { makeBaseNPMConfig, makeNPMConfigVariants } from '../../rollup/index.mjs';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    // packages with bundles have a different build directory structure
    hasBundles: true,
  }),
);
