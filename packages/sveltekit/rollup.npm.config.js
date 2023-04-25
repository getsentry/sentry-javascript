import { makeBaseNPMConfig, makeNPMConfigVariants } from '../../rollup/index.js';

export default [

  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: ['src/index.server.ts', 'src/index.client.ts', 'src/client/index.ts', 'src/server/index.ts'],
      packageSpecificConfig: {
        external: ['$app/stores'],
        output: {
          dynamicImportInCjs: true,
        }
      },
    }),
  ),
  // Templates for load function wrappers
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: [
        'src/vite/templates/universalLoadTemplate.ts',
        'src/vite/templates/serverLoadTemplate.ts',
      ],

      packageSpecificConfig: {
        output: {
          // Preserve the original file structure (i.e., so that everything is still relative to `src`)
          entryFileNames: 'vite/templates/[name].js',

          // this is going to be add-on code, so it doesn't need the trappings of a full module (and in fact actively
          // shouldn't have them, lest they muck with the module to which we're adding it)
          sourcemap: false,
          esModule: false,

          // make it so Rollup calms down about the fact that we're combining default and named exports
          exports: 'named',
        },
        external: [
          '@sentry/sveltekit',
          '__SENTRY_WRAPPING_TARGET_FILE__',
        ],
      },
    }),
),
];
