import { Transaction, handleCallbackErrors } from '@sentry/core';
import type { AddRequestDataToEventOptions } from '@sentry/node';
import { continueTrace, startSpanManual } from '@sentry/node';
import { getCurrentScope } from '@sentry/node';
import { captureException, flush } from '@sentry/node';
import { isString, logger, stripUrlQueryAndFragment } from '@sentry/utils';

import { DEBUG_BUILD } from '../debug-build';
import { domainify, markEventUnhandled, proxyFunction } from './../utils';
import type { HttpFunction, WrapperOptions } from './general';

// TODO (v8 / #5257): Remove this whole old/new business and just use the new stuff
type ParseRequestOptions = AddRequestDataToEventOptions['include'] & {
  serverName?: boolean;
  version?: boolean;
};

interface OldHttpFunctionWrapperOptions extends WrapperOptions {
  /**
   * @deprecated Use `addRequestDataToEventOptions` instead.
   */
  parseRequestOptions: ParseRequestOptions;
}
interface NewHttpFunctionWrapperOptions extends WrapperOptions {
  addRequestDataToEventOptions: AddRequestDataToEventOptions;
}

export type HttpFunctionWrapperOptions = OldHttpFunctionWrapperOptions | NewHttpFunctionWrapperOptions;

/**
 * Wraps an HTTP function handler adding it error capture and tracing capabilities.
 *
 * @param fn HTTP Handler
 * @param options Options
 * @returns HTTP handler
 */
export function wrapHttpFunction(
  fn: HttpFunction,
  wrapOptions: Partial<HttpFunctionWrapperOptions> = {},
): HttpFunction {
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
function _wrapHttpFunction(fn: HttpFunction, wrapOptions: Partial<HttpFunctionWrapperOptions> = {}): HttpFunction {
  // TODO (v8 / #5257): Switch to using `addRequestDataToEventOptions`
  // eslint-disable-next-line deprecation/deprecation
  const { parseRequestOptions } = wrapOptions as OldHttpFunctionWrapperOptions;

  const options: HttpFunctionWrapperOptions = {
    flushTimeout: 2000,
    // TODO (v8 / xxx): Remove this line, since `addRequestDataToEventOptions` will be included in the spread of `wrapOptions`
    addRequestDataToEventOptions: parseRequestOptions ? { include: parseRequestOptions } : {},
    ...wrapOptions,
  };
  return (req, res) => {
    const reqMethod = (req.method || '').toUpperCase();
    const reqUrl = stripUrlQueryAndFragment(req.originalUrl || req.url || '');

    const sentryTrace = req.headers && isString(req.headers['sentry-trace']) ? req.headers['sentry-trace'] : undefined;
    const baggage = req.headers?.baggage;

    const continueTraceContext = continueTrace({ sentryTrace, baggage });

    return startSpanManual(
      {
        ...continueTraceContext,
        name: `${reqMethod} ${reqUrl}`,
        op: 'function.gcp.http',
        origin: 'auto.function.serverless.gcp_http',

        metadata: {
          ...continueTraceContext.metadata,
          source: 'route',
        },
      },
      span => {
        getCurrentScope().setSDKProcessingMetadata({
          request: req,
          requestDataOptionsFromGCPWrapper: options.addRequestDataToEventOptions,
        });

        if (span instanceof Transaction) {
          // We also set __sentry_transaction on the response so people can grab the transaction there to add
          // spans to it later.
          // TODO(v8): Remove this
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          (res as any).__sentry_transaction = span;
        }

        // eslint-disable-next-line @typescript-eslint/unbound-method
        const _end = res.end;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        res.end = function (chunk?: any | (() => void), encoding?: string | (() => void), cb?: () => void): any {
          span?.setHttpStatus(res.statusCode);
          span?.end();

          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          flush(options.flushTimeout)
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
  };
}
