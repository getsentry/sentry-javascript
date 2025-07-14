import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node-core';
import { INTEGRATION_NAME } from './constants';
import { SentryOpenAiInstrumentation } from './instrumentation';
import type { OpenAiOptions } from './types';

export const instrumentOpenAi = generateInstrumentOnce(INTEGRATION_NAME, () => new SentryOpenAiInstrumentation({}));

const _openAiIntegration = ((options: OpenAiOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    options,
    setupOnce() {
      instrumentOpenAi();
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the [openai](https://www.npmjs.com/package/openai) library.
 * This integration is not enabled by default, you need to manually add it.
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *  integrations: [Sentry.openAIIntegration()],
 * });
 * ```
 *
 * This integration automatically instruments all OpenAI client instances and tracks:
 * - Chat completions (`client.chat.completions.create()`)
 * - Responses API (`client.responses.create()`)
 * - Token usage, timing metrics, and error information
 *
 * By default, inputs and outputs are recorded if `sendDefaultPii` is enabled.
 * You can override this behavior using integration options:
 *
 * ```javascript
 * Sentry.init({
 *   integrations: [
 *     Sentry.openAIIntegration({
 *       recordInputs: false,  // Disable input recording
 *       recordOutputs: true,  // Enable output recording
 *     })
 *   ],
 * });
 * ```
 *
 * The integration automatically creates spans for OpenAI operations with attributes like:
 * - `openai.request.model` - The model used
 * - `openai.usage.prompt_tokens` - Input token count
 * - `openai.usage.completion_tokens` - Output token count
 * - `openai.stream.time_to_first_token_ms` - Streaming latency metrics
 */
export const openAIIntegration = defineIntegration(_openAiIntegration);