import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default makeNPMConfigVariants(
  makeBaseNPMConfig({
    entrypoints: [
      'src/index.server.ts',
      'src/index.client.ts',
      'src/index.worker.ts',
      'src/client/index.ts',
      'src/server/index.ts',
      'src/worker/index.ts',
    ],
    packageSpecificConfig: {
      external: ['$app/stores'],
      output: {
        dynamicImportInCjs: true,
      },
    },
  }),
);
