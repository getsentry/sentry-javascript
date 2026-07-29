import * as api from '@opentelemetry/api';
import { setOpenTelemetryContextAsyncContextStrategy } from './asyncContextStrategy';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getRootSpan, spanIsIgnored, type TracingChannelBinding } from '@sentry/core';
import { SENTRY_TRACE_STATE_CHILD_IGNORED } from './constants';
import { type AsyncLocalStorageLookup, SentryAsyncLocalStorageContextManager } from './asyncLocalStorageContextManager';

/**
 * This sets up both the async context strategy based on OTEL, as well as the context manager needed to back this.
 * It ensures that both use the same instance of AsyncLocalStorage.
 */
export function setNodeOpenTelemetryContextAsyncContextStrategy(): AsyncLocalStorageLookup {
  const asyncLocalStorage = new AsyncLocalStorage<api.Context>();

  setOpenTelemetryContextAsyncContextStrategy({
    getTracingChannelBinding: () => {
      return {
        asyncLocalStorage,
        getStoreWithActiveSpan,
      } satisfies TracingChannelBinding;
    },
  });

  const ctxManager = new SentryAsyncLocalStorageContextManager(asyncLocalStorage);
  api.context.setGlobalContextManager(ctxManager);

  return ctxManager.getAsyncLocalStorageLookup();
}

function getStoreWithActiveSpan(span: Parameters<TracingChannelBinding['getStoreWithActiveSpan']>[0]): api.Context {
  const activeContext = api.context.active();

  // Tracing channels bind directly to the context manager's AsyncLocalStorage and bypass
  // SentryContextManager.with(), so ignored children must restore their parent here as well.
  const isIgnoredChild =
    (spanIsIgnored(span) && getRootSpan(span) !== span) ||
    span.spanContext().traceState?.get(SENTRY_TRACE_STATE_CHILD_IGNORED) === '1';

  return isIgnoredChild ? activeContext : api.trace.setSpan(activeContext, span);
}
