import { makeBaseNPMConfig, makeNPMConfigVariants, makeOtelLoaders } from '@sentry-internal/rollup-utils';
import { replacePlugin } from 'rolldown/plugins';
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
  ...makeOtelLoaders('./build', 'otel'),
  // The workers needs to be built first since it's their output is copied in the main bundle.
  anrWorkerConfig,
  localVariablesWorkerConfig,
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: ['src/index.ts', 'src/init.ts'],
      packageSpecificConfig: {
        output: {
          // set exports to 'named' or 'auto' so that rollup doesn't warn
          exports: 'named',
        },
        plugins: [
          replacePlugin(
            {
              AnrWorkerScript: () => getAnrBase64Code(),
              LocalVariablesWorkerScript: () => getLocalVariablesBase64Code(),
            },
            {
              delimiters: ['###', '###'],
              // removes some rollup warnings
              preventAssignment: true,
            },
          ),
        ],
      },
    }),
  ),
];
