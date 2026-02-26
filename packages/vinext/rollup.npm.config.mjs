import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default [
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: [
        'src/index.client.ts',
        'src/index.server.ts',
        'src/index.worker.ts',
        'src/client/index.ts',
        'src/server/index.ts',
        'src/vite/index.ts',
      ],
      packageSpecificConfig: {
        external: ['vite', 'vinext'],
        output: {
          dynamicImportInCjs: true,
        },
      },
    }),
  ),
];
