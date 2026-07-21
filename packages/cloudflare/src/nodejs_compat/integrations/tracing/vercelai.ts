/**
 * This is a copy of the Vercel AI integration from the Cloudflare SDK (src/integrations/tracing/vercelai.ts).
 *
 * The only difference is that it includes tracing channel support
 * because the default Vercel AI integration needs `nodejs_als`, while this one uses `nodejs_compat`.
 */

import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { vercelAiIntegration as serverUtilsVercelAiIntegration, type VercelAiOptions } from '@sentry/server-utils';
import { vercelAIIntegration as cloudflareVercelAIIntegration } from '../../../integrations/tracing/vercelai';

const _vercelAIIntegration = ((options: VercelAiOptions = {}) => {
  const inner = serverUtilsVercelAiIntegration(options);
  const instrumentation = cloudflareVercelAIIntegration(options);

  return {
    ...inner,
    ...instrumentation,
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the [ai](https://www.npmjs.com/package/ai) library.
 * This integration is not enabled by default, you need to manually add it.
 *
 * For more information, see the [`ai` documentation](https://sdk.vercel.ai/docs/ai-sdk-core/telemetry).
 *
 *  You need to enable collecting spans for a specific call by setting
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
