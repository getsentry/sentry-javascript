import { makeBaseNPMConfig, makeNPMConfigVariants, makeOtelLoaders } from '@sentry-internal/rollup-utils';

export default [
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: [
        'src/index.server.ts',
        'src/index.client.ts',
        'src/client/index.ts',
        'src/server/index.ts',
        'src/config/index.ts',
      ],
      packageSpecificConfig: {
        external: ['import-in-the-middle/hook.mjs'],
      },
    }),
  ),
  ...makeOtelLoaders('./build', 'sentry-node'),
];
