import type { IntegrationFn, LangChainOptions } from '@sentry/core';
import {
  ANTHROPIC_AI_INTEGRATION_NAME,
  defineIntegration,
  GOOGLE_GENAI_INTEGRATION_NAME,
  LANGCHAIN_INTEGRATION_NAME,
  OPENAI_INTEGRATION_NAME,
} from '@sentry/core';
import { disableIntegrations, generateInstrumentOnce } from '@sentry/node-core';
import { SentryLangChainInstrumentation } from './instrumentation';

export const instrumentLangChain = generateInstrumentOnce<LangChainOptions>(
  LANGCHAIN_INTEGRATION_NAME,
  options => new SentryLangChainInstrumentation(options),
);

const _langChainIntegration = ((options: LangChainOptions = {}) => {
  return {
    name: LANGCHAIN_INTEGRATION_NAME,
    setupOnce() {
      // Disable AI provider integrations to prevent duplicate spans
      // LangChain integration handles instrumentation for all underlying AI providers
      disableIntegrations([OPENAI_INTEGRATION_NAME, ANTHROPIC_AI_INTEGRATION_NAME, GOOGLE_GENAI_INTEGRATION_NAME]);

      instrumentLangChain(options);
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for LangChain.
 *
 * This integration is enabled by default.
 *
 * When configured, this integration automatically instruments LangChain runnable instances
 * to capture telemetry data by injecting Sentry callback handlers into all LangChain calls.
 *
 * **Important:** This integration automatically disables the OpenAI, Anthropic, and Google GenAI
 * integrations to prevent duplicate spans when using LangChain with these providers. LangChain
 * handles the instrumentation for all underlying AI providers.
 *
 * @example
 * ```javascript
 * import * as Sentry from '@sentry/node';
 * import { ChatOpenAI } from '@langchain/openai';
 *
 * Sentry.init({
 *   integrations: [Sentry.langChainIntegration()],
 *   sendDefaultPii: true, // Enable to record inputs/outputs
 * });
 *
 * // LangChain calls are automatically instrumented
 * const model = new ChatOpenAI();
 * await model.invoke("What is the capital of France?");
 * ```
 *
 * ## Manual Callback Handler
 *
 * You can also manually add the Sentry callback handler alongside other callbacks:
 *
 * @example
 * ```javascript
 * import * as Sentry from '@sentry/node';
 * import { ChatOpenAI } from '@langchain/openai';
 *
 * const sentryHandler = Sentry.createLangChainCallbackHandler({
 *   recordInputs: true,
 *   recordOutputs: true
 * });
 *
 * const model = new ChatOpenAI();
 * await model.invoke(
 *   "What is the capital of France?",
 *   { callbacks: [sentryHandler, myOtherCallback] }
 * );
 * ```
 *
 * ## Options
 *
 * - `recordInputs`: Whether to record input messages/prompts (default: respects `sendDefaultPii` client option)
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
 *     Sentry.langChainIntegration({
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
 *     Sentry.langChainIntegration({
 *       recordInputs: false,
 *       recordOutputs: false
 *     })
 *   ],
 * });
 * ```
 *
 * ## Supported Events
 *
 * The integration captures the following LangChain lifecycle events:
 * - LLM/Chat Model: start, end, error
 * - Chain: start, end, error
 * - Tool: start, end, error
 *
 */
export const langChainIntegration = defineIntegration(_langChainIntegration);
