import { SEMANTIC_ATTRIBUTE_SENTRY_OP, defineIntegration, spanToJSON } from '@sentry/core';
import type { IntegrationFn } from '@sentry/types';

import { addOriginToSpan } from '../../utils/addOriginToSpan';

const INTEGRATION_NAME = 'VercelAi';

const _vercelAiIntegration = (() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      // TODO: Vercel Instrumentation.
    },

    setup(client) {
      // TODO: Only run if @vercel/ai is installed.
      client.on('spanStart', span => {
        const { data: attributes, description: name } = spanToJSON(span);

        if (!attributes || !name) {
          return;
        }

        // https://sdk.vercel.ai/docs/ai-sdk-core/telemetry#basic-llm-span-information
        if (attributes['ai.model.id'] && attributes['ai.model.provider']) {
          addOriginToSpan(span, 'auto.vercel.ai');

          const aiOperation = name.replace('ai.', '');
          if (aiOperation.includes('embed')) {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.embeddings');
          } else {
            span.setAttribute(SEMANTIC_ATTRIBUTE_SENTRY_OP, 'ai.run');
          }

          if (attributes['ai.prompt']) {
            span.setAttribute('ai.input_messages', attributes['ai.prompt']);
          }
          if (attributes['ai.usage.completionTokens'] != undefined) {
            span.setAttribute('ai.completion_tokens.used', attributes['ai.usage.completionTokens']);
          }
          if (attributes['ai.usage.promptTokens'] != undefined) {
            span.setAttribute('ai.prompt_tokens.used', attributes['ai.usage.promptTokens']);
          }
          if (
            attributes['ai.usage.completionTokens'] != undefined &&
            attributes['ai.usage.promptTokens'] != undefined
          ) {
            span.setAttribute(
              'ai.tokens.used',
              attributes['ai.usage.completionTokens'] + attributes['ai.usage.promptTokens'],
            );
          }
          if (attributes['ai.model.id']) {
            span.setAttribute('ai.model_id', attributes['ai.model.id']);
          }

          span.setAttribute('ai.streaming', name.includes('stream'));
        }
      });
    },
  };
}) satisfies IntegrationFn;

/**
 * Integration for @vercel/ai
 */
export const vercelAiIntegration = defineIntegration(_vercelAiIntegration);
