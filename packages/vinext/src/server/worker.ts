import type { EventProcessor } from '@sentry/core';
import { applySdkMetadata, getClient, getGlobalScope } from '@sentry/core';

/**
 * Inits the Sentry vinext SDK on Cloudflare Workers.
 *
 * On Cloudflare Workers, users should use the `withSentry` wrapper from `@sentry/cloudflare`
 * to initialize the SDK within the Worker's fetch handler. This function applies vinext-specific
 * event processors after the Cloudflare SDK has been initialized.
 *
 * @example
 * ```ts
 * // worker/index.ts (Cloudflare Workers entry)
 * import { withSentry } from '@sentry/cloudflare';
 *
 * export default withSentry(
 *   (env) => ({ dsn: env.SENTRY_DSN }),
 *   { fetch(request, env, ctx) { ... } }
 * );
 * ```
 *
 * Then call `applyVinextEventProcessors()` in the `register()` callback
 * of your `instrumentation.ts`.
 */
export function applyVinextEventProcessors(): void {
  if (sdkAlreadyInitialized()) {
    applyProcessors();
  }
}

function applyProcessors(): void {
  applySdkMetadata({}, 'vinext', ['vinext', 'cloudflare']);

  getGlobalScope().addEventProcessor(
    Object.assign(
      (event => {
        if (event.type === 'transaction') {
          if (event.transaction?.match(/\/__vinext\//)) {
            return null;
          }

          if (
            event.transaction === '/404' ||
            event.transaction?.match(/^(GET|HEAD|POST|PUT|DELETE|CONNECT|OPTIONS|TRACE|PATCH) \/(404|_not-found)$/)
          ) {
            return null;
          }
        }

        return event;
      }) satisfies EventProcessor,
      { id: 'VinextWorkerLowQualityTransactionsFilter' },
    ),
  );

  getGlobalScope().addEventProcessor(
    Object.assign(
      ((event, hint) => {
        if (event.type !== undefined) {
          return event;
        }

        const originalException = hint.originalException;

        const isPostponeError =
          typeof originalException === 'object' &&
          originalException !== null &&
          '$$typeof' in originalException &&
          originalException.$$typeof === Symbol.for('react.postpone');

        if (isPostponeError) {
          return null;
        }

        const exceptionMessage = event.exception?.values?.[0]?.value;
        if (
          exceptionMessage?.includes('Suspense Exception: This is not a real error!') ||
          exceptionMessage?.includes('Suspense Exception: This is not a real error, and should not leak')
        ) {
          return null;
        }

        return event;
      }) satisfies EventProcessor,
      { id: 'VinextWorkerDropReactControlFlowErrors' },
    ),
  );
}

function sdkAlreadyInitialized(): boolean {
  return !!getClient();
}

// We don't provide a standalone `init()` for Workers because
// `@sentry/cloudflare` provides `withSentry()` which handles initialization.
// Re-export cloudflare utilities for convenience.
export { withSentry, wrapRequestHandler } from '@sentry/cloudflare';
