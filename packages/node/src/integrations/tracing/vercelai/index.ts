import type { Client, IntegrationFn } from '@sentry/core';
import { addVercelAiProcessors, defineIntegration } from '@sentry/core';
import { generateInstrumentOnce, type modulesIntegration } from '@sentry/node-core';
import { INTEGRATION_NAME } from './constants';
import { SentryVercelAiInstrumentation } from './instrumentation';
import type { VercelAiOptions } from './types';

export const instrumentVercelAi = generateInstrumentOnce(INTEGRATION_NAME, () => new SentryVercelAiInstrumentation({}));

/**
 * Determines if the integration should be forced based on environment and package availability.
 * Returns true if the 'ai' package is available.
 */
function shouldForceIntegration(client: Client): boolean {
  const modules = client.getIntegrationByName<ReturnType<typeof modulesIntegration>>('Modules');
  return !!modules?.getModules?.()?.ai;
}

const _vercelAIIntegration = ((options: VercelAiOptions = {}) => {
  let instrumentation: undefined | SentryVercelAiInstrumentation;

  return {
    name: INTEGRATION_NAME,
    options,
    setupOnce() {
      instrumentation = instrumentVercelAi();
    },
    afterAllSetup(client) {
      // Auto-detect if we should force the integration when running with 'ai' package available
      // Note that this can only be detected if the 'Modules' integration is available, and running in CJS mode
      const shouldForce = options.force ?? shouldForceIntegration(client);

      if (shouldForce) {
        addVercelAiProcessors(client);
      } else {
        instrumentation?.callWhenPatched(() => addVercelAiProcessors(client));
      }
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
 * const Sentry = require('@sentry/node');
 *
 * Sentry.init({
 *  integrations: [Sentry.vercelAIIntegration()],
 * });
 * ```
 *
 * This integration adds tracing support to all `ai` function calls.
 * You need to opt-in to collecting spans for a specific call,
 * you can do so by setting `experimental_telemetry.isEnabled` to `true` in the first argument of the function call.
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
