import { makeBaseNPMConfig, makeNPMConfigVariants } from '../../rollup/index.js';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    packageSpecificConfig: {
      output: {
        // Combine output into a single file to avoid expensive require/import calls
        preserveModules: false,
      },
    },
  }),
);
