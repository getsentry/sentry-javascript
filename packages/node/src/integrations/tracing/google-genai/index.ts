import type { GoogleGenAIOptions, IntegrationFn } from '@sentry/core';
import { defineIntegration, GOOGLE_GENAI_INTEGRATION_NAME } from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node-core';
import { SentryGoogleGenAiInstrumentation } from './instrumentation';

export const instrumentGoogleGenAI = generateInstrumentOnce<GoogleGenAIOptions>(
  GOOGLE_GENAI_INTEGRATION_NAME,
  options => new SentryGoogleGenAiInstrumentation(options),
);

const _googleGenAIIntegration = ((options: GoogleGenAIOptions = {}) => {
  return {
    name: GOOGLE_GENAI_INTEGRATION_NAME,
    setupOnce() {
      instrumentGoogleGenAI(options);
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the Google Generative AI SDK.
 *
 * This integration is enabled by default.
 *
 * When configured, this integration automatically instruments Google GenAI SDK client instances
 * to capture telemetry data following OpenTelemetry Semantic Conventions for Generative AI.
 *
 * @example
 * ```javascript
 * import * as Sentry from '@sentry/node';
 *
 * Sentry.init({
 *   integrations: [Sentry.googleGenAiIntegration()],
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
 *     Sentry.googleGenAiIntegration({
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
 *     Sentry.googleGenAiIntegration({
 *       recordInputs: false,
 *       recordOutputs: false
 *     })
 *   ],
 * });
 * ```
 *
 */
export const googleGenAIIntegration = defineIntegration(_googleGenAIIntegration);
