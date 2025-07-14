/**
 * OpenAI integration for Cloudflare Workers.
 * 
 * Unlike the Node.js version, this does not use OpenTelemetry instrumentation
 * because Cloudflare Workers do not support it.
 * 
 * Users must manually instrument their OpenAI client using the provided helper function.
 */

import type { IntegrationFn } from '@sentry/core';
import { defineIntegration, instrumentOpenAiClient } from '@sentry/core';

const INTEGRATION_NAME = 'OpenAI';

export interface OpenAiOptions {
  /**
   * Enable or disable input recording. Enabled if `sendDefaultPii` is `true`
   */
  recordInputs?: boolean;
  /**
   * Enable or disable output recording. Enabled if `sendDefaultPii` is `true`
   */
  recordOutputs?: boolean;
}

const _openAiIntegration = ((options: OpenAiOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    options,
    // No automatic setup in Cloudflare Workers - users must manually instrument
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the [openai](https://www.npmjs.com/package/openai) library.
 * This integration is not enabled by default, you need to manually add it.
 *
 * @example
 * ```javascript
 * import { Sentry } from '@sentry/cloudflare';
 * import { instrumentOpenAiClient } from '@sentry/cloudflare';
 * import OpenAI from 'openai';
 *
 * Sentry.init({
 *   integrations: [Sentry.openAIIntegration()],
 * });
 *
 * // Manually instrument your OpenAI client
 * const client = new OpenAI({
 *   apiKey: process.env.OPENAI_API_KEY,
 * });
 * const instrumentedClient = instrumentOpenAiClient(client);
 *
 * // Use the instrumented client
 * const response = await instrumentedClient.chat.completions.create({
 *   model: 'gpt-4',
 *   messages: [{ role: 'user', content: 'Hello!' }],
 * });
 * ```
 *
 * Because Cloudflare Workers do not support OpenTelemetry auto-instrumentation,
 * you must manually wrap your OpenAI client with `instrumentOpenAiClient()`.
 *
 * The integration tracks:
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
 */
export const openAIIntegration = defineIntegration(_openAiIntegration);

// Re-export the proxy function for manual instrumentation
export { instrumentOpenAiClient };