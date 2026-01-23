import { makeBaseNPMConfig, makeNPMConfigVariants, makeOtelLoaders } from '@sentry-internal/rollup-utils';
import path from 'path';

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

        output: {
          virtualDirname: '_virtual/core',
        },

        // Next.js and our users are more happy when our client code has the "use client" directive
        plugins: [
          {
            name: 'sentry-internal-add-use-client-directive-to-client-entry-points-plugin-extravaganza',
            banner: chunk => {
              if (
                chunk.isEntry &&
                (chunk.facadeModuleId.endsWith('/src/index.client.ts') ||
                  chunk.facadeModuleId.endsWith('/src/client/index.ts'))
              ) {
                return '"use client";';
              }
            },
          },
        ],
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
          virtualDirname: '_virtual/templates',

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
        plugins: [
          {
            name: 'sentry-fix-missing-serverComponentModule-import',
            renderChunk(code, chunk) {
              // Rolldown has a bug where it removes namespace imports for external modules even when they're still
              // referenced in the code (specifically when there's a `declare const` with the same name in the source).
              // We need to add back the missing import for serverComponentModule in the serverComponentWrapperTemplate.
              if (
                chunk.facadeModuleId?.includes('serverComponentWrapperTemplate') &&
                code.includes('serverComponentModule') &&
                !code.includes('import * as serverComponentModule')
              ) {
                // Find the position after the last import statement to insert our missing import
                const lastImportMatch = code.match(/^import[^;]*;/gm);
                if (lastImportMatch) {
                  const lastImport = lastImportMatch[lastImportMatch.length - 1];
                  const lastImportEnd = code.indexOf(lastImport) + lastImport.length;
                  return {
                    code: `${code.slice(0, lastImportEnd)}
import * as serverComponentModule from "__SENTRY_WRAPPING_TARGET_FILE__";${code.slice(lastImportEnd)}`,
                  };
                }
              }
              return null;
            },
          },
        ],
      },
    }),
  ).map(v => {
    // copy the templates into the config/templates directory relative to the esm/cjs build directory
    return {
      ...v,
      output: {
        ...v.output,
        dir: path.join(v.output.dir, 'config/templates'),
      },
    };
  }),
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: [
        'src/config/loaders/index.ts',
        'src/config/loaders/valueInjectionLoader.ts',
        'src/config/loaders/prefixLoader.ts',
        'src/config/loaders/wrappingLoader.ts',
      ],

      packageSpecificConfig: {
        output: {
          virtualDirname: '_virtual/loaders',

          // make it so Rollup calms down about the fact that we're combining default and named exports
          exports: 'named',
        },
        external: ['@rollup/plugin-commonjs', 'rollup'],
      },
    }),
  ).map(v => {
    // copy the loaders into the config/loaders directory relative to the esm/cjs build directory
    return {
      ...v,
      output: {
        ...v.output,
        dir: path.join(v.output.dir, 'config/loaders'),
      },
    };
  }),
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: ['src/config/polyfills/perf_hooks.js'],

      packageSpecificConfig: {
        output: {
          virtualDirname: '_virtual/polyfills',

          // make it so Rollup calms down about the fact that we're combining default and named exports
          exports: 'named',
        },
      },
    }),
  ),
  ...makeOtelLoaders('./build', 'sentry-node'),
];
