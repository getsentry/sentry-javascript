import { getClient } from '@sentry/core';
import type { ClaudeCodeOptions } from './index';
import { patchClaudeCodeQuery } from './instrumentation';

const CLAUDE_CODE_INTEGRATION_NAME = 'ClaudeCode';

export interface ClaudeCodeProviderOptions {
  agentName?: string;
  recordInputs?: boolean;
  recordOutputs?: boolean;
}

/**
 * Creates an instrumented query function for use with the AI SDK provider's queryFunction option.
 *
 * @example
 * ```typescript
 * import * as Sentry from '@sentry/node';
 * import { createInstrumentedQueryForProvider } from '@sentry/node';
 * import { query } from '@anthropic-ai/claude-agent-sdk';
 * import { claudeCode } from 'ai-sdk-provider-claude-code';
 * import { generateText } from 'ai';
 *
 * Sentry.init({
 *   dsn: 'your-dsn',
 *   integrations: [Sentry.claudeCodeIntegration({
 *     recordInputs: true,
 *     recordOutputs: true
 *   })],
 * });
 *
 * // Create instrumented query function
 * const instrumentedQuery = createInstrumentedQueryForProvider(query);
 *
 * // Use it with the AI SDK provider
 * const model = claudeCode('sonnet', {
 *   queryFunction: instrumentedQuery
 * });
 *
 * const result = await generateText({
 *   model,
 *   prompt: 'Hello'
 * });
 * ```
 */
export function createInstrumentedQueryForProvider(
  queryFunction: (...args: unknown[]) => AsyncGenerator<unknown, void, unknown>,
  options: ClaudeCodeProviderOptions = {},
): (...args: unknown[]) => AsyncGenerator<unknown, void, unknown> {
  const client = getClient();
  const integration = client?.getIntegrationByName(CLAUDE_CODE_INTEGRATION_NAME);
  const integrationOptions = ((integration as unknown as { options: ClaudeCodeOptions })?.options || {}) || {};

  const patchOptions: ClaudeCodeOptions = {
    recordInputs: options.recordInputs ?? integrationOptions.recordInputs,
    recordOutputs: options.recordOutputs ?? integrationOptions.recordOutputs,
    agentName: options.agentName ?? integrationOptions.agentName ?? 'claude-code',
  };

  return patchClaudeCodeQuery(queryFunction, patchOptions);
}
