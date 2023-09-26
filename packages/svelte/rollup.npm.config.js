import { makeBaseNPMConfig, makeNPMConfigVariants } from '../rollup/index.js';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    // Prevent 'svelte/internal' stuff from being included in the built JS
    packageSpecificConfig: { external: ['svelte/internal'] },
  }),
);
