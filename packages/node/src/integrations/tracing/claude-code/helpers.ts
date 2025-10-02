import { getClient } from '@sentry/core';
import { patchClaudeCodeQuery } from './instrumentation';
import type { ClaudeCodeOptions } from './index';

const CLAUDE_CODE_INTEGRATION_NAME = 'ClaudeCode';

// Global singleton - only patch once per application instance
let _globalPatchedQuery: ((...args: unknown[]) => AsyncGenerator<unknown, void, unknown>) | null = null;
let _initPromise: Promise<void> | null = null;

/**
 * Lazily loads and patches the Claude Code SDK.
 * Ensures only one patched instance exists globally.
 */
async function ensurePatchedQuery(): Promise<void> {
  if (_globalPatchedQuery) {
    return;
  }

  if (_initPromise) {
    return _initPromise;
  }

  _initPromise = (async () => {
    try {
      // Use webpackIgnore to prevent webpack from trying to resolve this at build time
      // The import resolves at runtime from the user's node_modules
      const sdkPath = '@anthropic-ai/claude-agent-sdk';
      const claudeSDK = await import(/* webpackIgnore: true */ sdkPath);

      if (!claudeSDK || typeof claudeSDK.query !== 'function') {
        throw new Error(
          `Failed to find 'query' function in @anthropic-ai/claude-agent-sdk.\n` +
            `Make sure you have version >=0.1.0 installed.`,
        );
      }

      const client = getClient();
      const integration = client?.getIntegrationByName(CLAUDE_CODE_INTEGRATION_NAME);
      const options = (integration as any)?.options as ClaudeCodeOptions | undefined || {};

      _globalPatchedQuery = patchClaudeCodeQuery(claudeSDK.query, options);
    } catch (error) {
      // Reset state on failure to allow retry on next call
      _initPromise = null;

      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error occurred while loading @anthropic-ai/claude-agent-sdk';

      throw new Error(
        `Failed to instrument Claude Code SDK:\n${errorMessage}\n\n` +
          `Make sure @anthropic-ai/claude-agent-sdk is installed:\n` +
          `  npm install @anthropic-ai/claude-agent-sdk\n` +
          `  # or\n` +
          `  yarn add @anthropic-ai/claude-agent-sdk`,
      );
    }
  })();

  return _initPromise;
}

/**
 * Creates a Sentry-instrumented query function for the Claude Code SDK.
 *
 * This is a convenience helper that reduces boilerplate to a single line.
 * The SDK is lazily loaded on first query call, and the patched version is cached globally.
 *
 * **Important**: This helper is NOT automatic. You must call it in your code.
 * The Claude Code SDK cannot be automatically instrumented due to ESM module
 * and webpack bundling limitations.
 *
 * @returns An instrumented query function ready to use
 *
 * @example
 * ```typescript
 * import { createInstrumentedClaudeQuery } from '@sentry/node';
 * import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
 *
 * const query = createInstrumentedClaudeQuery();
 *
 * // Use as normal - automatically instrumented!
 * for await (const message of query({
 *   prompt: 'Hello',
 *   options: { model: 'claude-sonnet-4-5' }
 * })) {
 *   console.log(message);
 * }
 * ```
 *
 * Configuration is automatically pulled from your `claudeCodeIntegration()` setup:
 *
 * @example
 * ```typescript
 * Sentry.init({
 *   integrations: [
 *     Sentry.claudeCodeIntegration({
 *       recordInputs: true,   // These options are used
 *       recordOutputs: true,  // by createInstrumentedClaudeQuery()
 *     })
 *   ]
 * });
 * ```
 */
export function createInstrumentedClaudeQuery(): (...args: unknown[]) => AsyncGenerator<unknown, void, unknown> {
  return async function* query(...args: unknown[]): AsyncGenerator<unknown, void, unknown> {
    await ensurePatchedQuery();

    if (!_globalPatchedQuery) {
      throw new Error('[Sentry] Failed to initialize instrumented Claude Code query function');
    }

    yield* _globalPatchedQuery(...args);
  };
}
