import { getCurrentHub, hasTracingEnabled, startTransaction } from '@sentry/core';
import type { Mechanism, Span, Transaction } from '@sentry/types';
import { baggageHeaderToDynamicSamplingContext, extractTraceparentData, isThenable } from '@sentry/utils';

interface WrapperContext {
  sentryTraceHeader?: string;
  sentryBaggageHeader?: string;
  requestContextObject?: object;
  syntheticParentTransaction?: Transaction;
}

interface WrapperContextExtractor<Args extends any[]> {
  (this: unknown, functionArgs: Args): WrapperContext;
}

interface SpanInfo {
  op: string;
  name: string;
  data: Record<string, unknown>;
  mechanism: Partial<Mechanism>;
}

interface SpanInfoCreator<Args extends any[]> {
  (this: unknown, functionArgs: Args, context: { willCreateTransaction: boolean }): SpanInfo;
}

interface WrappedReturnValue<V> {
  returnValue: V;
  usedSyntheticTransaction: Transaction | undefined;
}

const requestContextTransactionMap = new WeakMap<object, Transaction>();
const requestContextSyntheticTransactionMap = new WeakMap<object, Transaction>();

/**
 * TODO
 */
export function wrapRequestLikeFunctionWithPerformanceInstrumentation<A extends any[], F extends (...args: A) => any>(
  originalFunction: F,
  wrapperContextExtractor: WrapperContextExtractor<A>,
  spanInfoCreator: SpanInfoCreator<A>,
): (...args: Parameters<F>) => WrappedReturnValue<ReturnType<F>> {
  if (!hasTracingEnabled()) {
    return new Proxy(originalFunction, {
      apply: (originalFunction, thisArg: unknown, args: unknown[]): WrappedReturnValue<ReturnType<F>> => {
        return originalFunction.apply(thisArg, args);
      },
    });
  }

  return new Proxy(originalFunction, {
    apply: (originalFunction, thisArg: unknown, args: unknown[]): WrappedReturnValue<ReturnType<F>> => {
      const currentScope = getCurrentHub().getScope();

      const wrapperContext: WrapperContext = wrapperContextExtractor.apply(thisArg, [args]);

      let parentSpan: Span | undefined = currentScope?.getSpan();

      if (!parentSpan && wrapperContext.requestContextObject) {
        parentSpan = requestContextTransactionMap.get(wrapperContext.requestContextObject);
      }

      const spanInfo: SpanInfo = spanInfoCreator.apply(thisArg, [args, { willCreateTransaction: !!parentSpan }]);

      let span: Span;
      let usedSyntheticTransaction: Transaction | undefined;
      if (parentSpan) {
        span = parentSpan.startChild({
          description: spanInfo.name,
          op: spanInfo.op,
        });
      } else {
        let traceparentData;
        if (wrapperContext.sentryTraceHeader) {
          traceparentData = extractTraceparentData(wrapperContext.sentryTraceHeader);
        } else {
          if (wrapperContext.requestContextObject) {
            usedSyntheticTransaction = requestContextSyntheticTransactionMap.get(wrapperContext.requestContextObject);
          }

          if (
            wrapperContext.requestContextObject &&
            wrapperContext.syntheticParentTransaction &&
            !usedSyntheticTransaction
          ) {
            requestContextSyntheticTransactionMap.set(
              wrapperContext.requestContextObject,
              wrapperContext.syntheticParentTransaction,
            );
          }

          if (wrapperContext.syntheticParentTransaction && !usedSyntheticTransaction) {
            usedSyntheticTransaction = wrapperContext.syntheticParentTransaction;
          }

          if (usedSyntheticTransaction) {
            traceparentData = {
              traceId: usedSyntheticTransaction.traceId,
              parentSpanId: usedSyntheticTransaction.spanId,
            };
          }
        }

        const dynamicSamplingContext = baggageHeaderToDynamicSamplingContext(wrapperContext.sentryBaggageHeader);

        const transaction = startTransaction({
          name: spanInfo.name,
          op: spanInfo.op,
          ...traceparentData,
          status: 'ok',
          metadata: {
            dynamicSamplingContext: traceparentData && !dynamicSamplingContext ? {} : dynamicSamplingContext,
            source: 'route',
          },
        });

        span = transaction;

        if (wrapperContext.requestContextObject) {
          requestContextTransactionMap.set(wrapperContext.requestContextObject, transaction);
        }
      }

      if (currentScope) {
        currentScope.setSpan(span);
      }

      const handleFunctionError = (): void => {
        span.setStatus('internal_error');
      };

      const handleFunctionEnd = (): void => {
        span.finish();
      };

      let maybePromiseResult: ReturnType<F>;
      try {
        maybePromiseResult = originalFunction.apply(thisArg, args);
      } catch (e) {
        handleFunctionError();
        handleFunctionEnd();
        throw e;
      }

      if (isThenable(maybePromiseResult)) {
        const promiseResult = maybePromiseResult.then(
          (res: unknown) => {
            handleFunctionEnd();
            return res;
          },
          (err: unknown) => {
            handleFunctionError();
            handleFunctionEnd();
            throw err;
          },
        );

        return {
          returnValue: promiseResult,
          usedSyntheticTransaction,
        };
      } else {
        handleFunctionEnd();
        return {
          returnValue: maybePromiseResult,
          usedSyntheticTransaction,
        };
      }
    },
  });
}
