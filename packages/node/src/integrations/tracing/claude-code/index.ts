import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { patchClaudeCodeQuery } from './instrumentation';

export interface ClaudeCodeOptions {
  /**
   * Whether to record prompt messages.
   * Defaults to Sentry client's `sendDefaultPii` setting.
   */
  recordInputs?: boolean;

  /**
   * Whether to record response text, tool calls, and tool outputs.
   * Defaults to Sentry client's `sendDefaultPii` setting.
   */
  recordOutputs?: boolean;

  /**
   * Custom agent name to use for this integration.
   * This allows you to differentiate between multiple Claude Code agents in your application.
   * Defaults to 'claude-code'.
   *
   * @example
   * ```typescript
   * const query = createInstrumentedClaudeQuery({ name: 'app-builder' });
   * ```
   */
  agentName?: string;
}

const CLAUDE_CODE_INTEGRATION_NAME = 'ClaudeCode';

const _claudeCodeIntegration = ((options: ClaudeCodeOptions = {}) => {
  return {
    name: CLAUDE_CODE_INTEGRATION_NAME,
    options,
    setupOnce() {
      // Note: Automatic patching via require hooks doesn't work for ESM modules
      // or webpack-bundled dependencies. Users must manually patch using patchClaudeCodeQuery()
      // in their route files.
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the Claude Code SDK.
 *
 * **Important**: Due to ESM module and bundler limitations, this integration requires
 * using the `createInstrumentedClaudeQuery()` helper function in your code.
 * See the example below for proper usage.
 *
 * This integration captures telemetry data following OpenTelemetry Semantic Conventions
 * for Generative AI, including:
 * - Agent invocation spans (`invoke_agent`)
 * - LLM chat spans (`chat`)
 * - Tool execution spans (`execute_tool`)
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
 *     Sentry.claudeCodeIntegration({
 *       recordInputs: true,
 *       recordOutputs: true
 *     })
 *   ],
 * });
 *
 * // Step 2: Use the helper in your routes
 * import { createInstrumentedClaudeQuery } from '@sentry/node';
 *
 * const query = createInstrumentedClaudeQuery();
 *
 * // Use query as normal - automatically instrumented!
 * for await (const message of query({
 *   prompt: 'Hello',
 *   options: { model: 'claude-sonnet-4-5' }
 * })) {
 *   console.log(message);
 * }
 * ```
 *
 * ## Options
 *
 * - `recordInputs`: Whether to record prompt messages (default: respects `sendDefaultPii` client option)
 * - `recordOutputs`: Whether to record response text, tool calls, and outputs (default: respects `sendDefaultPii` client option)
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
 *     Sentry.claudeCodeIntegration({
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
 *     Sentry.claudeCodeIntegration({
 *       recordInputs: false,
 *       recordOutputs: false
 *     })
 *   ],
 * });
 * ```
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/node/ai-monitoring/
 */
export const claudeCodeIntegration = defineIntegration(_claudeCodeIntegration);

/**
 * Manually patch the Claude Code SDK query function with Sentry instrumentation.
 *
 * **Note**: Most users should use `createInstrumentedClaudeQuery()` instead,
 * which is simpler and handles option retrieval automatically.
 *
 * This low-level function is exported for advanced use cases where you need
 * explicit control over the patching process.
 *
 * @param queryFunction - The original query function from @anthropic-ai/claude-agent-sdk
 * @param options - Instrumentation options (recordInputs, recordOutputs)
 * @returns Instrumented query function
 *
 * @see createInstrumentedClaudeQuery for the recommended high-level helper
 */
export { patchClaudeCodeQuery };
