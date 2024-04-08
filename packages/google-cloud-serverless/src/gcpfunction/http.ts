import {
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SEMANTIC_ATTRIBUTE_SENTRY_SOURCE,
  handleCallbackErrors,
  setHttpStatus,
} from '@sentry/core';
import { captureException, continueTrace, flush, getCurrentScope, startSpanManual } from '@sentry/node';
import { isString, logger, stripUrlQueryAndFragment } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import { domainify, markEventUnhandled, proxyFunction } from '../utils';
import type { HttpFunction, WrapperOptions } from './general';

/**
 * Wraps an HTTP function handler adding it error capture and tracing capabilities.
 *
 * @param fn HTTP Handler
 * @param options Options
 * @returns HTTP handler
 */
export function wrapHttpFunction(fn: HttpFunction, wrapOptions: Partial<WrapperOptions> = {}): HttpFunction {
  const wrap = (f: HttpFunction): HttpFunction => domainify(_wrapHttpFunction(f, wrapOptions));

  let overrides: Record<PropertyKey, unknown> | undefined;

  // Functions emulator from firebase-tools has a hack-ish workaround that saves the actual function
  // passed to `onRequest(...)` and in fact runs it so we need to wrap it too.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  const emulatorFunc = (fn as any).__emulator_func as HttpFunction | undefined;
  if (emulatorFunc) {
    overrides = { __emulator_func: proxyFunction(emulatorFunc, wrap) };
  }
  return proxyFunction(fn, wrap, overrides);
}

/** */
function _wrapHttpFunction(fn: HttpFunction, options: Partial<WrapperOptions>): HttpFunction {
  const flushTimeout = options.flushTimeout || 2000;
  return (req, res) => {
    const reqMethod = (req.method || '').toUpperCase();
    const reqUrl = stripUrlQueryAndFragment(req.originalUrl || req.url || '');

    const sentryTrace = req.headers && isString(req.headers['sentry-trace']) ? req.headers['sentry-trace'] : undefined;
    const baggage = req.headers?.baggage;

    return continueTrace({ sentryTrace, baggage }, () => {
      return startSpanManual(
        {
          name: `${reqMethod} ${reqUrl}`,
          op: 'function.gcp.http',
          attributes: {
            [SEMANTIC_ATTRIBUTE_SENTRY_SOURCE]: 'route',
            [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: 'auto.function.serverless.gcp_http',
          },
        },
        span => {
          getCurrentScope().setSDKProcessingMetadata({
            request: req,
          });

          // eslint-disable-next-line @typescript-eslint/unbound-method
          const _end = res.end;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          res.end = function (chunk?: any | (() => void), encoding?: string | (() => void), cb?: () => void): any {
            setHttpStatus(span, res.statusCode);
            span.end();

            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            flush(flushTimeout)
              .then(null, e => {
                DEBUG_BUILD && logger.error(e);
              })
              .then(() => {
                _end.call(this, chunk, encoding, cb);
              });
          };

          return handleCallbackErrors(
            () => fn(req, res),
            err => {
              captureException(err, scope => markEventUnhandled(scope));
            },
          );
        },
      );
    });
  };
}
