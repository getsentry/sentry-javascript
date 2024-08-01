import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default [
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: [
        'src/index.server.ts',
        'src/index.client.ts',
        'src/client/index.ts',
        'src/server/index.ts',
        'src/module/index.ts',
      ],
      packageSpecificConfig: {
        external: ['nuxt/app'],
      },
    }),
  ),
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: ['src/module/plugins/sentry.client.ts', 'src/module/plugins/sentry.server.ts'],

      packageSpecificConfig: {
        external: ['nuxt/app', 'nitropack/runtime', 'h3'],
        output: {
          // Preserve the original file structure (i.e., so that everything is still relative to `src`)
          entryFileNames: 'module/[name].js',
        },
      },
    }),
  ),
];

/*

 */
