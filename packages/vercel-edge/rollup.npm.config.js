import { makeBaseNPMConfig, makeNPMConfigVariants } from '../../rollup/index.js';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: ['src/index.ts'],
    // packages with bundles have a different build directory structure
    hasBundles: true,
  }),
);
