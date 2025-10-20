import { getClient } from '@sentry/core';
import { instrumentCodexInstance } from './instrumentation';
import type { Codex, CodexConstructor, CodexOptions, OpenAiCodexOptions } from './types';

const OPENAI_CODEX_INTEGRATION_NAME = 'OpenAiCodex';

// Global singleton - only patch once per application instance
let _globalInstrumentedCodex: CodexConstructor | null = null;
let _initPromise: Promise<void> | null = null;

/**
 * Lazily loads and patches the OpenAI Codex SDK.
 * Ensures only one patched instance exists globally.
 */
async function ensurePatchedCodex(): Promise<CodexConstructor> {
  if (_globalInstrumentedCodex) {
    return _globalInstrumentedCodex;
  }

  if (_initPromise) {
    await _initPromise;
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return _globalInstrumentedCodex!;
  }

  _initPromise = (async () => {
    try {
      // Use webpackIgnore to prevent webpack from trying to resolve this at build time
      // The import resolves at runtime from the user's node_modules
      const sdkPath = '@openai/codex-sdk';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const codexSDK: any = await import(/* webpackIgnore: true */ sdkPath);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (!codexSDK || typeof codexSDK.Codex !== 'function') {
        throw new Error(
          "Failed to find 'Codex' class in @openai/codex-sdk.\n" + 'Make sure you have the package installed.',
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      _globalInstrumentedCodex = codexSDK.Codex;
    } catch (error) {
      // Reset state on failure to allow retry on next call
      _initPromise = null;

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred while loading @openai/codex-sdk';

      throw new Error(
        `Failed to instrument OpenAI Codex SDK:\n${errorMessage}\n\n` +
          'Make sure @openai/codex-sdk is installed:\n' +
          '  npm install @openai/codex-sdk\n' +
          '  # or\n' +
          '  yarn add @openai/codex-sdk',
      );
    }
  })();

  await _initPromise;
  return _globalInstrumentedCodex!;
}

/**
 * Creates a Sentry-instrumented Codex instance for the OpenAI Codex SDK.
 *
 * This is a convenience helper that reduces boilerplate to a single line.
 * The SDK is lazily loaded on first use, and instances are instrumented automatically.
 *
 * **Important**: This helper is NOT automatic. You must call it in your code.
 * The OpenAI Codex SDK cannot be automatically instrumented due to ESM module
 * and webpack bundling limitations.
 *
 * @param codexOptions - Options to pass to the Codex constructor
 * @param instrumentationOptions - Optional configuration for this specific agent instance
 * @param instrumentationOptions.name - Custom agent name for differentiation (defaults to 'openai-codex')
 * @param instrumentationOptions.recordInputs - Whether to record input prompts (defaults to sendDefaultPii)
 * @param instrumentationOptions.recordOutputs - Whether to record outputs (defaults to sendDefaultPii)
 * @returns An instrumented Codex instance ready to use
 *
 * @example
 * ```typescript
 * import { createInstrumentedCodex } from '@sentry/node';
 *
 * // Default agent name ('openai-codex')
 * const codex = await createInstrumentedCodex();
 * const thread = codex.startThread();
 * const result = await thread.run('Diagnose the test failure');
 *
 * // Custom agent name for differentiation
 * const devAgent = await createInstrumentedCodex({}, { name: 'dev-agent' });
 * const qaAgent = await createInstrumentedCodex({}, { name: 'qa-agent' });
 *
 * // Streaming mode
 * const thread = codex.startThread();
 * for await (const event of thread.runStreamed('Fix the bug')) {
 *   console.log(event);
 * }
 * ```
 *
 * Configuration is automatically pulled from your `openaiCodexIntegration()` setup:
 *
 * @example
 * ```typescript
 * Sentry.init({
 *   integrations: [
 *     Sentry.openaiCodexIntegration({
 *       recordInputs: true,   // These options are used
 *       recordOutputs: true,  // by createInstrumentedCodex()
 *     })
 *   ]
 * });
 * ```
 */
export async function createInstrumentedCodex(
  codexOptions?: CodexOptions,
  instrumentationOptions: { name?: string; recordInputs?: boolean; recordOutputs?: boolean } = {},
): Promise<Codex> {
  await ensurePatchedCodex();

  if (!_globalInstrumentedCodex) {
    throw new Error('[Sentry] Failed to initialize instrumented OpenAI Codex SDK');
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const CodexConstructor = _globalInstrumentedCodex;

  const client = getClient();
  const integration = client?.getIntegrationByName(OPENAI_CODEX_INTEGRATION_NAME);
  const integrationOptions = ((integration as any)?.options as OpenAiCodexOptions | undefined) || {};

  // Merge options: integration options < instrumentation options
  const finalOptions: OpenAiCodexOptions = {
    ...integrationOptions,
    ...(instrumentationOptions.recordInputs !== undefined && { recordInputs: instrumentationOptions.recordInputs }),
    ...(instrumentationOptions.recordOutputs !== undefined && { recordOutputs: instrumentationOptions.recordOutputs }),
    agentName: instrumentationOptions.name ?? integrationOptions.agentName ?? 'openai-codex',
  };

  // Create instance and instrument it
  const codexInstance = new CodexConstructor(codexOptions);
  return instrumentCodexInstance(codexInstance, finalOptions);
}
