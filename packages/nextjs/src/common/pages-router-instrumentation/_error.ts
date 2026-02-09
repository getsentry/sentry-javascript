import {
  captureException,
  getIsolationScope,
  checkOrSetAlreadyCaught,
  httpRequestToRequestData,
  withScope,
} from '@sentry/core';
import type { NextPageContext } from 'next';
import { flushSafelyWithTimeout, waitUntil } from '../utils/responseEnd';

type ContextOrProps = {
  req?: NextPageContext['req'];
  res?: NextPageContext['res'];
  err?: NextPageContext['err'] | string;
  pathname?: string;
  statusCode?: number;
};

/**
 * Capture the exception passed by nextjs to the `_error` page, adding context data as appropriate.
 *
 * This will not capture the exception if the status code is < 500 or if the pathname is not provided and will thus not return an event ID.
 *
 * @param contextOrProps The data passed to either `getInitialProps` or `render` by nextjs
 * @returns The Sentry event ID, or `undefined` if no event was captured
 */
export async function captureUnderscoreErrorException(contextOrProps: ContextOrProps): Promise<string | undefined> {
  const { req, res, err } = contextOrProps;

  // 404s (and other 400-y friends) can trigger `_error`, but we don't want to send them to Sentry
  const statusCode = res?.statusCode || contextOrProps.statusCode;
  if (statusCode && statusCode < 500) {
    return;
  }

  // In previous versions of the suggested `_error.js` page in which this function is meant to be used, there was a
  // workaround for https://github.com/vercel/next.js/issues/8592 which involved an extra call to this function, in the
  // custom error component's `render` method, just in case it hadn't been called by `getInitialProps`. Now that that
  // issue has been fixed, the second call is unnecessary, but since it lives in user code rather than our code, users
  // have to be the ones to get rid of it, and guaraneteedly, not all of them will. So, rather than capture the error
  // twice, we just bail if we sense we're in that now-extraneous second call. (We can tell which function we're in
  // because Nextjs passes `pathname` to `getInitialProps` but not to `render`.)
  if (!contextOrProps.pathname) {
    return;
  }

  // If the error was already captured (e.g., by wrapped functions in data fetchers),
  // return the existing event ID instead of capturing it again (needed for lastEventId() to work)
  if (err && checkOrSetAlreadyCaught(err)) {
    waitUntil(flushSafelyWithTimeout());
    return getIsolationScope().lastEventId();
  }

  const eventId = withScope(scope => {
    if (req) {
      const normalizedRequest = httpRequestToRequestData(req);
      scope.setSDKProcessingMetadata({ normalizedRequest });
    }

    // If third-party libraries (or users themselves) throw something falsy, we want to capture it as a message (which
    // is what passing a string to `captureException` will wind up doing)
    return captureException(err || `_error.js called with falsy error (${err})`, {
      mechanism: {
        type: 'auto.function.nextjs.underscore_error',
        handled: false,
        data: {
          function: '_error.getInitialProps',
        },
      },
    });
  });

  waitUntil(flushSafelyWithTimeout());

  return eventId;
}
