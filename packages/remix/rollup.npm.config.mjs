import { makeBaseNPMConfig, makeNPMConfigVariants, makeOtelLoaders } from '@sentry-internal/rollup-utils';

export default [
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: [
        'src/index.server.ts',
        'src/index.client.ts',
        'src/client/index.ts',
        'src/server/index.ts',
        'src/cloudflare/index.ts',
      ],
      packageSpecificConfig: {
        external: ['react-router', 'react-router-dom', 'react', 'react/jsx-runtime'],
        output: {
          // make it so Rollup calms down about the fact that we're combining default and named exports
          exports: 'named',
          // Always include __esModule marker for proper CJS/ESM interop
          // This ensures both `import * as Sentry` and `import Sentry` work correctly
          esModule: true,
        },
      },
    }),
  ),
  ...makeOtelLoaders('./build', 'sentry-node'),
];
