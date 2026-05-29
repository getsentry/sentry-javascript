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
 *     Sentry.anthropicAIIntegration({
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
