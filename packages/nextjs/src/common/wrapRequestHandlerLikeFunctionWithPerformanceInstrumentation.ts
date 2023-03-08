import { getCurrentHub, hasTracingEnabled, startTransaction } from '@sentry/core';
import type { Span, Transaction } from '@sentry/types';
import { baggageHeaderToDynamicSamplingContext, extractTraceparentData, isThenable } from '@sentry/utils';

interface WrapperContext {
  sentryTraceHeader?: string;
  sentryBaggageHeader?: string;
  requestContextObject?: object;
  syntheticParentTransaction?: Transaction;
}

interface WrapperContextExtractor<Args extends any[]> {
  (functionArgs: Args, finishSpan: () => void): WrapperContext;
}

interface SpanInfo {
  op: string;
  name: string;
  data?: Record<string, unknown>;
}

interface SpanInfoCreator<Args extends any[]> {
  (functionArgs: Args, context: { willCreateTransaction: boolean }): SpanInfo;
}

interface OnFunctionEndHookResult {
  shouldFinishSpan: boolean;
}

interface OnFunctionEndHook<Args extends any[], R> {
  (
    functionArgs: Args,
    span: Span,
    result: R | undefined,
    error: unknown | undefined,
  ): PromiseLike<OnFunctionEndHookResult>;
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
export function wrapRequestHandlerLikeFunctionWithPerformanceInstrumentation<
  A extends any[],
  F extends (...args: A) => any,
>(
  originalFunction: F,
  wrapperContextExtractor: WrapperContextExtractor<A>,
  spanInfoCreator: SpanInfoCreator<A>,
  onFunctionEnd: OnFunctionEndHook<A, ReturnType<F>>,
): (...args: Parameters<F>) => WrappedReturnValue<ReturnType<F>> {
  if (!hasTracingEnabled()) {
    return new Proxy(originalFunction, {
      apply: (originalFunction, thisArg: unknown, args: unknown[]): WrappedReturnValue<ReturnType<F>> => {
        return originalFunction.apply(thisArg, args);
      },
    });
  }

  return new Proxy(originalFunction, {
    apply: (originalFunction, thisArg: unknown, args: A): WrappedReturnValue<ReturnType<F>> => {
      const currentScope = getCurrentHub().getScope();

      const userSpanFinish = (): void => {
        if (span) {
          span.finish();
        }
      };

      const wrapperContext = wrapperContextExtractor(args, userSpanFinish);

      let parentSpan: Span | undefined = currentScope?.getSpan();

      if (!parentSpan && wrapperContext.requestContextObject) {
        parentSpan = requestContextTransactionMap.get(wrapperContext.requestContextObject);
      }

      const spanInfo = spanInfoCreator(args, { willCreateTransaction: !!parentSpan });

      let span: Span;
      let usedSyntheticTransaction: Transaction | undefined;
      if (parentSpan) {
        span = parentSpan.startChild({
          description: spanInfo.name,
          op: spanInfo.op,
          status: 'ok',
          data: spanInfo.data,
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
          data: spanInfo.data,
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

      const handleFunctionEnd = (res: ReturnType<F> | undefined, err: unknown | undefined): void => {
        void onFunctionEnd(args, span, res, err).then(beforeFinishResult => {
          if (!beforeFinishResult.shouldFinishSpan) {
            span.finish();
          }
        });
      };

      let maybePromiseResult: ReturnType<F>;
      try {
        maybePromiseResult = originalFunction.apply(thisArg, args);
      } catch (err) {
        handleFunctionError();
        handleFunctionEnd(undefined, err);
        throw err;
      }

      if (isThenable(maybePromiseResult)) {
        const promiseResult = maybePromiseResult.then(
          (res: ReturnType<F>) => {
            handleFunctionEnd(res, undefined);
            return res;
          },
          (err: unknown) => {
            handleFunctionError();
            handleFunctionEnd(undefined, err);
            throw err;
          },
        );

        return {
          returnValue: promiseResult,
          usedSyntheticTransaction,
        };
      } else {
        handleFunctionEnd(maybePromiseResult, undefined);
        return {
          returnValue: maybePromiseResult,
          usedSyntheticTransaction,
        };
      }
    },
  });
}
