import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    // Prevent 'svelte/internal' stuff from being included in the built JS
    packageSpecificConfig: { external: ['svelte/internal'] },
  }),
);
