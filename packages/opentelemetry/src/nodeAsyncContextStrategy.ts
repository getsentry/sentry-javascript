import * as api from '@opentelemetry/api';
import { setOpenTelemetryContextAsyncContextStrategy } from './asyncContextStrategy';
import { AsyncLocalStorage } from 'node:async_hooks';
import { getRootSpan, spanIsIgnored, type TracingChannelBinding } from '@sentry/core';
import { SENTRY_TRACE_STATE_CHILD_IGNORED } from './constants';

interface ContextApi {
  _getContextManager():
    | undefined
    | {
        getAsyncLocalStorageLookup(): {
          asyncLocalStorage: unknown;
        };
      };
}

export function setNodeOpenTelemetryContextAsyncContextStrategy(options?: { skipOpenTelemetrySetup?: boolean }): void {
  setOpenTelemetryContextAsyncContextStrategy({
    getTracingChannelBinding: !options?.skipOpenTelemetrySetup
      ? getDefaultAsyncLocalStorageFactory()
      : getCustomAsyncLocalStorageFactory(),
  });
}

/**
 * In the default case, we build the local storage instance ourselves here.
 * The default asyncLocalStorageContextManager will then use this internally.
 */
function getDefaultAsyncLocalStorageFactory(): () => TracingChannelBinding {
  const defaultAsyncLocalStorage = new AsyncLocalStorage<api.Context>();

  return () => {
    return {
      asyncLocalStorage: defaultAsyncLocalStorage,
      getStoreWithActiveSpan,
    } satisfies TracingChannelBinding;
  };
}

/**
 * If we have a custom context manager, we need to access it via the context manager
 * this may not be available yet, if this is called before the Otel ContextManager was setup
 * in this case, we need to return undefined and retry later, hoping that the setup works by then
 */
function getCustomAsyncLocalStorageFactory(): () => TracingChannelBinding | undefined {
  return () => {
    try {
      const contextManager = (api.context as unknown as ContextApi)._getContextManager();
      const asyncLocalStorage = contextManager?.getAsyncLocalStorageLookup().asyncLocalStorage;

      return asyncLocalStorage
        ? ({
            asyncLocalStorage,
            getStoreWithActiveSpan,
          } satisfies TracingChannelBinding)
        : undefined;
    } catch {
      return undefined;
    }
  };
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
