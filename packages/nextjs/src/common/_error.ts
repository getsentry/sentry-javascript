import { captureException, getCurrentHub, withScope } from '@sentry/core';
import { addExceptionMechanism } from '@sentry/utils';
import type { NextPageContext } from 'next';

type ContextOrProps = {
  req?: NextPageContext['req'];
  res?: NextPageContext['res'];
  err?: NextPageContext['err'] | string;
  pathname?: string;
  statusCode?: number;
};

/** Platform-agnostic version of `flush` */
function flush(timeout?: number): PromiseLike<boolean> {
  const client = getCurrentHub().getClient();
  return client ? client.flush(timeout) : Promise.resolve(false);
}

/**
 * Capture the exception passed by nextjs to the `_error` page, adding context data as appropriate.
 *
 * @param contextOrProps The data passed to either `getInitialProps` or `render` by nextjs
 */
export async function captureUnderscoreErrorException(contextOrProps: ContextOrProps): Promise<void> {
  const { req, res, err } = contextOrProps;

  // 404s (and other 400-y friends) can trigger `_error`, but we don't want to send them to Sentry
  const statusCode = (res && res.statusCode) || contextOrProps.statusCode;
  if (statusCode && statusCode < 500) {
    return Promise.resolve();
  }

  // In previous versions of the suggested `_error.js` page in which this function is meant to be used, there was a
  // workaround for https://github.com/vercel/next.js/issues/8592 which involved an extra call to this function, in the
  // custom error component's `render` method, just in case it hadn't been called by `getInitialProps`. Now that that
  // issue has been fixed, the second call is unnecessary, but since it lives in user code rather than our code, users
  // have to be the ones to get rid of it, and guaraneteedly, not all of them will. So, rather than capture the error
  // twice, we just bail if we sense we're in that now-extraneous second call. (We can tell which function we're in
  // because Nextjs passes `pathname` to `getInitialProps` but not to `render`.)
  if (!contextOrProps.pathname) {
    return Promise.resolve();
  }

  withScope(scope => {
    scope.addEventProcessor(event => {
      addExceptionMechanism(event, {
        type: 'instrument',
        handled: true,
        data: {
          function: '_error.getInitialProps',
        },
      });
      return event;
    });

    if (req) {
      scope.setSDKProcessingMetadata({ request: req });
    }

    // If third-party libraries (or users themselves) throw something falsy, we want to capture it as a message (which
    // is what passing a string to `captureException` will wind up doing)
    captureException(err || `_error.js called with falsy error (${err})`);
  });

  // In case this is being run as part of a serverless function (as is the case with the server half of nextjs apps
  // deployed to vercel), make sure the error gets sent to Sentry before the lambda exits.
  await flush(2000);
}
