import { makeBaseNPMConfig, makeNPMConfigVariants } from '@sentry-internal/rollup-utils';

export default [
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: [
        'src/index.server.ts',
        'src/index.client.ts',
        'src/client/index.ts',
        'src/server/index.ts',
        'src/module.ts',
      ],
      packageSpecificConfig: {
        external: ['nuxt/app'],
      },
    }),
  ),

  // The Nuxt module plugins are also built with the @nuxt/module-builder.
  // This rollup setup is still left here for an easier switch between the setups while
  // manually testing different built outputs (module-builder vs. rollup only)
  /*
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: ['src/runtime/plugins/sentry.client.ts', 'src/runtime/plugins/sentry.server.ts'],

      packageSpecificConfig: {
        external: ['nuxt/app', 'nitropack/runtime', 'h3'],
        output: {
          // Preserve the original file structure (i.e., so that everything is still relative to `src`)
          entryFileNames: 'runtime/[name].js',
        },
      },
    }),
  ),
 */
];
