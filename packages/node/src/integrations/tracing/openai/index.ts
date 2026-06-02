import type { IntegrationFn, OpenAiOptions } from '@sentry/core';
import { defineIntegration, OPENAI_INTEGRATION_NAME } from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node-core';
import { SentryOpenAiInstrumentation } from './instrumentation';

export const instrumentOpenAi = generateInstrumentOnce<OpenAiOptions>(
  OPENAI_INTEGRATION_NAME,
  options => new SentryOpenAiInstrumentation(options),
);

const _openAiIntegration = ((options: OpenAiOptions = {}) => {
  return {
    name: OPENAI_INTEGRATION_NAME,
    setupOnce() {
      instrumentOpenAi(options);
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the OpenAI SDK.
 *
 * This integration is enabled by default.
 *
 * When configured, this integration automatically instruments OpenAI SDK client instances
 * to capture telemetry data following OpenTelemetry Semantic Conventions for Generative AI.
 *
 * @example
 * ```javascript
 * import * as Sentry from '@sentry/node';
 *
 * Sentry.init({
 *   integrations: [Sentry.openAIIntegration()],
 * });
 * ```
 *
 * ## Options
 *
 * - `recordInputs`: Whether to record prompt messages (default: follows `sendDefaultPii` or `dataCollection.genAI.inputs`)
 * - `recordOutputs`: Whether to record response text (default: follows `sendDefaultPii` or `dataCollection.genAI.outputs`)
 *
 * ### Default Behavior
 *
 * By default, the integration will:
 * - Record inputs and outputs based on `sendDefaultPii` or `dataCollection.genAI` in your Sentry client options
 * - Integration-level `recordInputs`/`recordOutputs` options take precedence over global config
 *
 * @example
 * ```javascript
 * // Always record inputs and outputs regardless of global dataCollection config
 * Sentry.init({
 *   integrations: [
 *     Sentry.openAIIntegration({
 *       recordInputs: true,
 *       recordOutputs: true
 *     })
 *   ],
 * });
 *
 * // Never record inputs/outputs regardless of global dataCollection config
 * Sentry.init({
 *   dataCollection: { genAI: { inputs: true, outputs: true } },
 *   integrations: [
 *     Sentry.openAIIntegration({
 *       recordInputs: false,
 *       recordOutputs: false
 *     })
 *   ],
 * });
 * ```
 *
 */
export const openAIIntegration = defineIntegration(_openAiIntegration);
