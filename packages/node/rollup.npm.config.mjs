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

// The Lambda handler shim `init` redirects `_HANDLER` to for the managed tunnel. Standalone and ESM-only, since it
// uses top-level await to load the user's handler module. Bare imports stay external.
function makeLambdaHandlerShimConfig() {
  const baseConfig = makeBaseNPMConfig({
    entrypoints: ['src/run-lambda-handler.ts'],
    // Top-level await requires es2022.
    esbuild: { target: 'es2022' },
  });

  return {
    ...baseConfig,
    output: {
      ...baseConfig.output,
      dir: undefined,
      file: 'build/run-lambda-handler.mjs',
      format: 'esm',
      preserveModules: false,
    },
  };
}

export default [
  makeLambdaHandlerShimConfig(),
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
