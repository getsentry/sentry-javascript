import type { ServerResponse } from 'http';
import { flush, setHttpStatus } from '@sentry/core';
import type { Span } from '@sentry/types';
import { fill, logger } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import type { ResponseEndMethod, WrappedResponseEndMethod } from '../types';

/**
 * Wrap `res.end()` so that it ends the span and flushes events before letting the request finish.
 *
 * Note: This wraps a sync method with an async method. While in general that's not a great idea in terms of keeping
 * things in the right order, in this case it's safe, because the native `.end()` actually *is* (effectively) async, and
 * its run actually *is* (literally) awaited, just manually so (which reflects the fact that the core of the
 * request/response code in Node by far predates the introduction of `async`/`await`). When `.end()` is done, it emits
 * the `prefinish` event, and only once that fires does request processing continue. See
 * https://github.com/nodejs/node/commit/7c9b607048f13741173d397795bac37707405ba7.
 *
 * Also note: `res.end()` isn't called until *after* all response data and headers have been sent, so blocking inside of
 * `end` doesn't delay data getting to the end user. See
 * https://nodejs.org/api/http.html#responseenddata-encoding-callback.
 *
 * @param span The span tracking the request
 * @param res: The request's corresponding response
 */
export function autoEndSpanOnResponseEnd(span: Span, res: ServerResponse): void {
  const wrapEndMethod = (origEnd: ResponseEndMethod): WrappedResponseEndMethod => {
    return function sentryWrappedEnd(this: ServerResponse, ...args: unknown[]) {
      finishSpan(span, this);
      return origEnd.call(this, ...args);
    };
  };

  // Prevent double-wrapping
  // res.end may be undefined during build when using `next export` to statically export a Next.js app
  if (res.end && !(res.end as WrappedResponseEndMethod).__sentry_original__) {
    fill(res, 'end', wrapEndMethod);
  }
}

/** Finish the given response's span and set HTTP status data */
export function finishSpan(span: Span, res: ServerResponse): void {
  setHttpStatus(span, res.statusCode);
  span.end();
}

/** Flush the event queue to ensure that events get sent to Sentry before the response is finished and the lambda ends */
export async function flushQueue(): Promise<void> {
  try {
    DEBUG_BUILD && logger.log('Flushing events...');
    await flush(2000);
    DEBUG_BUILD && logger.log('Done flushing events');
  } catch (e) {
    DEBUG_BUILD && logger.log('Error while flushing events:\n', e);
  }
}
