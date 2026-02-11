import type { AnthropicAiOptions, IntegrationFn } from '@sentry/core';
import { ANTHROPIC_AI_INTEGRATION_NAME, defineIntegration } from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node-core';
import { SentryAnthropicAiInstrumentation } from './instrumentation';

export const instrumentAnthropicAi = generateInstrumentOnce<AnthropicAiOptions>(
  ANTHROPIC_AI_INTEGRATION_NAME,
  options => new SentryAnthropicAiInstrumentation(options),
);

const _anthropicAIIntegration = ((options: AnthropicAiOptions = {}) => {
  return {
    name: ANTHROPIC_AI_INTEGRATION_NAME,
    options,
    setupOnce() {
      instrumentAnthropicAi(options);
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the Anthropic AI SDK.
 *
 * This integration is enabled by default.
 *
 * When configured, this integration automatically instruments Anthropic AI SDK client instances
 * to capture telemetry data following OpenTelemetry Semantic Conventions for Generative AI.
 *
 * @example
 * ```javascript
 * import * as Sentry from '@sentry/node';
 *
 * Sentry.init({
 *   integrations: [Sentry.anthropicAIIntegration()],
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
 *     Sentry.anthropicAIIntegration({
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
 *     Sentry.anthropicAIIntegration({
 *       recordInputs: false,
 *       recordOutputs: false
 *     })
 *   ],
 * });
 * ```
 *
 */
export const anthropicAIIntegration = defineIntegration(_anthropicAIIntegration);
