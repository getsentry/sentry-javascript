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
export function maybeWarnAboutIgnoredTransactionOptions(options: ClientOptions): void {
  if (options.traceLifecycle !== 'stream') {
    return;
  }

  const ignoredOptions = [
    // oxlint-disable-next-line typescript/no-deprecated
    options.beforeSendTransaction && '`beforeSendTransaction`',
    // oxlint-disable-next-line typescript/no-deprecated
    options.ignoreTransactions?.length && '`ignoreTransactions`',
  ].filter(Boolean);

  if (!ignoredOptions.length) {
    return;
  }

  consoleSandbox(() => {
    // oxlint-disable-next-line no-console
    console.warn(
      `[Sentry] Your \`Sentry.init()\` options include ${ignoredOptions.join(' and ')}, which are currently ignored by the SDK!
Use \`beforeSendSpan\` and \`ignoreSpans\` instead.
Alternatively, set \`traceLifecycle: 'static'\` to opt out of streaming spans and keep the transaction-based options working.`,
    );
  });
}
