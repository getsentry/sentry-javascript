import type { IntegrationFn, LangGraphOptions } from '@sentry/core';
import { defineIntegration, LANGGRAPH_INTEGRATION_NAME } from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node-core';
import { SentryLangGraphInstrumentation } from './instrumentation';

export const instrumentLangGraph = generateInstrumentOnce<LangGraphOptions>(
  LANGGRAPH_INTEGRATION_NAME,
  options => new SentryLangGraphInstrumentation(options),
);

const _langGraphIntegration = ((options: LangGraphOptions = {}) => {
  return {
    name: LANGGRAPH_INTEGRATION_NAME,
    setupOnce() {
      instrumentLangGraph(options);
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for LangGraph.
 *
 * This integration is enabled by default.
 *
 * When configured, this integration automatically instruments LangGraph StateGraph and compiled graph instances
 * to capture telemetry data following OpenTelemetry Semantic Conventions for Generative AI.
 *
 * @example
 * ```javascript
 * import * as Sentry from '@sentry/node';
 *
 * Sentry.init({
 *   integrations: [Sentry.langGraphIntegration()],
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
 *     Sentry.langGraphIntegration({
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
 *     Sentry.langGraphIntegration({
 *       recordInputs: false,
 *       recordOutputs: false
 *     })
 *   ],
 * });
 * ```
 *
 * ## Captured Operations
 *
 * The integration captures the following LangGraph operations:
 * - **Agent Creation** (`StateGraph.compile()`) - Creates a `gen_ai.create_agent` span
 * - **Agent Invocation** (`CompiledGraph.invoke()`) - Creates a `gen_ai.invoke_agent` span
 *
 * ## Captured Data
 *
 * When `recordInputs` and `recordOutputs` are enabled, the integration captures:
 * - Input messages from the graph state
 * - Output messages and LLM responses
 * - Tool calls made during agent execution
 * - Agent and graph names
 * - Available tools configured in the graph
 *
 */
export const langGraphIntegration = defineIntegration(_langGraphIntegration);
