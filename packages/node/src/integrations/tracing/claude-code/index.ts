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
 * Instruments `query` from `@anthropic-ai/claude-agent-sdk` to capture spans.
 *
 * **Important**: Initialize Sentry BEFORE importing `@anthropic-ai/claude-agent-sdk`.
 *
 * Options:
 * - `recordInputs`: Record prompt messages (default: `sendDefaultPii` setting)
 * - `recordOutputs`: Record responses/tool outputs (default: `sendDefaultPii` setting)
 * - `agentName`: Custom agent name (default: 'claude-code')
 */
export const claudeCodeAgentSdkIntegration = defineIntegration(_claudeCodeAgentSdkIntegration);
