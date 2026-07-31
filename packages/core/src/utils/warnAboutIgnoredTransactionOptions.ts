import type { ClientOptions } from '../types/options';
import { consoleSandbox } from './debug-logger';

/**
 * Warns about `beforeSendTransaction` and `ignoreTransactions` being ignored because span streaming is enabled.
 *
 * Both options are tied to the transaction event that span streaming no longer produces, so they silently
 * stop taking effect when users upgrade. Since that's easy to miss, this warning bypasses the `debug` logger
 * (which is opt-in and stripped from non-debug bundles) and writes to the console directly.
 *
 * Must be called after integrations are set up: `spanStreamingIntegration` may fall back to the static
 * trace lifecycle, in which case the options do take effect and we must stay silent.
 */
export function warnAboutIgnoredTransactionOptions(options: ClientOptions): void {
  if (options.traceLifecycle !== 'stream') {
    return;
  }

  const ignoredOptions = [
    // eslint-disable-next-line typescript/no-deprecated
    options.beforeSendTransaction && 'beforeSendTransaction',
    // eslint-disable-next-line typescript/no-deprecated
    options.ignoreTransactions?.length && 'ignoreTransactions',
  ].filter(Boolean);

  if (!ignoredOptions.length) {
    return;
  }

  consoleSandbox(() => {
    // eslint-disable-next-line no-console
    console.warn(
      `[Sentry] Your \`Sentry.init()\` options include ${ignoredOptions.map(option => `\`${option}\``).join(' and ')}, which the SDK ignores because span streaming is enabled. ` +
        'Use `beforeSendSpan` and `ignoreSpans` instead. ' +
        "Alternatively, set `traceLifecycle: 'static'` to keep the transaction-based options working until they are removed in v12.",
    );
  });
}
