import { captureException, getCurrentScope, getIsolationScope, handleCallbackErrors } from '@sentry/core';
import { vercelWaitUntil, winterCGRequestToRequestData } from '@sentry/utils';

import type { EdgeRouteHandler } from '../../edge/types';
import { flushSafelyWithTimeout } from './responseEnd';

/**
 * Wraps a function on the edge runtime with error monitoring.
 */
export function withEdgeWrapping<H extends EdgeRouteHandler>(
  handler: H,
  options: { spanDescription: string; spanOp: string; mechanismFunctionName: string },
): (...params: Parameters<H>) => Promise<ReturnType<H>> {
  return async function (this: unknown, ...args) {
    const req: unknown = args[0];

    if (req instanceof Request) {
      getIsolationScope().setSDKProcessingMetadata({
        request: winterCGRequestToRequestData(req),
      });
    }

    getCurrentScope().setTransactionName(options.spanDescription);

    const handlerResult = await handleCallbackErrors(
      () => handler.apply(this, args),
      error => {
        captureException(error, {
          mechanism: {
            type: 'instrument',
            handled: false,
            data: {
              function: options.mechanismFunctionName,
            },
          },
        });
      },
    );

    vercelWaitUntil(flushSafelyWithTimeout());

    return handlerResult;
  };
}
