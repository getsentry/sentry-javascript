import { captureException, getCurrentHub, startTransaction } from '@sentry/core';
import { addRequestDataToEvent } from '@sentry/node';
import { getActiveTransaction } from '@sentry/tracing';
import { Transaction } from '@sentry/types';
import { extractTraceparentData, fill, isString, parseBaggageSetMutability } from '@sentry/utils';
import * as domain from 'domain';
import { IncomingMessage, ServerResponse } from 'http';

declare module 'http' {
  interface IncomingMessage {
    _sentryTransaction?: Transaction;
  }
}

/**
 * Grabs a transaction off a Next.js datafetcher request object, if it was previously put there via
 * `setTransactionOnRequest`.
 *
 * @param req The Next.js datafetcher request object
 * @returns the Transaction on the request object if there is one, or `undefined` if the request object didn't have one.
 */
export function getTransactionFromRequest(req: IncomingMessage): Transaction | undefined {
  return req._sentryTransaction;
}

function setTransactionOnRequest(transaction: Transaction, req: IncomingMessage): void {
  req._sentryTransaction = transaction;
}

function autoEndTransactionOnResponseEnd(transaction: Transaction, res: ServerResponse): void {
  fill(res, 'end', (originalEnd: ServerResponse['end']) => {
    return function (this: unknown, ...endArguments: Parameters<ServerResponse['end']>) {
      transaction.finish();
      return originalEnd.call(this, ...endArguments);
    };
  });
}

/**
 * Wraps a function that potentially throws. If it does, the error is passed to `captureException` and rethrown.
 */
export function withErrorInstrumentation<F extends (...args: any[]) => any>(
  origFunction: F,
): (...params: Parameters<F>) => ReturnType<F> {
  return function (this: unknown, ...origFunctionArguments: Parameters<F>): ReturnType<F> {
    try {
      const potentialPromiseResult = origFunction.call(this, ...origFunctionArguments);

      // First of all, we need to capture promise rejections so we have the following check, as well as the try-catch block.
      // Additionally, we do the following instead of `await`-ing so we do not change the method signature of the passed function from `() => unknown` to `() => Promise<unknown>.
      Promise.resolve(potentialPromiseResult).catch(err => {
        // TODO: Extract error logic from `withSentry` in here or create a new wrapper with said logic or something like that.
        captureException(err);
        throw err;
      });

      return potentialPromiseResult;
    } catch (e) {
      // TODO: Extract error logic from `withSentry` in here or create a new wrapper with said logic or something like that.
      captureException(e);
      throw e;
    }
  };
}

/**
 * Calls a server-side data fetching function (that takes a `req` and `res` object in its context) with tracing
 * instrumentation. A transaction will be created for the incoming request (if it doesn't already exist) in addition to
 * a span for the wrapped data fetching function.
 *
 * All of the above happens in an isolated domain, meaning all thrown errors will be associated with the correct span.
 *
 * @param origFunction The data fetching method to call.
 * @param origFunctionArguments The arguments to call the data fetching method with.
 * @param req The data fetching function's request object.
 * @param res The data fetching function's response object.
 * @param options Options providing details for the created transaction and span.
 * @returns what the data fetching method call returned.
 */
export function callTracedServerSideDataFetcher<F extends (...args: any[]) => Promise<any> | any>(
  origFunction: F,
  origFunctionArguments: Parameters<F>,
  req: IncomingMessage,
  res: ServerResponse,
  options: {
    /** Parameterized route of the request - will be used for naming the transaction. */
    requestedRouteName: string;
    /** Name of the route the data fetcher was defined in - will be used for describing the data fetcher's span. */
    dataFetcherRouteName: string;
    /** Name of the data fetching method - will be used for describing the data fetcher's span. */
    dataFetchingMethodName: string;
  },
): Promise<ReturnType<F>> {
  return domain.create().bind(async () => {
    let requestTransaction: Transaction | undefined = getTransactionFromRequest(req);

    if (requestTransaction === undefined) {
      const sentryTraceHeader = req.headers['sentry-trace'];
      const rawBaggageString = req.headers && isString(req.headers.baggage) && req.headers.baggage;
      const traceparentData =
        typeof sentryTraceHeader === 'string' ? extractTraceparentData(sentryTraceHeader) : undefined;

      const baggage = parseBaggageSetMutability(rawBaggageString, traceparentData);

      const newTransaction = startTransaction({
        op: 'nextjs.data.server',
        name: options.requestedRouteName,
        ...traceparentData,
        metadata: {
          source: 'route',
          baggage,
        },
      });

      requestTransaction = newTransaction;
      autoEndTransactionOnResponseEnd(newTransaction, res);
      setTransactionOnRequest(newTransaction, req);
    }

    const dataFetcherSpan = requestTransaction.startChild({
      op: 'nextjs.data.server',
      description: `${options.dataFetchingMethodName} (${options.dataFetcherRouteName})`,
    });

    const currentScope = getCurrentHub().getScope();
    if (currentScope) {
      currentScope.setSpan(dataFetcherSpan);
      currentScope.addEventProcessor(event =>
        addRequestDataToEvent(event, req, {
          include: {
            // When the `transaction` option is set to true, it tries to extract a transaction name from the request
            // object. We don't want this since we already have a high-quality transaction name with a parameterized
            // route. Setting `transaction` to `true` will clobber that transaction name.
            transaction: false,
          },
        }),
      );
    }

    try {
      return await origFunction(...origFunctionArguments);
    } finally {
      dataFetcherSpan.finish();
    }
  })();
}

/**
 * Call a data fetcher and trace it. Only traces the function if there is an active transaction on the scope.
 *
 * We only do the following until we move transaction creation into this function: When called, the wrapped function
 * will also update the name of the active transaction with a parameterized route provided via the `options` argument.
 */
export async function callDataFetcherTraced<F extends (...args: any[]) => Promise<any> | any>(
  origFunction: F,
  origFunctionArgs: Parameters<F>,
  options: {
    parameterizedRoute: string;
    dataFetchingMethodName: string;
  },
): Promise<ReturnType<F>> {
  const { parameterizedRoute, dataFetchingMethodName } = options;

  const transaction = getActiveTransaction();

  if (!transaction) {
    return origFunction(...origFunctionArgs);
  }

  // TODO: Make sure that the given route matches the name of the active transaction (to prevent background data
  // fetching from switching the name to a completely other route) -- We'll probably switch to creating a transaction
  // right here so making that check will probabably not even be necessary.
  // Logic will be: If there is no active transaction, start one with correct name and source. If there is an active
  // transaction, create a child span with correct name and source.
  transaction.name = parameterizedRoute;
  transaction.metadata.source = 'route';

  // Capture the route, since pre-loading, revalidation, etc might mean that this span may happen during another
  // route's transaction
  const span = transaction.startChild({
    op: 'nextjs.data.server',
    description: `${dataFetchingMethodName} (${parameterizedRoute})`,
  });

  try {
    return await origFunction(...origFunctionArgs);
  } catch (err) {
    if (span) {
      span.finish();
    }

    // TODO Copy more robust error handling over from `withSentry`
    captureException(err);
    throw err;
  }
}
