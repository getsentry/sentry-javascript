import { makeBaseNPMConfig, makeNPMConfigVariants, makeOtelLoaders } from '@sentry-internal/rollup-utils';

export default [
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: [
        'src/index.server.ts',
        'src/index.client.ts',
        'src/client/index.ts',
        'src/server/index.ts',
        'src/vite/index.ts',
      ],
      packageSpecificConfig: {
        output: {
          // keep emitted module paths relative to `src` so the bundled `@sentry/conventions`
          // (a devDependency, vendored into the build) doesn't shift the output layout
          preserveModulesRoot: 'src',
        },
      },
    }),
  ),
  ...makeOtelLoaders('./build', 'sentry-node'),
];
