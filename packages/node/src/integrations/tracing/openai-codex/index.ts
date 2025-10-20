import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { patchCodexConstructor } from './instrumentation';
import type { OpenAiCodexOptions } from './types';

const OPENAI_CODEX_INTEGRATION_NAME = 'OpenAiCodex';

const _openaiCodexIntegration = ((options: OpenAiCodexOptions = {}) => {
  return {
    name: OPENAI_CODEX_INTEGRATION_NAME,
    options,
    setupOnce() {
      // Note: Automatic patching via require hooks doesn't work for ESM modules
      // or webpack-bundled dependencies. Users must manually use createInstrumentedCodex()
      // in their code.
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the OpenAI Codex SDK.
 *
 * **Important**: Due to ESM module and bundler limitations, this integration requires
 * using the `createInstrumentedCodex()` helper function in your code.
 * See the example below for proper usage.
 *
 * This integration captures telemetry data following OpenTelemetry Semantic Conventions
 * for Generative AI, including:
 * - Agent invocation spans (`invoke_agent`)
 * - Chat spans (`chat`) for turn completions
 * - Tool execution spans (`execute_tool`) for commands, web searches, file changes, etc.
 * - Token usage, model info, and session tracking
 *
 * @example
 * ```typescript
 * // Step 1: Configure the integration
 * import * as Sentry from '@sentry/node';
 *
 * Sentry.init({
 *   dsn: 'your-dsn',
 *   integrations: [
 *     Sentry.openaiCodexIntegration({
 *       recordInputs: true,
 *       recordOutputs: true
 *     })
 *   ],
 * });
 *
 * // Step 2: Use the helper in your code
 * import { createInstrumentedCodex } from '@sentry/node';
 *
 * const codex = await createInstrumentedCodex();
 *
 * // Use Codex as normal - automatically instrumented!
 * const thread = codex.startThread();
 * const result = await thread.run('Diagnose the test failure and propose a fix');
 * console.log(result.finalResponse);
 *
 * // Or use streaming mode
 * for await (const event of thread.runStreamed('Fix the bug')) {
 *   if (event.type === 'item.completed') {
 *     console.log('Tool completed:', event.item);
 *   }
 * }
 * ```
 *
 * ## Options
 *
 * - `recordInputs`: Whether to record prompt messages (default: respects `sendDefaultPii` client option)
 * - `recordOutputs`: Whether to record response text, tool calls, and outputs (default: respects `sendDefaultPii` client option)
 * - `agentName`: Custom agent name for differentiation (default: 'openai-codex')
 *
 * ### Default Behavior
 *
 * By default, the integration will:
 * - Record inputs and outputs ONLY if `sendDefaultPii` is set to `true` in your Sentry client options
 * - Otherwise, inputs and outputs are NOT recorded unless explicitly enabled
 *
 * @example
 * ```typescript
 * // Record inputs and outputs when sendDefaultPii is false
 * Sentry.init({
 *   integrations: [
 *     Sentry.openaiCodexIntegration({
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
 *     Sentry.openaiCodexIntegration({
 *       recordInputs: false,
 *       recordOutputs: false
 *     })
 *   ],
 * });
 *
 * // Use custom agent name for multiple agents
 * const devAgent = await createInstrumentedCodex({}, { name: 'dev-agent' });
 * const qaAgent = await createInstrumentedCodex({}, { name: 'qa-agent' });
 * ```
 *
 * ## Captured Events
 *
 * The integration captures the following Codex events as spans:
 *
 * ### Agent Invocation (invoke_agent)
 * - Tracks the entire agent interaction lifecycle
 * - Captures thread ID and session information
 *
 * ### Chat Turns (chat)
 * - Tracks individual turns in the conversation
 * - Captures token usage (input, output, cached tokens)
 * - Records response text (when recordOutputs is enabled)
 *
 * ### Tool Executions (execute_tool)
 * - `command_execution`: Shell commands with exit codes
 * - `file_change`: File modifications with change details
 * - `web_search`: Web search queries
 * - `mcp_tool_call`: MCP tool calls with server/tool names
 * - `agent_message`: Agent messages and reasoning
 * - `todo_list`: Task list management
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/node/ai-monitoring/
 */
export const openaiCodexIntegration = defineIntegration(_openaiCodexIntegration);

/**
 * Manually patch the OpenAI Codex SDK Codex constructor with Sentry instrumentation.
 *
 * **Note**: Most users should use `createInstrumentedCodex()` instead,
 * which is simpler and handles option retrieval automatically.
 *
 * This low-level function is exported for advanced use cases where you need
 * explicit control over the patching process.
 *
 * @param CodexConstructor - The original Codex constructor from @openai/codex-sdk
 * @param options - Instrumentation options (recordInputs, recordOutputs, agentName)
 * @returns Instrumented Codex constructor
 *
 * @see createInstrumentedCodex for the recommended high-level helper
 */
export { patchCodexConstructor };

/**
 * Export the helper function for creating instrumented Codex instances
 */
export { createInstrumentedCodex } from './helpers';

/**
 * Export types for users who need them
 */
export type { OpenAiCodexOptions, Codex, Thread, Turn, StreamedTurn, ThreadEvent, ThreadItem } from './types';
