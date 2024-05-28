import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    packageSpecificConfig: {
      external: ['solid-js', 'solid-js/web', '@solidjs/router'],
    },
  }),
);
