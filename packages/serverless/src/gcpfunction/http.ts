// '@google-cloud/functions-framework/build/src/functions' import is expected to be type-only so it's erased in the final .js file.
// When TypeScript compiler is upgraded, use `import type` syntax to explicitly assert that we don't want to load a module here.
import { HttpFunction } from '@google-cloud/functions-framework/build/src/functions';
import { captureException, flush, getCurrentHub, Handlers, startTransaction } from '@sentry/node';
import { logger, stripUrlQueryAndFragment } from '@sentry/utils';

import { getActiveDomain, WrapperOptions } from './general';

type Request = Parameters<HttpFunction>[0];
type Response = Parameters<HttpFunction>[1];
type ParseRequestOptions = Handlers.ParseRequestOptions;

export interface HttpFunctionWrapperOptions extends WrapperOptions {
  parseRequestOptions: ParseRequestOptions;
}

export { Request, Response };

const { parseRequest } = Handlers;

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
  const options: HttpFunctionWrapperOptions = {
    flushTimeout: 2000,
    parseRequestOptions: {},
    ...wrapOptions,
  };
  return (req, res) => {
    const reqMethod = (req.method || '').toUpperCase();
    const reqUrl = req.url && stripUrlQueryAndFragment(req.url);

    const transaction = startTransaction({
      name: `${reqMethod} ${reqUrl}`,
      op: 'gcp.function.http',
    });

    // getCurrentHub() is expected to use current active domain as a carrier
    // since functions-framework creates a domain for each incoming request.
    // So adding of event processors every time should not lead to memory bloat.
    getCurrentHub().configureScope(scope => {
      scope.addEventProcessor(event => parseRequest(event, req, options.parseRequestOptions));
      // We put the transaction on the scope so users can attach children to it
      scope.setSpan(transaction);
    });

    // We also set __sentry_transaction on the response so people can grab the transaction there to add
    // spans to it later.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (res as any).__sentry_transaction = transaction;

    // functions-framework creates a domain for each incoming request so we take advantage of this fact and add an error handler.
    // BTW this is the only way to catch any exception occured during request lifecycle.
    getActiveDomain().on('error', err => {
      captureException(err);
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const _end = res.end;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res.end = function(chunk?: any | (() => void), encoding?: string | (() => void), cb?: () => void): void {
      transaction.setHttpStatus(res.statusCode);
      transaction.finish();

      flush(options.flushTimeout)
        .then(() => {
          _end.call(this, chunk, encoding, cb);
        })
        .then(null, e => {
          logger.error(e);
        });
    };

    return fn(req, res);
  };
}
