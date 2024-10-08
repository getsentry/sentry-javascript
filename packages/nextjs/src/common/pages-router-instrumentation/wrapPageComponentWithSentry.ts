import { captureException, getActiveSpan, getCurrentScope, getRootSpan, withIsolationScope } from '@sentry/core';
import { extractTraceparentData } from '@sentry/utils';
import { TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION } from '../span-attributes-with-logic-attached';
import { escapeNextjsTracing } from '../utils/tracingUtils';

interface FunctionComponent {
  (...args: unknown[]): unknown;
}

interface ClassComponent {
  new (...args: unknown[]): {
    props?: unknown;
    render(...args: unknown[]): unknown;
  };
}

function isReactClassComponent(target: unknown): target is ClassComponent {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return typeof target === 'function' && target?.prototype?.isReactComponent;
}

/**
 * Wraps a page component with Sentry error instrumentation.
 */
export function wrapPageComponentWithSentry(pageComponent: FunctionComponent | ClassComponent): unknown {
  if (isReactClassComponent(pageComponent)) {
    return class SentryWrappedPageComponent extends pageComponent {
      public render(...args: unknown[]): unknown {
        // Since the spans emitted by Next.js are super buggy with completely wrong timestamps
        // (fix pending at the time of writing this: https://github.com/vercel/next.js/pull/70908) we want to intentionally
        // drop them. In the future, when Next.js' OTEL instrumentation is in a high-quality place we can potentially think
        // about keeping them.
        const nextJsOwnedSpan = getActiveSpan();
        if (nextJsOwnedSpan) {
          getRootSpan(nextJsOwnedSpan)?.setAttribute(TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION, true);
        }

        return escapeNextjsTracing(() => {
          return withIsolationScope(() => {
            const scope = getCurrentScope();
            // We extract the sentry trace data that is put in the component props by datafetcher wrappers
            const sentryTraceData =
              typeof this.props === 'object' &&
              this.props !== null &&
              '_sentryTraceData' in this.props &&
              typeof this.props._sentryTraceData === 'string'
                ? this.props._sentryTraceData
                : undefined;

            if (sentryTraceData) {
              const traceparentData = extractTraceparentData(sentryTraceData);
              scope.setContext('trace', {
                span_id: traceparentData?.parentSpanId,
                trace_id: traceparentData?.traceId,
              });
            }

            try {
              return super.render(...args);
            } catch (e) {
              captureException(e, {
                mechanism: {
                  handled: false,
                },
              });
              throw e;
            }
          });
        });
      }
    };
  } else if (typeof pageComponent === 'function') {
    return new Proxy(pageComponent, {
      apply(target, thisArg, argArray: [{ _sentryTraceData?: string } | undefined]) {
        // Since the spans emitted by Next.js are super buggy with completely wrong timestamps
        // (fix pending at the time of writing this: https://github.com/vercel/next.js/pull/70908) we want to intentionally
        // drop them. In the future, when Next.js' OTEL instrumentation is in a high-quality place we can potentially think
        // about keeping them.
        const nextJsOwnedSpan = getActiveSpan();
        if (nextJsOwnedSpan) {
          getRootSpan(nextJsOwnedSpan)?.setAttribute(TRANSACTION_ATTR_SHOULD_DROP_TRANSACTION, true);
        }

        return escapeNextjsTracing(() => {
          return withIsolationScope(() => {
            const scope = getCurrentScope();
            // We extract the sentry trace data that is put in the component props by datafetcher wrappers
            const sentryTraceData = argArray?.[0]?._sentryTraceData;

            if (sentryTraceData) {
              const traceparentData = extractTraceparentData(sentryTraceData);
              scope.setContext('trace', {
                span_id: traceparentData?.parentSpanId,
                trace_id: traceparentData?.traceId,
              });
            }

            try {
              return target.apply(thisArg, argArray);
            } catch (e) {
              captureException(e, {
                mechanism: {
                  handled: false,
                },
              });
              throw e;
            }
          });
        });
      },
    });
  } else {
    return pageComponent;
  }
}
