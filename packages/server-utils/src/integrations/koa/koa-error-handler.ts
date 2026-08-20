import type { Span } from '@sentry/core';
import { addNonEnumerableProperty, captureException, withActiveSpan } from '@sentry/core';

// Marks a koa app as already carrying the Sentry error listener, so repeat
// attachments only ever register a single listener — whether reached via the
// `callback` channel or a lingering manual `setupKoaErrorHandler` call.
const ERROR_HANDLER_ATTACHED = '__SENTRY_KOA_ERROR_HANDLER_ATTACHED__';

/**
 * Key under which the koa instrumentation stashes the request's active span on
 * the koa `ctx`. Koa emits its `error` event from `handleRequest`'s `.catch()`,
 * *after* the middleware chain has unwound and no span is active — so we capture
 * within this stashed span to keep the error linked to the request's trace.
 */
export const KOA_CONTEXT_SPAN = '__SENTRY_KOA_SPAN__';

/** The subset of a koa `Application` the error handler needs (it extends `EventEmitter`). */
export interface KoaApp {
  on(event: 'error', listener: (error: unknown, context?: unknown) => void): unknown;
  [key: string]: unknown;
}

type MarkedKoaApp = KoaApp & { [ERROR_HANDLER_ATTACHED]?: boolean };

/**
 * Attach a Sentry error listener to a koa app's `error` event.
 *
 * Koa emits `'error'` for every request error that bubbles up unhandled, so a
 * single `app.on('error')` listener captures the same errors a top-level
 * try/catch middleware would — without depending on middleware order. The error
 * is captured within the request's koa span (stashed on the koa `ctx` under
 * {@link KOA_CONTEXT_SPAN}) so it keeps its trace linkage, since koa emits the
 * event after the middleware spans have already ended.
 *
 * Idempotent — the app is marked so auto-registration (via the `callback`
 * channel) and any explicit `setupKoaErrorHandler` call never stack up multiple
 * listeners.
 *
 * @deprecated Internal. The error handler is registered automatically by the koa
 * instrumentation; there is no need to call this directly. It is exported only
 * so the deprecated `setupKoaErrorHandler` can delegate to it, and will be
 * removed in a future major version.
 */
export function attachKoaErrorHandler(app: KoaApp): void {
  const markedApp = app as MarkedKoaApp;
  if (!markedApp || typeof markedApp.on !== 'function' || markedApp[ERROR_HANDLER_ATTACHED]) {
    return;
  }
  addNonEnumerableProperty(markedApp, ERROR_HANDLER_ATTACHED, true);

  markedApp.on('error', (error: unknown, context?: unknown) => {
    const span = (context as { [KOA_CONTEXT_SPAN]?: Span } | undefined)?.[KOA_CONTEXT_SPAN];
    const capture = (): void => {
      captureException(error, {
        mechanism: {
          type: 'auto.middleware.koa',
          handled: false,
        },
      });
    };

    if (span) {
      withActiveSpan(span, capture);
    } else {
      capture();
    }
  });
}
