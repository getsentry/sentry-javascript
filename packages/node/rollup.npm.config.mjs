import replace from '@rollup/plugin-replace';
import { makeBaseNPMConfig, makeNPMConfigVariants, makeOrchestrionLoader } from '@sentry-internal/rollup-utils';
import { createWorkerCodeBuilder } from './rollup.anr-worker.config.mjs';

const [anrWorkerConfig, getAnrBase64Code] = createWorkerCodeBuilder(
  'src/integrations/anr/worker.ts',
  'build/esm/integrations/anr',
);

const [localVariablesWorkerConfig, getLocalVariablesBase64Code] = createWorkerCodeBuilder(
  'src/integrations/local-variables/worker.ts',
  'build/esm/integrations/local-variables',
);

export default [
  // The `@sentry/node/import` entry (`node --import @sentry/node/import app.js`), which registers
  // the orchestrion diagnostics-channel injection before the app loads.
  ...makeOrchestrionLoader('./build'),
  // The workers need to be built first since their output is copied into the main bundle.
  anrWorkerConfig,
  localVariablesWorkerConfig,
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: [
        'src/index.ts',
        'src/init.ts',
        'src/preload.ts',
        // Combined Sentry bundler plugins + orchestrion code transform, exposed
        // via the `@sentry/node/{vite,rollup,webpack,esbuild}` subpath exports.
        'src/bundler-plugin/vite.ts',
        'src/bundler-plugin/rollup.ts',
        'src/bundler-plugin/webpack.ts',
        'src/bundler-plugin/esbuild.ts',
      ],
      packageSpecificConfig: {
        external: [/^@sentry\/opentelemetry/],
        output: {
          // set exports to 'named' or 'auto' so that rollup doesn't warn
          exports: 'named',
          preserveModules: true,
        },
        plugins: [
          replace({
            delimiters: ['###', '###'],
            // removes some rollup warnings
            preventAssignment: true,
            values: {
              AnrWorkerScript: () => getAnrBase64Code(),
              LocalVariablesWorkerScript: () => getLocalVariablesBase64Code(),
            },
          }),
        ],
      },
    }),
  ),
];
