/**
 * This is a copy of the Vercel AI integration from the node SDK.
 *
 * The only difference is that it does not use `@opentelemetry/instrumentation`
 * because Cloudflare Workers do not support it.
 *
 * Therefore, we cannot automatically patch setting `experimental_telemetry: { isEnabled: true }`
 * and users have to manually  these to get spans.
 */

/* eslint-disable @typescript-eslint/no-dynamic-delete */
/* eslint-disable complexity */
import type { Client, IntegrationFn } from '@sentry/core';
import { defineIntegration, SEMANTIC_ATTRIBUTE_SENTRY_OP, spanToJSON } from '@sentry/core';
import { addOriginToSpan } from '../../../utils/addOriginToSpan';
import type { modulesIntegration } from '../../modules';
import {
  AI_MODEL_ID_ATTRIBUTE,
  AI_MODEL_PROVIDER_ATTRIBUTE,
  AI_PROMPT_ATTRIBUTE,
  AI_PROMPT_MESSAGES_ATTRIBUTE,
  AI_PROMPT_TOOLS_ATTRIBUTE,
  AI_RESPONSE_TEXT_ATTRIBUTE,
  AI_RESPONSE_TOOL_CALLS_ATTRIBUTE,
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
import type { VercelAiOptions } from './types';

/**
 * Determines if the integration should be forced based on environment and package availability.
 * Returns true if the 'ai' package is available.
 */
function shouldForceIntegration(client: Client): boolean {
  const modules = client.getIntegrationByName<ReturnType<typeof modulesIntegration>>('Modules');
  return !!modules?.getModules?.()?.ai;
}

const _vercelAIIntegration = ((options: VercelAiOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    options,
    afterAllSetup(client) {
      function registerProcessors(): void {
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
            span.setAttribute('gen_ai.tool.call.id', attributes[AI_TOOL_CALL_ID_ATTRIBUTE]);
            span.setAttribute('gen_ai.tool.name', attributes[AI_TOOL_CALL_NAME_ATTRIBUTE]);
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
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
            return;
          }

          if (name === 'ai.generateText.doGenerate') {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.generate_text');
            span.updateName(`generate_text ${attributes[AI_MODEL_ID_ATTRIBUTE]}`);
            return;
          }

          if (name === 'ai.streamText') {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
            return;
          }

          if (name === 'ai.streamText.doStream') {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.stream_text');
            span.updateName(`stream_text ${attributes[AI_MODEL_ID_ATTRIBUTE]}`);
            return;
          }

          if (name === 'ai.generateObject') {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
            return;
          }

          if (name === 'ai.generateObject.doGenerate') {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.generate_object');
            span.updateName(`generate_object ${attributes[AI_MODEL_ID_ATTRIBUTE]}`);
            return;
          }

          if (name === 'ai.streamObject') {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
            return;
          }

          if (name === 'ai.streamObject.doStream') {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.stream_object');
            span.updateName(`stream_object ${attributes[AI_MODEL_ID_ATTRIBUTE]}`);
            return;
          }

          if (name === 'ai.embed') {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
            return;
          }

          if (name === 'ai.embed.doEmbed') {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.embed');
            span.updateName(`embed ${attributes[AI_MODEL_ID_ATTRIBUTE]}`);
            return;
          }

          if (name === 'ai.embedMany') {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'gen_ai.invoke_agent');
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

              renameAttributeKey(
                attributes,
                AI_USAGE_COMPLETION_TOKENS_ATTRIBUTE,
                GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE,
              );
              renameAttributeKey(attributes, AI_USAGE_PROMPT_TOKENS_ATTRIBUTE, GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE);
              if (
                typeof attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE] === 'number' &&
                typeof attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE] === 'number'
              ) {
                attributes['gen_ai.usage.total_tokens'] =
                  attributes[GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE] + attributes[GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE];
              }

              // Rename AI SDK attributes to standardized gen_ai attributes
              renameAttributeKey(attributes, AI_PROMPT_MESSAGES_ATTRIBUTE, 'gen_ai.request.messages');
              renameAttributeKey(attributes, AI_RESPONSE_TEXT_ATTRIBUTE, 'gen_ai.response.text');
              renameAttributeKey(attributes, AI_RESPONSE_TOOL_CALLS_ATTRIBUTE, 'gen_ai.response.tool_calls');
              renameAttributeKey(attributes, AI_PROMPT_TOOLS_ATTRIBUTE, 'gen_ai.request.available_tools');
            }
          }

          return event;
        });
      }

      // Auto-detect if we should force the integration when running with 'ai' package available
      // Note that this can only be detected if the 'Modules' integration is available, and running in CJS mode
      const shouldForce = options.force ?? shouldForceIntegration(client);

      if (shouldForce) {
        registerProcessors();
      }
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
 * const Sentry = require('@sentry/cloudflare');
 *
 * Sentry.init({
 *  integrations: [Sentry.vercelAIIntegration()],
 * });
 * ```
 *
 * The integration automatically detects when to force registration in CommonJS environments
 * when the 'ai' package is available. You can still manually set the `force` option if needed.
 *
 * Unlike the Vercel AI integration in the node SDK, this integration does not add tracing support to
 * `ai` function calls. You need to enable collecting spans for a specific call by setting
 * `experimental_telemetry.isEnabled` to `true` in the first argument of the function call.
 *
 * ```javascript
 * const result = await generateText({
 *   model: openai('gpt-4-turbo'),
 *   experimental_telemetry: { isEnabled: true },
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

/**
 * Renames an attribute key in the provided attributes object if the old key exists.
 * This function safely handles null and undefined values.
 */
function renameAttributeKey(attributes: Record<string, unknown>, oldKey: string, newKey: string): void {
  if (attributes[oldKey] != null) {
    attributes[newKey] = attributes[oldKey];
    delete attributes[oldKey];
  }
}
