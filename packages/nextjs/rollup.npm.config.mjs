import { makeBaseNPMConfig, makeNPMConfigVariants, makeOtelLoaders } from '@sentry-internal/rollup-utils';

export default [
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      // We need to include `instrumentServer.ts` separately because it's only conditionally required, and so rollup
      // doesn't automatically include it when calculating the module dependency tree.
      entrypoints: [
        'src/index.server.ts',
        'src/index.client.ts',
        'src/client/index.ts',
        'src/server/index.ts',
        'src/edge/index.ts',
        'src/config/index.ts',
      ],

      // prevent this internal nextjs code from ending up in our built package (this doesn't happen automatically because
      // the name doesn't match an SDK dependency)
      packageSpecificConfig: {
        external: ['next/router', 'next/constants', 'next/headers', 'stacktrace-parser'],
      },
    }),
  ),
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: [
        'src/config/templates/apiWrapperTemplate.ts',
        'src/config/templates/middlewareWrapperTemplate.ts',
        'src/config/templates/pageWrapperTemplate.ts',
        'src/config/templates/requestAsyncStorageShim.ts',
        'src/config/templates/sentryInitWrapperTemplate.ts',
        'src/config/templates/serverComponentWrapperTemplate.ts',
        'src/config/templates/routeHandlerWrapperTemplate.ts',
      ],

      packageSpecificConfig: {
        output: {
          // Preserve the original file structure (i.e., so that everything is still relative to `src`)
          entryFileNames: 'config/templates/[name].js',

          // this is going to be add-on code, so it doesn't need the trappings of a full module (and in fact actively
          // shouldn't have them, lest they muck with the module to which we're adding it)
          sourcemap: false,
          esModule: false,

          // make it so Rollup calms down about the fact that we're combining default and named exports
          exports: 'named',
        },
        external: [
          '@sentry/nextjs',
          'next/dist/client/components/request-async-storage',
          '__SENTRY_CONFIG_IMPORT_PATH__',
          '__SENTRY_WRAPPING_TARGET_FILE__',
          '__SENTRY_NEXTJS_REQUEST_ASYNC_STORAGE_SHIM__',
        ],
      },
    }),
  ),
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: ['src/config/loaders/index.ts'],

      packageSpecificConfig: {
        output: {
          // Preserve the original file structure (i.e., so that everything is still relative to `src`)
          entryFileNames: 'config/loaders/[name].js',

          // make it so Rollup calms down about the fact that we're combining default and named exports
          exports: 'named',
        },
        external: ['@rollup/plugin-commonjs', 'rollup'],
      },
    }),
  ),
  ...makeOtelLoaders('./build', 'sentry-node'),
];
