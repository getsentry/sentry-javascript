import { captureException, getCurrentHub, startTransaction } from '@sentry/core';
import { getActiveTransaction } from '@sentry/tracing';
import { Transaction } from '@sentry/types';
import { baggageHeaderToDynamicSamplingContext, extractTraceparentData } from '@sentry/utils';
import * as domain from 'domain';
import { IncomingMessage, ServerResponse } from 'http';

import { autoEndTransactionOnResponseEnd } from './utils/responseEnd';

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

/**
 * Wraps a function that potentially throws. If it does, the error is passed to `captureException` and rethrown.
 *
 * Note: This function turns the wrapped function into an asynchronous one.
 */
export function withErrorInstrumentation<F extends (...args: any[]) => any>(
  origFunction: F,
): (...params: Parameters<F>) => Promise<ReturnType<F>> {
  return async function (this: unknown, ...origFunctionArguments: Parameters<F>): Promise<ReturnType<F>> {
    try {
      return await origFunction.call(this, ...origFunctionArguments);
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
      const rawBaggageString = req.headers && req.headers.baggage;
      const traceparentData =
        typeof sentryTraceHeader === 'string' ? extractTraceparentData(sentryTraceHeader) : undefined;

      const dynamicSamplingContext = baggageHeaderToDynamicSamplingContext(rawBaggageString);

      const newTransaction = startTransaction(
        {
          op: 'nextjs.data.server',
          name: options.requestedRouteName,
          ...traceparentData,
          status: 'ok',
          metadata: {
            source: 'route',
            dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
          },
        },
        { request: req },
      );

      requestTransaction = newTransaction;
      autoEndTransactionOnResponseEnd(newTransaction, res);

      // Link the transaction and the request together, so that when we would normally only have access to one, it's
      // still possible to grab the other.
      setTransactionOnRequest(newTransaction, req);
      newTransaction.setMetadata({ request: req });
    }

    const dataFetcherSpan = requestTransaction.startChild({
      op: 'nextjs.data.server',
      description: `${options.dataFetchingMethodName} (${options.dataFetcherRouteName})`,
      status: 'ok',
    });

    const currentScope = getCurrentHub().getScope();
    if (currentScope) {
      currentScope.setSpan(dataFetcherSpan);
      currentScope.setSDKProcessingMetadata({ request: req });
    }

    try {
      return await origFunction(...origFunctionArguments);
    } catch (e) {
      // Since we finish the span before the error can bubble up and trigger the handlers in `registerErrorInstrumentation`
      // that set the transaction status, we need to manually set the status of the span & transaction
      dataFetcherSpan.setStatus('internal_error');

      const transaction = dataFetcherSpan.transaction;
      if (transaction) {
        transaction.setStatus('internal_error');
      }

      throw e;
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
    status: 'ok',
  });

  try {
    return await origFunction(...origFunctionArgs);
  } catch (err) {
    // Since we finish the span before the error can bubble up and trigger the handlers in `registerErrorInstrumentation`
    // that set the transaction status, we need to manually set the status of the span & transaction
    transaction.setStatus('internal_error');
    span.setStatus('internal_error');
    span.finish();

    // TODO Copy more robust error handling over from `withSentry`
    captureException(err);
    throw err;
  }
}
