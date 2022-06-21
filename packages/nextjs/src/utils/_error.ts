import { captureException, withScope } from '@sentry/core';
import { getCurrentHub } from '@sentry/hub';
import { addExceptionMechanism, addRequestDataToEvent, objectify } from '@sentry/utils';
import { NextPageContext } from 'next';

type ContextOrProps = {
  [key: string]: unknown;
  req?: NextPageContext['req'];
  res?: NextPageContext['res'];
  err?: NextPageContext['err'] | string;
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

  // Nextjs only passes the pathname in the context data given to `getInitialProps`, not the main render function, but
  // unlike `req` and `res`, for which that also applies, it passes it on both server and client.
  //
  // TODO: This check is only necessary because of the workaround for https://github.com/vercel/next.js/issues/8592
  // explained below. Once that's fixed, we'll have to keep the `inGetInitialProps` check, because lots of people will
  // still call this function in their custom error component's `render` function, but we can get rid of the check for
  // `err` and just always bail if we're not in `getInitialProps`.
  const inGetInitialProps = contextOrProps.pathname !== undefined;
  if (!inGetInitialProps && !err) {
    return Promise.resolve();
  }

  withScope(scope => {
    scope.addEventProcessor(event => {
      addExceptionMechanism(event, {
        type: 'instrument',
        handled: true,
        data: {
          // TODO: Get rid of second half of ternary once https://github.com/vercel/next.js/issues/8592 is fixed.
          function: inGetInitialProps ? '_error.getInitialProps' : '_error.customErrorComponent',
        },
      });
      return event;
    });

    if (req) {
      scope.addEventProcessor(event => addRequestDataToEvent(event, req));
    }

    // If third-party libraries (or users themselves) throw something falsy, we want to capture it as a message (which
    // is what passing a string to `captureException` will wind up doing)
    const finalError = err || `_error.js called with falsy error (${err})`;

    // In case we have a primitive, wrap it in the equivalent wrapper class (string -> String, etc.) so that we can
    // store a seen flag on it. (Because of https://github.com/vercel/next.js/issues/8592, it can happen that the custom
    // error component's `getInitialProps` won't have run, so we have people call this function in their error
    // component's main render function in addition to in its `getInitialProps`, just in case. By forcing it to be an
    // object, we can flag it as seen, so that if we hit this a second time, we can no-op.)
    captureException(objectify(finalError));
  });

  // In case this is being run as part of a serverless function (as is the case with the server half of nextjs apps
  // deployed to vercel), make sure the error gets sent to Sentry before the lambda exits.
  await flush(2000);
}
