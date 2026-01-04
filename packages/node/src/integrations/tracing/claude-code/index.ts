import type { IntegrationFn } from '@sentry/core';
import { defineIntegration } from '@sentry/core';
import { generateInstrumentOnce } from '@sentry/node-core';
import { SentryClaudeCodeAgentSdkInstrumentation } from './instrumentation';
import type { ClaudeCodeOptions } from './types';

export type { ClaudeCodeOptions } from './types';
export { patchClaudeCodeQuery } from './helpers';

export const CLAUDE_CODE_AGENT_SDK_INTEGRATION_NAME = 'ClaudeCodeAgentSdk';

/**
 * Instruments the Claude Code Agent SDK using OpenTelemetry.
 * This is called automatically when the integration is added to Sentry.
 */
export const instrumentClaudeCodeAgentSdk = generateInstrumentOnce<ClaudeCodeOptions>(
  CLAUDE_CODE_AGENT_SDK_INTEGRATION_NAME,
  options => new SentryClaudeCodeAgentSdkInstrumentation(options),
);

const _claudeCodeAgentSdkIntegration = ((options: ClaudeCodeOptions = {}) => {
  return {
    name: CLAUDE_CODE_AGENT_SDK_INTEGRATION_NAME,
    setupOnce() {
      instrumentClaudeCodeAgentSdk(options);
    },
  };
}) satisfies IntegrationFn;

/**
 * Adds Sentry tracing instrumentation for the Claude Code Agent SDK.
 *
 * This integration automatically instruments the `query` function from
 * `@anthropic-ai/claude-agent-sdk` to capture telemetry data following
 * OpenTelemetry Semantic Conventions for Generative AI.
 *
 * **Important**: Sentry must be initialized BEFORE importing `@anthropic-ai/claude-agent-sdk`.
 *
 * @example
 * ```typescript
 * // Initialize Sentry FIRST
 * import * as Sentry from '@sentry/node';
 *
 * Sentry.init({
 *   dsn: 'your-dsn',
 *   integrations: [
 *     Sentry.claudeCodeAgentSdkIntegration({
 *       recordInputs: true,
 *       recordOutputs: true
 *     })
 *   ],
 * });
 *
 * // THEN import the SDK - it will be automatically instrumented!
 * import { query } from '@anthropic-ai/claude-agent-sdk';
 *
 * // Use query as normal - spans are created automatically
 * for await (const message of query({
 *   prompt: 'Hello',
 *   options: { model: 'claude-sonnet-4-20250514' }
 * })) {
 *   console.log(message);
 * }
 * ```
 *
 * ## Captured Telemetry
 *
 * This integration captures:
 * - Agent invocation spans (`gen_ai.invoke_agent`)
 * - LLM chat spans (`gen_ai.chat`)
 * - Tool execution spans (`gen_ai.execute_tool`)
 * - Token usage, model info, and session tracking
 *
 * ## Options
 *
 * - `recordInputs`: Whether to record prompt messages (default: respects `sendDefaultPii` client option)
 * - `recordOutputs`: Whether to record response text, tool calls, and outputs (default: respects `sendDefaultPii` client option)
 * - `agentName`: Custom agent name for differentiation (default: 'claude-code')
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
 *     Sentry.claudeCodeAgentSdkIntegration({
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
 *     Sentry.claudeCodeAgentSdkIntegration({
 *       recordInputs: false,
 *       recordOutputs: false
 *     })
 *   ],
 * });
 *
 * // Custom agent name
 * Sentry.init({
 *   integrations: [
 *     Sentry.claudeCodeAgentSdkIntegration({
 *       agentName: 'my-coding-assistant'
 *     })
 *   ],
 * });
 * ```
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/node/ai-monitoring/
 */
export const claudeCodeAgentSdkIntegration = defineIntegration(_claudeCodeAgentSdkIntegration);
