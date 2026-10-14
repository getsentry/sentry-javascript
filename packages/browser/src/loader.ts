
type LoaderApi = typeof import('@sentry/core') &
  typeof import('./sdk') &
  typeof import('./report-dialog');

type VoidReturningFunction<T> = T extends (...args: infer Args) => unknown
  ? (...args: Args) => void
  : never;

type LoaderQueuedMethod =
  | 'init'
  | 'addBreadcrumb'
  | 'captureMessage'
  | 'captureException'
  | 'captureEvent'
  | 'withScope'
  | 'showReportDialog';

/**
 * The subset of the Sentry browser API supported by the CDN loader.
 *
 * Queued calls do not synchronously return the result of the underlying SDK
 * method, so their return types are void.
 */
export type LoaderSentry = {
  [Method in LoaderQueuedMethod]: VoidReturningFunction<LoaderApi[Method]>;
} & Pick<LoaderApi, 'onLoad' | 'forceLoad'>;
