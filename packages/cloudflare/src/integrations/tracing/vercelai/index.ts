/**
 * This is a copy of the Vercel AI integration from the node SDK.
 *
 * The only difference is that it does not use `@opentelemetry/instrumentation`
 * because Cloudflare Workers do not support it.
 *
 * Therefore, we cannot automatically patch setting `experimental_telemetry: { isEnabled: true }`
 * and users have to manually  these to get spans.
 */

import type { Client, IntegrationFn} from '@sentry/core';
import { defineIntegration,processVercelAiSpan  } from '@sentry/core';
import type { modulesIntegration } from '../../modules';
import { INTEGRATION_NAME } from './constants';
import type { VercelAiOptions } from './types';

/**
 * Determines if the integration should be forced based on environment and package availability.
 * Returns true if the 'ai' package is available.
 */
function shouldRunIntegration(client: Client): boolean {
  const modules = client.getIntegrationByName<ReturnType<typeof modulesIntegration>>('Modules');
  return !!modules?.getModules?.()?.ai;
}

const _vercelAIIntegration = ((options: VercelAiOptions = {}) => {
  return {
    name: INTEGRATION_NAME,
    options,
    setup(client) {
      function registerProcessors(): void {
        client.on('spanEnd', processVercelAiSpan);
      }

      if (options.force || shouldRunIntegration(client)) {
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
