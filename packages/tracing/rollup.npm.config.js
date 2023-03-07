import { makeBaseNPMConfig, makeNPMConfigVariants } from '../../rollup/index.js';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: ['src/browser/index.ts', 'src/node/index.ts', 'src/index.ts'],
    // packages with bundles have a different build directory structure
    hasBundles: true,
  }),
);
