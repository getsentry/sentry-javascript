/* eslint-disable complexity */
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, SEMANTIC_ATTRIBUTE_SENTRY_OP, spanToJSON } from '@sentry/core';
import { generateInstrumentOnce } from '../../../otel/instrument';
import { addOriginToSpan } from '../../../utils/addOriginToSpan';
import {
  AI_MODEL_ID_ATTRIBUTE,
  AI_MODEL_PROVIDER_ATTRIBUTE,
  AI_PROMPT_ATTRIBUTE,
  AI_USAGE_COMPLETION_TOKENS_ATTRIBUTE,
  AI_USAGE_PROMPT_TOKENS_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
} from './attributes';
import { INTEGRATION_NAME } from './constants';
import { SentryVercelAiInstrumentation } from './instrumentation';

export const instrumentVercelAi = generateInstrumentOnce(INTEGRATION_NAME, () => new SentryVercelAiInstrumentation({}));

const _vercelAIIntegration = (() => {
  let instrumentation: undefined | SentryVercelAiInstrumentation;

  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentation = instrumentVercelAi();
    },
    setup(client) {
      instrumentation?.callWhenPatched(() => {
        client.on('spanStart', span => {
          const { data: attributes, description: name } = spanToJSON(span);

          if (!name) {
            return;
          }

          // The id of the model
          const aiModelId = attributes[AI_MODEL_ID_ATTRIBUTE];

          // the provider of the model
          const aiModelProvider = attributes[AI_MODEL_PROVIDER_ATTRIBUTE];

          // both of these must be defined for the integration to work
          if (typeof aiModelId !== 'string' || typeof aiModelProvider !== 'string' || !aiModelId || !aiModelProvider) {
            return;
          }

          let isPipelineSpan = false;

          switch (name) {
            case 'ai.generateText': {
              span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.pipeline.generateText');
              isPipelineSpan = true;
              break;
            }
            case 'ai.generateText.doGenerate': {
              span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.run.doGenerate');
              break;
            }
            case 'ai.streamText': {
              span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.pipeline.streamText');
              isPipelineSpan = true;
              break;
            }
            case 'ai.streamText.doStream': {
              span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.run.doStream');
              break;
            }
            case 'ai.generateObject': {
              span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.pipeline.generateObject');
              isPipelineSpan = true;
              break;
            }
            case 'ai.generateObject.doGenerate': {
              span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.run.doGenerate');
              break;
            }
            case 'ai.streamObject': {
              span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.pipeline.streamObject');
              isPipelineSpan = true;
              break;
            }
            case 'ai.streamObject.doStream': {
              span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.run.doStream');
              break;
            }
            case 'ai.embed': {
              span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.pipeline.embed');
              isPipelineSpan = true;
              break;
            }
            case 'ai.embed.doEmbed': {
              span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.embeddings');
              break;
            }
            case 'ai.embedMany': {
              span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.pipeline.embedMany');
              isPipelineSpan = true;
              break;
            }
            case 'ai.embedMany.doEmbed': {
              span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.embeddings');
              break;
            }
            case 'ai.toolCall':
            case 'ai.stream.firstChunk':
            case 'ai.stream.finish':
              span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.run');
              break;
          }

          addOriginToSpan(span, 'auto.vercelai.otel');

          const nameWthoutAi = name.replace('ai.', '');
          span.setAttribute('ai.pipeline.name', nameWthoutAi);
          span.updateName(nameWthoutAi);

          // If a Telemetry name is set and it is a pipeline span, use that as the operation name
          const functionId = attributes['ai.telemetry.functionId'];
          if (functionId && typeof functionId === 'string' && isPipelineSpan) {
            span.updateName(functionId);
            span.setAttribute('ai.pipeline.name', functionId);
          }

          if (attributes[AI_PROMPT_ATTRIBUTE]) {
            span.setAttribute('gen_ai.prompt', attributes[AI_PROMPT_ATTRIBUTE]);
          }
          if (attributes[AI_MODEL_ID_ATTRIBUTE] && !attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]) {
            span.setAttribute(GEN_AI_RESPONSE_MODEL_ATTRIBUTE, attributes[AI_MODEL_ID_ATTRIBUTE]);
          }
          span.setAttribute('ai.streaming', name.includes('stream'));
        });

        client.addEventProcessor(event => {
          if (event.type === 'transaction' && event.spans?.length) {
            for (const span of event.spans) {
              const { data: attributes, description: name } = span;

              if (!name || span.origin !== 'auto.vercelai.otel') {
                continue;
              }

              if (attributes[AI_USAGE_COMPLETION_TOKENS_ATTRIBUTE] != undefined) {
                attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE] = attributes[AI_USAGE_COMPLETION_TOKENS_ATTRIBUTE];
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete attributes[AI_USAGE_COMPLETION_TOKENS_ATTRIBUTE];
              }
              if (attributes[AI_USAGE_PROMPT_TOKENS_ATTRIBUTE] != undefined) {
                attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE] = attributes[AI_USAGE_PROMPT_TOKENS_ATTRIBUTE];
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete attributes[AI_USAGE_PROMPT_TOKENS_ATTRIBUTE];
              }
              if (
                typeof attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE] === 'number' &&
                typeof attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE] === 'number'
              ) {
                attributes['gen_ai.usage.total_tokens'] =
                  attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE] + attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE];
              }
            }
          }

          return event;
        });
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the [ai](https://www.npmjs.com/package/ai) library.
 *
 * For more information, see the [`ai` documentation](https://sdk.vercel.ai/docs/ai-sdk-core/telemetry).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *  integrations: [Sentry.vercelAIIntegration()],
 * });
 * ```
 *
 * By default this integration adds tracing support to all `ai` function calls. If you need to disable
 * collecting spans for a specific call, you can do so by setting `experimental_telemetry.isEnabled` to
 * `false` in the first argument of the function call.
 *
 * ```javascript
 * const result = await generateText({
 *   model: openai('gpt-4-turbo'),
 *   experimental_telemetry: { isEnabled: false },
 * });
 * ```
 *
 * If you want to collect inputs and outputs for a specific call, you must specifically opt-in to each
 * function call by setting `experimental_telemetry.recordInputs` and `experimental_telemetry.recordOutputs`
 * to `true`.
 *
 * ```javascript
 * const result = await generateText({
 *  model: openai('gpt-4-turbo'),
 *  experimental_telemetry: { isEnabled: true, recordInputs: true, recordOutputs: true },
 * });
 */
export const vercelAIIntegration = defineIntegration(_vercelAIIntegration);
