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
 * - `recordInputs`: Whether to record prompt messages (default: respects `sendDefaultPii` client option)
 * - `recordOutputs`: Whether to record response text (default: respects `sendDefaultPii` client option)
 *
 * ### Default Behavior
 *
 * By default, the integration will:
 * - Record inputs and outputs ONLY if `sendDefaultPii` is set to `true` in your Sentry client options
 * - Otherwise, inputs and outputs are NOT recorded unless explicitly enabled
 *
 * @example
 * ```javascript
 * // Record inputs and outputs when sendDefaultPii is false
 * Sentry.init({
 *   integrations: [
 *     Sentry.openAIIntegration({
 *       recordInputs: true,
 *       recordOutputs: true
 *     })
 *   ],
 * });
 *
 * // Never record inputs/outputs regardless of sendDefaultPii
 * Sentry.init({
 *   sendDefaultPii: true,
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
