import type { ClientOptions } from '../types/options';
import { consoleSandbox } from './debug-logger';

/**
 * Warns about `beforeSendTransaction` and `ignoreTransactions` being ignored because span streaming is enabled.
 *
 * Both options are tied to the transaction event that span streaming no longer produces, so they silently
 * stop taking effect when users upgrade. Since that's easy to miss, this warning bypasses the `debug` logger
 * (which is opt-in and stripped from non-debug bundles) and writes to the console directly.
 *
 * The message is one static string rather than one naming whichever option is set: it ships in every bundle,
 * and interpolating the names costs more gzipped than the rest of this function put together.
 *
 * Must be called after integrations are set up, and only when they were set up at all: `spanStreamingIntegration`
 * may fall back to the static trace lifecycle, in which case the options do take effect and we must stay silent.
 * A client that skips integration setup never sends anything, so it ignores nothing worth warning about.
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
      "[Sentry] `beforeSendTransaction` and `ignoreTransactions` are ignored with span streaming. Use `beforeSendSpan` and `ignoreSpans` instead, or set `traceLifecycle: 'static'`.",
    );
  });
}
