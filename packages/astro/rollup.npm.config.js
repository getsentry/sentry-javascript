import { makeBaseNPMConfig, makeNPMConfigVariants } from '../../rollup/index.js';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: ['src/index.server.ts', 'src/index.client.ts'],
    packageSpecificConfig: {
      output: {
        dynamicImportInCjs: true,
      },
    },
  }),
);
