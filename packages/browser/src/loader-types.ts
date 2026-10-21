import type { addBreadcrumb, captureEvent, captureException, captureMessage, Scope } from '@sentry/core';
import type { showReportDialog } from './report-dialog';
import type { forceLoad, init, onLoad } from './sdk';

/** Queued calls are replayed once the SDK loads, so they can't return the SDK method's result. */
type Queued<Fn> = Fn extends (...args: infer Args) => unknown ? (...args: Args) => void : never;

/**
 * The subset of the Sentry browser API that is safe to call on the CDN loader's
 * `window.Sentry` stub before the full SDK has loaded.
 *
 * Any other SDK API needs to be wrapped in `Sentry.onLoad()`. Inside the callback, the full SDK is
 * loaded, so `window.Sentry` can be cast to the full SDK type.
 *
 * @example
 * ```ts
 * import type * as SentryBrowser from '@sentry/browser';
 * import type { LoaderSentry } from '@sentry/browser';
 *
 * declare global {
 *   interface Window {
 *     Sentry: LoaderSentry;
 *   }
 * }
 *
 * window.Sentry.captureException(new Error('Something went wrong'));
 *
 * window.Sentry.onLoad(() => {
 *   const Sentry = window.Sentry as typeof SentryBrowser;
 *   Sentry.init({ release: 'my-app@1.0.0' });
 *   Sentry.addIntegration(Sentry.replayIntegration());
 * });
 * ```
 */
export interface LoaderSentry {
  init: Queued<typeof init>;
  addBreadcrumb: Queued<typeof addBreadcrumb>;
  captureMessage: Queued<typeof captureMessage>;
  captureException: Queued<typeof captureException>;
  captureEvent: Queued<typeof captureEvent>;
  showReportDialog: Queued<typeof showReportDialog>;
  // Only the callback overload: there's no way to get hold of a `Scope` before the SDK has loaded.
  withScope: (callback: (scope: Scope) => void) => void;
  onLoad: typeof onLoad;
  forceLoad: typeof forceLoad;
}
