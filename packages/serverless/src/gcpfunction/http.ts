import type { AddRequestDataToEventOptions } from '@sentry/node';
import { captureException, flush, getCurrentHub } from '@sentry/node';
import { extractTraceparentData } from '@sentry/tracing';
import { baggageHeaderToDynamicSamplingContext, isString, logger, stripUrlQueryAndFragment } from '@sentry/utils';

import { domainify, getActiveDomain, proxyFunction } from './../utils';
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

    // Applying `sentry-trace` to context
    let traceparentData;
    const reqWithHeaders = req as { headers?: { [key: string]: string } };
    if (reqWithHeaders.headers && isString(reqWithHeaders.headers['sentry-trace'])) {
      traceparentData = extractTraceparentData(reqWithHeaders.headers['sentry-trace']);
    }

    const baggageHeader = reqWithHeaders.headers?.baggage;

    const dynamicSamplingContext = baggageHeaderToDynamicSamplingContext(baggageHeader);

    const hub = getCurrentHub();

    const transaction = hub.startTransaction({
      name: `${reqMethod} ${reqUrl}`,
      op: 'function.gcp.http',
      ...traceparentData,
      metadata: {
        dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
        source: 'route',
      },
    });

    // getCurrentHub() is expected to use current active domain as a carrier
    // since functions-framework creates a domain for each incoming request.
    // So adding of event processors every time should not lead to memory bloat.
    hub.configureScope(scope => {
      scope.setSDKProcessingMetadata({
        request: req,
        requestDataOptionsFromGCPWrapper: options.addRequestDataToEventOptions,
      });
      // We put the transaction on the scope so users can attach children to it
      scope.setSpan(transaction);
    });

    // We also set __sentry_transaction on the response so people can grab the transaction there to add
    // spans to it later.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (res as any).__sentry_transaction = transaction;

    // functions-framework creates a domain for each incoming request so we take advantage of this fact and add an error handler.
    // BTW this is the only way to catch any exception occured during request lifecycle.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    getActiveDomain()!.on('error', err => {
      captureException(err);
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const _end = res.end;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res.end = function (chunk?: any | (() => void), encoding?: string | (() => void), cb?: () => void): any {
      transaction.setHttpStatus(res.statusCode);
      transaction.finish();

      void flush(options.flushTimeout)
        .then(null, e => {
          __DEBUG_BUILD__ && logger.error(e);
        })
        .then(() => {
          _end.call(this, chunk, encoding, cb);
        });
    };

    return fn(req, res);
  };
}
