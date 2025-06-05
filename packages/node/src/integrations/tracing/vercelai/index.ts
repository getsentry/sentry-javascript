/* eslint-disable @typescript-eslint/no-dynamic-delete */
/* eslint-disable complexity */
import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, SEMANTIC_ATTRIBUTE_SENTRY_OP, spanToJSON } from '@sentry/core';
import { generateInstrumentOnce } from '../../../otel/instrument';
import { addOriginToSpan } from '../../../utils/addOriginToSpan';
import {
  AI_MODEL_ID_ATTRIBUTE,
  AI_MODEL_PROVIDER_ATTRIBUTE,
  AI_PROMPT_ATTRIBUTE,
  AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE,
  AI_TOOL_CALL_ID_ATTRIBUTE,
  AI_TOOL_CALL_NAME_ATTRIBUTE,
  AI_USAGE_COMPLETION_TOKENS_ATTRIBUTE,
  AI_USAGE_PROMPT_TOKENS_ATTRIBUTE,
  GEN_AI_RESPONSE_MODEL_ATTRIBUTE,
  GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE,
  GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
} from './ai_sdk_attributes';
import { INTEGRATION_NAME } from './constants';
import { SentryVercelAiInstrumentation } from './instrumentation';
import type { VercelAiOptions } from './types';

export const instrumentVercelAi = generateInstrumentOnce(INTEGRATION_NAME, () => new SentryVercelAiInstrumentation({}));

const _vercelAIIntegration = ((options: VercelAiOptions = {}) => {
  let instrumentation: undefined | SentryVercelAiInstrumentation;

  return {
    name: INTEGRATION_NAME,
    options,
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

          // Tool call spans
          // https://ai-sdk.dev/docs/ai-sdk-core/telemetry#tool-call-spans
          if (
            attributes[AI_TOOL_CALL_NAME_ATTRIBUTE] &&
            attributes[AI_TOOL_CALL_ID_ATTRIBUTE] &&
            name === 'ai.toolCall'
          ) {
            addOriginToSpan(span, 'auto.vercelai.otel');
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.execute_tool');
            span.updateName(`execute_tool ${attributes[AI_TOOL_CALL_NAME_ATTRIBUTE]}`);
            return;
          }

          // The AI and Provider must be defined for generate, stream, and embed spans.
          // The id of the model
          const aiModelId = attributes[AI_MODEL_ID_ATTRIBUTE];
          // the provider of the model
          const aiModelProvider = attributes[AI_MODEL_PROVIDER_ATTRIBUTE];
          if (typeof aiModelId !== 'string' || typeof aiModelProvider !== 'string' || !aiModelId || !aiModelProvider) {
            return;
          }

          addOriginToSpan(span, 'auto.vercelai.otel');

          const nameWthoutAi = name.replace('ai.', '');
          span.setAttribute('ai.pipeline.name', nameWthoutAi);
          span.updateName(nameWthoutAi);

          // If a Telemetry name is set and it is a pipeline span, use that as the operation name
          const functionId = attributes[AI_TELEMETRY_FUNCTION_ID_ATTRIBUTE];
          if (functionId && typeof functionId === 'string' && name.split('.').length - 1 === 1) {
            span.updateName(`${nameWthoutAi} ${functionId}`);
            span.setAttribute('ai.pipeline.name', functionId);
          }

          if (attributes[AI_PROMPT_ATTRIBUTE]) {
            span.setAttribute('gen_ai.prompt', attributes[AI_PROMPT_ATTRIBUTE]);
          }
          if (attributes[AI_MODEL_ID_ATTRIBUTE] && !attributes[GEN_AI_RESPONSE_MODEL_ATTRIBUTE]) {
            span.setAttribute(GEN_AI_RESPONSE_MODEL_ATTRIBUTE, attributes[AI_MODEL_ID_ATTRIBUTE]);
          }
          span.setAttribute('ai.streaming', name.includes('stream'));

          // Generate Spans
          if (name === 'ai.generateText') {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.pipeline.generate_text');
            return;
          }

          if (name === 'ai.generateText.doGenerate') {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.generate_text');
            span.updateName(`generate_text ${attributes[AI_MODEL_ID_ATTRIBUTE]}`);
            return;
          }

          if (name === 'ai.streamText') {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.pipeline.stream_text');
            return;
          }

          if (name === 'ai.streamText.doStream') {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.stream_text');
            span.updateName(`stream_text ${attributes[AI_MODEL_ID_ATTRIBUTE]}`);
            return;
          }

          if (name === 'ai.generateObject') {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.pipeline.generate_object');
            return;
          }

          if (name === 'ai.generateObject.doGenerate') {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.generate_object');
            span.updateName(`generate_object ${attributes[AI_MODEL_ID_ATTRIBUTE]}`);
            return;
          }

          if (name === 'ai.streamObject') {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.pipeline.stream_object');
            return;
          }

          if (name === 'ai.streamObject.doStream') {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.stream_object');
            span.updateName(`stream_object ${attributes[AI_MODEL_ID_ATTRIBUTE]}`);
            return;
          }

          if (name === 'ai.embed') {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.pipeline.embed');
            return;
          }

          if (name === 'ai.embed.doEmbed') {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.embed');
            span.updateName(`embed ${attributes[AI_MODEL_ID_ATTRIBUTE]}`);
            return;
          }

          if (name === 'ai.embedMany') {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.pipeline.embed_many');
            return;
          }

          if (name === 'ai.embedMany.doEmbed') {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.embed_many');
            span.updateName(`embed_many ${attributes[AI_MODEL_ID_ATTRIBUTE]}`);
            return;
          }

          if (name.startsWith('ai.stream')) {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.run');
            return;
          }
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
                delete attributes[AI_USAGE_COMPLETION_TOKENS_ATTRIBUTE];
              }
              if (attributes[AI_USAGE_PROMPT_TOKENS_ATTRIBUTE] != undefined) {
                attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE] = attributes[AI_USAGE_PROMPT_TOKENS_ATTRIBUTE];
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
