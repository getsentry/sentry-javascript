/* eslint-disable complexity */
import { SEMANTIC_ATTRIBUTE_SENTRY_OP, defineIntegration, spanToJSON } from '@sentry/core';
import type { IntegrationFn } from '@sentry/core';
import { generateInstrumentOnce } from '../../../otel/instrument';
import { addOriginToSpan } from '../../../utils/addOriginToSpan';
import { SentryVercelAiInstrumentation, sentryVercelAiPatched } from './instrumentation';

const INTEGRATION_NAME = 'VercelAI';

export const instrumentVercelAi = generateInstrumentOnce(INTEGRATION_NAME, () => new SentryVercelAiInstrumentation({}));

const _vercelAIIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentVercelAi();
    },
    processEvent(event) {
      if (event.type === 'transaction' && event.spans?.length) {
        for (const span of event.spans) {
          const { data: attributes, description: name } = span;

          if (!name || span.origin !== 'auto.vercelai.otel') {
            continue;
          }

          if (attributes['ai.usage.completionTokens'] != undefined) {
            attributes['ai.completion_tokens.used'] = attributes['ai.usage.completionTokens'];
          }
          if (attributes['ai.usage.promptTokens'] != undefined) {
            attributes['ai.prompt_tokens.used'] = attributes['ai.usage.promptTokens'];
          }
          if (
            typeof attributes['ai.usage.completionTokens'] == 'number' &&
            typeof attributes['ai.usage.promptTokens'] == 'number'
          ) {
            attributes['ai.total_tokens.used'] =
              attributes['ai.usage.completionTokens'] + attributes['ai.usage.promptTokens'];
          }
        }
      }

      return event;
    },
    setup(client) {
      client.on('spanStart', span => {
        if (!sentryVercelAiPatched) {
          return;
        }

        const { data: attributes, description: name } = spanToJSON(span);

        if (!name) {
          return;
        }

        // The id of the model
        const aiModelId = attributes['ai.model.id'];

        // the provider of the model
        const aiModelProvider = attributes['ai.model.provider'];

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

        if (attributes['ai.prompt']) {
          span.setAttribute('ai.input_messages', attributes['ai.prompt']);
        }
        if (attributes['ai.model.id']) {
          span.setAttribute('ai.model_id', attributes['ai.model.id']);
        }
        span.setAttribute('ai.streaming', name.includes('stream'));
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
