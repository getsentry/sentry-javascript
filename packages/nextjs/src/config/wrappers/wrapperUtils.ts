import { captureException } from '@sentry/core';
import { getActiveTransaction } from '@sentry/tracing';
import { Transaction } from '@sentry/types';
import { fill } from '@sentry/utils';
import * as domain from 'domain';
import { IncomingMessage, ServerResponse } from 'http';

declare module 'http' {
  interface IncomingMessage {
    _sentryTransaction?: Transaction;
  }
}

function getTransactionFromRequest(req: IncomingMessage): Transaction | undefined {
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
    parameterizedRoute: string;
    functionName: string;
  },
): Promise<ReturnType<F>> {
  return domain.create().bind(async () => {
    let requestTransaction: Transaction | undefined = getTransactionFromRequest(req);

    if (requestTransaction === undefined) {
      // TODO: Extract trace data from `req` object (trace and baggage headers) and attach it to transaction

      const newTransaction = startTransaction({
        op: 'nextjs.data',
        name: options.parameterizedRoute,
        metadata: {
          source: 'route',
        },
      });

      requestTransaction = newTransaction;
      autoEndTransactionOnResponseEnd(newTransaction, res);
      setTransactionOnRequest(newTransaction, req);
    }

    const dataFetcherSpan = requestTransaction.startChild({
      op: 'nextjs.data',
      description: `${options.functionName} (${options.parameterizedRoute})`,
    });

    const currentScope = getCurrentHub().getScope();
    if (currentScope) {
      currentScope.setSpan(dataFetcherSpan);
    }

    try {
      // TODO: Inject trace data into returned props
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
    op: 'nextjs.data',
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
