import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: ['src/index.client.ts', 'src/index.server.ts', 'src/client/index.ts', 'src/server/index.ts'],
    packageSpecificConfig: {
      external: ['solid-js', 'solid-js/attribution', '@solidjs/web'],
    },
  }),
);
