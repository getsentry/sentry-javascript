import type { ClientOptions } from '../types/options';
import { consoleSandbox } from './debug-logger';

/**
 * Warns about `beforeSendTransaction` and `ignoreTransactions` being ignored because span streaming is enabled.
 *
 * Both options are tied to the transaction event that span streaming no longer produces, so they silently
 * stop taking effect when users upgrade. Since that's easy to miss, this warning bypasses the `debug` logger
 * (which is opt-in and stripped from non-debug bundles) and writes to the console directly.
 */
export function maybeWarnAboutIgnoredTransactionOptions(options: ClientOptions): void {
  if (
    options.traceLifecycle !== 'stream' ||
    // oxlint-disable-next-line typescript/no-deprecated
    !(options.beforeSendTransaction || options.ignoreTransactions?.length)
  ) {
    return;
  }

  consoleSandbox(() => {
    // oxlint-disable-next-line no-console
    console.warn(
      "[Sentry] `beforeSendTransaction` and `ignoreTransactions` are ignored with `traceLifecycle: 'stream'` (enabled by default). Use `beforeSendSpan` and `ignoreSpans` instead, or set `traceLifecycle: 'static'`.",
    );
  });
}
