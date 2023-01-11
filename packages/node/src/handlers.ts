/* eslint-disable @typescript-eslint/no-explicit-any */
import { captureException, getCurrentHub, startTransaction, withScope } from '@sentry/core';
import type { Span } from '@sentry/types';
import type { AddRequestDataToEventOptions } from '@sentry/utils';
import {
  addRequestDataToTransaction,
  baggageHeaderToDynamicSamplingContext,
  dropUndefinedKeys,
  extractPathForTransaction,
  extractTraceparentData,
  isString,
  logger,
} from '@sentry/utils';
import * as domain from 'domain';
import type * as http from 'http';

import type { NodeClient } from './client';
import { extractRequestData } from './requestdata';
// TODO (v8 / XXX) Remove this import
import type { ParseRequestOptions } from './requestDataDeprecated';
import { flush, isAutoSessionTrackingEnabled } from './sdk';

/**
 * Express-compatible tracing handler.
 * @see Exposed as `Handlers.tracingHandler`
 */
export function tracingHandler(): (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  next: (error?: any) => void,
) => void {
  return function sentryTracingMiddleware(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    next: (error?: any) => void,
  ): void {
    const hub = getCurrentHub();
    const options = hub.getClient()?.getOptions();

    if (
      !options ||
      options.instrumenter !== 'sentry' ||
      req.method?.toUpperCase() === 'OPTIONS' ||
      req.method?.toUpperCase() === 'HEAD'
    ) {
      return next();
    }

    // TODO: This is the `hasTracingEnabled` check, but we're doing it manually since `@sentry/tracing` isn't a
    // dependency of `@sentry/node`. Long term, that function should probably move to `@sentry/hub.
    if (!('tracesSampleRate' in options) && !('tracesSampler' in options)) {
      __DEBUG_BUILD__ &&
        logger.warn(
          'Sentry `tracingHandler` is being used, but tracing is disabled. Please enable tracing by setting ' +
            'either `tracesSampleRate` or `tracesSampler` in your `Sentry.init()` options.',
        );
      return next();
    }

    // If there is a trace header set, we extract the data from it (parentSpanId, traceId, and sampling decision)
    const traceparentData =
      req.headers && isString(req.headers['sentry-trace']) && extractTraceparentData(req.headers['sentry-trace']);
    const incomingBaggageHeaders = req.headers?.baggage;
    const dynamicSamplingContext = baggageHeaderToDynamicSamplingContext(incomingBaggageHeaders);

    const [name, source] = extractPathForTransaction(req, { path: true, method: true });
    const transaction = startTransaction(
      {
        name,
        op: 'http.server',
        ...traceparentData,
        metadata: {
          dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
          // The request should already have been stored in `scope.sdkProcessingMetadata` (which will become
          // `event.sdkProcessingMetadata` the same way the metadata here will) by `sentryRequestMiddleware`, but on the
          // off chance someone is using `sentryTracingMiddleware` without `sentryRequestMiddleware`, it doesn't hurt to
          // be sure
          request: req,
          source,
        },
      },
      // extra context passed to the tracesSampler
      { request: extractRequestData(req) },
    );

    // We put the transaction on the scope so users can attach children to it
    hub.configureScope(scope => {
      scope.setSpan(transaction);
    });

    // We also set __sentry_transaction on the response so people can grab the transaction there to add
    // spans to it later.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    (res as any).__sentry_transaction = transaction;

    res.once('finish', () => {
      // Push `transaction.finish` to the next event loop so open spans have a chance to finish before the transaction
      // closes
      setImmediate(() => {
        addRequestDataToTransaction(transaction, req);
        transaction.setHttpStatus(res.statusCode);
        transaction.finish();
      });
    });

    next();
  };
}

export type RequestHandlerOptions =
  // TODO (v8 / XXX) Remove ParseRequestOptions type and eslint override
  // eslint-disable-next-line deprecation/deprecation
  | (ParseRequestOptions | AddRequestDataToEventOptions) & {
      flushTimeout?: number;
    };

/**
 * Backwards compatibility shim which can be removed in v8. Forces the given options to follow the
 * `AddRequestDataToEventOptions` interface.
 *
 * TODO (v8): Get rid of this, and stop passing `requestDataOptionsFromExpressHandler` to `setSDKProcessingMetadata`.
 */
function convertReqHandlerOptsToAddReqDataOpts(
  reqHandlerOptions: RequestHandlerOptions = {},
): AddRequestDataToEventOptions | undefined {
  let addRequestDataOptions: AddRequestDataToEventOptions | undefined;

  if ('include' in reqHandlerOptions) {
    addRequestDataOptions = { include: reqHandlerOptions.include };
  } else {
    // eslint-disable-next-line deprecation/deprecation
    const { ip, request, transaction, user } = reqHandlerOptions as ParseRequestOptions;

    if (ip || request || transaction || user) {
      addRequestDataOptions = { include: dropUndefinedKeys({ ip, request, transaction, user }) };
    }
  }

  return addRequestDataOptions;
}

/**
 * Express compatible request handler.
 * @see Exposed as `Handlers.requestHandler`
 */
export function requestHandler(
  options?: RequestHandlerOptions,
): (req: http.IncomingMessage, res: http.ServerResponse, next: (error?: any) => void) => void {
  // TODO (v8): Get rid of this
  const requestDataOptions = convertReqHandlerOptsToAddReqDataOpts(options);

  const currentHub = getCurrentHub();
  const client = currentHub.getClient<NodeClient>();
  // Initialise an instance of SessionFlusher on the client when `autoSessionTracking` is enabled and the
  // `requestHandler` middleware is used indicating that we are running in SessionAggregates mode
  if (client && isAutoSessionTrackingEnabled(client)) {
    client.initSessionFlusher();

    // If Scope contains a Single mode Session, it is removed in favor of using Session Aggregates mode
    const scope = currentHub.getScope();
    if (scope && scope.getSession()) {
      scope.setSession();
    }
  }

  return function sentryRequestMiddleware(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    next: (error?: any) => void,
  ): void {
    if (options && options.flushTimeout && options.flushTimeout > 0) {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      const _end = res.end;
      res.end = function (chunk?: any | (() => void), encoding?: string | (() => void), cb?: () => void): void {
        void flush(options.flushTimeout)
          .then(() => {
            _end.call(this, chunk, encoding, cb);
          })
          .then(null, e => {
            __DEBUG_BUILD__ && logger.error(e);
            _end.call(this, chunk, encoding, cb);
          });
      };
    }
    const local = domain.create();
    local.add(req);
    local.add(res);

    local.run(() => {
      const currentHub = getCurrentHub();

      currentHub.configureScope(scope => {
        scope.setSDKProcessingMetadata({
          request: req,
          // TODO (v8): Stop passing this
          requestDataOptionsFromExpressHandler: requestDataOptions,
        });

        const client = currentHub.getClient<NodeClient>();
        if (isAutoSessionTrackingEnabled(client)) {
          const scope = currentHub.getScope();
          if (scope) {
            // Set `status` of `RequestSession` to Ok, at the beginning of the request
            scope.setRequestSession({ status: 'ok' });
          }
        }
      });

      res.once('finish', () => {
        const client = currentHub.getClient<NodeClient>();
        if (isAutoSessionTrackingEnabled(client)) {
          setImmediate(() => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            if (client && (client as any)._captureRequestSession) {
              // Calling _captureRequestSession to capture request session at the end of the request by incrementing
              // the correct SessionAggregates bucket i.e. crashed, errored or exited
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              (client as any)._captureRequestSession();
            }
          });
        }
      });
      next();
    });
  };
}

/** JSDoc */
interface MiddlewareError extends Error {
  status?: number | string;
  statusCode?: number | string;
  status_code?: number | string;
  output?: {
    statusCode?: number | string;
  };
}

/** JSDoc */
function getStatusCodeFromResponse(error: MiddlewareError): number {
  const statusCode = error.status || error.statusCode || error.status_code || (error.output && error.output.statusCode);
  return statusCode ? parseInt(statusCode as string, 10) : 500;
}

/** Returns true if response code is internal server error */
function defaultShouldHandleError(error: MiddlewareError): boolean {
  const status = getStatusCodeFromResponse(error);
  return status >= 500;
}

/**
 * Express compatible error handler.
 * @see Exposed as `Handlers.errorHandler`
 */
export function errorHandler(options?: {
  /**
   * Callback method deciding whether error should be captured and sent to Sentry
   * @param error Captured middleware error
   */
  shouldHandleError?(this: void, error: MiddlewareError): boolean;
}): (
  error: MiddlewareError,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  next: (error: MiddlewareError) => void,
) => void {
  return function sentryErrorMiddleware(
    error: MiddlewareError,
    _req: http.IncomingMessage,
    res: http.ServerResponse,
    next: (error: MiddlewareError) => void,
  ): void {
    const shouldHandleError = (options && options.shouldHandleError) || defaultShouldHandleError;

    if (shouldHandleError(error)) {
      withScope(_scope => {
        // The request should already have been stored in `scope.sdkProcessingMetadata` by `sentryRequestMiddleware`,
        // but on the off chance someone is using `sentryErrorMiddleware` without `sentryRequestMiddleware`, it doesn't
        // hurt to be sure
        _scope.setSDKProcessingMetadata({ request: _req });

        // For some reason we need to set the transaction on the scope again
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const transaction = (res as any).__sentry_transaction as Span;
        if (transaction && _scope.getSpan() === undefined) {
          _scope.setSpan(transaction);
        }

        const client = getCurrentHub().getClient<NodeClient>();
        if (client && isAutoSessionTrackingEnabled(client)) {
          // Check if the `SessionFlusher` is instantiated on the client to go into this branch that marks the
          // `requestSession.status` as `Crashed`, and this check is necessary because the `SessionFlusher` is only
          // instantiated when the the`requestHandler` middleware is initialised, which indicates that we should be
          // running in SessionAggregates mode
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          const isSessionAggregatesMode = (client as any)._sessionFlusher !== undefined;
          if (isSessionAggregatesMode) {
            const requestSession = _scope.getRequestSession();
            // If an error bubbles to the `errorHandler`, then this is an unhandled error, and should be reported as a
            // Crashed session. The `_requestSession.status` is checked to ensure that this error is happening within
            // the bounds of a request, and if so the status is updated
            if (requestSession && requestSession.status !== undefined) {
              requestSession.status = 'crashed';
            }
          }
        }

        const eventId = captureException(error);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (res as any).sentry = eventId;
        next(error);
      });

      return;
    }

    next(error);
  };
}

// TODO (v8 / #5257): Remove this
// eslint-disable-next-line deprecation/deprecation
export type { ParseRequestOptions, ExpressRequest } from './requestDataDeprecated';
// eslint-disable-next-line deprecation/deprecation
export { parseRequest, extractRequestData } from './requestDataDeprecated';
