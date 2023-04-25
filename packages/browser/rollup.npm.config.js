import { makeBaseNPMConfig, makeNPMConfigVariants } from '../../rollup/index.js';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    // packages with bundles have a different build directory structure
    hasBundles: true,
    packageSpecificConfig: {
      output: {
        // Combine output into a single file to avoid expensive require/import calls
        preserveModules: false,
      },
    },
  }),
);
