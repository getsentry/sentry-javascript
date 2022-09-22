import { formatAsCode, nextLogger } from '../../utils/nextLogger';
// We import these types from `withSentry` rather than directly from `next` because our version can work simultaneously
// with multiple versions of next. See note in `withSentry` for more.
import type { NextApiHandler, WrappedNextApiHandler } from './withSentry';
import { withSentry } from './withSentry';

/**
 * Wrap the given API route handler for tracing and error capturing. Thin wrapper around `withSentry`, which only
 * applies it if it hasn't already been applied.
 *
 * @param maybeWrappedHandler The handler exported from the user's API page route file, which may or may not already be
 * wrapped with `withSentry`
 * @param parameterizedRoute The page's route, passed in via the proxy loader
 * @returns The wrapped handler
 */
export function withSentryAPI(
  maybeWrappedHandler: NextApiHandler | WrappedNextApiHandler,
  parameterizedRoute: string,
): WrappedNextApiHandler {
  // Log a warning if the user is still manually wrapping their route in `withSentry`. Doesn't work in cases where
  // there's been an intermediate wrapper (like `withSentryAPI(someOtherWrapper(withSentry(handler)))`) but should catch
  // most cases. Only runs once per route. (Note: Such double-wrapping isn't harmful, but we'll eventually deprecate and remove `withSentry`, so
  // best to get people to stop using it.)
  if (maybeWrappedHandler.name === 'sentryWrappedHandler') {
    const [_sentryNextjs_, _autoWrapOption_, _withSentry_, _route_] = [
      '@sentry/nextjs',
      'autoInstrumentServerFunctions',
      'withSentry',
      parameterizedRoute,
    ].map(phrase => formatAsCode(phrase));

    nextLogger.info(
      `${_sentryNextjs_} is running with the ${_autoWrapOption_} flag set, which means API routes no longer need to ` +
        `be manually wrapped with ${_withSentry_}. Detected manual wrapping in ${_route_}.`,
    );
  }

  return withSentry(maybeWrappedHandler, parameterizedRoute);
}
