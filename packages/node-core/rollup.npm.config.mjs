import { makeBaseNPMConfig, makeNPMConfigVariants, makeOtelLoaders } from '@sentry-internal/rollup-utils';
import { createWorkerCodeBuilder } from './rollup.anr-worker.config.mjs';

const [anrWorkerConfig, getAnrBase64Code] = createWorkerCodeBuilder(
  'src/integrations/anr/worker.ts',
  'build/esm/integrations/anr',
);

const [localVariablesWorkerConfig, getLocalVariablesBase64Code] = createWorkerCodeBuilder(
  'src/integrations/local-variables/worker.ts',
  'build/esm/integrations/local-variables',
);

/**
 * Custom replace plugin that lazily evaluates replacement values.
 * This is needed because the worker scripts are built in earlier configs,
 * and we need to wait for their renderChunk hooks to complete before
 * we can get the base64-encoded worker code.
 */
function makeLazyReplacePlugin(replacements, options = {}) {
  const { delimiters = ['###', '###'] } = options;
  const [delimiterStart, delimiterEnd] = delimiters;

  return {
    name: 'lazy-replace-plugin',
    renderChunk(code) {
      let result = code;

      for (const [key, valueFn] of Object.entries(replacements)) {
        const value = typeof valueFn === 'function' ? valueFn() : valueFn;
        const searchPattern = `${delimiterStart}${key}${delimiterEnd}`;
        // Don't add quotes - the source already has quotes around the placeholder
        const replacement = value;

        // Replace all occurrences
        result = result.split(searchPattern).join(replacement);
      }

      return { code: result };
    },
  };
}

export default [
  ...makeOtelLoaders('./build', 'otel'),
  // The workers needs to be built first since it's their output is copied in the main bundle.
  anrWorkerConfig,
  localVariablesWorkerConfig,
  ...makeNPMConfigVariants(
    makeBaseNPMConfig({
      entrypoints: ['src/index.ts', 'src/init.ts', 'src/light/index.ts'],
      packageSpecificConfig: {
        output: {
          // set exports to 'named' or 'auto' so that rollup doesn't warn
          exports: 'named',
          preserveModules: true,
        },
        plugins: [
          makeLazyReplacePlugin(
            {
              AnrWorkerScript: getAnrBase64Code,
              LocalVariablesWorkerScript: getLocalVariablesBase64Code,
            },
            {
              delimiters: ['###', '###'],
            },
          ),
        ],
      },
    }),
  ),
];
