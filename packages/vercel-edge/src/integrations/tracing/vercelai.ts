/**
 * This is a copy of the Vercel AI integration from the node SDK.
 *
 * The only difference is that it does not use `@opentelemetry/instrumentation`
 * because Cloudflare Workers do not support it.
 *
 * Therefore, we cannot automatically patch setting `experimental_telemetry: { isEnabled: true }`
 * and users have to manually set this to get spans.
 */

import type { IntegrationFn } from '@sentry/core';
import { addVercelAiProcessors, defineIntegration } from '@sentry/core';
import type { VercelAiOptions } from './vercelai-types';

const INTEGRATION_NAME = 'VercelAI';

const _vercelAIIntegration = ((options: VercelAiOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    options,
    setup(client) {
      addVercelAiProcessors(client);
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the [ai](https://www.npmjs.com/package/ai) library.
 * This integration is not enabled by default, you need to manually add it.
 *
 * For more information, see the [`ai` documentation](https://sdk.vercel.ai/docs/ai-sdk-core/telemetry).
 *
 * @example
 * ```javascript
 * const Sentry = require('@sentry/vercel-edge');
 *
 * Sentry.init({
 *  integrations: [Sentry.vercelAIIntegration()],
 * });
 * ```
 *
 * You can configure the integration with options to set default recording preferences:
 *
 * ```javascript
 * Sentry.init({
 *   integrations: [
 *     Sentry.vercelAIIntegration({
 *       recordInputs: true,
 *       recordOutputs: true,
 *     }),
 *   ],
 * });
 * ```
 *
 * You need to enable collecting spans for a specific call by setting
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
